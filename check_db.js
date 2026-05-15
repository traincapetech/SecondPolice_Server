require('dotenv').config();
const { Client } = require('pg');

async function checkColumns() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'StandaloneInvoice'
    `);
    console.log('Columns in StandaloneInvoice:');
    res.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
  } catch (err) {
    console.error('Failed to query columns:', err.message);
  } finally {
    await client.end();
    process.exit();
  }
}

checkColumns();
