const prisma = require('../lib/prisma');
const { startOfDay, endOfDay, differenceInMinutes } = require('date-fns');

/**
 * Get attendance records.
 * For normal employees, returns only their own attendance.
 * For Admins or users with HR 'Read & Write', returns all.
 */
exports.getAttendance = async (req, res) => {
  try {
    const { user } = req;
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['HR'] === 'Read & Write';
    
    // Determine the target employee. If not HRAdmin, force to self.
    let targetEmployeeProfileId = null;
    
    if (!isHRAdmin) {
      const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return res.status(404).json({ success: false, error: 'Employee profile not found for user.' });
      targetEmployeeProfileId = profile.id;
    }

    const { month, year, employeeProfileId } = req.query;

    const where = { tenantId: user.tenantId };
    if (targetEmployeeProfileId) {
      where.employeeProfileId = targetEmployeeProfileId;
    } else if (employeeProfileId) {
      where.employeeProfileId = employeeProfileId;
    }

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      where.date = { gte: startDate, lte: endDate };
    }

    const records = await prisma.attendance.findMany({
      where,
      include: {
        employeeProfile: {
          include: {
            user: { select: { name: true, email: true } },
            department: { select: { name: true } },
            designation: { select: { title: true } }
          }
        }
      },
      orderBy: { date: 'desc' },
      take: 100 // default limit to avoid huge payload
    });

    res.json({ success: true, data: { records } });
  } catch (error) {
    console.error('[getAttendance]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Clock In for the current day.
 */
exports.clockIn = async (req, res) => {
  try {
    const { user } = req;
    const { workMode, remarks } = req.body;

    const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'You do not have an employee profile linked.' });
    }

    const now = new Date();
    const today = startOfDay(now);

    // Check if already checked in today
    const existing = await prisma.attendance.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeProfileId: profile.id,
        date: { gte: today, lte: endOfDay(now) }
      }
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Already clocked in today.' });
    }

    const attendance = await prisma.attendance.create({
      data: {
        tenantId: user.tenantId,
        employeeProfileId: profile.id,
        date: today,
        checkIn: now,
        status: 'PRESENT',
        workMode: workMode || 'OFFICE',
        remarks
      }
    });

    res.json({ success: true, data: { attendance }, message: 'Clocked in successfully.' });
  } catch (error) {
    console.error('[clockIn]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Clock Out for the current day.
 */
exports.clockOut = async (req, res) => {
  try {
    const { user } = req;

    const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Employee profile not found.' });
    }

    const now = new Date();
    const today = startOfDay(now);

    const existing = await prisma.attendance.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeProfileId: profile.id,
        date: { gte: today, lte: endOfDay(now) }
      }
    });

    if (!existing) {
      return res.status(400).json({ success: false, error: 'No active clock-in found for today.' });
    }

    if (existing.checkOut) {
      return res.status(400).json({ success: false, error: 'Already clocked out today.' });
    }

    // Calculate total hours
    const mins = differenceInMinutes(now, new Date(existing.checkIn));
    const totalHours = Number((mins / 60).toFixed(2));

    const attendance = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOut: now,
        totalHours
      }
    });

    res.json({ success: true, data: { attendance }, message: 'Clocked out successfully.' });
  } catch (error) {
    console.error('[clockOut]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get "today's" status for the logged-in user.
 */
exports.getTodayStatus = async (req, res) => {
  try {
    const { user } = req;
    
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return res.json({ success: true, data: { status: 'NO_PROFILE' } });

    const today = startOfDay(new Date());

    const existing = await prisma.attendance.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeProfileId: profile.id,
        date: { gte: today, lte: endOfDay(new Date()) }
      }
    });

    if (!existing) {
      return res.json({ success: true, data: { status: 'NOT_CLOCKED_IN' } });
    } else if (existing.checkOut) {
      return res.json({ success: true, data: { status: 'CLOCKED_OUT', record: existing } });
    } else {
      return res.json({ success: true, data: { status: 'CLOCKED_IN', record: existing } });
    }
  } catch (error) {
    console.error('[getTodayStatus]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
