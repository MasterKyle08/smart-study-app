const express = require('express');
const { userFromRequest } = require('../middleware/auth');
const authService = require('../services/auth');
const usage = require('../services/usage');
const gcpMonitoring = require('../services/gcpMonitoring');

const router = express.Router();

async function publicQuota(existing) {
  const totals = existing || await usage.totalsForDay(usage.usageDate());
  let google = { configured: false, used: null };
  try {
    google = await gcpMonitoring.getCachedDailyGenerativeLanguageRequests();
  } catch (_err) {
    google = { configured: gcpMonitoring.configured(), used: null };
  }
  return gcpMonitoring.publicQuotaView(google, totals.gemmaRequests, usage.GEMMA_DAILY_BUDGET);
}

router.get('/quota', async (req, res) => {
  try {
    const quota = await publicQuota();
    res.json(quota);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Could not load quota.' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const user = await userFromRequest(req);
    const premium = authService.resolvePlan(user) === 'premium';
    const status = await usage.snapshot({ user, ip: req.ip, premium });
    const quota = await publicQuota({gemmaRequests:status.community.gemmaUsed});
    status.quota = quota;
    if (status.community) {
      status.community.displayUsed = quota.used;
      status.community.displayLimit = quota.limit;
      status.community.displaySource = quota.source;
    }
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Could not load usage.' });
  }
});

router.post('/ad-reward', (req, res) => {
  res.status(501).json({ message: 'Ad rewards are unavailable until a supported provider can verify completion on the server. A browser flag or timer cannot grant actions.' });
});

module.exports = router;
