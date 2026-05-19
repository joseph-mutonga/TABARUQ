const db = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function inspectSchema() {
    try {
        const [tables] = await db.query('SHOW TABLES');
        const tableNames = tables.map(r => Object.values(r)[0]);
        
        let schemaSql = `-- TABARUQ Foods Database Live Schema Dump\n\n`;
        schemaSql += `CREATE DATABASE IF NOT EXISTS \`tabaruq_foods\`;\n`;
        schemaSql += `USE \`tabaruq_foods\`;\n\n`;

        for (const tableName of tableNames) {
            const [createTable] = await db.query(`SHOW CREATE TABLE \`${tableName}\``);
            schemaSql += `-- Table structure for table \`${tableName}\`\n`;
            schemaSql += createTable[0]['Create Table'] + ';\n\n';
        }
        
        fs.writeFileSync(path.join(__dirname, 'actual_schema.sql'), schemaSql);
        console.log('Schema written to scratch/actual_schema.sql');
        process.exit(0);
    } catch (error) {
        console.error('Inspection failed:', error);
        process.exit(1);
    }
}

inspectSchema();
