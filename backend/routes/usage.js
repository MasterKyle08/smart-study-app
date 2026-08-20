const express = require('express');
const { userFromRequest } = require('../middleware/auth');
const authService = require('../services/auth');
const usage = require('../services/usage');
const gcpMonitoring = require('../services/gcpMonitoring');

const router = express.Router();

async function publicQuota() {
  const totals = await usage.totalsForDay(usage.usageDate());
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
    const quota = await publicQuota();
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

router.post('/ad-reward', async (req, res) => {
  try {
    const user = await userFromRequest(req);
    const premium = authService.resolvePlan(user) === 'premium';
    const adsConfigured = Boolean(process.env.ADSENSE_CLIENT_ID);
    const allowDev = process.env.NODE_ENV !== 'production' && process.env.USAGE_ALLOW_DEV_ADS === '1';
    if (!adsConfigured && !allowDev) {
      return res.status(501).json({
        message: 'AdSense is not configured yet. Set ADSENSE_CLIENT_ID (ca-pub-…). Extra actions require keeping an ad visible — do not click it. Ads pay the site, they do not buy extra Google API quota.',
      });
    }
    if (adsConfigured && !req.body.granted) {
      return res.status(400).json({ message: 'Ad reward was not confirmed by the player.' });
    }
    const status = await usage.grantAdReward({ user, ip: req.ip, premium });
    res.json({ message: `+${status.you.jobsPerAd} extra study action added for today.`, usage: status });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not grant ad extra.' });
  }
});

module.exports = router;
