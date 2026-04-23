const express = require('express');
const productController = require('../controllers/productController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(authenticate);

// We can restrict mutations to ADMIN or MANAGER if needed, but for now we'll allow standard RBAC checking
// Since Products are tied to tenant, any user in tenant can view them (useful for Deals/Invoices)
router.get('/', productController.getProducts);
router.get('/:id', productController.getProduct);

// Only ADMIN or MANAGER should be able to modify the catalog by default, or we can let the frontend hide the buttons based on RBAC 'Products' module.
router.post('/', productController.createProduct);
router.patch('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

module.exports = router;
