const db = require('../config/db');

exports.getReceiptSettings = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM receipt_settings WHERE id = 1');
        if (rows.length === 0) {
            // Fallback defaults if row was somehow deleted
            return res.json({
                success: true,
                data: {
                    hotel_name: 'TABARUQ FOODS',
                    phone_number: '',
                    address: '',
                    mpesa_paybill: '600000',
                    mpesa_till: '174379',
                    footer_message: 'Thank you for dining with us!'
                }
            });
        }
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.saveReceiptSettings = async (req, res) => {
    const { hotel_name, phone_number, address, mpesa_paybill, mpesa_till, footer_message } = req.body;
    
    if (!hotel_name || !hotel_name.trim()) {
        return res.status(400).json({ success: false, message: 'Hotel name is required' });
    }

    try {
        await db.execute(`
            INSERT INTO receipt_settings (id, hotel_name, phone_number, address, mpesa_paybill, mpesa_till, footer_message)
            VALUES (1, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                hotel_name = VALUES(hotel_name),
                phone_number = VALUES(phone_number),
                address = VALUES(address),
                mpesa_paybill = VALUES(mpesa_paybill),
                mpesa_till = VALUES(mpesa_till),
                footer_message = VALUES(footer_message)
        `, [
            hotel_name.trim(),
            phone_number ? phone_number.trim() : null,
            address ? address.trim() : null,
            mpesa_paybill ? mpesa_paybill.trim() : null,
            mpesa_till ? mpesa_till.trim() : null,
            footer_message ? footer_message.trim() : null
        ]);

        res.json({ success: true, message: 'Receipt settings saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
