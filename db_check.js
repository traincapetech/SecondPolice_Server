const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://postgres.kxxpndtycvvjixkaxnkl:t9d^QkZ#2!*w7@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
  });

  await client.connect();
  const res = await client.query('SELECT * FROM "Expense"');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

check().catch(console.error);
