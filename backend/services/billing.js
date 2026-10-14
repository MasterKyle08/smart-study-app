const User = require("../models/User");
const { db } = require("../models/db");
const { writeTransaction } = require("../utils/transaction");
const { withLock } = require("./billingLock");
const { pricing } = require("../utils/modelPricing");

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const Stripe = require("stripe");
  return new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
}

function configuredProviders() {
  return {
    stripe: Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PRICE_ID &&
        process.env.STRIPE_WEBHOOK_SECRET &&
        process.env.GOOGLE_PREMIUM_API_KEY,
    ),
    paypal: false,
    lemonsqueezy: false,
  };
}

function publicConfig() {
  const monthly = process.env.PREMIUM_MONTHLY_PRICE || "5";
  const providers = configuredProviders();
  let price;
  try {
    price = pricing();
  } catch {
    price = null;
  }
  return {
    premiumEnabled: Object.values(providers).some(Boolean),
    providers,
    monthlyPrice: Number(monthly),
    monthlyPriceLabel: `$${monthly} / month`,
    successUrl:
      process.env.BILLING_SUCCESS_URL || "/dashboard.html?billing=success",
    cancelUrl:
      process.env.BILLING_CANCEL_URL || "/dashboard.html?billing=cancel",
    ads: {
      provider: "adsense",
      enabled: Boolean(process.env.ADSENSE_CLIENT_ID),
      rewardsEnabled: false,
      client: process.env.ADSENSE_CLIENT_ID || "",
      slot: process.env.ADSENSE_SLOT_ID || "",
      viewSeconds: parseInt(process.env.ADSENSE_VIEW_SECONDS || "15", 10),
      rewardsPerDay: parseInt(process.env.AD_REWARDS_PER_DAY || "2", 10),
      cooldownHours: parseInt(process.env.AD_COOLDOWN_HOURS || "4", 10),
      jobsPerAd: parseInt(process.env.JOBS_PER_AD || "1", 10),
    },
    pricing: {
      amount: `$${monthly}`,
      period: "month",
      model: process.env.GOOGLE_PREMIUM_MODEL_NAME || "gemini-2.5-flash-lite",
      tokenPricing: price,
      freeModel: process.env.GOOGLE_AI_MODEL_NAME || "gemma-4-31b-it",
      why: `Premium is ${"$" + monthly}/month because Google charges for the better model (Gemini Flash-Lite), not because we add a hidden markup on Gemma. Free Gemma 4 is a shared community pool (~1,500 requests/day for the whole site). Premium traffic uses a paid model so it does not eat that pool. Lifetime billing is not offered: model usage is an ongoing cost.`,
      costNotes: [
        "Free: Gemma 4 via Google’s free tier. We do not charge you; the limit is Google’s daily request cap, shared by every free user here.",
        price
          ? `Premium uses ${price.model}: $${price.input.toFixed(2)} per million input tokens and $${price.output.toFixed(2)} per million output tokens (standard text pricing, checked ${price.verified}).`
          : "Premium model pricing needs operator configuration.",
        "Premium includes daily allowances and a monthly AI spending allowance. Provider attempts, including unsuccessful requests, can consume allowances.",
        "Display ads can support the site, but they do not grant extra actions. Rewards require a provider with trusted server verification.",
      ],
    },
  };
}

