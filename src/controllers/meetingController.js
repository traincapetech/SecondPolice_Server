const prisma = require('../lib/prisma');
const { createNotification } = require('../services/notificationService');
const { getIO } = require('../lib/socket');
const AppError = require('../utils/appError');

const axios = require('axios');

const daily = axios.create({
  baseURL: 'https://api.daily.co/v1',
  headers: {
    Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Creates a Daily.co room. Returns the room object.
// Daily rooms are identified by name — same as our roomName.
const createDailyRoom = async (roomName) => {
  const res = await daily.post('/rooms', {
    name: roomName,
    privacy: 'private',       // token required to join
    properties: {
      enable_chat: true,
      enable_screenshare: true,
      enable_recording: false,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24h
    },
  });
  return res.data;
};

// Deletes a Daily.co room by name. Safe to call even if it doesn't exist.
const deleteDailyRoom = async (roomName) => {
  try {
    await daily.delete(`/rooms/${roomName}`);
  } catch (_) {
    // Ignore — room may have already been auto-deleted
  }
};

// Generates a Daily.co meeting token for a participant.
// isOwner: true = host/moderator, false = guest
const createDailyToken = async (roomName, userId, userName, isOwner) => {
  const res = await daily.post('/meeting-tokens', {
    properties: {
      room_name: roomName,
      user_id: userId,
      user_name: userName,
      is_owner: isOwner,
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    },
  });
  return res.data.token;
};

// Create a meeting
exports.createMeeting = async (req, res, next) => {
  try {
    const { title, roomName, guestIds } = req.body;
    const tenantId = req.user.tenantId;
    const hostId = req.user.id;

    if (!title) {
      return next(new AppError('Meeting title is required', 400));
    }

    // Generate sanitized roomName
    let finalRoomName = roomName;
    if (!finalRoomName) {
      const slug = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]/g, '');
      finalRoomName = `${slug}-${Date.now()}`;
    } else {
      finalRoomName = finalRoomName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]/g, '');
    }

    // Check if roomName is already active/taken

    let existing = await prisma.meeting.findUnique({
      where: { roomName: finalRoomName }
    });

    if (existing) {
      if (!existing.endedAt) {
        // If an active meeting already has this room name, append a unique timestamp to make it unique
        finalRoomName = `${finalRoomName}-${Date.now()}`;
      } else {
        // Old meeting ended — delete it so the new one can take the unique slot
        await prisma.meeting.delete({ where: { roomName: finalRoomName } });
      }
    }

    // Create the room on Daily.co
    await createDailyRoom(finalRoomName);

    // Start a transaction to create meeting and invitations
    const meeting = await prisma.meeting.create({
      data: {
        title,
        roomName: finalRoomName,
        tenantId,
        hostId,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    // Create invitations and notifications
    if (guestIds && Array.isArray(guestIds) && guestIds.length > 0) {
      // 1. Create MeetingInvitation records
      await prisma.meetingInvitation.createMany({
        data: guestIds.map(userId => ({
          meetingId: meeting.id,
          userId,
          status: 'PENDING'
        })),
        skipDuplicates: true
      });

      // 2. Create in-app notification records and push them (realtime + push notifications)
      for (const guestId of guestIds) {
        try {
          await createNotification({
            tenantId,
            userId: guestId,
            type: 'MEETING',
            title: 'New Meeting Invitation',
            body: `${req.user.name} has invited you to join a meeting: "${title}"`,
            linkUrl: `/meeting/${finalRoomName}`
          });

          // Send custom socket.io event to update their client state instantly
          try {
            getIO().to(`user:${guestId}`).emit('meetingInvitation', {
              meetingId: meeting.id,
              title,
              roomName: finalRoomName,
              hostName: req.user.name
            });
          } catch (socketErr) {
            console.warn('[Socket] failed to emit meetingInvitation:', socketErr.message);
          }

        } catch (notifErr) {
          console.error('[Notification] failed for user:', guestId, notifErr.message);
        }
      }
    }

    res.status(201).json({
      status: 'success',
      data: { meeting }
    });
  } catch (err) {
    next(err);
  }
};

// Join / Track meeting
exports.joinMeeting = async (req, res, next) => {
  try {
    const { roomName } = req.body;
    const userId = req.user.id;

    if (!roomName) {
      return next(new AppError('Room name is required', 400));
    }

    // Check if the meeting exists in our DB
    const meeting = await prisma.meeting.findUnique({
      where: { roomName }
    });

    if (!meeting) {
      // If we don't have a record of this meeting in our database, we can still return success
      // since the videocall component will just join the Jitsi room, but we can't track it.
      return res.status(200).json({
        status: 'success',
        message: 'Meeting room not tracked in database'
      });
    }

    if (meeting.endedAt) {
      return next(new AppError('This meeting has already been ended by the host', 400));
    }

    // Register join event: create or update the participant timestamp
    const participant = await prisma.meetingParticipant.upsert({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId
        }
      },
      create: {
        meetingId: meeting.id,
        userId,
        joinedAt: new Date()
      },
      update: {
        joinedAt: new Date()
      }
    });

    // Also update invitation status to ACCEPTED if they were invited
    await prisma.meetingInvitation.updateMany({
      where: {
        meetingId: meeting.id,
        userId,
        status: 'PENDING'
      },
      data: {
        status: 'ACCEPTED'
      }
    });

    res.status(200).json({
      status: 'success',
      data: { participant }
    });
  } catch (err) {
    next(err);
  }
};

