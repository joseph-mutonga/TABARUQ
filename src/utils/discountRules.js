const db = require('../config/db');

// Days-of-week convention matches JS Date#getDay(): 0 = Sunday ... 6 = Saturday.

/**
 * Finds the single best-matching active discount rule for a brand-new online-platform order and
 * returns the resulting discount to apply (or null if nothing matches). "Best" = the rule that
 * produces the largest discount amount for this specific order.
 *
 * @param {object} connection - an active mysql2 connection/pool (so this runs inside the caller's transaction)
 * @param {object} params
 * @param {string} params.platform - the order's platform (e.g. "Uber Eats"). Required - rules never apply to walk-in/POS orders.
 * @param {number} params.orderTotal - the order's total amount before any discount
 * @param {Array<{id:number|null, quantity:number, price:number}>} params.orderItems - resolved line items (inventory id, quantity, unit price)
 * @param {number} [params.maxPercentage] - optional cap (from discount_settings) applied to percentage-type rules as a safety net
 * @returns {Promise<null|{discountAmount:number, discountType:string, discountValue:number, ruleId:number, ruleName:string}>}
 */
async function computeAutoDiscount(connection, { platform, orderTotal, orderItems, maxPercentage }) {
    const [rules] = await connection.query('SELECT * FROM discount_rules WHERE is_active = 1');
    if (!rules || rules.length === 0) return null;

    const now = new Date();
    const currentDay = now.getDay();
    const pad = (n) => String(n).padStart(2, '0');
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Filter rules active at the current day and time
    const activeRules = rules.filter((rule) => {
        if (rule.days_of_week) {
            const days = rule.days_of_week.split(',').map((d) => Number(d.trim()));
            if (!days.includes(currentDay)) return false;
        }
        if (rule.start_time && rule.end_time) {
            const inRange = rule.start_time <= rule.end_time
                ? (currentTime >= rule.start_time && currentTime <= rule.end_time)
                : (currentTime >= rule.start_time || currentTime <= rule.end_time);
            if (!inRange) return false;
        }
        return true;
    });

    if (activeRules.length === 0) return null;

    const itemRules = activeRules.filter(r => r.item_id != null);
    const orderRules = activeRules.filter(r => {
        if (r.item_id != null) return false;
        if (platform && platform !== 'none') {
            return r.platform == null || r.platform === platform;
        }
        return r.platform == null;
    });

    let totalItemDiscount = 0;
    const appliedRuleNames = [];
    let primaryRuleId = null;

    // 1. Calculate discount for each matching line item
    const itemsList = orderItems || [];
    for (const item of itemsList) {
        if (item.id == null) continue;
        const matchingRules = itemRules.filter(r => {
            if (Number(r.item_id) !== Number(item.id)) return false;
            if (platform && platform !== 'none' && r.platform != null && r.platform !== platform) return false;
            return true;
        });
        if (!matchingRules.length) continue;

        const base = Number(item.quantity) * Number(item.price);
        if (!(base > 0)) continue;

        let bestItemRule = null;
        let bestItemDiscount = 0;

        for (const rule of matchingRules) {
            const value = Number(rule.discount_value);
            let disc = 0;
            if (rule.discount_type === 'percentage') {
                const pct = Number.isFinite(maxPercentage) ? Math.min(value, maxPercentage) : value;
                disc = base * (pct / 100);
            } else {
                disc = Math.min(value * Number(item.quantity), base);
            }
            disc = Math.round(disc * 100) / 100;
            if (disc > bestItemDiscount) {
                bestItemDiscount = disc;
                bestItemRule = rule;
            }
        }

        if (bestItemDiscount > 0 && bestItemRule) {
            totalItemDiscount += bestItemDiscount;
            if (!appliedRuleNames.includes(bestItemRule.name)) {
                appliedRuleNames.push(bestItemRule.name);
            }
            if (!primaryRuleId) primaryRuleId = bestItemRule.id;
        }
    }

    // 2. Check general order-wide rules if any
    let bestOrderDiscount = 0;
    let bestOrderRule = null;
    for (const rule of orderRules) {
        const base = Number(orderTotal);
        if (!(base > 0)) continue;
        const value = Number(rule.discount_value);
        let disc = 0;
        if (rule.discount_type === 'percentage') {
            const pct = Number.isFinite(maxPercentage) ? Math.min(value, maxPercentage) : value;
            disc = base * (pct / 100);
        } else {
            disc = Math.min(value, base);
        }
        disc = Math.round(disc * 100) / 100;
        if (disc > bestOrderDiscount) {
            bestOrderDiscount = disc;
            bestOrderRule = rule;
        }
    }

    // Combine or select best discount amount
    let finalDiscountAmount = totalItemDiscount;
    let ruleName = appliedRuleNames.join(', ');
    let primaryRuleType = 'fixed';
    let primaryRuleValue = finalDiscountAmount;

    if (bestOrderDiscount > finalDiscountAmount) {
        finalDiscountAmount = bestOrderDiscount;
        ruleName = bestOrderRule.name;
        primaryRuleId = bestOrderRule.id;
        primaryRuleType = bestOrderRule.discount_type;
        primaryRuleValue = Number(bestOrderRule.discount_value);
    } else if (bestOrderDiscount > 0 && totalItemDiscount > 0) {
        // If both exist, allow combined up to orderTotal cap
        finalDiscountAmount = Math.min(orderTotal - 0.01, totalItemDiscount + bestOrderDiscount);
        if (bestOrderRule && !appliedRuleNames.includes(bestOrderRule.name)) {
            appliedRuleNames.push(bestOrderRule.name);
            ruleName = appliedRuleNames.join(', ');
        }
        primaryRuleType = 'fixed';
        primaryRuleValue = finalDiscountAmount;
    } else if (appliedRuleNames.length === 1 && primaryRuleId) {
        const matching = itemRules.find(r => r.id === primaryRuleId);
        if (matching) {
            primaryRuleType = matching.discount_type;
            primaryRuleValue = Number(matching.discount_value);
        }
    }

    finalDiscountAmount = Math.round(finalDiscountAmount * 100) / 100;
    if (finalDiscountAmount <= 0) return null;

    return {
        discountAmount: finalDiscountAmount,
        discountType: primaryRuleType === 'percentage' ? 'percentage' : 'fixed',
        discountValue: primaryRuleValue,
        ruleId: primaryRuleId,
        ruleName: ruleName || 'Special Discount'
    };
}

module.exports = { computeAutoDiscount };
