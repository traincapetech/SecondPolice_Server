const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const c = require('../controllers/hrDeptDesigController');

const router = express.Router();
router.use(authenticate);

// Departments
router.route('/departments')
  .get(c.getDepartments)
  .post(c.createDepartment);
router.route('/departments/:id')
  .put(c.updateDepartment)
  .delete(c.deleteDepartment);

// Designations
router.route('/designations')
  .get(c.getDesignations)
  .post(c.createDesignation);
router.route('/designations/:id')
  .put(c.updateDesignation)
  .delete(c.deleteDesignation);

module.exports = router;
