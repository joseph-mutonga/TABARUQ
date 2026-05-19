const axios = require('axios');
require('dotenv').config();

async function runTest() {
    try {
        console.log('--- STARTING TOP 4 SELLING FOODS INTEGRATION TEST ---');

        // 1. Log in to get admin token
        console.log('1. Logging in...');
        const loginResp = await axios.post('http://localhost:5001/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginResp.data.token;

        // 2. Query Dashboard stats
        console.log('2. Querying dashboard stats...');
        const statsResp = await axios.get('http://localhost:5001/api/dashboard/stats', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const topProducts = statsResp.data.data.topProducts;
        console.log(`Number of products returned on dashboard: ${topProducts.length}`);
        
        if (topProducts.length > 4) {
            throw new Error(`Expected at most 4 items on dashboard but received ${topProducts.length}`);
        }

        // 3. Query Reports popular items
        console.log('3. Querying reports popular items...');
        const popularResp = await axios.get('http://localhost:5001/api/reports/popular', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const popularItems = popularResp.data.data;
        console.log(`Number of products returned on reports: ${popularItems.length}`);
        
        if (popularItems.length > 4) {
            throw new Error(`Expected at most 4 items on reports but received ${popularItems.length}`);
        }

        console.log('SUCCESS: Both endpoints are successfully limited to a maximum of 4 top-selling items!');
        process.exit(0);

    } catch (e) {
        console.error('\nFAIL: Top selling limit test failed with error:', e.response?.data || e.message);
        process.exit(1);
    }
}

runTest();
