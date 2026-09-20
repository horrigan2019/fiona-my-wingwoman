/**
 * POST /api/fiona/checkout
 * Body: { priceId: string }
 *
 * Creates a Stripe Checkout subscription session with a 7-day free trial.
 * Uses Stripe HTTP API directly (no stripe npm package required).
 * Requires STRIPE_SECRET_KEY in Vercel env.
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

  const priceId = body && body.priceId ? String(body.priceId).trim() : '';
  if (!priceId || !/^price_/.test(priceId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing or invalid priceId' }));
  }

  const monthlyId = process.env.STRIPE_MONTHLY_PRICE_ID
    || process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
    || 'price_1UHfCx8MURYuyfuQfX02FkDg';
  const annualId = process.env.STRIPE_ANNUAL_PRICE_ID
    || process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID
    || 'price_1UHfGR8MURYuyfuQroMfVfKq';

  if (priceId !== monthlyId && priceId !== annualId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unrecognized priceId for Fiona VIP plans' }));
  }

  const plan = priceId === monthlyId ? 'monthly' : 'annual';
  const origin = siteOrigin(req);

  try {
    const { ok, status, json } = await stripeForm(secret, 'checkout/sessions', {
      mode: 'subscription',
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      allow_promotion_codes: 'true',
      'metadata[product]': 'fiona_vip',
      'metadata[plan]': plan,
      'subscription_data[metadata][product]': 'fiona_vip',
      'subscription_data[metadata][plan]': plan,
      'subscription_data[trial_period_days]': '7'
    });

    if (!ok || !json.url) {
      console.error('[api/fiona/checkout] Stripe error', status, json);
      res.statusCode = status || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Stripe Checkout could not start',
        detail: (json && json.error && json.error.message) || json
      }));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ url: json.url }));
  } catch (err) {
    console.error('[api/fiona/checkout] failure', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Checkout failed',
      detail: err && err.message ? err.message : String(err)
    }));
  }
};
