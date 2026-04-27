const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

// GET /api/customers - List all customers AND leads
const getCustomers = async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const leadWhere = { tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      leadWhere.OR = [
        { createdById: req.user.id },
        { assignedToId: req.user.id }
      ];
    }

    const leads = await prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: 'desc' },
    });

    // We deduplicate them using a Map keyed by lowercase email OR name
    const uniqueMap = new Map();

    // 1. Add all true customers first
    customers.forEach(c => uniqueMap.set(c.email?.toLowerCase() || c.name.toLowerCase(), c));

    // 2. Add or update with leads
    leads.forEach(l => {
      const key = l.email?.toLowerCase() || `${l.firstName} ${l.lastName || ''}`.trim().toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          id: l.id,
          tenantId: l.tenantId,
          name: `${l.firstName} ${l.lastName || ''}`.trim(),
          email: l.email,
          phone: l.phone,
          address: l.address,
          city: l.city,
          state: l.state,
          pinCode: l.pinCode,
          country: l.country,
          gstin: l.gstin,
          status: l.status,
          createdAt: l.createdAt,
          _isOriginallyLead: true // Important for update/delete routing
        });
      } else {
        // If a customer already exists with this email/name, override its status to match the active Lead status
        const existing = uniqueMap.get(key);
        existing.status = l.status;
      }
    });

    const unified = Array.from(uniqueMap.values()).sort((a,b) => b.createdAt - a.createdAt);

    res.status(200).json({
      status: 'success',
      results: unified.length,
      data: { customers: unified },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/customers - Create a new customer
const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, status, address, city, state, pinCode, country, gstin } = req.body;
    const email = req.body.email ? req.body.email.toLowerCase().trim() : null;
    if (!name) return next(new AppError('Customer name is required.', 400));

    const customer = await prisma.customer.create({
      data: {
        tenantId: req.user.tenantId,
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        pinCode: pinCode || null,
        country: country || null,
        gstin: gstin || null,
        status: status || 'LEAD',
      },
    });

    res.status(201).json({ status: 'success', data: { customer } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/customers/:id - Update a customer
const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, status, address, city, state, pinCode, country, gstin } = req.body;
    const email = req.body.email != null ? req.body.email.toLowerCase().trim() : undefined;

    // Check if it's a real customer
    let existing = await prisma.customer.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });

    if (existing) {
      const customer = await prisma.customer.update({
        where: { id },
        data: { name, email, phone, status, address, city, state, pinCode, country, gstin },
      });
      return res.status(200).json({ status: 'success', data: { customer } });
    }

    // Fallback: This might be a Lead being updated through the Customers tab
    const leadWhere = { id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      leadWhere.OR = [{ createdById: req.user.id }, { assignedToId: req.user.id }];
    }

    let existingLead = await prisma.lead.findFirst({
      where: leadWhere,
    });

    if (existingLead) {
      const names = name.split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ');

      const lead = await prisma.lead.update({
        where: { id },
        data: { firstName, lastName, email: email != null ? email : undefined, phone, status, address, city, state, pinCode, country, gstin }
      });
      return res.status(200).json({ status: 'success', data: { customer: lead } });
    }

    return next(new AppError('Customer not found.', 404));
  } catch (err) {
    next(err);
  }
};

// DELETE /api/customers/:id - Delete a customer
const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;

    let existing = await prisma.customer.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });

    if (existing) {
      await prisma.customer.delete({ where: { id } });
      return res.status(204).json({ status: 'success', data: null });
    }

    const leadWhere = { id, tenantId: req.user.tenantId };
    if (req.user.role !== 'ADMIN') {
      leadWhere.OR = [{ createdById: req.user.id }, { assignedToId: req.user.id }];
    }

    let existingLead = await prisma.lead.findFirst({
      where: leadWhere,
    });

    if (existingLead) {
      await prisma.lead.delete({ where: { id } });
      return res.status(204).json({ status: 'success', data: null });
    }

    return next(new AppError('Customer not found.', 404));
  } catch (err) {
    next(err);
  }
};

module.exports = { getCustomers, createCustomer, updateCustomer, deleteCustomer };
