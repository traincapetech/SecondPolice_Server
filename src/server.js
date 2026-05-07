require('dotenv').config();
const http = require('http');
const app  = require('./app');
const { initSocket } = require('./lib/socket');

const PORT = process.env.PORT || 5000;

process.on('uncaughtException', err => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// Wrap Express in a native http.Server so Socket.IO can share the same port
const server = http.createServer(app);

// Attach Socket.IO (JWT auth + per-user rooms)
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

process.on('unhandledRejection', err => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

 
