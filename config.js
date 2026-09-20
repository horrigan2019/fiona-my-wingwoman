/**
 * GET /api/stripe/config
 * Returns public Stripe price IDs for the pricing UI (never the secret key).
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.end(JSON.stringify({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      || null,
    monthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID
      || process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
      || 'price_1UHfCx8MURYuyfuQfX02FkDg',
    annualPriceId: process.env.STRIPE_ANNUAL_PRICE_ID
      || process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID
      || 'price_1UHfGR8MURYuyfuQroMfVfKq',
    trialDays: 7
  }));
};
