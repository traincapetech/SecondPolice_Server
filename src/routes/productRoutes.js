const express = require('express');
const productController = require('../controllers/productController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(authenticate);

// All authenticated users can view products (useful for Deals/Invoices)
router.get('/', productController.getProducts);
router.get('/:id', productController.getProduct);

// Mutations are access-controlled by RBAC permissions on the frontend
router.post('/', productController.createProduct);
router.patch('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

module.exports = router;
