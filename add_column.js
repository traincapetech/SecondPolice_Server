require('dotenv').config();
const { Client } = require('pg');

async function addColumn() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('Attempting to add templateId column...');
    await client.query(`ALTER TABLE "StandaloneInvoice" ADD COLUMN IF NOT EXISTS "templateId" text DEFAULT 'basic'`);
    console.log('SUCCESS: Column templateId added!');
  } catch (err) {
    console.error('FAILED:', err.message);
  } finally {
    await client.end();
    process.exit();
  }
}

addColumn();
