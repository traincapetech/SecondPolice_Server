const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/** GET /api/products */
exports.getProducts = async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { name: 'asc' }
    });

    res.status(200).json({
      status: 'success',
      results: products.length,
      data: { products }
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/products/:id */
exports.getProduct = async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });

    if (!product) {
      return next(new AppError('Product not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: { product }
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/products */
exports.createProduct = async (req, res, next) => {
  try {
    const { name, sku, description, price, taxRate, currency, isActive } = req.body;

    if (!name || price === undefined) {
      return next(new AppError('Product name and price are required', 400));
    }

    const product = await prisma.product.create({
      data: {
        tenantId: req.user.tenantId,
        name,
        sku,
        description,
        price: parseFloat(price),
        taxRate: taxRate !== undefined ? parseFloat(taxRate) : 0,
        currency: currency || 'USD',
        isActive: isActive !== undefined ? isActive : true
      }
    });

    res.status(201).json({
      status: 'success',
      data: { product }
    });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/products/:id */
exports.updateProduct = async (req, res, next) => {
  try {
    const { name, sku, description, price, taxRate, currency, isActive } = req.body;

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });

    if (!existing) {
      return next(new AppError('Product not found', 404));
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name : existing.name,
        sku: sku !== undefined ? sku : existing.sku,
        description: description !== undefined ? description : existing.description,
        price: price !== undefined ? parseFloat(price) : existing.price,
        taxRate: taxRate !== undefined ? parseFloat(taxRate) : existing.taxRate,
        currency: currency || existing.currency,
        isActive: isActive !== undefined ? isActive : existing.isActive
      }
    });

    res.status(200).json({
      status: 'success',
      data: { product }
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/products/:id */
exports.deleteProduct = async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId }
    });

    if (!existing) {
      return next(new AppError('Product not found', 404));
    }

    await prisma.product.delete({
      where: { id: req.params.id }
    });

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    next(err);
  }
};
