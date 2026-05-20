const axios = require('axios');

async function checkApi() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post('http://localhost:5001/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginRes.data.token;

        console.log('Fetching incomplete payments...');
        const res = await axios.get('http://localhost:5001/api/payments?status=incomplete', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('JSON Output:');
        console.log(JSON.stringify(res.data.data, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err.response ? err.response.data : err.message);
        process.exit(1);
    }
}

checkApi();
