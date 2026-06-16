const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

let _io = null;

function initSocket(httpServer) {
  if (_io) return _io;

  _io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // ─────────────────────────────────────────
  // AUTH MIDDLEWARE
  // ─────────────────────────────────────────
  _io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('No token'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      socket.userId = decoded.userId;

      next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  // ─────────────────────────────────────────
  // CONNECTION
  // ─────────────────────────────────────────
  _io.on('connection', (socket) => {

    const userRoom = `user:${socket.userId}`;
    socket.join(userRoom);

    console.log(`[Socket] User connected: ${socket.userId}`);

    // ─────────────────────────────────────────
    // JOIN CONVERSATION
    // ─────────────────────────────────────────
    socket.on('joinConversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    // ─────────────────────────────────────────
    // LEAVE CONVERSATION
    // ─────────────────────────────────────────
    socket.on('leaveConversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // ─────────────────────────────────────────
    // SEND MESSAGE (FULL PRISMA FLOW)
    // ─────────────────────────────────────────
    socket.on('sendMessage', async ({ conversationId, content }) => {
      try {

        // 1. Validate user is participant
        const participant = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId,
            userId: socket.userId
          }
        });

        if (!participant) return;

        // 2. Create message (MATCH YOUR SCHEMA)
        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId: socket.userId,
            content
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        // 3. Update conversation timestamp (important for sorting)
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            createdAt: new Date() // (schema has no lastMessageAt, so reuse createdAt)
          }
        });
         
        // 4. Emit to room
        _io.to(`conversation:${conversationId}`).emit(
          'newMessage',
          message
        );
      } catch (err) {
        console.log('[sendMessage error]', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] disconnected: ${socket.userId}`);
    });
  });

  return _io;
}

function getIO() {
  if (!_io) throw new Error('Socket not initialized');
  return _io;
}

module.exports = {
  initSocket,
  getIO
};