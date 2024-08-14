const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function testConnection() {
    const connection = await pool.getConnection();
    try {
        console.log('Successfully connected to the database.');
    } catch (error) {
        console.error('Database connection failed:', error);
    } finally {
        connection.release();
    }
}

testConnection();

module.exports = pool;
