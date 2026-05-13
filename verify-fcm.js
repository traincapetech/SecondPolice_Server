require('dotenv').config();
const axios = require('axios');

async function verify() {
  const email = 'nitin@traincapetech.in';
  const password = 'Canada@1212';
  const baseUrl = 'http://localhost:8000/api';

  try {
    console.log(`Logging in as ${email}...`);
    const loginRes = await axios.post(`${baseUrl}/auth/login`, { email, password });
    const token = loginRes.data.token;
    console.log('Login successful!');

    const dummyFcmToken = 'eXp1A...dummy_token...';
    console.log('Updating FCM token...');
    const patchRes = await axios.patch(
      `${baseUrl}/auth/fcm-token`, 
      { fcmToken: dummyFcmToken },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Update result:', patchRes.data);

    console.log('Verifying in DB...');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { email }, select: { fcmToken: true } });
    console.log('FCM Token in DB:', user.fcmToken);
    await prisma.$disconnect();

  } catch (error) {
    console.error('Verification failed:', error.response?.data || error.message);
  }
}

verify();
