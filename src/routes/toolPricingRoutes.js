const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * Public API to fetch standalone tool products and their passes
 */
router.get('/', async (req, res) => {
  try {
    const tools = await prisma.toolProduct.findMany({
      where: { isActive: true },
      include: { 
        passes: { 
          where: { isActive: true }
        } 
      }
    });

    res.status(200).json({ status: 'success', data: tools });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
