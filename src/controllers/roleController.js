const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');
const { generateWorkspaceId } = require('../utils/workspaceIdGenerator');

/**
 * Get all roles for the tenant
 */
exports.getRoles = async (req, res, next) => {
  try {
    const roles = await prisma.customRole.findMany({
      where: { tenantId: req.user.tenantId },
      include: {
        _count: { select: { users: true } },
        users: { select: { id: true, name: true, email: true, workspaceId: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ status: 'success', data: { roles } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific role
 */
exports.getRole = async (req, res, next) => {
  try {
    const role = await prisma.customRole.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId
      },
      include: { users: { select: { id: true } } }
    });

    if (!role) {
      return next(new AppError('No role found with that ID', 404));
    }

    res.status(200).json({ status: 'success', data: { role } });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new role
 */
exports.createRole = async (req, res, next) => {
  try {
    const { name, permissions, userIds } = req.body;

    if (!name) {
      return next(new AppError('Please provide a role name', 400));
    }

    const data = {
      name,
      permissions: permissions || {},
      tenantId: req.user.tenantId
    };

    if (Array.isArray(userIds)) {
      data.users = { connect: userIds.map(id => ({ id })) };
    }

    const role = await prisma.customRole.create({
      data,
      include: { 
        users: { select: { id: true, name: true, workspaceId: true, tenantId: true } },
        tenant: { select: { name: true } }
      }
    });

    // Update workspaceId for connected users
    if (Array.isArray(userIds) && userIds.length > 0) {
      for (const user of role.users) {
        const existingRandom = user.workspaceId ? user.workspaceId.slice(-5) : null;
        const newId = await generateWorkspaceId(role.tenant.name, role.name, existingRandom);
        await prisma.user.update({
          where: { id: user.id },
          data: { workspaceId: newId }
        });
      }
    }

    // Refresh role object to include updated workspaceIds
    const finalRole = await prisma.customRole.findUnique({
      where: { id: role.id },
      include: { 
        users: { select: { id: true, name: true, workspaceId: true, tenantId: true } },
        tenant: { select: { name: true } }
      }
    });

    res.status(201).json({ status: 'success', data: { role: finalRole } });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing role
 */
exports.updateRole = async (req, res, next) => {
  try {
    const { name, permissions, userIds } = req.body;

    const role = await prisma.customRole.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });

    if (!role) {
      return next(new AppError('No role found with that ID', 404));
    }

    const data = {
      name: name !== undefined ? name : role.name,
      permissions: permissions !== undefined ? permissions : role.permissions
    };

    if (Array.isArray(userIds)) {
      data.users = { set: userIds.map(id => ({ id })) };
    }

    const updatedRole = await prisma.customRole.update({
      where: { id: req.params.id },
      data,
      include: { 
        users: { select: { id: true, name: true, workspaceId: true, tenantId: true } },
        tenant: { select: { name: true } }
      }
    });

    // Update workspaceId for all users in this role (since role name might have changed or new users connected)
    for (const user of updatedRole.users) {
      const existingRandom = user.workspaceId ? user.workspaceId.slice(-5) : null;
      const newId = await generateWorkspaceId(updatedRole.tenant.name, updatedRole.name, existingRandom);
      await prisma.user.update({
        where: { id: user.id },
        data: { workspaceId: newId }
      });
    }

    // Refresh updatedRole object to include updated workspaceIds
    const finalUpdatedRole = await prisma.customRole.findUnique({
      where: { id: updatedRole.id },
      include: { 
        users: { select: { id: true, name: true, workspaceId: true, tenantId: true } },
        tenant: { select: { name: true } }
      }
    });

    res.status(200).json({ status: 'success', data: { role: finalUpdatedRole } });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a role
 */
exports.deleteRole = async (req, res, next) => {
  try {
    const role = await prisma.customRole.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });

    if (!role) {
      return next(new AppError('No role found with that ID', 404));
    }

    await prisma.customRole.delete({
      where: { id: req.params.id }
    });

    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};
