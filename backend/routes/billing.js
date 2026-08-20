const express = require('express');
const authenticateToken = require('../middleware/auth');
const billing = require('../services/billing');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json(billing.publicConfig());
});

router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const provider = (req.body.provider || 'stripe').toLowerCase();
    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await billing.createCheckout({
      provider,
      user: req.user,
      origin,
    });
    res.status(200).json(session);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Checkout failed.' });
  }
});

router.post('/webhook/stripe', async (req, res) => {
  try {
    const result = await billing.handleStripeWebhook(req.body, req.headers['stripe-signature']);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || 'Webhook failed.' });
  }
});

module.exports = router;
