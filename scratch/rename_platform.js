const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const paths = [
    '../public/admin/settings.html',
    '../public/admin/inventory.html',
    '../public/admin/delivery.html',
    '../public/cashier/index.html',
    '../src/controllers/orderController.js',
    '../src/controllers/deliveryController.js',
    '../src/controllers/inventoryController.js',
    '../schema.sql'
];

paths.forEach(p => {
    const fullPath = path.join(__dirname, p);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        content = content.replaceAll('Own Delivery', 'Tabaruq Delivery');
        fs.writeFileSync(fullPath, content, 'utf8');
    }
});

// Fix the missed dropdowns in delivery.html
const deliveryHtmlPath = path.join(__dirname, '../public/admin/delivery.html');
let html = fs.readFileSync(deliveryHtmlPath, 'utf8');

// Ensure all dropdowns have Tabaruq Delivery
// Dropdown 1: Settlement Platform (id="sPlatform")
if (!html.includes('<option value="Tabaruq Delivery">Tabaruq Delivery</option>') || html.split('<option value="Tabaruq Delivery">Tabaruq Delivery</option>').length < 4) {
    html = html.replaceAll('<option value="Bolt Food">Bolt Food</option>', '<option value="Bolt Food">Bolt Food</option>\n                        <option value="Tabaruq Delivery">Tabaruq Delivery</option>');
    // Cleanup any duplicates if they occurred due to previous patch
    html = html.replaceAll('<option value="Tabaruq Delivery">Tabaruq Delivery</option>\n                        <option value="Tabaruq Delivery">Tabaruq Delivery</option>', '<option value="Tabaruq Delivery">Tabaruq Delivery</option>');
    html = html.replaceAll('<option value="Tabaruq Delivery">Tabaruq Delivery</option>\n                            <option value="Tabaruq Delivery">Tabaruq Delivery</option>', '<option value="Tabaruq Delivery">Tabaruq Delivery</option>');
}

fs.writeFileSync(deliveryHtmlPath, html, 'utf8');

async function updateDb() {
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || '',
            database: process.env.DB_NAME || 'tabaruq_foods'
        });
        await db.execute("UPDATE platform_commissions SET platform = 'Tabaruq Delivery' WHERE platform = 'Own Delivery'");
        console.log("Database platform name updated to Tabaruq Delivery");
        await db.end();
    } catch(e) {
        console.error(e);
    }
}
updateDb();
