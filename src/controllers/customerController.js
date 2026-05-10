const db = require('../config/db');

exports.getCustomers = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM customers ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getCustomers Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.createCustomer = async (req, res) => {
    const { name, phone, email, notes } = req.body;

    try {
        const [result] = await db.execute(
            'INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?)',
            [name, phone, email, notes]
        );
        res.status(201).json({ success: true, data: { id: result.insertId, name, phone, email, notes } });
    } catch (err) {
        console.error('createCustomer Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteCustomer = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM customers WHERE id = ?', [id]);
        res.json({ success: true, message: 'Customer deleted' });
    } catch (err) {
        console.error('deleteCustomer Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
