const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  addRecipients,
  removeRecipient,
  startCampaign
} = require('../controllers/campaignController');

const router = express.Router();

router.use(authenticate);

router.get('/', getCampaigns);
router.post('/', createCampaign);
router.get('/:id', getCampaign);
router.patch('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);

router.post('/:id/recipients', addRecipients);
router.delete('/:id/recipients/:recipientId', removeRecipient);

router.post('/:id/send', startCampaign);

module.exports = router;
