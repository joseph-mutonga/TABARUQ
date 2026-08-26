const fs = require('fs');
const path = require('path');

const files = [
    'expenses.html',
    'index.html',
    'inventory.html',
    'reports.html',
    'stocks.html',
    'users.html',
    'workers.html',
    'settings.html',
    'history.html'
];

const adminDir = path.join(__dirname, '../public/admin');

for (const file of files) {
    const filePath = path.join(adminDir, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // 1. Update Sidebar HTML
        const targetHtml = '<li><a href="../cashier/orders.html"><i class="fas fa-check-double"></i> Confirm Payments <span id="pendingBadge" class="notification-badge" style="display: none;">0</span></a></li>';
        const replacementHtml = '<li><a href="../cashier/orders.html"><i class="fas fa-check-double"></i> Confirm Payments <span id="pendingBadge" class="notification-badge" style="display: none;">0</span></a></li>\n                <li><a href="../cashier/scheduled.html"><i class="fas fa-calendar-alt"></i> Scheduled Orders <span id="scheduledBadge" class="notification-badge" style="display: none;">0</span></a></li>';
        
        if (content.includes(targetHtml)) {
            content = content.replace(targetHtml, replacementHtml);
            console.log(`Updated sidebar HTML in ${file}`);
        } else {
            console.log(`Sidebar target HTML not found in ${file}`);
        }
        
        // 2. Update Badge query JS function using regex
        const regex = /async\s+function\s+checkPendingPayments\(\)\s*\{\s*try\s*\{\s*const\s+response\s*=\s*await\s+apiFetch\(\'\/payments\/pending-count\'\);\s*const\s+badge\s*=\s*document\.getElementById\(\'pendingBadge\'\);\s*if\s*\(response\.count\s*>\s*0\)\s*\{\s*badge\.textContent\s*=\s*response\.count;\s*badge\.style\.display\s*=\s*\'inline-block\';\s*\}\s*else\s*\{\s*badge\.style\.display\s*=\s*\'none\';\s*\}\s*\}\s*catch\s*\(err\)\s*\{\s*console\.error\(err\);\s*\}\s*\}/g;
        
        const replacementJs = `async function checkPendingPayments() {
            try {
                const response = await apiFetch('/payments/pending-count');
                const badge = document.getElementById('pendingBadge');
                if (badge) {
                    if (response.count > 0) {
                        badge.textContent = response.count;
                        badge.style.display = 'inline-block';
                    } else {
                        badge.style.display = 'none';
                    }
                }

                // Also update scheduled badge
                const schedRes = await apiFetch('/orders/scheduled');
                const schedBadge = document.getElementById('scheduledBadge');
                if (schedBadge) {
                    const count = schedRes.data ? schedRes.data.length : 0;
                    if (count > 0) {
                        schedBadge.textContent = count;
                        schedBadge.style.display = 'inline-block';
                    } else {
                        schedBadge.style.display = 'none';
                    }
                }
            } catch (err) { console.error(err); }
        }`;

        content = content.replace(regex, replacementJs);
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Processed ${file}`);
    }
}
console.log('Admin sidebars and JS scripts updated successfully!');
