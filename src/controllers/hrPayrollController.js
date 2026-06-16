const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/**
 * Get all salary structures for the tenant
 */
exports.getSalaryStructures = async (req, res, next) => {
  try {
    const { user } = req;
    
    // Only Admin or HR Admin can view all structures
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['Payroll'] === 'Read & Write';
    if (!isHRAdmin) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view salary structures' });
    }

    const profiles = await prisma.employeeProfile.findMany({
      where: { tenantId: user.tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        department: { select: { name: true } },
        designation: { select: { title: true } },
        salaryStructure: true
      }
    });

    res.status(200).json({ success: true, data: { profiles } });
  } catch (error) {
    next(error);
  }
};

/**
 * Create or update a salary structure
 */
exports.setSalaryStructure = async (req, res, next) => {
  try {
    const { user } = req;
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['Payroll'] === 'Read & Write';
    if (!isHRAdmin) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { employeeProfileId, basicPay, hra, conveyance, medicalAllowance, specialAllowance, providentFund, professionalTax } = req.body;

    const structure = await prisma.salaryStructure.upsert({
      where: { employeeProfileId },
      create: {
        tenantId: user.tenantId,
        employeeProfileId,
        basicPay,
        hra: hra || 0,
        conveyance: conveyance || 0,
        medicalAllowance: medicalAllowance || 0,
        specialAllowance: specialAllowance || 0,
        providentFund: providentFund || 0,
        professionalTax: professionalTax || 0,
      },
      update: {
        basicPay,
        hra: hra || 0,
        conveyance: conveyance || 0,
        medicalAllowance: medicalAllowance || 0,
        specialAllowance: specialAllowance || 0,
        providentFund: providentFund || 0,
        professionalTax: professionalTax || 0,
      }
    });

    res.status(200).json({ success: true, data: { structure }, message: 'Salary structure updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payslips
 */
exports.getPayslips = async (req, res, next) => {
  try {
    const { user } = req;
    const { month, year } = req.query;
    
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['Payroll'] === 'Read & Write';
    
    const where = { tenantId: user.tenantId };
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);

    if (!isHRAdmin) {
      // Normal users only see their PUBLISHED or PAID payslips
      const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return res.status(200).json({ success: true, data: { payslips: [] } });
      where.employeeProfileId = profile.id;
      where.status = { in: ['PUBLISHED', 'PAID'] };
    }

    const payslips = await prisma.payslip.findMany({
      where,
      include: {
        tenant: { select: { name: true } },
        employeeProfile: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            department: { select: { name: true } },
            designation: { select: { title: true } }
          }
        }
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' }
      ]
    });

    res.status(200).json({ success: true, data: { payslips } });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate payroll for a given month/year
 */
exports.generatePayroll = async (req, res, next) => {
  try {
    const { user } = req;
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['Payroll'] === 'Read & Write';
    if (!isHRAdmin) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ success: false, error: 'Month and year are required' });

    // Fetch all active employee profiles
    const profiles = await prisma.employeeProfile.findMany({
      where: { tenantId: user.tenantId },
      include: {
        user: true,
        salaryStructure: true
      }
    });

    if (profiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No active employees found to generate payroll for.' });
    }

    // Fetch Attendance for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const attendances = await prisma.attendance.findMany({
      where: {
        tenantId: user.tenantId,
        date: { gte: startDate, lte: endDate },
        status: { in: ['PRESENT', 'HALF_DAY'] }
      }
    });

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'APPROVED',
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      }
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    let generatedCount = 0;

    for (const profile of profiles) {
      const struct = profile.salaryStructure || {
        basicPay: profile.basicSalary || 0,
        hra: 0, conveyance: 0, medicalAllowance: 0, specialAllowance: 0,
        providentFund: 0, professionalTax: 0
      };

      // Optionally skip employees who don't have any pay configured yet
      if (struct.basicPay === 0) continue;

      // Check if payslip already exists for this month/year
      const existing = await prisma.payslip.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeProfileId: profile.id,
          month: parseInt(month),
          year: parseInt(year)
        }
      });

      // Skip if already generated
      if (existing) continue; 
      
      // -- LOP Calculation Logic --
      const empAttendances = attendances.filter(a => a.employeeProfileId === profile.id);
      let presentDays = empAttendances.reduce((acc, a) => acc + (a.status === 'HALF_DAY' ? 0.5 : 1), 0);
      
      const empLeaves = leaveRequests.filter(l => l.employeeProfileId === profile.id);
      let paidLeaveDays = 0;
      for (const l of empLeaves) {
        if (l.leaveType !== 'UNPAID') {
           const lStart = new Date(Math.max(new Date(l.startDate), startDate));
           const lEnd = new Date(Math.min(new Date(l.endDate), endDate));
           const diffDays = Math.ceil(Math.abs(lEnd - lStart) / (1000 * 60 * 60 * 24)) + 1;
           paidLeaveDays += diffDays;
        }
      }

      let expectedWorkingDays = daysInMonth;
      if (profile.workScheduleType === 'FIXED' && profile.workingDays) {
         let wDays = profile.workingDays;
         if (typeof wDays === 'string') wDays = JSON.parse(wDays);
         if (!Array.isArray(wDays)) wDays = [1,2,3,4,5]; // fallback Mon-Fri
         
         let count = 0;
         for (let i = 1; i <= daysInMonth; i++) {
           const d = new Date(year, month - 1, i).getDay();
           if (wDays.includes(d)) count++;
         }
         expectedWorkingDays = count;
      } else if (profile.workScheduleType === 'ROTATING') {
         const weeksInMonth = daysInMonth / 7;
         const totalOffs = Math.round(weeksInMonth * (profile.weeklyOffs || 2));
         expectedWorkingDays = daysInMonth - totalOffs;
      }

      let lopDays = expectedWorkingDays - (presentDays + paidLeaveDays);
      if (lopDays < 0) lopDays = 0;
      const lossOfPayAmount = Math.round((struct.basicPay / daysInMonth) * lopDays);

      // Calculate totals
      const totalAllowances = struct.hra + struct.conveyance + struct.medicalAllowance + struct.specialAllowance;
      const totalDeductions = struct.providentFund + struct.professionalTax + lossOfPayAmount;
      
      let reimbursements = 0;
      const empUser = profile.user;

      if (empUser && empUser.nextSalaryReimbursement > 0) {
        reimbursements = empUser.nextSalaryReimbursement;
      }

      const netPay = struct.basicPay + totalAllowances - totalDeductions + reimbursements;

      // Wrap in a transaction to create payslip and reset reimbursement
      await prisma.$transaction(async (tx) => {
        await tx.payslip.create({
          data: {
            tenantId: user.tenantId,
            employeeProfileId: profile.id,
            month: parseInt(month),
            year: parseInt(year),
            basicPay: struct.basicPay,
            allowances: {
              hra: struct.hra,
              conveyance: struct.conveyance,
              medicalAllowance: struct.medicalAllowance,
              specialAllowance: struct.specialAllowance
            },
            deductions: {
              providentFund: struct.providentFund,
              professionalTax: struct.professionalTax,
              lossOfPay: lossOfPayAmount
            },
            reimbursements,
            netPay,
            status: 'DRAFT'
          }
        });

        // Reset reimbursement on User model
        if (reimbursements > 0) {
          await tx.user.update({
            where: { id: empUser.id },
            data: { nextSalaryReimbursement: 0 }
          });
        }
      });

      generatedCount++;
    }

    res.status(200).json({ success: true, message: `Successfully generated ${generatedCount} payslips for ${month}/${year}` });
  } catch (error) {
    console.error('[generatePayroll]', error);
    next(error);
  }
};

