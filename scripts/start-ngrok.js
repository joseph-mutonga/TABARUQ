const ngrok = require('ngrok');
const app = require('../src/app');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN;
const NGROK_SUBDOMAIN = process.env.NGROK_SUBDOMAIN;

(async () => {
    try {
        app.listen(PORT, async () => {
            console.log(`Server running on http://localhost:${PORT}`);

            const url = await ngrok.connect({
                addr: PORT,
                authtoken: NGROK_AUTHTOKEN || undefined,
                subdomain: NGROK_SUBDOMAIN || undefined,
                bind_tls: true,
            });

            console.log(`Ngrok tunnel established: ${url}`);
            console.log('Use this URL on another device to access the app.');
            console.log('For webhook callbacks, set MPESA_CALLBACK_URL to the public ngrok URL plus /api/payments/callback.');
        });
    } catch (error) {
        console.error('Failed to start ngrok tunnel:', error);
        process.exit(1);
    }
})();
