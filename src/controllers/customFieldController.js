const prisma = require('../lib/prisma');

// GET /api/custom-fields/:entityType
const getCustomFields = async (req, res, next) => {
  try {
    const { entityType } = req.params;
    const tenantId = req.user.tenantId;

    const fields = await prisma.customFieldDefinition.findMany({
      where: {
        tenantId,
        entityType,
      },
      orderBy: {
        fieldName: 'asc',
      },
    });

    res.status(200).json({
      status: 'success',
      data: fields,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/custom-fields
const createCustomField = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    const {
      entityType,
      fieldName,
      fieldLabel,
      fieldType,
      isRequired,
      options,
    } = req.body;

    const newField = await prisma.customFieldDefinition.create({
      data: {
        tenantId,
        entityType,
        fieldName,
        fieldLabel,
        fieldType,
        isRequired: isRequired || false,
        options: options || null,
      },
    });

    res.status(201).json({
      status: 'success',
      data: newField,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/custom-fields/:id
const updateCustomField = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const {
      fieldLabel,
      fieldType,
      isRequired,
      options,
    } = req.body;

    // Verify that the field belongs to this tenant
    const existingField = await prisma.customFieldDefinition.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!existingField) {
      return res.status(404).json({
        status: 'fail',
        message: 'Custom field not found.',
      });
    }

    const updateResult = await prisma.customFieldDefinition.updateMany({
      where: {
        id,
        tenantId
      },
      data: {
        ...(fieldLabel !== undefined && { fieldLabel }),
        ...(fieldType !== undefined && { fieldType }),
        ...(isRequired !== undefined && { isRequired }),
        ...(options !== undefined && { options })
      }
    });

    if (updateResult.count === 0) {
      return next(new AppError('Custom field not found', 404));
    }

    const updatedField = await prisma.customFieldDefinition.findUnique({
      where: { id }
    });

    res.status(200).json({ status: 'success', data: updatedField });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/custom-fields/:id
const deleteCustomField = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const deleteResult = await prisma.customFieldDefinition.deleteMany({
      where: {
        id,
        tenantId
      }
    });

    if (deleteResult.count === 0) {
      return next(new AppError('Custom field not found', 404));
    }

    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
};