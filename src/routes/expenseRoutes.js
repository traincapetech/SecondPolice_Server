const express = require('express');
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/rbacMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('Expenses', 'Read-Only'), expenseController.getExpenses);
router.get('/:id', requirePermission('Expenses', 'Read-Only'), expenseController.getExpense);
router.post('/', requirePermission('Expenses', 'Read & Write'), expenseController.createExpense);
router.patch('/:id', requirePermission('Expenses', 'Read & Write'), expenseController.updateExpense);
router.delete('/:id', requirePermission('Expenses', 'Read & Write'), expenseController.deleteExpense);

module.exports = router;
