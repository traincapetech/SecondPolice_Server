const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to DB.');

    console.log('Checking for templateId column...');
    await client.query(`
      ALTER TABLE "StandaloneInvoice" 
      ADD COLUMN IF NOT EXISTS "templateId" TEXT DEFAULT 'basic';
    `);
    console.log('Successfully ensured templateId column exists.');

    console.log('Checking for invoiceDate column...');
    await client.query(`
      ALTER TABLE "StandaloneInvoice" 
      ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('Successfully ensured invoiceDate column exists.');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
