const db = require('../config/db');
const net = require('net');

exports.getReceiptSettings = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM receipt_settings WHERE id = 1');
        if (rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    hotel_name: 'TABARUQ FOODS',
                    phone_number: '',
                    address: '',
                    mpesa_paybill: '600000',
                    mpesa_till: '174379',
                    footer_message: 'Thank you for dining with us!',
                    printer_ip: '',
                    printer_port: 9100
                }
            });
        }
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.saveReceiptSettings = async (req, res) => {
    const { hotel_name, phone_number, address, mpesa_paybill, mpesa_till, footer_message, printer_ip, printer_port } = req.body;
    
    if (!hotel_name || !hotel_name.trim()) {
        return res.status(400).json({ success: false, message: 'Hotel name is required' });
    }

    try {
        await db.execute(`
            INSERT INTO receipt_settings (id, hotel_name, phone_number, address, mpesa_paybill, mpesa_till, footer_message, printer_ip, printer_port)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                hotel_name = VALUES(hotel_name),
                phone_number = VALUES(phone_number),
                address = VALUES(address),
                mpesa_paybill = VALUES(mpesa_paybill),
                mpesa_till = VALUES(mpesa_till),
                footer_message = VALUES(footer_message),
                printer_ip = VALUES(printer_ip),
                printer_port = VALUES(printer_port)
        `, [
            hotel_name.trim(),
            phone_number ? phone_number.trim() : null,
            address ? address.trim() : null,
            mpesa_paybill ? mpesa_paybill.trim() : null,
            mpesa_till ? mpesa_till.trim() : null,
            footer_message ? footer_message.trim() : null,
            printer_ip ? printer_ip.trim() : null,
            printer_port ? parseInt(printer_port) : 9100
        ]);

        res.json({ success: true, message: 'Receipt settings saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.openCashDrawer = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT printer_ip, printer_port FROM receipt_settings WHERE id = 1');
        const settings = rows[0];

        if (!settings || !settings.printer_ip) {
            return res.status(400).json({ success: false, message: 'Printer IP not configured in settings.' });
        }

        const ip = settings.printer_ip;
        const port = settings.printer_port || 9100;

        // ESC/POS cash drawer open command: ESC p m t1 t2
        // ESC=0x1B, p=0x70, pin2=0x00, on-time=0x19 (25ms), off-time=0xFA (250ms)
        const drawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

        await new Promise((resolve, reject) => {
            const client = new net.Socket();
            client.setTimeout(3000);
            client.connect(port, ip, () => {
                client.write(drawerCmd, () => {
                    client.destroy();
                    resolve();
                });
            });
            client.on('error', reject);
            client.on('timeout', () => { client.destroy(); reject(new Error('Printer connection timed out')); });
        });

        res.json({ success: true, message: 'Cash drawer opened.' });
    } catch (err) {
        console.error('Cash drawer error:', err.message);
        res.status(500).json({ success: false, message: 'Could not open cash drawer: ' + err.message });
    }
};
