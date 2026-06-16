const prisma = require('../lib/prisma');

const  {groupSchema} = require('../schemas/userSchema')
exports.createConversation = async (req, res) => {
  try {
    const { participantIds = [] } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized user"
      });
    }

    const currentUserId = req.user.id;

    const uniqueUsers = [
      ...new Set([currentUserId, ...participantIds])
    ];

    if (uniqueUsers.length !== 2) {
      return res.status(400).json({
        status: "fail",
        message: "Direct message requires exactly 2 users"
      });
    }

    const [userA, userB] = uniqueUsers;

    const existing = await prisma.conversation.findFirst({
  where: {
    isGroup: false,
    AND: [
      {
        participants: {
          some: { userId: userA }
        }
      },
      {
        participants: {
          some: { userId: userB }
        }
      }
    ]
  },
  include: {
    participants: true
  }
});

    if (existing) {
      return res.status(200).json({
        status: "success",
        conversation: existing
      });
    }

    const newConversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        participants: {
          create: uniqueUsers.map(userId => ({ userId }))
        }
      },
      include: {
        participants: {
          include: {
            user: true
          }
        }
      }
    });

    return res.status(201).json({
      status: "success",
      conversation: newConversation
    });

  } catch (err) {
    console.log("CREATE CONV ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};

exports.createGroup = async (req, res) => {
  try {
    
    const parsedData = groupSchema.safeParse(req.body);
    
    
    if (!parsedData.success) {
      return res.status(400).json({ 
        status: 'error',
        message: "Send correct data for group",
        errors: parsedData.error.errors
      });
    }

    const name = parsedData.data.name;
    const participantIds = parsedData.data.participantIds;

    const currentUserId = req.user.id;

    const users = [
      ...new Set([
        currentUserId,
        ...participantIds
      ])
    ];

    if (users.length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'Group must contain at least 2 users total'
      });
    }

    const group = await prisma.conversation.create({
      data: {
        isGroup: true,
        name,
        adminId:req.user.id,
        participants: {
          create: users.map(userId => ({
            userId
          }))
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    return res.status(201).json({
      status: 'success',
      conversation: group
    });

  } catch (err) {
    console.error("DEBUG ERROR TRACE:", err);
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.getConversations = async (req, res) => {
  try {

    const userId =
      req.user.id;

    const conversations =
      await prisma.conversation.findMany({

        where: {
          participants: {
            some: {
              userId
            }
          }
        },

        include: {

          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },

          messages: {
            take: 1,
            orderBy: {
              createdAt: 'desc'
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }

        },

        orderBy: {
          createdAt: 'desc'
        }

      });

    return res.status(200).json({
      status: 'success',
      conversations
    });

  } catch (err) {

    return res.status(500).json({
      status: 'error',
      message: err.message
    });

  }
};
exports.addParticipant = async (req, res) => {
  try {
    const { conversationId, employeeIds } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Missing conversationId parameter node'
      });
    }

    // Normalize input: safely convert a single string or an array into a flat array
    let targetUserIds = [];
    if (Array.isArray(employeeIds)) {
      targetUserIds = employeeIds;
    } else if (typeof employeeIds === 'string') {
      targetUserIds = [employeeIds];
    }

    if (targetUserIds.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a valid employeeId or array of employeeIds'
      });
    }

    // Clean up duplicates from payload
    const uniqueUserIds = [...new Set(targetUserIds)];

    // Map to Prisma transaction shape
    const participantsData = uniqueUserIds.map(id => ({
      conversationId,
      userId: id
    }));

    // Batch creation with unique constraint skip guard
    await prisma.conversationParticipant.createMany({
      data: participantsData,
      skipDuplicates: true 
    });

    // Fetch complete updated conversation context to push down stream
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
                }
              }
            },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    return res.status(200).json({
      status: 'success',
      conversation: updatedConversation
    });

  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};
exports.deleteParticipant = async (req, res) => {
  try {
 const { id, groupId } = req.query;
    const group = await prisma.conversation.findFirst({
      where: {
        id: groupId,
        adminId: req.user.id,
      },
    });
    if (!group) {
      return res.status(403).json({
        message: "Unauthorized",
      });
    }
  
          await prisma.conversationParticipant.deleteMany({
            where: {
              conversationId: groupId,
              userId: id,
            },
          });
    return res.status(200).json({
      message: "User removed successfully",
    });

  } catch (error) {
    console.log(error)
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};