const fs = require('fs');
const path = require('path');
const { Client } = require('../backend/node_modules/pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://rural_mobility_app_user:uxLtn6xrRRaLd3xGNIF2RhDZ4wI6ll2j@dpg-dbusmbjrjlhs73b8k0j0-a.singapore-postgres.render.com/rural_mobility_app';

async function migrate() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Render PostgreSQL!');

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${migrationFiles.length} migration files.`);

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`Applying migration: ${file}...`);
    try {
      await client.query(sql);
      console.log(`✓ ${file} applied successfully.`);
    } catch (err) {
      console.error(`✗ Error applying ${file}:`, err.message);
      // If error is about relation or type already existing, we can inspect
      throw err;
    }
  }

  const seedsDir = path.join(__dirname, 'seeds');
  if (fs.existsSync(seedsDir)) {
    const seedFiles = fs.readdirSync(seedsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${seedFiles.length} seed files.`);

    for (const file of seedFiles) {
      const filePath = path.join(seedsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`Applying seed: ${file}...`);
      try {
        await client.query(sql);
        console.log(`✓ ${file} applied successfully.`);
      } catch (err) {
        console.warn(`! Warning applying seed ${file}:`, err.message);
      }
    }
  }

  console.log('\n=======================================');
  console.log('All migrations and seeds successfully completed!');
  console.log('=======================================');

  await client.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
