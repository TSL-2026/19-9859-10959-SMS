const fs = require('fs');
const path = require('path');
const pool = require('../pool');

async function runMigrations() {
  const dir = __dirname;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file} failed:`, err.message);
      throw err;
    }
  }

  console.log('All migrations complete.');
  await pool.end();
}

runMigrations().catch(() => process.exit(1));
