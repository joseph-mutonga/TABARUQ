const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
    console.log('Connecting to MySQL...');
    
    // Connect without database selected to create it first
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        multipleStatements: true
    });

    try {
        console.log(`Checking/Creating database: ${process.env.DB_NAME}`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        await connection.query(`USE ${process.env.DB_NAME}`);

        console.log('Reading schema.sql...');
        const schemaPath = path.join(__dirname, '../schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split by semicolon but watch out for semicolons inside strings/enums
        // For simplicity with this schema, we can use multipleStatements: true 
        // to execute the whole thing at once if it's formatted well.
        console.log('Executing schema...');
        await connection.query(schema);

        console.log('Database initialized successfully!');
    } catch (error) {
        console.error('Error initializing database:', error.message);
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('Hint: Check your DB_USER and DB_PASS in .env file.');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('Hint: Ensure your MySQL Server is running.');
        }
    } finally {
        await connection.end();
    }
}

initializeDatabase();
