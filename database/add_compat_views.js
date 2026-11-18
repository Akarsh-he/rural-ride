const { Client } = require('../backend/node_modules/pg');

const DATABASE_URL = 'postgresql://rural_mobility_app_user:uxLtn6xrRRaLd3xGNIF2RhDZ4wI6ll2j@dpg-dbusmbjrjlhs73b8k0j0-a.singapore-postgres.render.com/rural_mobility_app';

async function run() {
  const c = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  await c.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
    ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'unverified';
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity INT;
    UPDATE vehicles SET capacity = max_passengers WHERE capacity IS NULL;
    
    DROP VIEW IF EXISTS payments CASCADE;
    CREATE OR REPLACE VIEW payments AS 
    SELECT 
      id,
      booking_id,
      payer_id as user_id,
      amount,
      platform_fee as platform_commission,
      driver_payout as driver_earning,
      CASE WHEN status = 'success' THEN 'paid' ELSE status::text END as status,
      payment_method::text as method,
      created_at,
      updated_at
    FROM payment_transactions;

    CREATE OR REPLACE VIEW driver_documents AS 
    SELECT 
      id,
      driver_id,
      document_type::text as document_type,
      document_url,
      status::text as verification_status,
      review_notes as rejection_reason,
      updated_at as verified_at,
      created_at
    FROM driver_verifications;
  `);

  console.log('Compatibility views and columns created successfully!');
  await c.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
