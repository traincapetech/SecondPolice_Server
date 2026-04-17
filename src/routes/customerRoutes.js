const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { getCustomers, createCustomer, updateCustomer, deleteCustomer } = require('../controllers/customerController');

const router = express.Router();

// All customer routes require authentication
router.use(authenticate);

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .put(updateCustomer)
  .delete(deleteCustomer);

module.exports = router;
