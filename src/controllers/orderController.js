const db = require('../config/db');
const { getOpenShift } = require('./shiftController');
const { computeAutoDiscount } = require('../utils/discountRules');

// Flags an order as belonging to a "repeat" customer by matching customer_name (case/whitespace
// insensitive) against earlier orders. Generic placeholder names (Guest, "<Platform> Order", etc.)
// are excluded to avoid false positives for orders where no real customer name was captured.
const REPEAT_CUSTOMER_SQL = `(CASE WHEN o.customer_name IS NOT NULL
        AND TRIM(o.customer_name) NOT IN ('', 'Guest', 'Delivery Customer')
        AND TRIM(o.customer_name) NOT LIKE '% Order'
        AND EXISTS (
            SELECT 1 FROM orders o2
            WHERE o2.id <> o.id
              AND LOWER(TRIM(o2.customer_name)) = LOWER(TRIM(o.customer_name))
              AND o2.created_at < o.created_at
        ) THEN 1 ELSE 0 END) AS is_repeat_customer`;
exports.REPEAT_CUSTOMER_SQL = REPEAT_CUSTOMER_SQL;

exports.createOrder = async (req, res) => {
    const {
        items,
        total_amount,
        customer_name,
        platform: initialPlatform,
        platform_order_id,
        isMerge,
        mergedOrderIds,
        scheduled_for,
        discount_type,
        discount_value,
        discount_reason,
        delivery_location_id,
        delivery_address,
        is_delivery
    } = req.body;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        let platform = (initialPlatform && initialPlatform !== 'none') ? initialPlatform : null;
        const isTabaruqDelivery = platform === 'Tabaruq Delivery' || !!is_delivery || !!delivery_location_id;
        if (isTabaruqDelivery && (!platform || platform === 'none')) {
            platform = 'Tabaruq Delivery';
        }

        // When making a sale for delivery, the cashier must choose the location where the delivery is going
        if (platform === 'Tabaruq Delivery' && !delivery_location_id) {
            throw new Error('Please choose the delivery location where the Tabaruq Delivery is going');
        }

        let deliveryFee = 0;
        let deliveryLocationName = null;
        let deliveryDistance = null;

        if (delivery_location_id) {
            const [locRows] = await connection.execute(
                'SELECT * FROM delivery_locations WHERE id = ?',
                [Number(delivery_location_id)]
            );
            if (locRows.length === 0) {
                throw new Error('The selected delivery location was not found in settings');
            }
            const loc = locRows[0];
            deliveryFee = Number(loc.transport_fee) || 0;
            deliveryLocationName = loc.location_name;
            deliveryDistance = loc.distance_km != null ? Number(loc.distance_km) : null;
        }

        const shift = await getOpenShift(req.user.id, connection);

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('An order must contain at least one item');
        }

        const itemIds = [...new Set(items.map((item) => Number(item.id)))];
        if (itemIds.some((id) => !Number.isInteger(id) || id <= 0)) {
            throw new Error('Order contains an invalid inventory item');
        }

        const [inventoryRows] = await connection.query(
            `SELECT id, name, selling_price, uber_price, glovo_price, bolt_price, own_delivery_price
             FROM inventory WHERE id IN (?)`,
            [itemIds]
        );
        const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
        if (inventoryRows.length !== itemIds.length) {
            throw new Error('Order contains an inventory item that no longer exists');
        }

        let calculatedTotal = 0;
        const resolvedItems = []; // {id, quantity, price} snapshot used later to auto-match discount rules
        for (const item of items) {
            const quantity = Number(item.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) {
                throw new Error('Order quantities must be greater than zero');
            }

            const inventoryItem = inventoryById.get(Number(item.id));
            let price = Number(inventoryItem.selling_price);
            const platformPrice = {
                'Uber Eats': inventoryItem.uber_price,
                Glovo: inventoryItem.glovo_price,
                'Bolt Food': inventoryItem.bolt_price,
                'Tabaruq Delivery': inventoryItem.own_delivery_price
            }[platform];
            if (platformPrice != null && Number(platformPrice) >= 0) price = Number(platformPrice);
            calculatedTotal += quantity * price;
            resolvedItems.push({ id: Number(item.id), quantity, price });
        }
        const totalAmount = Math.round(calculatedTotal * 100) / 100;
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            throw new Error('Order total must be greater than zero');
        }

        // ── Discount evaluation (manual checkout discount or automatic discount rule) ──
        let appliedDiscount = null;
        let finalTotalAmount = totalAmount;

        const [discountSettingsRows] = await connection.execute('SELECT * FROM discount_settings WHERE id = 1');
        const discountSettings = discountSettingsRows[0] || { enabled: 1, max_percentage: 100 };

        // 1. Manual discount specified at checkout
        if (!isMerge && discount_type && ['percentage', 'fixed'].includes(discount_type) && Number(discount_value) > 0) {
            if (!discountSettings.enabled) {
                throw new Error('Order discounts are currently disabled in Settings');
            }
            const val = Number(discount_value);
            let discAmt = 0;
            if (discount_type === 'percentage') {
                const maxPct = Number(discountSettings.max_percentage) || 100;
                if (val > maxPct) {
                    throw new Error(`Discount percentage cannot exceed ${maxPct}%`);
                }
                discAmt = Math.round(totalAmount * (val / 100) * 100) / 100;
            } else {
                discAmt = Math.round(val * 100) / 100;
            }

            if (discAmt > 0) {
                const calcFinal = Math.round((totalAmount - discAmt) * 100) / 100;
                if (calcFinal <= 0) {
                    throw new Error('Discount cannot reduce the order total to zero or below');
                }
                appliedDiscount = {
                    source: 'manual',
                    type: discount_type,
                    value: val,
                    amount: discAmt,
                    reason: discount_reason ? String(discount_reason).trim().substring(0, 255) : 'Checkout discount',
                    givenBy: req.user.id,
                    ruleId: null
                };
                finalTotalAmount = calcFinal;
            }
        }

        // 2. Automatic discount rule fallback (if no manual discount applied)
        if (!appliedDiscount && !isMerge && discountSettings.enabled) {
            const autoRule = await computeAutoDiscount(connection, {
                platform: platform || null,
                orderTotal: totalAmount,
                orderItems: resolvedItems,
                maxPercentage: Number(discountSettings.max_percentage) || 100
            });
            if (autoRule) {
                const calcFinal = Math.round((totalAmount - autoRule.discountAmount) * 100) / 100;
                if (calcFinal > 0) {
                    appliedDiscount = {
                        source: 'auto',
                        type: autoRule.discountType,
                        value: autoRule.discountValue,
                        amount: autoRule.discountAmount,
                        reason: `Auto: ${autoRule.ruleName}`,
                        givenBy: null,
                        ruleId: autoRule.ruleId,
                        ruleName: autoRule.ruleName
                    };
                    finalTotalAmount = calcFinal;
                }
            }
        }

        if (deliveryFee > 0) {
            finalTotalAmount = Math.round((finalTotalAmount + deliveryFee) * 100) / 100;
        }

        let nameToSave = customer_name || (platform ? `${platform} Order` : 'Guest');
        if (nameToSave && nameToSave.length > 255) {
            nameToSave = nameToSave.substring(0, 252) + '...';
        }

        let scheduledForDate = null;
        let scheduledReleased = 1;
        if (scheduled_for) {
            const parsedDate = new Date(scheduled_for);
            if (!isNaN(parsedDate.getTime())) {
                scheduledForDate = parsedDate;
                if (parsedDate > new Date()) {
                    scheduledReleased = 0;
                }
            }
        }

        const [orderResult] = await connection.execute(
            `INSERT INTO orders (cashier_id, shift_id, total_amount, status, payment_status, customer_name, platform, platform_order_id, scheduled_for, scheduled_released,
                original_total_amount, discount_type, discount_value, discount_amount, discount_reason, discount_given_by, discount_given_at, discount_source, discount_rule_id,
                delivery_location_id, delivery_location_name, delivery_distance, delivery_fee, delivery_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, shift?.id || null, finalTotalAmount, 'pending', 'pending', nameToSave, platform || null, platform_order_id || null, scheduledForDate, scheduledReleased,
                appliedDiscount ? Math.round((totalAmount + deliveryFee) * 100) / 100 : null,
                appliedDiscount ? (['percentage', 'fixed'].includes(appliedDiscount.type) ? appliedDiscount.type : 'fixed') : 'none',
                appliedDiscount ? appliedDiscount.value : 0,
                appliedDiscount ? appliedDiscount.amount : 0,
                appliedDiscount ? appliedDiscount.reason : null,
                appliedDiscount ? (appliedDiscount.givenBy || null) : null,
                appliedDiscount ? new Date() : null,
                appliedDiscount ? appliedDiscount.source : null,
                appliedDiscount ? (appliedDiscount.ruleId || null) : null,
                delivery_location_id ? Number(delivery_location_id) : null,
                deliveryLocationName || null,
                deliveryDistance != null ? deliveryDistance : null,
                deliveryFee,
                delivery_address ? String(delivery_address).trim() : null
            ]
        );
        const orderId = orderResult.insertId;

        // If it's a delivery platform order, insert platform fees based on settings (computed on the
        // final, post-discount total since that reflects what will actually be settled by the platform)
        if (platform) {
            const [commissions] = await connection.execute(
                'SELECT commission_percentage FROM platform_commissions WHERE platform = ?',
                [platform]
            );
            const commissionPct = commissions.length > 0 ? Number(commissions[0].commission_percentage) : 0;
            if (commissionPct > 0) {
                const feeAmount = finalTotalAmount * (commissionPct / 100);
                await connection.execute(
                    'INSERT INTO platform_fees (order_id, fee_percentage, fee_amount) VALUES (?, ?, ?)',
                    [orderId, commissionPct, feeAmount]
                );
            }
        }

        // Consolidate items with the same item_id into a single line (important for merged orders)
        const consolidatedMap = new Map();
        for (const item of items) {
            const inventoryItem = inventoryById.get(Number(item.id));
            let itemPrice = Number(inventoryItem.selling_price);
            const platformPrice = {
                'Uber Eats': inventoryItem.uber_price,
                Glovo: inventoryItem.glovo_price,
                'Bolt Food': inventoryItem.bolt_price,
                'Tabaruq Delivery': inventoryItem.own_delivery_price
            }[platform];
            if (platformPrice != null && Number(platformPrice) >= 0) itemPrice = Number(platformPrice);

            const key = `${item.id}_${itemPrice}`; // group by item + price
            const qty = Number(item.quantity) || 0;
            if (consolidatedMap.has(key)) {
                consolidatedMap.get(key).quantity += qty;
            } else {
                consolidatedMap.set(key, {
                    id: item.id,
                    quantity: qty,
                    price: itemPrice,
                    name: item.name || item.item_name || null
                });
            }
        }

        const stockItemIds = new Set();
        for (const item of consolidatedMap.values()) {
            const subtotal = item.quantity * item.price;
            stockItemIds.add(Number(item.id));

            // 1. Record Order Item (one consolidated row per item)
            await connection.execute(
                'INSERT INTO order_items (order_id, item_id, quantity, price, subtotal, item_name) VALUES (?, ?, ?, ?, ?, ?)',
                [orderId, item.id, item.quantity, item.price, subtotal, item.name || null]
            );

            if (!isMerge) {
                // 2. Deduct the sold item's own stock
                const [stockUpdate] = await connection.execute(
                    'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
                    [item.quantity, item.id]
                );
                if (stockUpdate.affectedRows !== 1) {
                    throw new Error(`Insufficient stock for item #${item.id}`);
                }

                // 3. Log direct stock change
                await connection.execute(
                    'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
                    [item.id, req.user.id, -item.quantity, `Sale - Order #${orderId}`]
                );

                // ── 4. Apply Stock Deduction Rules ────────────────────────────
                // e.g. selling "Chipo" also deducts 1 kg of "Viazi" from stock
                const [deductionRules] = await connection.execute(
                    'SELECT id, stock_item_id, deduct_qty, menu_items_per_stock_unit, stock_qty_per_batch, accumulated_menu_qty FROM stock_deduction_rules WHERE menu_item_id = ? FOR UPDATE',
                    [item.id]
                );
                for (const rule of deductionRules) {
                    stockItemIds.add(Number(rule.stock_item_id));
                    const batchSize = Number(rule.menu_items_per_stock_unit) > 0 ? Number(rule.menu_items_per_stock_unit) : 1 / Number(rule.deduct_qty);
                    const stockPerBatch = Number(rule.stock_qty_per_batch) > 0 ? Number(rule.stock_qty_per_batch) : 1;
                    const accumulated = Number(rule.accumulated_menu_qty) || 0;
                    const menuQuantityTotal = accumulated + Number(item.quantity);
                    const batches = Math.floor((menuQuantityTotal + 0.0000001) / batchSize);
                    const totalDeduct = batches * stockPerBatch;
                    const remainder = menuQuantityTotal - (batches * batchSize);
                    await connection.execute('UPDATE stock_deduction_rules SET accumulated_menu_qty = ? WHERE id = ?', [remainder, rule.id]);
                    if (totalDeduct <= 0) {
                        continue;
                    }
                    const [stockUpdate] = await connection.execute(
                        'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
                        [totalDeduct, rule.stock_item_id]
                    );
                    if (stockUpdate.affectedRows !== 1) {
                        throw new Error(`Insufficient stock for deduction item #${rule.stock_item_id}`);
                    }
                    await connection.execute(
                        'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
                        [rule.stock_item_id, req.user.id, -totalDeduct, `Auto-deduct (rule) - Order #${orderId} via item #${item.id}`]
                    );
                }

                // ── 5. Apply Combo / Bundle Recipe Deductions ─────────────────
                // e.g. selling "Savoury" deducts 1 Samosa + 3 Viazi Karai + 1 Sausage
                const [recipeComponents] = await connection.execute(
                    'SELECT component_item_id, component_qty FROM item_recipes WHERE combo_item_id = ?',
                    [item.id]
                );
                for (const comp of recipeComponents) {
                    stockItemIds.add(Number(comp.component_item_id));
                    const totalDeduct = parseFloat(comp.component_qty) * item.quantity;
                    const [stockUpdate] = await connection.execute(
                        'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
                        [totalDeduct, comp.component_item_id]
                    );
                    if (stockUpdate.affectedRows !== 1) {
                        throw new Error(`Insufficient stock for recipe item #${comp.component_item_id}`);
                    }
                    await connection.execute(
                        'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
                        [comp.component_item_id, req.user.id, -totalDeduct, `Combo deduct - Order #${orderId} via ${item.name || 'item #' + item.id}`]
                    );
                }
            }
        }

        // Handle merging of old orders and their payments
        if (isMerge && Array.isArray(mergedOrderIds) && mergedOrderIds.length > 0) {
            for (const oldId of mergedOrderIds) {
                // Mark old order as merged
                await connection.execute(
                    'UPDATE orders SET status = "merged", payment_status = "merged" WHERE id = ?',
                    [oldId]
                );
                // Re-link all payments from old order to the new combined order
                await connection.execute(
                    'UPDATE payments SET order_id = ? WHERE order_id = ?',
                    [orderId, oldId]
                );
            }
        }

        if (appliedDiscount) {
            await connection.execute(
                'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
                [
                    req.user.id,
                    appliedDiscount.source === 'manual' ? 'Applied checkout discount' : 'Auto-applied discount rule',
                    `Order #${orderId} (${platform || 'POS'}): ${appliedDiscount.type} discount of ${appliedDiscount.value}${appliedDiscount.type === 'percentage' ? '%' : ''} = KES ${appliedDiscount.amount}. New total: KES ${finalTotalAmount}. Reason: ${appliedDiscount.reason}`
                ]
            );
        }

        await connection.commit();
        
        // Emit Real-time Events
        const io = req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
        if (io) {
            io.emit('order_update', { type: 'new', orderId });
            io.emit('stock_update', { items: [...stockItemIds] });
            
            // If it is a delivery platform order and is immediately released, notify kitchen
            if (platform && scheduledReleased === 1) {
                const formattedItems = items.map(item => ({
                    name: item.name || item.item_name || 'Item',
                    quantity: item.quantity,
                    price: Number(item.selling_price) || Number(item.price) || 0
                }));
                io.emit('new_delivery_order', {
                    id: orderId,
                    platform,
                    platform_order_id: platform_order_id || `#${orderId}`,
                    customer_name: nameToSave,
                    items: formattedItems,
                    total: finalTotalAmount,
                    delivery_fee: deliveryFee,
                    delivery_location_name: deliveryLocationName,
                    delivery_distance: deliveryDistance,
                    delivery_address: delivery_address || null,
                    status: 'pending'
                });
            }
        }

        res.status(201).json({
            success: true,
            orderId,
            total_amount: finalTotalAmount,
            delivery_fee: deliveryFee,
            delivery_location_name: deliveryLocationName,
            delivery_distance: deliveryDistance,
            original_total_amount: appliedDiscount ? (totalAmount + deliveryFee) : null,
            discount_amount: appliedDiscount ? appliedDiscount.amount : 0,
            message: appliedDiscount
                ? `Order created successfully with discount (KES ${appliedDiscount.amount} off).`
                : 'Order created successfully',
            data: {
                orderId,
                total_amount: finalTotalAmount,
                delivery_fee: deliveryFee,
                delivery_location_name: deliveryLocationName,
                delivery_distance: deliveryDistance,
                original_total_amount: appliedDiscount ? (totalAmount + deliveryFee) : null,
                discount_amount: appliedDiscount ? appliedDiscount.amount : 0,
                discount_type: appliedDiscount ? appliedDiscount.type : 'none',
                discount_value: appliedDiscount ? appliedDiscount.value : 0,
                discount_reason: appliedDiscount ? appliedDiscount.reason : null,
                discount_source: appliedDiscount ? appliedDiscount.source : null
            }
        });
    } catch (err) {
        await connection.rollback();
        console.error('ERROR IN CREATE_ORDER:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT o.*, COALESCE(u.username, o.platform, 'Delivery') as cashier_name
            FROM orders o 
            LEFT JOIN users u ON o.cashier_id = u.id 
            WHERE o.status != 'merged' AND o.platform IS NULL
            ORDER BY o.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getOrderDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [order] = await db.execute(`
            SELECT o.*, u.username as cashier_name, ${REPEAT_CUSTOMER_SQL}
            FROM orders o 
            LEFT JOIN users u ON o.cashier_id = u.id 
            WHERE o.id = ?
        `, [id]);
        if (order.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        const [items] = await db.execute(`
            SELECT oi.*, COALESCE(i.name, oi.item_name) as name 
            FROM order_items oi 
            LEFT JOIN inventory i ON oi.item_id = i.id 
            WHERE oi.order_id = ?
        `, [id]);

        const [payments] = await db.execute(`
            SELECT payment_method, transaction_id, status, amount
            FROM payments 
            WHERE order_id = ? 
            ORDER BY id DESC LIMIT 1
        `, [id]);
        const payment = payments[0] || null;

        const [settingsRows] = await db.execute('SELECT * FROM receipt_settings WHERE id = 1');
        const settings = settingsRows[0] || {};

        res.json({ 
            success: true, 
            data: { 
                ...order[0], 
                items,
                payment_method: payment ? payment.payment_method : null,
                transaction_id: payment ? payment.transaction_id : null,
                payment_amount: payment ? payment.amount : null,
                hotel_name: settings.hotel_name || 'TABARUQ FOODS',
                phone_number: settings.phone_number || '',
                address: settings.address || '',
                mpesa_paybill: settings.mpesa_paybill || '600000',
                mpesa_till: settings.mpesa_till || '174379',
                footer_message: settings.footer_message || 'Thank you for dining with us!'
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, payment_status } = req.body;
    try {
        const validStatuses = ['pending', 'completed', 'cancelled', 'merged'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid order status' });
        }
        if (status === 'cancelled' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only administrators can cancel orders' });
        }

        // Sanitize payment_status — the DB ENUM only allows: pending, paid, failed, partial, merged
        // 'cancelled' is NOT a valid ENUM value; use 'pending' when cancelling (order.status handles exclusion)
        const validPaymentStatuses = ['pending', 'paid', 'failed', 'partial', 'merged'];
        const safePaymentStatus = validPaymentStatuses.includes(payment_status) ? payment_status : 'pending';

        await db.execute('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', [status, safePaymentStatus, id]);
        
        // Emit Real-time Update
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'status', orderId: id, status, payment_status: safePaymentStatus });

        res.json({ success: true, message: 'Order status updated' });
    } catch (err) {
        console.error('updateOrderStatus error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};

exports.getScheduledOrders = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT o.*, COALESCE(u.username, o.platform, 'Delivery') as cashier_name,
                (SELECT GROUP_CONCAT(CONCAT(oi.quantity, 'x ', COALESCE(oi.item_name, i.name, 'Item')) SEPARATOR ', ')
                 FROM order_items oi LEFT JOIN inventory i ON i.id = oi.item_id WHERE oi.order_id = o.id) AS items_summary
            FROM orders o 
            LEFT JOIN users u ON o.cashier_id = u.id 
            WHERE o.status != 'merged' AND o.status != 'cancelled' AND o.scheduled_for > NOW() AND o.scheduled_released = 0
            ORDER BY o.scheduled_for ASC
        `);
        
        for (const order of rows) {
            const [items] = await db.execute(`
                SELECT oi.*, COALESCE(i.name, oi.item_name) as name 
                FROM order_items oi 
                LEFT JOIN inventory i ON oi.item_id = i.id 
                WHERE oi.order_id = ?
            `, [order.id]);
            order.items = items;
        }

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('ERROR IN GET_SCHEDULED_ORDERS:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.releaseScheduledOrder = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [orderRows] = await connection.execute('SELECT * FROM orders WHERE id = ?', [id]);
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orderRows[0];

        // Update order status to released
        const [releaseResult] = await connection.execute(
            'UPDATE orders SET scheduled_released = 1, scheduled_for = CURRENT_TIMESTAMP WHERE id = ? AND scheduled_released = 0 AND scheduled_for > NOW()',
            [id]
        );
        if (releaseResult.affectedRows !== 1) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'Order is already released or is not scheduled' });
        }

        // Fetch order items to emit
        const [items] = await connection.execute(`
            SELECT oi.*, COALESCE(i.name, oi.item_name) as name 
            FROM order_items oi 
            LEFT JOIN inventory i ON oi.item_id = i.id 
            WHERE oi.order_id = ?
        `, [id]);

        await connection.commit();

        // Emit Socket Events
        const io = req.app.get('io');
        if (io) {
            io.emit('order_update', { type: 'status', orderId: id, status: order.status, payment_status: order.payment_status });
            
            // If it's a delivery platform order, emit to kitchen display
            if (order.platform) {
                const formattedItems = items.map(item => ({
                    name: item.name || item.item_name || 'Item',
                    quantity: item.quantity,
                    price: Number(item.price) || 0
                }));
                io.emit('new_delivery_order', {
                    id: order.id,
                    platform: order.platform,
                    platform_order_id: order.platform_order_id || `#${order.id}`,
                    customer_name: order.customer_name,
                    items: formattedItems,
                    total: Number(order.total_amount),
                    status: order.status
                });
            }
        }

        res.json({ success: true, message: 'Order released to kitchen successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('ERROR IN RELEASE_SCHEDULED_ORDER:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    } finally {
        connection.release();
    }
};

exports.deleteScheduledOrder = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [orders] = await connection.execute(
            'SELECT id FROM orders WHERE id = ? AND scheduled_for IS NOT NULL AND scheduled_released = 0 AND status != "cancelled" FOR UPDATE',
            [id]
        );
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Scheduled order not found or already released' });
        }

        await connection.execute('DELETE FROM payments WHERE order_id = ?', [id]);
        await connection.execute('DELETE FROM order_items WHERE order_id = ?', [id]);
        await connection.execute('DELETE FROM orders WHERE id = ?', [id]);
        await connection.commit();

        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'deleted', orderId: Number(id) });
        res.json({ success: true, message: 'Scheduled order deleted successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('ERROR IN DELETE_SCHEDULED_ORDER:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    } finally {
        connection.release();
    }
};