async function setUserPlan(userId, plan, extra = {}) {
  const fields = ["plan = ?"];
  const args = [plan === "premium" ? "premium" : "free"];
  if (extra.stripeCustomerId) {
    fields.push("stripe_customer_id = ?");
    args.push(extra.stripeCustomerId);
  }
  if (extra.billingProvider) {
    fields.push("billing_provider = ?");
    args.push(extra.billingProvider);
  }
  args.push(userId);
  await db.execute({
    sql: `UPDATE Users SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
  return User.findById(userId);
}

function createBillingHandlers({
  client = db,
  transaction = writeTransaction,
  getStripe = stripeClient,
} = {}) {
  const idOf = (value) => (typeof value === "string" ? value : value?.id);
  async function createCheckout({ provider, user }) {
    if (provider !== "stripe")
      throw Object.assign(new Error("This billing provider is unavailable."), {
        statusCode: 501,
      });
    const stripe = getStripe();
    if (!stripe || !configuredProviders().stripe)
      throw Object.assign(
        new Error("Stripe payments and Premium AI are not fully configured."),
        { statusCode: 501 },
      );
    const base =
      process.env.PUBLIC_ORIGIN || "https://" + process.env.SITE_ADDRESS;
    const parsed = new URL(base);
    if (
      parsed.protocol !== "https:" ||
      parsed.pathname !== "/" ||
      parsed.username ||
      parsed.password
    )
      throw new Error(
        "Configure a trusted HTTPS PUBLIC_ORIGIN or SITE_ADDRESS.",
      );
    const redirect = (value, fallback) => {
      const route = value || fallback;
      const url = new URL(route, parsed.origin);
      if (url.origin !== parsed.origin || url.username || url.password)
        throw new Error(
          "Billing redirects must stay on the configured website.",
        );
      return url.href;
    };
    return withLock(client, `checkout:${user.id}`, async (assertLock) => {
      const account = (
        await client.execute({
          sql: "SELECT premium_until,billing_provider,stripe_customer_id FROM Users WHERE id=?",
          args: [user.id],
        })
      ).rows[0];
      if (!account)
        throw Object.assign(new Error("Account no longer exists."), {
          statusCode: 401,
        });
      if (
        account.billing_provider === "stripe" &&
        Number(account.premium_until) * 1000 > Date.now()
      )
        throw Object.assign(
          new Error(
            "You already have a subscription. Use Manage subscription.",
          ),
          { statusCode: 409 },
        );
      if (account.stripe_customer_id) {
        const current = await stripe.subscriptions.list({
          customer: account.stripe_customer_id,
          status: "all",
          limit: 100,
        });
        if (
          current.has_more ||
          current.data.some(
            (item) => !["canceled", "incomplete_expired"].includes(item.status),
          )
        )
          throw Object.assign(
            new Error(
              "You already have a subscription. Use Manage subscription.",
            ),
            { statusCode: 409 },
          );
      }
      const open = (
        await client.execute({
          sql: "SELECT id FROM BillingCheckouts WHERE user_id=? AND state='open' ORDER BY created_at DESC,id DESC LIMIT 1",
          args: [user.id],
        })
      ).rows[0];
      if (open) {
        const existing = await stripe.checkout.sessions.retrieve(open.id);
        if (existing.status === "open" && existing.url)
          return { provider, url: existing.url, id: existing.id };
        if (existing.status === "complete" && existing.subscription)
          throw Object.assign(
            new Error(
              "Your previous checkout is still synchronizing. Refresh shortly or manage your subscription.",
            ),
            { statusCode: 409 },
          );
      }
      await assertLock(client);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: redirect(
          process.env.BILLING_SUCCESS_URL,
          "/dashboard.html?billing=success",
        ),
        cancel_url: redirect(
          process.env.BILLING_CANCEL_URL,
          "/dashboard.html?billing=cancel",
        ),
        client_reference_id: String(user.id),
        metadata: { userId: String(user.id) },
        subscription_data: { metadata: { userId: String(user.id) } },
        ...(user.stripe_customer_id
          ? { customer: user.stripe_customer_id }
          : { customer_email: user.email }),
      });
      try {
        await transaction(async (tx) => {
          await assertLock(tx);
          await tx.execute({
            sql: "INSERT INTO BillingCheckouts (id, user_id, customer_id,expires_at) VALUES (?, ?, ?,?)",
            args: [
              session.id,
              user.id,
              idOf(session.customer) || null,
              Number(session.expires_at || 0) * 1000,
            ],
          });
        });
      } catch (error) {
        // Avoid leaving a payable checkout after failed persistence or a lost lease.
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch {
          console.error(
            "Operator billing cleanup required for checkout:",
            session.id,
          );
        }
        throw error;
      }
      return { provider: "stripe", url: session.url, id: session.id };
    });
  }

  async function handleStripeWebhook(rawBody, signature) {
    const stripe = getStripe();
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
      throw Object.assign(new Error("Stripe webhook is not configured."), {
        statusCode: 501,
      });
    if (!Buffer.isBuffer(rawBody))
      throw Object.assign(
        new Error("The webhook requires its original raw body."),
        { statusCode: 400 },
      );
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (_error) {
      throw Object.assign(new Error("Invalid webhook signature."), {
        statusCode: 400,
      });
    }
    if (!event.id || !Number.isSafeInteger(event.created))
      throw Object.assign(new Error("Invalid billing event."), {
        statusCode: 400,
      });
    const processed = await client.execute({
      sql: "SELECT id FROM BillingEvents WHERE id = ?",
      args: [event.id],
    });
    if (processed.rows.length) return { received: true, duplicate: true };
    const object = event.data.object;
    const checkoutEvent = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ].includes(event.type);
    const subscriptionEvent =
      /^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(
        event.type,
      );
    const invoiceEvent =
      /^invoice\.(paid|payment_failed|payment_action_required|voided|marked_uncollectible|finalization_failed)$/.test(
        event.type,
      );
    const subscriptionId = checkoutEvent
      ? idOf(object.subscription)
      : subscriptionEvent
        ? object.id
        : invoiceEvent
          ? idOf(
              object.subscription ||
                object.parent?.subscription_details?.subscription,
            )
          : null;
    let checkout;
    if (checkoutEvent) {
      checkout = (
        await client.execute({
          sql: "SELECT * FROM BillingCheckouts WHERE id = ?",
          args: [object.id],
        })
      ).rows[0];
      if (!checkout) return { received: true, ignored: true }; // Never trust public metadata to assign an account.
    }
    if (!subscriptionId) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO BillingEvents (id, created) VALUES (?, ?)",
        args: [event.id, event.created],
      });
      return { received: true, ignored: true };
    }
    return withLock(
      client,
      `subscription:${subscriptionId}`,
      async (assertLock) => {
        // Fetch authoritative current state after acquiring the shared lock, so
        // delayed events cannot overwrite a newer snapshot with stale state.
        let subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["latest_invoice"],
          });
        } catch (error) {
          if (
            subscriptionEvent &&
            event.type === "customer.subscription.deleted" &&
            error.statusCode === 404
          )
            subscription = object;
          else
            throw Object.assign(
              new Error(
                "Billing synchronization is temporarily unavailable. Stripe should retry.",
              ),
              { statusCode: 502 },
            );
        }
        const customerId = idOf(subscription.customer);
        if (
          !customerId ||
          (checkout?.customer_id && checkout.customer_id !== customerId)
        )
          throw Object.assign(new Error("Billing customer mismatch."), {
            statusCode: 400,
          });
        const prices = (
          process.env.BILLING_ALLOWED_PRICE_IDS ||
          process.env.STRIPE_PRICE_ID ||
          ""
        )
          .split(",")
          .map((value) => value.trim());
        const item = subscription.items?.data?.find((value) =>
          prices.includes(idOf(value.price)),
        );
        const until = Number(
          item?.current_period_end || subscription.current_period_end || 0,
        );
        const invoice = subscription.latest_invoice;
        const entitled =
          subscription.status === "active" &&
          !subscription.pause_collection &&
          item &&
          invoice &&
          typeof invoice === "object" &&
          (invoice.paid === true || invoice.status === "paid") &&
          until * 1000 > Date.now();
        await transaction(async (tx) => {
          await assertLock(tx);
          if (
            (
              await tx.execute({
                sql: "SELECT id FROM BillingEvents WHERE id = ?",
                args: [event.id],
              })
            ).rows.length
          )
            return;
          let userId = checkout?.user_id;
          if (!userId) {
            const existing = await tx.execute({
              sql: "SELECT user_id FROM BillingSubscriptions WHERE id = ?",
              args: [subscriptionId],
            });
            userId = existing.rows[0]?.user_id;
          }
          if (!userId) {
            const legacy = await tx.execute({
              sql: "SELECT id FROM Users WHERE stripe_customer_id = ? AND billing_provider = 'stripe'",
              args: [customerId],
            });
            if (legacy.rows.length === 1) userId = legacy.rows[0].id;
          }
          if (!userId) return; // An unrelated Stripe subscription cannot provision access.
          const current = await tx.execute({
            sql: "SELECT * FROM BillingSubscriptions WHERE id = ?",
            args: [subscriptionId],
          });
          if (
            current.rows[0] &&
            (Number(current.rows[0].user_id) !== Number(userId) ||
              current.rows[0].customer_id !== customerId)
          )
            throw Object.assign(new Error("Subscription ownership mismatch."), {
              statusCode: 400,
            });
          {
            await tx.execute({
              sql: "INSERT INTO BillingSubscriptions (id, user_id, customer_id, status, entitled, entitled_until, event_created) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, entitled = excluded.entitled, entitled_until = excluded.entitled_until, event_created = excluded.event_created, updated_at = CURRENT_TIMESTAMP",
              args: [
                subscriptionId,
                userId,
                customerId,
                subscription.status,
                entitled ? 1 : 0,
                entitled ? until : 0,
                event.created,
              ],
            });
          }
          if (checkout)
            await tx.execute({
              sql: "UPDATE BillingCheckouts SET customer_id = ?, subscription_id = ?,state='complete' WHERE id = ?",
              args: [customerId, subscriptionId, checkout.id],
            });
          const allowed = await tx.execute({
            sql: "SELECT MAX(entitled_until) AS expires FROM BillingSubscriptions WHERE user_id = ? AND entitled = 1",
            args: [userId],
          });
          const expires = Number(allowed.rows[0]?.expires || 0);
          await tx.execute({
            sql: "UPDATE Users SET plan = ?, stripe_customer_id = ?, billing_provider = 'stripe', premium_until = ? WHERE id = ?",
            args: [
              expires * 1000 > Date.now() ? "premium" : "free",
              customerId,
              expires,
              userId,
            ],
          });
          await tx.execute({
            sql: "INSERT INTO BillingEvents (id, created) VALUES (?, ?)",
            args: [event.id, event.created],
          });
        });
        return { received: true, type: event.type };
      },
    );
  }
  async function portal(user) {
    const stripe = getStripe();
    if (!stripe || !user.stripe_customer_id)
      throw Object.assign(new Error("No managed subscription was found."), {
        statusCode: 400,
      });
    const origin = new URL(
      process.env.PUBLIC_ORIGIN || `https://${process.env.SITE_ADDRESS}`,
    ).origin;
    return stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: origin + "/account.html",
    });
  }
  async function cancelUserSubscriptions(
    userId,
    afterCancellation = async () => {},
  ) {
    return withLock(client, `checkout:${userId}`, async (assertLock) => {
      const rows = (
        await client.execute({
          sql: "SELECT id,status FROM BillingSubscriptions WHERE user_id=?",
          args: [userId],
        })
      ).rows;
      const user = (
        await client.execute({
          sql: "SELECT stripe_customer_id,billing_provider FROM Users WHERE id=?",
          args: [userId],
        })
      ).rows[0];
      const open = (
        await client.execute({
          sql: "SELECT id FROM BillingCheckouts WHERE user_id=? AND state='open' LIMIT 101",
          args: [userId],
        })
      ).rows;
      if (open.length > 100)
        throw Object.assign(
          new Error(
            "This account needs operator-assisted checkout cancellation.",
          ),
          { statusCode: 409 },
        );
      if (rows.length || user?.stripe_customer_id || open.length) {
        const stripe = getStripe();
        if (!stripe)
          throw Object.assign(
            new Error(
              "Subscriptions must be cancelled before deleting this account. Configure Stripe or contact the operator.",
            ),
            { statusCode: 503 },
          );
        const subscriptions = user?.stripe_customer_id
          ? await stripe.subscriptions.list({
              customer: user.stripe_customer_id,
              status: "all",
              limit: 100,
            })
          : { data: rows };
        if (subscriptions.has_more)
          throw Object.assign(
            new Error("This account needs operator-assisted cancellation."),
            { statusCode: 409 },
          );
        for (const subscription of subscriptions.data)
          if (
            !["canceled", "incomplete_expired"].includes(subscription.status)
          ) {
            await assertLock(client);
            await stripe.subscriptions.cancel(subscription.id);
          }
        for (const checkout of open) {
          await assertLock(client);
          const latest = await stripe.checkout.sessions.retrieve(checkout.id);
          if (latest.status === "open")
            await stripe.checkout.sessions.expire(checkout.id);
          else if (latest.status === "complete" && latest.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              idOf(latest.subscription),
            );
            if (
              !["canceled", "incomplete_expired"].includes(subscription.status)
            )
              await stripe.subscriptions.cancel(subscription.id);
          }
        }
      }
      await assertLock(client);
      return afterCancellation(assertLock); // Account erasure stays inside the same checkout lock.
    });
  }
  return {
    createCheckout,
    handleStripeWebhook,
    portal,
    cancelUserSubscriptions,
  };
}

const handlers = createBillingHandlers();

module.exports = {
  publicConfig,
  configuredProviders,
  ...handlers,
  createBillingHandlers,
  setUserPlan,
};
