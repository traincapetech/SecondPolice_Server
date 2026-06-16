const express = require('express');
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middlewares/authMiddleware');


const router = express.Router();

router.use(authenticate);

router.get('/analytics', expenseController.getExpenseAnalytics);


router.get('/', expenseController.getExpenses);
router.get('/:id', expenseController.getExpense);
router.post('/', expenseController.createExpense);
router.patch('/:id', expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
