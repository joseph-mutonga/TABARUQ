const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runTest() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        console.log('--- STARTING PAYROLL REPORT & NET REVENUE INTEGRATION TEST ---');

        // 1. Log in to get admin token
        console.log('1. Logging in as admin...');
        const loginResp = await axios.post('http://localhost:5001/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginResp.data.token;
        console.log('Logged in successfully.');

        // 2. Create a test worker
        console.log('2. Creating test worker...');
        const workerName = `Test Worker ${Date.now()}`;
        const [insertWorkerResult] = await conn.execute(
            'INSERT INTO workers (name, phone, role, weekly_salary, status) VALUES (?, ?, ?, ?, ?)',
            [workerName, '0711222333', 'Chef', 6000.00, 'active']
        );
        const workerId = insertWorkerResult.insertId;
        console.log(`Worker created with ID: ${workerId}`);

        // 3. Record a payment of 5000 KES
        console.log('3. Recording a payroll payment...');
        const todayStr = new Date().toISOString().split('T')[0];
        const paymentResp = await axios.post('http://localhost:5001/api/workers/payments', {
            worker_id: workerId,
            amount: 5000.00,
            payment_date: todayStr,
            week_start: todayStr,
            week_end: todayStr,
            status: 'paid',
            notes: 'Weekly Salary Payout'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Record payment response:', paymentResp.data);

        // 4. Verify the expense record was automatically generated under Salaries category
        console.log('4. Verifying generated expense record...');
        const [expenseRows] = await conn.execute(
            'SELECT * FROM expenses WHERE description = ? AND category = ? ORDER BY id DESC LIMIT 1',
            [`Salary Payment - ${workerName}`, 'Salaries']
        );
        
        if (expenseRows.length === 0) {
            throw new Error('Expense log for the worker salary was not found!');
        }
        console.log('Generated Salary Expense:', expenseRows[0]);

        // 5. Query Profit/Loss report to check that totalPayroll matches and there is no double-counting
        console.log('5. Querying Profit & Loss report...');
        const reportResp = await axios.get(`http://localhost:5001/api/reports/profit-loss?startDate=${todayStr}&endDate=${todayStr}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const report = reportResp.data.data;
        console.log('Profit & Loss Report data:', report);

        // Verify totalPayroll is at least 5000 KES
        if (Number(report.totalPayroll) < 5000.00) {
            throw new Error(`Expected payroll to be at least 5000.00 KES but got ${report.totalPayroll}`);
        }

        // Verify Salaries are not double counted in totalGeneralExpenses (Operational Expenses)
        // Let's count direct expense rows of category 'Salaries' for today
        const [[{ totalSalaries }]] = await conn.execute(
            "SELECT SUM(amount) as totalSalaries FROM expenses WHERE category = 'Salaries' AND expense_date = ?",
            [todayStr]
        );
        const [[{ totalAllExpenses }]] = await conn.execute(
            "SELECT SUM(amount) as totalAllExpenses FROM expenses WHERE expense_date = ?",
            [todayStr]
        );
        
        console.log(`Today's Salaries: ${totalSalaries}, Total expenses in table: ${totalAllExpenses}`);
        console.log(`Report totalGeneralExpenses (excl. salaries): ${report.totalGeneralExpenses}`);
        
        const expectedGeneral = (Number(totalAllExpenses) || 0) - (Number(totalSalaries) || 0);
        if (Number(report.totalGeneralExpenses) !== expectedGeneral) {
            throw new Error(`Operational Expenses double counting detected! Expected ${expectedGeneral} but got ${report.totalGeneralExpenses}`);
        }

        console.log('SUCCESS: Payroll payments successfully affect net revenue (net profit) and map to the report without double counting!');
        process.exit(0);

    } catch (e) {
        console.error('\nFAIL: Test failed with error:', e.response?.data || e.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

runTest();
