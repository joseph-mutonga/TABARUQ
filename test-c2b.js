const axios = require('axios');

async function run() {
    try {
        const payload = {
            "TransactionType": "Pay Bill",
            "TransID": "RHA9OGH123",
            "TransTime": "20230810143000",
            "TransAmount": "100.00",
            "BusinessShortCode": "174379",
            "BillRefNumber": "123",
            "InvoiceNumber": "",
            "OrgAccountBalance": "1000.00",
            "ThirdPartyTransID": "",
            "MSISDN": "254712345678",
            "FirstName": "John",
            "MiddleName": "Doe",
            "LastName": "Smith"
        };
        const res = await axios.post('http://localhost:5001/api/payments/c2b-confirmation', payload);
        console.log('Response:', res.data);
    } catch(e) {
        console.error('Error:', e.response?.data || e.message);
    }
}
run();
