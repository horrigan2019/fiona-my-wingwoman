/**
 * Fiona VIP — create Stripe Checkout Session
 * POST /api/fiona/stripe/checkout
 * Body: { plan: "monthly" | "annual" }
 *
 * Env (Vercel):
 *   STRIPE_SECRET_KEY
 *   STRIPE_MONTHLY_PRICE_ID (optional fallback below)
 *   STRIPE_ANNUAL_PRICE_ID (optional fallback below)
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJson(req) {
  if (req.body != null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return Promise.resolve(req.body);
    }
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(JSON.parse(req.body || '{}'));
      } catch (e) {
        return Promise.reject(e);
      }
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function siteOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'www.fionamywingwoman.com')
    .toString()
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

async function stripeForm(secret, path, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    body.append(key, String(value));
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'STRIPE_SECRET_KEY is not configured',
      code: 'missing_stripe_secret',
      hint: 'Add STRIPE_SECRET_KEY in Vercel Environment Variables, then redeploy.'
    }));
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  const plan = body && body.plan === 'monthly' ? 'monthly' : 'annual';
  const priceId = plan === 'monthly'
    ? (process.env.STRIPE_MONTHLY_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID || 'price_1UHfCx8MURYuyfuQfX02FkDg')
    : (process.env.STRIPE_ANNUAL_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID || 'price_1UHfGR8MURYuyfuQroMfVfKq');

  const origin = siteOrigin(req);
  const successUrl = `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/pricing`;

  const params = {
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    allow_promotion_codes: 'true',
    'metadata[product]': 'fiona_vip',
    'metadata[plan]': plan,
    'subscription_data[metadata][product]': 'fiona_vip',
    'subscription_data[metadata][plan]': plan,
    'subscription_data[trial_period_days]': '7'
  };

  try {
    const { ok, status, json } = await stripeForm(secret, 'checkout/sessions', params);
    if (!ok || !json.url) {
      console.error('[fiona/stripe/checkout] Stripe error', status, json);
      res.statusCode = status || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Stripe Checkout could not start',
        code: 'stripe_checkout_failed',
        detail: (json && json.error && json.error.message) || json
      }));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      plan,
      sessionId: json.id,
      url: json.url
    }));
  } catch (err) {
    console.error('[fiona/stripe/checkout] failure', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Checkout failed',
      detail: err && err.message ? err.message : String(err)
    }));
  }
};
