const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const c = require('../controllers/hrPayrollController');

const router = express.Router();
router.use(authenticate);

router.route('/structures')
  .get(c.getSalaryStructures)
  .post(c.setSalaryStructure);

router.post('/generate', c.generatePayroll);

router.get('/payslips', c.getPayslips);
router.patch('/payslips/:id/status', c.updatePayslipStatus);
router.put('/payslips/:id', c.updatePayslipData);

module.exports = router;
