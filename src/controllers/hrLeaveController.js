const prisma = require('../lib/prisma');

/**
 * Get leave requests.
 * Normal employee: only theirs.
 * HR Admin: all in tenant.
 * Manager: theirs + employees who report to them (we will do HR Admin vs Employee for now to keep it simple, per Phase 2 scope).
 */
exports.getLeaves = async (req, res) => {
  try {
    const { user } = req;
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['HR'] === 'Read & Write';
    
    let targetEmployeeProfileId = null;
    
    if (!isHRAdmin) {
      const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return res.status(404).json({ success: false, error: 'Employee profile not found.' });
      targetEmployeeProfileId = profile.id;
    }

    const { status, employeeProfileId } = req.query;

    const where = { tenantId: user.tenantId };
    
    if (targetEmployeeProfileId) {
      where.employeeProfileId = targetEmployeeProfileId;
    } else if (employeeProfileId) {
      where.employeeProfileId = employeeProfileId;
    }

    if (status) {
      where.status = status; // PENDING, APPROVED, REJECTED
    }

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: {
        employeeProfile: {
          include: {
            user: { select: { name: true, email: true } },
            department: { select: { name: true } }
          }
        },
        approvedBy: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: { leaves } });
  } catch (error) {
    console.error('[getLeaves]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Apply for leave
 */
exports.applyLeave = async (req, res) => {
  try {
    const { user } = req;
    const { leaveType, startDate, endDate, totalDays, reason } = req.body;

    const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'You do not have an employee profile linked.' });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeProfileId: profile.id,
        leaveType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays: Number(totalDays),
        reason,
        status: 'PENDING'
      }
    });

    res.json({ success: true, data: { leave }, message: 'Leave request submitted successfully.' });
  } catch (error) {
    console.error('[applyLeave]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Update leave status (Approve/Reject)
 * Requires HR Admin permission
 */
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { status, managerRemarks } = req.body; // APPROVED or REJECTED

    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['HR'] === 'Read & Write';
    if (!isHRAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized to approve/reject leaves.' });
    }

    const existing = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ success: false, error: 'Leave request not found.' });
    }

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        managerRemarks,
        approvedById: user.id
      }
    });

    res.json({ success: true, data: { leave }, message: `Leave request ${status.toLowerCase()} successfully.` });
  } catch (error) {
    console.error('[updateLeaveStatus]', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
