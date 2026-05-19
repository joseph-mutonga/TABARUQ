const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../src/routes/customers.js');
const controllersPath = path.join(__dirname, '../src/controllers/customerController.js');

try {
    if (fs.existsSync(routesPath)) {
        fs.unlinkSync(routesPath);
        console.log('Deleted src/routes/customers.js');
    }
    if (fs.existsSync(controllersPath)) {
        fs.unlinkSync(controllersPath);
        console.log('Deleted src/controllers/customerController.js');
    }
} catch (e) {
    console.error('Failed to delete backend files:', e.message);
}
