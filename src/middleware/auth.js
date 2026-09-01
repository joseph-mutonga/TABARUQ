const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

exports.verifyToken = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await db.execute('SELECT id, username, role, is_active FROM users WHERE id = ?', [decoded.id]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const user = rows[0];
        const normalizedRole = String(user.role || '').toLowerCase();
        if (user.is_active === 0 && normalizedRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the administrator.' });
        }

        req.user = { ...decoded, username: user.username, role: normalizedRole, is_active: user.is_active };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Require Admin Role' });
    }
};

exports.isCashier = (req, res, next) => {
    if (req.user && (req.user.role === 'cashier' || req.user.role === 'admin')) {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Require Cashier Role' });
    }
};
