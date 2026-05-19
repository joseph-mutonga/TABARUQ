const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '../public/admin');

function cleanHtmlFiles() {
    console.log('Scanning public/admin for HTML files...');
    if (!fs.existsSync(adminDir)) {
        console.error('Directory public/admin does not exist.');
        return;
    }

    const files = fs.readdirSync(adminDir);
    files.forEach(file => {
        const filePath = path.join(adminDir, file);
        if (fs.statSync(filePath).isFile() && file.endsWith('.html')) {
            if (file === 'customers.html') {
                // Delete the customers.html file
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted file: ${file}`);
                } catch (err) {
                    console.error(`Failed to delete ${file}:`, err.message);
                }
                return;
            }

            let content = fs.readFileSync(filePath, 'utf8');
            let updated = false;

            // Pattern for sidebar link (both with and without class="active")
            const sidebarPatterns = [
                /<li><a href="customers\.html"[^>]*><i class="fas fa-user-friends"><\/i>\s*Customers<\/a><\/li>/gi,
                /<li><a href="customers\.html"[^>]*><i class="fas fa-user-friends"><\/i>\s*Customers\s*<\/a>\s*<\/li>/gi,
                /<li>\s*<a href="customers\.html"[^>]*>\s*<i class="fas fa-user-friends"><\/i>\s*Customers\s*<\/a>\s*<\/li>/gi
            ];

            sidebarPatterns.forEach(pattern => {
                if (pattern.test(content)) {
                    content = content.replace(pattern, '');
                    updated = true;
                }
            });

            // Specific pattern for quick action button in index.html
            const quickActionPattern = /<button class="quick-action-button" onclick="navigateTo\('customers\.html'\)"><i class="fas fa-user-friends"><\/i>\s*Customers<\/button>/gi;
            if (quickActionPattern.test(content)) {
                content = content.replace(quickActionPattern, '');
                updated = true;
            }

            if (updated) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated navigation links in: ${file}`);
            }
        }
    });
    console.log('Clean up complete.');
}

cleanHtmlFiles();
