const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

// ─── Departments ──────────────────────────────────────────────────────────────

exports.getDepartments = async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true } },
      },
    });
    res.status(200).json({ status: 'success', data: { departments } });
  } catch (err) { next(err); }
};

exports.createDepartment = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['Departments'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { name, code, description } = req.body;
    if (!name) return next(new AppError('Department name is required', 400));

    const dept = await prisma.department.create({
      data: { tenantId: req.user.tenantId, name, code, description },
    });
    res.status(201).json({ status: 'success', data: { department: dept } });
  } catch (err) {
    if (err.code === 'P2002') return next(new AppError('Department name already exists', 400));
    next(err);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['Departments'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { id } = req.params;
    const { name, code, description } = req.body;

    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      return next(new AppError('Department not found', 404));
    }

    const dept = await prisma.department.update({
      where: { id },
      data: { name, code, description },
    });
    res.status(200).json({ status: 'success', data: { department: dept } });
  } catch (err) { next(err); }
};

exports.deleteDepartment = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['Departments'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { id } = req.params;
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      return next(new AppError('Department not found', 404));
    }
    await prisma.department.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
};

// ─── Designations ─────────────────────────────────────────────────────────────

exports.getDesignations = async (req, res, next) => {
  try {
    const designations = await prisma.designation.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { level: 'asc' },
      include: {
        _count: { select: { employees: true } },
      },
    });
    res.status(200).json({ status: 'success', data: { designations } });
  } catch (err) { next(err); }
};

exports.createDesignation = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['Departments'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { title, level, description } = req.body;
    if (!title) return next(new AppError('Designation title is required', 400));

    const desig = await prisma.designation.create({
      data: {
        tenantId: req.user.tenantId,
        title,
        level: level ? parseInt(level, 10) : 1,
        description,
      },
    });
    res.status(201).json({ status: 'success', data: { designation: desig } });
  } catch (err) {
    if (err.code === 'P2002') return next(new AppError('Designation title already exists', 400));
    next(err);
  }
};

exports.updateDesignation = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['Departments'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { id } = req.params;
    const { title, level, description } = req.body;

    const existing = await prisma.designation.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      return next(new AppError('Designation not found', 404));
    }

    const desig = await prisma.designation.update({
      where: { id },
      data: { title, level: level ? parseInt(level, 10) : existing.level, description },
    });
    res.status(200).json({ status: 'success', data: { designation: desig } });
  } catch (err) { next(err); }
};

exports.deleteDesignation = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['Departments'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { id } = req.params;
    const existing = await prisma.designation.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      return next(new AppError('Designation not found', 404));
    }
    await prisma.designation.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
};
