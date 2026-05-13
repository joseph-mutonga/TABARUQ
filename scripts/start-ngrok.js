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

            const fs = require('fs');
            const path = require('path');
            
            const envPath = path.resolve(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            const callbackUrl = `${url}/api/payments/callback`;
            
            if (envContent.includes('MPESA_CALLBACK_URL=')) {
                envContent = envContent.replace(/MPESA_CALLBACK_URL=.*/g, `MPESA_CALLBACK_URL=${callbackUrl}`);
            } else {
                envContent += `\nMPESA_CALLBACK_URL=${callbackUrl}`;
            }
            
            fs.writeFileSync(envPath, envContent);
            process.env.MPESA_CALLBACK_URL = callbackUrl;
            
            console.log(`Ngrok tunnel established: ${url}`);
            console.log(`SUCCESS: Automatically updated MPESA_CALLBACK_URL in .env to ${callbackUrl}`);
            
            // Automatically register the C2B URLs with Safaricom
            try {
                const { registerC2BURLsInternal } = require('../src/controllers/paymentController');
                console.log('Registering C2B endpoints with Safaricom Sandbox...');
                await registerC2BURLsInternal();
                console.log('SUCCESS: C2B endpoints registered!');
            } catch (regErr) {
                console.error('WARNING: Failed to automatically register C2B URLs:', regErr.response?.data || regErr.message);
            }
        });
    } catch (error) {
        console.error('Failed to start ngrok tunnel:', error);
        process.exit(1);
    }
})();
