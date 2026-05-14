const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const c = require('../controllers/hrEmployeeController');

const router = express.Router();
router.use(authenticate);

router.get('/me', c.getMyProfile);
router.route('/')
  .get(c.getEmployees)
  .post(c.createEmployee);
router.route('/:id')
  .get(c.getEmployee)
  .put(c.updateEmployee)
  .delete(c.deleteEmployee);

module.exports = router;
