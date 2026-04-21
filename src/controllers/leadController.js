const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { createNotification } = require('../services/notificationService');

/**
 * Resolves which users in this tenant are "sales people" —
 * users whose customRole has 'Sales Pipeline': 'Read & Write'
 */
const getSalesPeople = async (tenantId) => {
  const users = await prisma.user.findMany({
    where: { tenantId, role: { not: 'ADMIN' } },
    include: { customRole: true },
    orderBy: { name: 'asc' },
  });
  return users.filter(
    u => u.customRole?.permissions?.['Sales Pipeline'] === 'Read & Write'
  );
};

/**
 * Round-robin assignment: increments the tenant's leadAssigneeIndex atomically
 * and returns the next sales person to assign.
 */
const assignNextSalesPerson = async (tenantId) => {
  const salesPeople = await getSalesPeople(tenantId);
  if (salesPeople.length === 0) return null;

  // Atomically increment the index and fetch new value
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { leadAssigneeIndex: { increment: 1 } },
    select: { leadAssigneeIndex: true },
  });

  const idx = (tenant.leadAssigneeIndex - 1) % salesPeople.length;
  return salesPeople[idx];
};

const LEAD_SELECT = {
  id: true, tenantId: true,
  firstName: true, lastName: true, email: true, phone: true,
  company: true, jobTitle: true,
  source: true, status: true, priority: true,
  estimatedValue: true, currency: true, notes: true,
  createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
};

/** GET /api/leads */
exports.getLeads = async (req, res, next) => {
  try {
    const { status, priority, assignedToId, search } = req.query;

    const where = { tenantId: req.user.tenantId };

    // Strict Privacy Rules for Non-Admins
    // Strict Privacy Rules for Non-Admins: Show only leads created by or assigned to the user
    if (req.user.role !== 'ADMIN') {
      where.OR = [
        { createdById: req.user.id },
        { assignedToId: req.user.id }
      ];
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
        { company:   { contains: search, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      select: LEAD_SELECT,
      orderBy: [{ createdAt: 'desc' }],
    });

    res.status(200).json({ status: 'success', results: leads.length, data: { leads } });
  } catch (err) { next(err); }
};

/** GET /api/leads/:id */
exports.getLead = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    
    if (req.user.role !== 'ADMIN') {
      where.OR = [
        { createdById: req.user.id },
        { assignedToId: req.user.id }
      ];
    }

    const lead = await prisma.lead.findFirst({
      where,
      select: LEAD_SELECT,
    });
    if (!lead) return next(new AppError('Lead not found', 404));
    res.status(200).json({ status: 'success', data: { lead } });
  } catch (err) { next(err); }
};

/** POST /api/leads */
exports.createLead = async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, phone, company, jobTitle,
      source, status, priority, estimatedValue, currency, notes,
      assignedToId: explicitAssigneeId,
    } = req.body;

    if (!firstName) return next(new AppError('First name is required', 400));

    // Admin can manually assign; otherwise round-robin
    let assignee = null;
    if (explicitAssigneeId) {
      const user = await prisma.user.findFirst({
        where: { id: explicitAssigneeId, tenantId: req.user.tenantId },
        select: { id: true, name: true },
      });
      assignee = user;
    } else {
      assignee = await assignNextSalesPerson(req.user.tenantId);
    }

    const lead = await prisma.lead.create({
      data: {
        tenantId: req.user.tenantId,
        firstName, lastName,
        email: email ? email.toLowerCase().trim() : null,
        phone, company, jobTitle,
        source: source || 'OTHER',
        status: status || 'NEW',
        priority: priority || 'MEDIUM',
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
        currency: currency || 'USD',
        notes,
        assignedToId: assignee?.id ?? null,
        createdById: req.user.id,
      },
      select: LEAD_SELECT,
    });

    res.status(201).json({ status: 'success', data: { lead } });

    // Fire assignment notification (non-blocking)
    if (assignee) {
      createNotification({
        tenantId: req.user.tenantId,
        userId: assignee.id,
        type: 'LEAD_ASSIGNED',
        title: 'New Lead Assigned To You',
        body: `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}${
          lead.company ? ' from ' + lead.company : ''
        } has been assigned to you.`,
        linkUrl: `/leads`,
      }).catch(err => console.error('Failed to create notification:', err));
    }
  } catch (err) { next(err); }
};

