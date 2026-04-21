const express = require('express');
const prospectController = require('../controllers/prospectController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(authenticate);

router
  .route('/')
  .get(prospectController.getAllProspects)
  .post(prospectController.createProspect);

router
  .route('/:id')
  .get(prospectController.getProspect)
  .patch(prospectController.updateProspect)
  .delete(prospectController.deleteProspect);

module.exports = router;
