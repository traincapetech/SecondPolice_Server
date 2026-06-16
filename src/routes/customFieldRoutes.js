const express = require('express');
const router = express.Router();
const customFieldController = require('../controllers/customFieldController');
const { authenticate, restrictTo } = require('../middlewares/authMiddleware');

router.use(authenticate);
router.use(restrictTo('SUPERADMIN', 'ADMIN')); // Only admins can manage custom fields

router.get('/:entityType', customFieldController.getCustomFields);
router.post('/', customFieldController.createCustomField);
router.put('/:id', customFieldController.updateCustomField);
router.delete('/:id', customFieldController.deleteCustomField);

module.exports = router;