// Get last 3 meetings joined
exports.getRecentMeetings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const participants = await prisma.meetingParticipant.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      take: 3,
      include: {
        meeting: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    const meetings = participants.map(p => ({
      id: p.meeting.id,
      title: p.meeting.title,
      roomName: p.meeting.roomName,
      createdAt: p.meeting.createdAt,
      endedAt: p.meeting.endedAt,
      joinedAt: p.joinedAt,
      host: p.meeting.host
    }));

    res.status(200).json({
      status: 'success',
      data: { meetings }
    });
  } catch (err) {
    next(err);
  }
};

// Get pending invitations
exports.getPendingInvitations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const invitations = await prisma.meetingInvitation.findMany({
      where: {
    userId,
    status: 'PENDING',
    meeting: {
      endedAt: null  
    }
  },
      orderBy: { createdAt: 'desc' },
      include: {
        meeting: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    res.status(200).json({
      status: 'success',
      data: { invitations }
    });
  } catch (err) {
    next(err);
  }
};

// Get details of a meeting by roomName
exports.getMeetingDetails = async (req, res, next) => {
  try {
    const { roomName } = req.params;

    const meeting = await prisma.meeting.findUnique({
      where: { roomName },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!meeting) {
      return next(new AppError('Meeting not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: { meeting }
    });
  } catch (err) {
    next(err);
  }
};

// End meeting (moderator/host only)
exports.endMeeting = async (req, res, next) => {
  try {
    const { roomName } = req.params;
    const userId = req.user.id;

    const meeting = await prisma.meeting.findUnique({
      where: { roomName }
    });

    if (!meeting) {
      return next(new AppError('Meeting not found', 404));
    }

    if (meeting.hostId !== userId) {
      return next(new AppError('Only the meeting host can end the meeting', 403));
    }

    // Set endedAt to current time
    const updatedMeeting = await prisma.meeting.update({
      where: { roomName },
      data: { endedAt: new Date() }
    });

    // Delete the room from Daily.co so the name can be reused
    await deleteDailyRoom(roomName);

    // Notify all participants in real-time via Socket.IO
    try {
      getIO().to(`meeting:${roomName}`).emit('meetingEnded', { roomName });
    } catch (socketErr) {
      console.warn('[Socket] failed to emit meetingEnded:', socketErr.message);
    }

    res.status(200).json({
      status: 'success',
      data: { meeting: updatedMeeting }
    });
  } catch (err) {
    next(err);
  }
};

exports.getMeetingToken = async (req, res, next) => {
  try {
    const { roomName } = req.query;
    const user = req.user;

    if (!roomName) {
      return next(new AppError('roomName query param is required', 400));
    }

    const meeting = await prisma.meeting.findUnique({
      where: { roomName },
    });

    if (!meeting) {
      return next(new AppError('Meeting not found', 404));
    }

    if (meeting.endedAt) {
      return next(new AppError('This meeting has already ended', 400));
    }

    const isOwner = meeting.hostId === user.id;

    const token = await createDailyToken(
      roomName,
      user.id,
      user.name,
      isOwner
    );

    const domain = process.env.DAILY_DOMAIN;
    const roomUrl = `https://${domain}.daily.co/${roomName}`;

    res.status(200).json({
      status: 'success',
      data: { token, roomUrl, isOwner },
    });
  } catch (err) {
    next(err);
  }
};
