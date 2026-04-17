const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { getDeals, createDeal, updateDeal, deleteDeal } = require('../controllers/dealController');

const router = express.Router();

router.use(authenticate);

router.route('/')
  .get(getDeals)
  .post(createDeal);

router.route('/:id')
  .put(updateDeal)
  .delete(deleteDeal);

module.exports = router;
