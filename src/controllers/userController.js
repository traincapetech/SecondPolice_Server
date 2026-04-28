const bcrypt = require('bcrypt');
const userService = require('../services/userService');
const { addEmployeeSchema } = require('../schemas/userSchema');
const AppError = require('../utils/appError');
const prisma = require('../lib/prisma');
const { notifyAdmins } = require('../utils/notifyAdmins');

// POST /api/users/add-employee (Admin only)
const addEmployee = async (req, res, next) => {
  try {
    const validationResult = addEmployeeSchema.safeParse(req.body);
    if (!validationResult.success) {
      return next(new AppError(validationResult.error.issues[0].message, 400));
    }
    const user = await userService.addEmployee(req.user.tenantId, validationResult.data);
    res.status(201).json({
      status: 'success',
      message: 'Employee successfully added to workspace.',
      data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId, companyName: user.companyName } },
    });

    // Notify admins — #12 New team member joined
    notifyAdmins({
      tenantId: req.user.tenantId,
      excludeId: req.user.id,
      type: 'TEAM_MEMBER_ADDED',
      title: '👥 New Team Member Added',
      body: `${req.user.name} added ${user.name} (${user.email}) to the workspace`,
      linkUrl: '/team',
    }).catch(console.error);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/:id (Admin only)
const deleteEmployee = async (req, res, next) => {
  try {
    const victim = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });
    if (!victim) return next(new AppError('User not found', 404));
    if (victim.role === 'ADMIN') return next(new AppError('Cannot delete an admin', 403));
    
    await prisma.user.delete({ where: { id: victim.id } });
    res.status(204).send();

    // Notify admins — #13 Team member removed
    notifyAdmins({
      tenantId: req.user.tenantId,
      excludeId: req.user.id,
      type: 'TEAM_MEMBER_REMOVED',
      title: '🚪 Team Member Removed',
      body: `${req.user.name} removed ${victim.name} (${victim.email}) from the workspace`,
      linkUrl: '/team',
    }).catch(console.error);
  } catch (err) {
    next(err);
  }
};

// GET /api/users — List all users in tenant (ADMIN + MANAGER)
const getTeamMembers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user.tenantId },
      select: {
        id: true, name: true, email: true, role: true, workspaceId: true, createdAt: true,
        customRole: { select: { id: true, name: true } },
        _count: { select: { deals: true, activities: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.status(200).json({ status: 'success', results: users.length, data: { users } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me — Update own name
const updateMe = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return next(new AppError('Name is required.', 400));

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true, role: true, workspaceId: true },
    });

    res.status(200).json({ status: 'success', data: { user } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me/password — Change own password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return next(new AppError('Please provide current and new password.', 400));
    if (newPassword.length < 8)
      return next(new AppError('New password must be at least 8 characters.', 400));

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCorrect) return next(new AppError('Current password is incorrect.', 401));

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });

    res.status(200).json({ status: 'success', message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { addEmployee, deleteEmployee, getTeamMembers, updateMe, changePassword };
