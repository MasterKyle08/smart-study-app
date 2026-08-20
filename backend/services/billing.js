const User = require('../models/User');
const { db } = require('../models/db');

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const Stripe = require('stripe');
  return new Stripe(key);
}

function configuredProviders() {
  return {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    lemonsqueezy: Boolean(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_VARIANT_ID),
  };
}

function publicConfig() {
  const monthly = process.env.PREMIUM_MONTHLY_PRICE || '5';
  const providers = configuredProviders();
  return {
    premiumEnabled: Object.values(providers).some(Boolean),
    providers,
    monthlyPrice: Number(monthly),
    monthlyPriceLabel: `$${monthly} / month`,
    successUrl: process.env.BILLING_SUCCESS_URL || '/dashboard.html?billing=success',
    cancelUrl: process.env.BILLING_CANCEL_URL || '/dashboard.html?billing=cancel',
    ads: {
      provider: 'adsense',
      enabled: Boolean(process.env.ADSENSE_CLIENT_ID),
      client: process.env.ADSENSE_CLIENT_ID || '',
      slot: process.env.ADSENSE_SLOT_ID || '',
      viewSeconds: parseInt(process.env.ADSENSE_VIEW_SECONDS || '15', 10),
      rewardsPerDay: parseInt(process.env.AD_REWARDS_PER_DAY || '2', 10),
      cooldownHours: parseInt(process.env.AD_COOLDOWN_HOURS || '4', 10),
      jobsPerAd: parseInt(process.env.JOBS_PER_AD || '1', 10),
    },
    pricing: {
      amount: `$${monthly}`,
      period: 'month',
      model: process.env.GOOGLE_PREMIUM_MODEL_NAME || 'gemini-3.5-flash-lite',
      freeModel: process.env.GOOGLE_AI_MODEL_NAME || 'gemma-4-31b-it',
      why: `Premium is ${'$' + monthly}/month because Google charges for the better model (Gemini Flash-Lite), not because we add a hidden markup on Gemma. Free Gemma 4 is a shared community pool (~1,500 requests/day for the whole site). Premium traffic uses a paid model so it does not eat that pool. Lifetime billing is not offered: model usage is an ongoing cost.`,
      costNotes: [
        'Free: Gemma 4 via Google’s free tier. We do not charge you; the limit is Google’s daily request cap, shared by every free user here.',
        `Premium: $${monthly}/month. That covers Gemini Flash-Lite API usage (roughly $0.10 per million input tokens and $0.40 per million output tokens at current Google list prices) plus running the site.`,
        `At those rates, $${monthly} is about 12 million output tokens or a much larger mix of input+output — enough for heavy studying, not enough to resell unlimited API access.`,
        'Google AdSense display ads (if configured) pay the site, not Google’s API bill. Viewing an ad for 15 seconds can add +1 extra study action, at most twice a day. Do not click the ad — clicks for a reward violate AdSense policy.',
      ],
    },
  };
}

async function setUserPlan(userId, plan, extra = {}) {
  const fields = ['plan = ?'];
  const args = [plan === 'premium' ? 'premium' : 'free'];
  if (extra.stripeCustomerId) {
    fields.push('stripe_customer_id = ?');
    args.push(extra.stripeCustomerId);
  }
  if (extra.billingProvider) {
    fields.push('billing_provider = ?');
    args.push(extra.billingProvider);
  }
  args.push(userId);
  await db.execute({
    sql: `UPDATE Users SET ${fields.join(', ')} WHERE id = ?`,
    args,
  });
  return User.findById(userId);
}

async function createStripeCheckout({ user, origin }) {
  const stripe = stripeClient();
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    const error = new Error('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.');
    error.statusCode = 501;
    throw error;
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${origin}${process.env.BILLING_SUCCESS_URL || '/dashboard.html?billing=success'}`,
    cancel_url: `${origin}${process.env.BILLING_CANCEL_URL || '/dashboard.html?billing=cancel'}`,
    client_reference_id: String(user.id),
    customer_email: user.email,
    metadata: { userId: String(user.id) },
  });
  return { provider: 'stripe', url: session.url, id: session.id };
}

async function handleStripeWebhook(rawBody, signature) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    const error = new Error('Stripe webhook is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
    error.statusCode = 501;
    throw error;
  }
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
  const event = stripe.webhooks.constructEvent(payload, signature, secret);

  if (event.type === 'checkout.session.completed') {
    const object = event.data.object;
    const userId = object.client_reference_id || (object.metadata && object.metadata.userId);
    if (userId) {
      await setUserPlan(userId, 'premium', {
        stripeCustomerId: object.customer || null,
        billingProvider: 'stripe',
      });
    }
  }
  if (event.type === 'customer.subscription.deleted') {
    const customerId = event.data.object.customer;
    if (customerId) {
      const result = await db.execute({
        sql: 'SELECT id FROM Users WHERE stripe_customer_id = ? LIMIT 1',
        args: [customerId],
      });
      if (result.rows[0]) await setUserPlan(result.rows[0].id, 'free');
    }
  }
  return { received: true, type: event.type };
}

async function createCheckout({ provider, user, origin }) {
  if (provider === 'stripe') return createStripeCheckout({ user, origin });
  if (provider === 'paypal' || provider === 'lemonsqueezy') {
    const error = new Error(`${provider} checkout is scaffolded. Add the remaining API credentials before going live.`);
    error.statusCode = 501;
    throw error;
  }
  const error = new Error('Unknown billing provider.');
  error.statusCode = 400;
  throw error;
}

module.exports = {
  publicConfig,
  configuredProviders,
  createCheckout,
  handleStripeWebhook,
  setUserPlan,
};
