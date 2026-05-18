const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * Public API to fetch available pricing plans and tiers
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.pricingPlan.findMany({
      where: { isActive: true },
      include: { 
        seatTiers: { 
          where: { isActive: true },
          orderBy: { minSeats: 'asc' }
        } 
      },
      orderBy: { sortOrder: 'asc' }
    });

    res.status(200).json({ status: 'success', data: plans });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
