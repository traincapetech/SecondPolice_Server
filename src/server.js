require('dotenv').config();
const https = require('https');  // change from 'http'
const http = require('http');
const fs = require('fs');
const app = require('./app');
const { initSocket } = require('./lib/socket');

const PORT = process.env.PORT || 8000;

process.on('uncaughtException', err => {
  console.log('UNCAUGHT EXCEPTION! Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// Use HTTPS in dev if certs exist, fallback to HTTP
let server;
const certPath = process.env.SSL_CERT;
const keyPath = process.env.SSL_KEY;

if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const sslOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  server = https.createServer(sslOptions, app);
  console.log('Running with HTTPS');
} else {
  server = http.createServer(app);
  console.log('Running with HTTP');
}

initSocket(server);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

process.on('unhandledRejection', err => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => { process.exit(1); });
});