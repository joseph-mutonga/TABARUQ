const axios = require('axios');
require('dotenv').config();

const getMpesaToken = async () => {
    const consumer_key = process.env.MPESA_CONSUMER_KEY;
    const consumer_secret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64');

    try {
        const response = await axios.get(
            process.env.MPESA_OAUTH_URL || 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                },
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('M-Pesa Token Error:', error.response?.data || error.message);
        throw new Error('Failed to get M-Pesa token');
    }
};

const generateTimestamp = () => {
    const date = new Date();
    return date.getFullYear() +
        ('0' + (date.getMonth() + 1)).slice(-2) +
        ('0' + date.getDate()).slice(-2) +
        ('0' + date.getHours()).slice(-2) +
        ('0' + date.getMinutes()).slice(-2) +
        ('0' + date.getSeconds()).slice(-2);
};

module.exports = { getMpesaToken, generateTimestamp };
