const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

const EMPLOYEE_INCLUDE = {
  user: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, title: true, level: true } },
  manager: { select: { id: true, name: true, email: true } },
};

// GET all employees in the tenant
exports.getEmployees = async (req, res, next) => {
  try {
    const { department, status, search } = req.query;

    const where = { tenantId: req.user.tenantId };
    if (department) where.departmentId = department;
    if (status) where.employeeStatus = status;
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const employees = await prisma.employeeProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: EMPLOYEE_INCLUDE,
    });

    res.status(200).json({ status: 'success', results: employees.length, data: { employees } });
  } catch (err) { next(err); }
};

// GET single employee by profile id
exports.getEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await prisma.employeeProfile.findUnique({
      where: { id },
      include: EMPLOYEE_INCLUDE,
    });

    if (!employee || employee.tenantId !== req.user.tenantId) {
      return next(new AppError('Employee not found', 404));
    }

    res.status(200).json({ status: 'success', data: { employee } });
  } catch (err) { next(err); }
};

// POST – create employee profile for an existing User
exports.createEmployee = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['HR Directory'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }

    const {
      userId, departmentId, designationId, managerId,
      employeeCode, gender, dob, phone, address,
      emergencyContact, bloodGroup, joiningDate,
      probationEndDate, employmentType, workLocation,
      employeeStatus, basicSalary, workScheduleType, workingDays, weeklyOffs, customFields
    } = req.body;

    if (!userId) return next(new AppError('userId is required', 400));

    // Ensure the user belongs to the same tenant
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });
    if (!targetUser || targetUser.tenantId !== req.user.tenantId) {
      return next(new AppError('User not found in this tenant', 404));
    }

    // Check no profile already exists
    const existing = await prisma.employeeProfile.findUnique({ where: { userId } });
    if (existing) return next(new AppError('Employee profile already exists for this user', 400));

    const employee = await prisma.employeeProfile.create({
      data: {
        tenantId: req.user.tenantId,
        userId,
        departmentId: departmentId || null,
        designationId: designationId || null,
        managerId: managerId || null,
        employeeCode,
        gender,
        dob: dob ? new Date(dob) : null,
        phone,
        address,
        emergencyContact,
        bloodGroup,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        probationEndDate: probationEndDate ? new Date(probationEndDate) : null,
        employmentType: employmentType || 'FULL_TIME',
        workLocation: workLocation || 'OFFICE',
        employeeStatus: employeeStatus || 'ACTIVE',
        basicSalary: basicSalary ? parseFloat(basicSalary) : null,
        workScheduleType: workScheduleType || 'FIXED',
        workingDays: workingDays ? workingDays : undefined,
        weeklyOffs: weeklyOffs !== undefined ? parseInt(weeklyOffs) : 2,
        customFields: customFields || null,
      },
      include: EMPLOYEE_INCLUDE,
    });

    res.status(201).json({ status: 'success', data: { employee } });
  } catch (err) { next(err); }
};

// PUT – update employee profile
exports.updateEmployee = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['HR Directory'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }

    const { id } = req.params;
    const existing = await prisma.employeeProfile.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      return next(new AppError('Employee not found', 404));
    }

    const {
      departmentId, designationId, managerId,
      employeeCode, gender, dob, phone, address,
      emergencyContact, bloodGroup, joiningDate,
      probationEndDate, employmentType, workLocation,
      employeeStatus, basicSalary, workScheduleType, workingDays, weeklyOffs, customFields,
    } = req.body;

    const employee = await prisma.employeeProfile.update({
      where: { id },
      data: {
        departmentId: departmentId === '' ? null : (departmentId ?? existing.departmentId),
        designationId: designationId === '' ? null : (designationId ?? existing.designationId),
        managerId: managerId === '' ? null : (managerId ?? existing.managerId),
        employeeCode: employeeCode ?? existing.employeeCode,
        gender: gender === '' ? null : (gender ?? existing.gender),
        dob: dob ? new Date(dob) : existing.dob,
        phone: phone ?? existing.phone,
        address: address ?? existing.address,
        emergencyContact: emergencyContact ?? existing.emergencyContact,
        bloodGroup: bloodGroup ?? existing.bloodGroup,
        joiningDate: joiningDate ? new Date(joiningDate) : existing.joiningDate,
        probationEndDate: probationEndDate ? new Date(probationEndDate) : existing.probationEndDate,
        employmentType: employmentType ?? existing.employmentType,
        workLocation: workLocation ?? existing.workLocation,
        employeeStatus: employeeStatus ?? existing.employeeStatus,
        basicSalary: basicSalary !== undefined ? parseFloat(basicSalary) : existing.basicSalary,
        workScheduleType: workScheduleType ?? existing.workScheduleType,
        workingDays: workingDays ?? existing.workingDays,
        weeklyOffs: weeklyOffs !== undefined ? parseInt(weeklyOffs) : existing.weeklyOffs,
        customFields: customFields !== undefined ? customFields : existing.customFields,
      },
      include: EMPLOYEE_INCLUDE,
    });

    res.status(200).json({ status: 'success', data: { employee } });
  } catch (err) { next(err); }
};

// DELETE – remove employee profile (keeps User account)
exports.deleteEmployee = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.permissions?.['HR Directory'] !== 'Read & Write') {
      return next(new AppError('Permission denied', 403));
    }
    const { id } = req.params;
    const existing = await prisma.employeeProfile.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      return next(new AppError('Employee not found', 404));
    }
    await prisma.employeeProfile.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
};

// GET /me – own profile
exports.getMyProfile = async (req, res, next) => {
  try {
    const employee = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.id },
      include: EMPLOYEE_INCLUDE,
    });
    // It's okay if no profile exists yet — return null
    res.status(200).json({ status: 'success', data: { employee } });
  } catch (err) { next(err); }
};