/** PUT /api/leads/:id */
exports.updateLead = async (req, res, next) => {
  try {
    const where = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      where.OR = [{ createdById: req.user.id }, { assignedToId: req.user.id }];
    }

    const existing = await prisma.lead.findFirst({ where });
    if (!existing) return next(new AppError('Lead not found or you do not have permission', 404));

    const {
      firstName, lastName, email, phone, company, jobTitle,
      source, status, priority, estimatedValue, currency, notes, assignedToId,
    } = req.body;

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        firstName:      firstName      ?? existing.firstName,
        lastName:       lastName       ?? existing.lastName,
        email:          email != null ? email.toLowerCase().trim() : existing.email,
        phone:          phone          ?? existing.phone,
        company:        company        ?? existing.company,
        jobTitle:       jobTitle       ?? existing.jobTitle,
        source:         source         ?? existing.source,
        status:         status         ?? existing.status,
        priority:       priority       ?? existing.priority,
        estimatedValue: estimatedValue !== undefined ? parseFloat(estimatedValue) : existing.estimatedValue,
        currency:       currency       ?? existing.currency,
        notes:          notes          ?? existing.notes,
        assignedToId:   assignedToId   !== undefined ? assignedToId : existing.assignedToId,
      },
      select: LEAD_SELECT,
    });

    // --- AUTO-CONVERSION WORKFLOW ---
    if (status === 'CONVERTED' && existing.status !== 'CONVERTED') {
      try {
        // Generate Deal if there's projected value AND no deal already linked
        if (lead.estimatedValue && lead.estimatedValue > 0) {
          const existingDeal = await prisma.deal.findUnique({ where: { leadId: lead.id } });
          if (!existingDeal) {
            await prisma.deal.create({
              data: {
                tenantId: req.user.tenantId,
                title: `${lead.company || `${lead.firstName} ${lead.lastName || ''}`.trim()} - Sales Deal`,
                value: lead.estimatedValue,
                currency: lead.currency || 'USD',
                stage: 'PROPOSAL',
                assignedTo: lead.assignedToId || req.user.id,
                leadId: lead.id,   // ← link the deal back to this lead
              }
            });
          }
        }
      } catch (autoErr) {
        console.error('Auto-conversion error:', autoErr);
      }
    }

    // --- SYNC LINKED DEAL ---
    // Keeps value/currency/title on the Deal record in sync with the Lead.
    // Tries leadId first (fast), falls back to title-match for legacy deals
    // that were created before leadId was added.
    try {
      const newTitle = `${lead.company || `${lead.firstName} ${lead.lastName || ''}`.trim()} - Sales Deal`;

      // 1. Look up by explicit link
      let linkedDeal = await prisma.deal.findUnique({ where: { leadId: lead.id } });

      // 2. Legacy fallback: find by matching title pattern within the same tenant
      if (!linkedDeal && existing.status === 'CONVERTED') {
        const oldTitle = `${existing.company || `${existing.firstName} ${existing.lastName || ''}`.trim()} - Sales Deal`;
        linkedDeal = await prisma.deal.findFirst({
          where: {
            tenantId: req.user.tenantId,
            title: oldTitle,
            leadId: null,   // only unlinked deals — avoid matching manually-created ones
          },
        });
        // Stamp the leadId so next update is fast
        if (linkedDeal) {
          await prisma.deal.update({
            where: { id: linkedDeal.id },
            data: { leadId: lead.id },
          });
        }
      }

      if (linkedDeal) {
        await prisma.deal.update({
          where: { id: linkedDeal.id },
          data: {
            title: newTitle,
            ...(lead.estimatedValue !== null && lead.estimatedValue !== undefined
              ? { value: lead.estimatedValue } : {}),
            ...(lead.currency ? { currency: lead.currency } : {}),
          },
        });
      }
    } catch (syncErr) {
      console.error('Deal sync error:', syncErr);
    }
    // ------------------------


    res.status(200).json({ status: 'success', data: { lead } });

    // Fire re-assignment notification if assignee changed (non-blocking)
    const newAssigneeId = assignedToId !== undefined ? assignedToId : existing.assignedToId;
    if (newAssigneeId && newAssigneeId !== existing.assignedToId) {
      createNotification({
        tenantId: req.user.tenantId,
        userId: newAssigneeId,
        type: 'LEAD_ASSIGNED',
        title: 'New Lead Assigned To You',
        body: `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}${
          lead.company ? ' from ' + lead.company : ''
        } has been assigned to you.`,
        linkUrl: `/leads`,
      }).catch(err => console.error('Failed to create notification:', err));
    }
  } catch (err) { next(err); }
};

/** DELETE /api/leads/:id */
exports.deleteLead = async (req, res, next) => {
  try {
    const whereDelete = { id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      whereDelete.OR = [{ createdById: req.user.id }, { assignedToId: req.user.id }];
    }

    const existing = await prisma.lead.findFirst({
      where: whereDelete,
    });
    if (!existing) return next(new AppError('Lead not found or you do not have permission', 404));

    await prisma.lead.delete({ where: { id: req.params.id } });
    res.status(204).json({ status: 'success', data: null });
  } catch (err) { next(err); }
};
