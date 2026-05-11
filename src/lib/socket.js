const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let _io = null;

/**
 * Initialise Socket.IO, attach it to the http.Server,
 * wire up JWT authentication and per-user rooms.
 * Call this ONCE from server.js.
 */
function initSocket(httpServer) {
  _io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // ── Middleware: authenticate every socket connection via JWT ──────────────
  _io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication error: no token'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId   = decoded.userId;
      socket.tenantId = decoded.tenantId;

      // Dynamically require prisma to avoid circular dependency
      const prisma = require('./prisma');
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { role: true }
      });
      socket.userRole = user?.role;

      next();
    } catch {
      next(new Error('Authentication error: invalid token'));
    }
  });

  // ── On connection: join the user's private room ───────────────────────────
  _io.on('connection', (socket) => {
    const room = `user:${socket.userId}`;
    socket.join(room);
    console.log(`[Socket] ${socket.userId} connected → joined room "${room}"`);

    if (socket.userRole === 'ADMIN') {
      const adminRoom = `tenant:${socket.tenantId}:admin`;
      socket.join(adminRoom);
      console.log(`[Socket] ${socket.userId} (ADMIN) joined room "${adminRoom}"`);
    }

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] ${socket.userId} disconnected (${reason})`);
    });
  });

  return _io;
}

/**
 * Returns the Socket.IO server instance.
 * Throws if initSocket() has not been called yet.
 */
function getIO() {
  if (!_io) throw new Error('[Socket] io not initialised — call initSocket() first');
  return _io;
}

module.exports = { initSocket, getIO };
