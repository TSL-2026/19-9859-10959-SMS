require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE (oid 1082) as 'YYYY-MM-DD' string instead of local-time Date object
types.setTypeParser(1082, (str) => str);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'safety_monitor_dev',
  user: process.env.DB_USER || 'gsa',
  password: process.env.DB_PASSWORD || '',
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

module.exports = pool;
