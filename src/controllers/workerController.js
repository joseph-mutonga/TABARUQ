const db = require('../config/db');

exports.getWorkers = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT w.*, 
                (SELECT COUNT(*) FROM attendance WHERE worker_id = w.id AND status = 'present' AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)) as present_days,
                (SELECT COUNT(*) FROM attendance WHERE worker_id = w.id AND status = 'half-day' AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)) as half_days
            FROM workers w 
            ORDER BY w.name ASC
        `);
        
        // Add accrued calculation (assuming 6 day work week)
        const data = rows.map(w => {
            const effectiveDays = Number(w.present_days) + (Number(w.half_days) * 0.5);
            const dailyRate = Number(w.weekly_salary) / 6;
            return {
                ...w,
                accrued_this_week: effectiveDays * dailyRate
            };
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


exports.addWorker = async (req, res) => {
    const { name, phone, role, weekly_salary } = req.body;
    try {
        await db.execute(
            'INSERT INTO workers (name, phone, role, weekly_salary) VALUES (?, ?, ?, ?)',
            [name, phone, role, weekly_salary || 0]
        );
        res.status(201).json({ success: true, message: 'Worker added' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateWorker = async (req, res) => {
    const { id } = req.params;
    const { name, phone, role, weekly_salary, status } = req.body;
    try {
        await db.execute(
            'UPDATE workers SET name=?, phone=?, role=?, weekly_salary=?, status=? WHERE id=?',
            [name, phone, role, weekly_salary, status, id]
        );
        res.json({ success: true, message: 'Worker updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteWorker = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM workers WHERE id = ?', [id]);
        res.json({ success: true, message: 'Worker deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getWorkerPayments = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT wp.*, w.name as worker_name 
            FROM worker_payments wp 
            JOIN workers w ON wp.worker_id = w.id 
            ORDER BY wp.payment_date DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.recordWorkerPayment = async (req, res) => {
    const { worker_id, amount, payment_date, week_start, week_end, status, notes } = req.body;
    try {
        await db.execute(
            'INSERT INTO worker_payments (worker_id, amount, payment_date, week_start, week_end, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [worker_id, amount, payment_date, week_start, week_end, status || 'paid', notes]
        );
        res.status(201).json({ success: true, message: 'Payment recorded' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
exports.markAttendance = async (req, res) => {
    const { worker_id, date, status } = req.body;
    try {
        await db.execute(
            'INSERT INTO attendance (worker_id, date, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
            [worker_id, date, status, status]
        );
        res.json({ success: true, message: 'Attendance marked' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getAttendance = async (req, res) => {
    const { date } = req.query;
    try {
        const [rows] = await db.execute(
            'SELECT a.status, w.name as worker_name, w.id as worker_id, w.role FROM workers w LEFT JOIN attendance a ON a.worker_id = w.id AND a.date = ? WHERE w.status = "active"',
            [date]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

function getISOWeekDates(dateString) {
    const d = dateString ? new Date(dateString) : new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const temp = new Date(monday);
        temp.setDate(monday.getDate() + i);
        dates.push(temp.toISOString().split('T')[0]);
    }
    return dates;
}

exports.getWeeklyAttendance = async (req, res) => {
    const { date } = req.query;
    try {
        const dates = getISOWeekDates(date);
        const mondayStr = dates[0];
        const sundayStr = dates[6];

        const [rows] = await db.execute(`
            SELECT a.date, a.status, w.name as worker_name, w.id as worker_id, w.role 
            FROM workers w 
            LEFT JOIN attendance a ON a.worker_id = w.id AND a.date >= ? AND a.date <= ?
            WHERE w.status = "active"
            ORDER BY w.name ASC
        `, [mondayStr, sundayStr]);

        const workersMap = {};
        rows.forEach(row => {
            if (!workersMap[row.worker_id]) {
                workersMap[row.worker_id] = {
                    worker_id: row.worker_id,
                    worker_name: row.worker_name,
                    role: row.role,
                    attendance: {}
                };
            }
            if (row.date) {
                let dateStr;
                if (row.date instanceof Date) {
                    dateStr = row.date.toISOString().split('T')[0];
                } else {
                    dateStr = String(row.date).split('T')[0];
                }
                workersMap[row.worker_id].attendance[dateStr] = row.status;
            }
        });

        res.json({
            success: true,
            dates,
            data: Object.values(workersMap)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
