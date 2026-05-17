const pool = require('../db/pool');

async function findByEmail(email, tenantId) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND tenant_id = $2',
    [email, tenantId]
  );
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function create(data) {
  const { tenant_id, email, name, role } = data;
  const result = await pool.query(
    `INSERT INTO users (tenant_id, email, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [tenant_id, email, name, role || 'member']
  );
  return result.rows[0];
}

module.exports = { findByEmail, findById, create };
