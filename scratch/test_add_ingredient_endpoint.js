const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function test() {
    const token = jwt.sign(
        { id: 1, username: 'admin', role: 'admin' },
        process.env.JWT_SECRET || 'tabaruq_secret_key_2024',
        { expiresIn: '1h' }
    );

    const data = {
        name: 'Tomato Test',
        item_type: 'ingredient',
        category: 'Vegetables',
        unit: 'kg',
        cost_price: '50.00',
        selling_price: 0,
        low_stock_threshold: '5.00',
        uber_price: null,
        glovo_price: null,
        bolt_price: null,
        is_delivery: 0,
        delivery_platform: null,
        quantity: '10.00'
    };

    try {
        const response = await axios.post('http://localhost:5001/api/inventory', data, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Success response:', response.data);
    } catch (err) {
        console.error('Error status:', err.response?.status);
        console.error('Error response data:', err.response?.data);
    }
}

test();
