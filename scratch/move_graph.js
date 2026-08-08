const fs = require('fs');
const path = require('path');

// 1. Remove graph from delivery.html
const deliveryPath = path.join(__dirname, '../public/admin/delivery.html');
if (fs.existsSync(deliveryPath)) {
    let deliveryHtml = fs.readFileSync(deliveryPath, 'utf8');
    
    // Remove the script tag
    deliveryHtml = deliveryHtml.replace('    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n', '');
    
    // Remove the HTML card
    deliveryHtml = deliveryHtml.replace(/<div class="glass-card" style="margin-top:2rem;" id="summaryGraphCard">[\s\S]*?<\/div>\s*<\/div>/, '');
    
    // Remove the JS function
    deliveryHtml = deliveryHtml.replace(/let summaryChartInstance = null;[\s\S]*?}\n        }\n/, '');
    
    // Remove the function calls
    deliveryHtml = deliveryHtml.replaceAll('\n            loadSummaryChart();', '');
    deliveryHtml = deliveryHtml.replaceAll('\n                    loadSummaryChart();', '');
    
    fs.writeFileSync(deliveryPath, deliveryHtml, 'utf8');
}

// 2. Add graph to reports.html
const reportsPath = path.join(__dirname, '../public/admin/reports.html');
if (fs.existsSync(reportsPath)) {
    let reportsHtml = fs.readFileSync(reportsPath, 'utf8');
    
    if (!reportsHtml.includes('chart.js')) {
        reportsHtml = reportsHtml.replace('</head>', '    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n</head>');
    }
    
    const chartUi = `
            <div class="glass-card" style="margin-top: 2rem;">
                <h3 style="color: #ffffff; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.2); margin-bottom: 1rem;">Comprehensive Financial Summary</h3>
                <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 1rem; position: relative; height: 350px;">
                    <canvas id="financialChart"></canvas>
                </div>
            </div>
    `;
    
    if (!reportsHtml.includes('id="financialChart"')) {
        reportsHtml = reportsHtml.replace('</div>\n\n            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-top: 2rem;">', '</div>\n' + chartUi + '\n            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-top: 2rem;">');
    }
    
    const chartJs = `
        let financialChartInstance = null;
        function updateFinancialChart(sales, expenses, payroll, profit) {
            const ctx = document.getElementById('financialChart').getContext('2d');
            if (financialChartInstance) financialChartInstance.destroy();
            
            financialChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Period Sales', 'Operational Expenses', 'Workforce Payroll', 'Net Revenue'],
                    datasets: [{
                        label: 'Amount (KES)',
                        data: [sales, expenses, payroll, profit],
                        backgroundColor: [
                            'rgba(59, 130, 246, 0.7)',
                            'rgba(239, 68, 68, 0.7)',
                            'rgba(245, 158, 11, 0.7)',
                            'rgba(16, 185, 129, 0.7)'
                        ],
                        borderColor: [
                            'rgba(59, 130, 246, 1)',
                            'rgba(239, 68, 68, 1)',
                            'rgba(245, 158, 11, 1)',
                            'rgba(16, 185, 129, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                        y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                    }
                }
            });
        }
    `;
    
    if (!reportsHtml.includes('updateFinancialChart')) {
        reportsHtml = reportsHtml.replace('async function generateReports() {', chartJs + '\n\n        async function generateReports() {');
        
        const hookStr = `document.getElementById('pProfit').textContent = formatCurrency(profitResp.data.netProfit);\n\n                updateFinancialChart(profitResp.data.totalSales, profitResp.data.totalGeneralExpenses, profitResp.data.totalPayroll, profitResp.data.netProfit);`;
        reportsHtml = reportsHtml.replace('document.getElementById(\'pProfit\').textContent = formatCurrency(profitResp.data.netProfit);', hookStr);
    }
    
    fs.writeFileSync(reportsPath, reportsHtml, 'utf8');
}

console.log('Graph moved to reports.html successfully.');
