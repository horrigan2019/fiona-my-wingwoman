/**
 * Fiona VIP — verify Stripe Checkout Session after return
 * GET /api/fiona/stripe/session?session_id=cs_...
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

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'STRIPE_SECRET_KEY is not configured',
      code: 'missing_stripe_secret'
    }));
  }

  const url = new URL(req.url, 'https://www.fionamywingwoman.com');
  const sessionId = url.searchParams.get('session_id') || '';
  if (!sessionId || !/^cs_[a-zA-Z0-9]+/.test(sessionId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing or invalid session_id' }));
  }

  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
      {
        headers: { Authorization: `Bearer ${secret}` }
      }
    );
    const session = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      res.statusCode = stripeRes.status || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Could not load Checkout Session',
        detail: (session && session.error && session.error.message) || session
      }));
    }

    const plan = (session.metadata && session.metadata.plan)
      || (session.subscription && session.subscription.metadata && session.subscription.metadata.plan)
      || 'annual';
    const subStatus = typeof session.subscription === 'object' && session.subscription
      ? session.subscription.status
      : null;
    const paid = session.payment_status === 'paid'
      || session.status === 'complete'
      || subStatus === 'active'
      || subStatus === 'trialing';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      paid: Boolean(paid),
      plan,
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionStatus: subStatus,
      customerEmail: session.customer_details && session.customer_details.email
        ? session.customer_details.email
        : null
    }));
  } catch (err) {
    console.error('[fiona/stripe/session] failure', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Session lookup failed',
      detail: err && err.message ? err.message : String(err)
    }));
  }
};