// Admin gives (or updates) a discount on an order — mainly used for delivery/online platform
// orders where the customer was given a discount directly on the platform. Reducing total_amount
// here means every downstream "expected payment" check (STK push, C2B validation, reconciliation,
// receipts) automatically uses the discounted figure, so it stays in sync with what is actually collected.
exports.applyOrderDiscount = async (req, res) => {
    const { id } = req.params;
    const { discount_type, discount_value, reason } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [settingsRows] = await connection.execute('SELECT * FROM discount_settings WHERE id = 1');
        const discountSettings = settingsRows[0] || { enabled: 1, max_percentage: 100 };
        if (!discountSettings.enabled) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Order discounts are currently disabled in Settings' });
        }

        const [orders] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orders[0];
        if (order.payment_status === 'paid') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Cannot change the discount on an order that has already been paid' });
        }
        if (order.status === 'cancelled' || order.status === 'merged') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Cannot discount a ${order.status} order` });
        }

        if (!['percentage', 'fixed'].includes(discount_type)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Discount type must be percentage or fixed' });
        }
        const value = Number(discount_value);
        if (!Number.isFinite(value) || value <= 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Discount value must be greater than zero' });
        }

        // Always discount from the original (pre-discount) total so re-applying a discount doesn't compound.
        const baseAmount = order.original_total_amount != null ? Number(order.original_total_amount) : Number(order.total_amount);

        let discountAmount;
        if (discount_type === 'percentage') {
            const maxPct = Number(discountSettings.max_percentage) || 100;
            if (value > maxPct) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: `Discount percentage cannot exceed ${maxPct}% (see Settings)` });
            }
            discountAmount = Math.round(baseAmount * (value / 100) * 100) / 100;
        } else {
            discountAmount = Math.round(value * 100) / 100;
        }

        const newTotal = Math.round((baseAmount - discountAmount) * 100) / 100;
        if (newTotal <= 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Discount cannot reduce the order total to zero or below' });
        }

        const trimmedReason = reason ? String(reason).trim().substring(0, 255) : null;

        await connection.execute(
            `UPDATE orders SET
                original_total_amount = ?,
                total_amount = ?,
                discount_type = ?,
                discount_value = ?,
                discount_amount = ?,
                discount_reason = ?,
                discount_given_by = ?,
                discount_given_at = CURRENT_TIMESTAMP,
                discount_source = 'manual',
                discount_rule_id = NULL
             WHERE id = ?`,
            [baseAmount, newTotal, discount_type, value, discountAmount, trimmedReason, req.user.id, id]
        );

        await connection.execute(
            'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
            [
                req.user.id,
                'Applied order discount',
                `Order #${id} (${order.platform || 'walk-in'}): ${discount_type} discount of ${value}${discount_type === 'percentage' ? '%' : ''} = KES ${discountAmount}. New total: KES ${newTotal}. Reason: ${trimmedReason || 'N/A'}`
            ]
        );

        await connection.commit();

        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'discount', orderId: Number(id) });

        res.json({
            success: true,
            message: 'Discount applied successfully',
            data: { id: Number(id), original_total_amount: baseAmount, total_amount: newTotal, discount_amount: discountAmount }
        });
    } catch (err) {
        await connection.rollback();
        console.error('applyOrderDiscount error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    } finally {
        connection.release();
    }
};

// Removes a previously applied discount, restoring the order's original total_amount.
exports.removeOrderDiscount = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [orders] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orders[0];
        if (order.discount_type === 'none' || order.original_total_amount == null) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'This order has no discount to remove' });
        }
        if (order.payment_status === 'paid') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Cannot change the discount on an order that has already been paid' });
        }

        const restoredTotal = Number(order.original_total_amount);
        await connection.execute(
            `UPDATE orders SET
                total_amount = ?,
                original_total_amount = NULL,
                discount_type = 'none',
                discount_value = 0,
                discount_amount = 0,
                discount_reason = NULL,
                discount_given_by = NULL,
                discount_given_at = NULL,
                discount_source = NULL,
                discount_rule_id = NULL
             WHERE id = ?`,
            [restoredTotal, id]
        );

        await connection.execute(
            'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'Removed order discount', `Order #${id}: discount removed, total restored to KES ${restoredTotal}`]
        );

        await connection.commit();

        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'discount', orderId: Number(id) });

        res.json({ success: true, message: 'Discount removed', data: { id: Number(id), total_amount: restoredTotal } });
    } catch (err) {
        await connection.rollback();
        console.error('removeOrderDiscount error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    } finally {
        connection.release();
    }
};
