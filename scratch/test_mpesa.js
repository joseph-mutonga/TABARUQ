const { getMpesaToken } = require('../src/utils/mpesa');

async function testToken() {
    try {
        console.log('Fetching M-Pesa token...');
        const token = await getMpesaToken();
        console.log('SUCCESS! Token retrieved:', token);
        process.exit(0);
    } catch (e) {
        console.error('FAILED to fetch token:', e.message);
        process.exit(1);
    }
}
testToken();