/**
 * Update payslip status (e.g. DRAFT to PUBLISHED)
 */
exports.updatePayslipStatus = async (req, res, next) => {
  try {
    const { user } = req;
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['Payroll'] === 'Read & Write';
    if (!isHRAdmin) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const payslip = await prisma.payslip.update({
      where: { id, tenantId: user.tenantId },
      data: { status }
    });

    res.status(200).json({ success: true, data: { payslip }, message: 'Status updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update payslip data (manual edit)
 */
exports.updatePayslipData = async (req, res, next) => {
  try {
    const { user } = req;
    const isHRAdmin = user.role === 'ADMIN' || user.permissions?.['Payroll'] === 'Read & Write';
    if (!isHRAdmin) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { basicPay, allowances, deductions } = req.body;

    const existing = await prisma.payslip.findUnique({ where: { id, tenantId: user.tenantId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Payslip not found' });
    if (existing.status !== 'DRAFT') return res.status(400).json({ success: false, error: 'Only DRAFT payslips can be edited' });

    const totalAllowances = Object.values(allowances).reduce((a, b) => a + Number(b), 0);
    const totalDeductions = Object.values(deductions).reduce((a, b) => a + Number(b), 0);
    const netPay = Number(basicPay) + totalAllowances - totalDeductions + existing.reimbursements;

    const payslip = await prisma.payslip.update({
      where: { id },
      data: {
        basicPay: Number(basicPay),
        allowances,
        deductions,
        netPay
      }
    });

    res.status(200).json({ success: true, data: { payslip }, message: 'Payslip updated manually' });
  } catch (error) {
    next(error);
  }
};
