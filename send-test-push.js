require('dotenv').config();
const admin = require('firebase-admin');
const prisma = require('./src/lib/prisma');
const { sendPushNotification } = require('./src/utils/firebasePush');

async function testPush() {
  const token = process.argv[2];

  if (token) {
    console.log(`Sending test push directly to token: ${token}`);
    
    if (!admin.apps.length) {
      console.log("Firebase Admin not initialized in utils, make sure .env is correct");
      process.exit(1);
    }

    const message = {
      notification: {
        title: 'Test Notification',
        body: 'This is a test push from the backend server!',
      },
      token: token,
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('Successfully sent message:', response);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  } else {
    console.log("No token provided as an argument. Looking up latest user with an FCM token in the database...");
    
    const user = await prisma.user.findFirst({
      where: { fcmToken: { not: null } },
      select: { id: true, fcmToken: true, name: true, email: true }
    });

    if (!user) {
      console.log("❌ No users found with an FCM token in the database.");
      console.log("Usage: node send-test-push.js \"YOUR_FCM_TOKEN\"");
      process.exit(0);
    }

    console.log(`✅ Found token for user ${user.name} (${user.email}). Sending push...`);
    
    const response = await sendPushNotification(
      user.id, 
      '🚀 Test Push Notification', 
      'It works! Your push integration is fully functional.'
    );
    
    if (response) {
      console.log("✅ Push notification dispatched! Response ID:", response);
    } else {
      console.log("❌ Failed to send push notification. Please check logs.");
    }
  }
  
  process.exit(0);
}

testPush();
