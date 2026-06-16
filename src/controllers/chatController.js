const prisma = require('../lib/prisma');
const { getIO } = require('../lib/socket');

exports.sendMessage = async (req, res) => {
  try {

    const {
      conversationId,
      content
    } = req.body;

    const senderId =
      req.user.id;

    const participant =
      await prisma.conversationParticipant.findFirst({

        where: {
          conversationId,
          userId: senderId
        }

      });

    if (!participant) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not allowed'
      });
    }

    const message =
      await prisma.message.create({

        data: {
          conversationId,
          senderId,
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

    await prisma.conversation.update({

      where: {
        id: conversationId
      },

      data: {
        lastMessageAt: new Date()
      }

    });

    getIO()
      .to(`conversation:${conversationId}`)
      .emit(
        'newMessage',
        message
      );

    return res.status(201).json({
      status: 'success',
      message
    });

  } catch (err) {

    return res.status(500).json({
      status: 'error',
      message: err.message
    });

  }
};

exports.getMessages = async (req, res) => {
  try {

    const {
      conversationId
    } = req.params;

    const messages =
      await prisma.message.findMany({

        where: {
          conversationId
        },

        include: {
          sender: {
            select: {
              id: true,
              name: true
            }
          }
        },

        orderBy: {
          createdAt: 'asc'
        }

      });

    return res.status(200).json({
      status: 'success',
      messages
    });

  } catch (err) {

    return res.status(500).json({
      status: 'error',
      message: err.message
    });

  }
};
exports.getAllEmployees = async (req, res) => {
  try {

    const employees = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id
        }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    return res.status(200).json({
      status: 'success',
      employees
    });

  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};