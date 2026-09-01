const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const user = rows[0];
        const normalizedRole = String(user.role || '').toLowerCase();
        if (Number(user.is_active) === 0 && normalizedRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the administrator.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: normalizedRole,
                is_active: user.is_active
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.register = async (req, res) => {
    const { username, password, role } = req.body;

    try {
        const [existing] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO users (username, password, role, is_active) VALUES (?, ?, ?, 1)', [username, hashedPassword, role]);

        res.status(201).json({ success: true, message: 'User created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    try {
        const [userRows] = await db.execute('SELECT id, role FROM users WHERE id = ?', [id]);
        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (userRows[0].role === 'admin') {
            return res.status(400).json({ success: false, message: 'Admin accounts cannot be deactivated here.' });
        }

        const active = Number(is_active) === 1 ? 1 : 0;
        await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [active, id]);

        res.json({ success: true, message: active ? 'Cashier account activated.' : 'Cashier account deactivated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
