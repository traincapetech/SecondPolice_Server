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
    const tenantId = req.user.tenantId;

    if (!name) {
      return next(new AppError('Please provide a role name', 400));
    }

    const data = {
      name,
      permissions: permissions || {},
      tenantId
    };

    let verifiedUsers = [];

    if (Array.isArray(userIds) && userIds.length > 0) {
      verifiedUsers = await prisma.user.findMany({
        where: {
          id: { in: userIds },
          tenantId
        },
        select: { id: true }
      });

      if (verifiedUsers.length !== userIds.length) {
        return next(
          new AppError(
            'One or more user IDs are invalid or belong to another tenant.',
            400
          )
        );
      }

      data.users = {
        connect: verifiedUsers.map(user => ({ id: user.id }))
      };
    }

    const role = await prisma.customRole.create({
      data,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
            tenantId: true
          }
        },
        tenant: {
          select: {
            name: true
          }
        }
      }
    });

    // Update workspaceId for connected users in parallel
    if (Array.isArray(userIds) && userIds.length > 0) {
      const createPromises = role.users.map(async (user) => {
        const existingRandom = user.workspaceId
          ? user.workspaceId.slice(-5)
          : null;

        const newId = await generateWorkspaceId(
          role.tenant.name,
          role.name,
          existingRandom
        );

        return prisma.user.update({
          where: { id: user.id },
          data: { workspaceId: newId }
        });
      });
      await Promise.all(createPromises);
    }

    // Refresh role object to include updated workspaceIds
    const finalRole = await prisma.customRole.findUnique({
      where: { id: role.id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
            tenantId: true
          }
        },
        tenant: {
          select: {
            name: true
          }
        }
      }
    });

    res.status(201).json({
      status: 'success',
      data: { role: finalRole }
    });
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
    const tenantId = req.user.tenantId;

    const role = await prisma.customRole.findFirst({
      where: {
        id: req.params.id,
        tenantId
      }
    });

    if (!role) {
      return next(new AppError('No role found with that ID', 404));
    }

    const data = {
      name: name !== undefined ? name : role.name,
      permissions:
        permissions !== undefined ? permissions : role.permissions
    };

    if (Array.isArray(userIds)) {
      let verifiedUsers = [];

      if (userIds.length > 0) {
        verifiedUsers = await prisma.user.findMany({
          where: {
            id: { in: userIds },
            tenantId
          },
          select: { id: true }
        });

        if (verifiedUsers.length !== userIds.length) {
          return next(
            new AppError(
              'One or more user IDs are invalid or belong to another tenant.',
              400
            )
          );
        }
      }

      data.users = {
        set: verifiedUsers.map(user => ({ id: user.id }))
      };
    }

    const updatedRole = await prisma.customRole.update({
      where: { id: req.params.id },
      data,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
            tenantId: true
          }
        },
        tenant: {
          select: {
            name: true
          }
        }
      }
    });

    // Update workspaceId for all users in this role in parallel
    const updatePromises = updatedRole.users.map(async (user) => {
      const existingRandom = user.workspaceId
        ? user.workspaceId.slice(-5)
        : null;

      const newId = await generateWorkspaceId(
        updatedRole.tenant.name,
        updatedRole.name,
        existingRandom
      );

      return prisma.user.update({
        where: { id: user.id },
        data: { workspaceId: newId }
      });
    });
    await Promise.all(updatePromises);

    // Refresh updated role to include updated workspaceIds
    const finalUpdatedRole = await prisma.customRole.findUnique({
      where: { id: updatedRole.id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
            tenantId: true
          }
        },
        tenant: {
          select: {
            name: true
          }
        }
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        role: finalUpdatedRole
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a role
 */
exports.deleteRole = async (req, res, next) => {
  try {
    const deleteResult = await prisma.customRole.deleteMany({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });

    if (deleteResult.count === 0) {
      return next(new AppError('No role found with that ID', 404));
    }

    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};