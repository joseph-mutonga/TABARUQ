const fs = require('fs');
const path = require('path');

const deliveryHtmlPath = path.join(__dirname, '../public/admin/delivery.html');
let html = fs.readFileSync(deliveryHtmlPath, 'utf8');

if (!html.includes('chart.js')) {
    html = html.replace('</head>', '    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n</head>');
}

const graphHtml = `
            <div class="glass-card" style="margin-top:2rem;" id="summaryGraphCard">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h3>Delivery Revenue Summary</h3>
                </div>
                <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 1rem; position: relative; height: 350px;">
                    <canvas id="summaryChart"></canvas>
                </div>
            </div>
`;

if (!html.includes('id="summaryChart"')) {
    const sectionRegex = /(<\/div>\s*)(<div class="glass-card" style="margin-top:2rem;">\s*<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">\s*<h3 style="margin:0;">Delivery Order History<\/h3>)/;
    html = html.replace(sectionRegex, '$1' + graphHtml + '\n\n$2');
}

const scriptLogic = `
        let summaryChartInstance = null;
        async function loadSummaryChart() {
            try {
                const res = await apiFetch('/delivery/reports/reconciliation');
                if (!res || !Array.isArray(res)) return;

                const labels = [];
                const grossData = [];
                const netData = [];
                const commissionData = [];

                res.forEach(row => {
                    labels.push(row.platform);
                    grossData.push(Number(row.gross_revenue) || 0);
                    netData.push(Number(row.net_revenue) || 0);
                    commissionData.push(Number(row.commission_amount) || 0);
                });

                const ctx = document.getElementById('summaryChart').getContext('2d');
                if (summaryChartInstance) summaryChartInstance.destroy();

                summaryChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Gross Revenue (KES)',
                                data: grossData,
                                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                                borderColor: 'rgba(59, 130, 246, 1)',
                                borderWidth: 1
                            },
                            {
                                label: 'Net Revenue (KES)',
                                data: netData,
                                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                                borderColor: 'rgba(16, 185, 129, 1)',
                                borderWidth: 1
                            },
                            {
                                label: 'Commissions (KES)',
                                data: commissionData,
                                backgroundColor: 'rgba(249, 115, 22, 0.7)',
                                borderColor: 'rgba(249, 115, 22, 1)',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { labels: { color: '#fff' } }
                        },
                        scales: {
                            x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                            y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                        }
                    }
                });

            } catch (err) {
                console.error("Failed to load chart", err);
            }
        }
`;

if (!html.includes('loadSummaryChart()')) {
    html = html.replace(/(if \(user && user\.role === 'admin'\) {\s*loadReconciliation\(\);\s*loadStats\(\);)/, scriptLogic + '\n        $1\n            loadSummaryChart();');
    
    // Also inject into the websocket reload handler
    html = html.replace(/(loadStats\(\);\s*\})/, 'loadStats();\n                    loadSummaryChart();\n                }');
}

fs.writeFileSync(deliveryHtmlPath, html, 'utf8');
console.log('Chart successfully injected into delivery.html');
