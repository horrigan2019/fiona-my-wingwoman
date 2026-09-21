/**
 * Fiona Glamour Suite — live Anthropic style analysis
 * ALSO handles Stripe Checkout when body includes { priceId }
 * and session verify on GET ?session_id=cs_...
 *
 * POST /api/fiona/glamour/style
 *   - { priceId } → Stripe Checkout (7-day trial)
 *   - style body → Anthropic wardrobe/palette
 * GET /api/fiona/glamour/style?session_id=cs_... → verify checkout session
 */

const FIONA_STYLE_SYSTEM = `You are Fiona, an impeccably dressed, emotionally untouchable wingwoman sipping an espresso.
Warm, grounded, stylishly witty — never a generic corporate life coach.

Philosophy: It's a marathon, not a sprint. Motto: "It's a marathon, not a sprint, darling. We aren't doing extreme makeovers; we're building an empire one tailored cuff at a time."
Celebrate 1% micro-wins. Preserve EQ rules: count wins, unruffled feathers, zero-penalty rest days.

CRITICAL STYLING RULES:
- Every recommendation MUST be distinct and customized to THIS user's uploaded photo(s) and selected filters (occasion, vibe, silhouette, color harmony / undertone, and morning energy when provided).
- When morning energy is logged, let it drive the look: fumes → low-friction soft silhouettes and flats; conquer → structured tailoring and bold statements; on the move → polished athleisure and movement-friendly layers.
- NEVER return a generic default like "Tailored wide-leg trousers in rich plum with a tucked silk cami" unless that literally matches what you see and the filters demand it.
- Reference visible garments, colors, body proportions, lighting, or accessories from the photo when images are provided.
- PHOTO ANALYSIS (when photos are attached): You MUST visually assess the woman's body silhouette/figure and skin-tone / undertone from the images. Prefer what you see over manual filter chips when filters say "Auto from photos" or when inferFromPhotos is true. Be kind, specific, and never body-shame.
- Vary titles, fabrics, cues, and beauty notes across requests — creativity is required.
- Return ONLY valid JSON matching the schema in the user message. No markdown fences.

MAKEUP / LIP RULES (NON-NEGOTIABLE):
- Lipstick MUST be wearable everyday-to-evening makeup: rose, berry, mauve, nude, coral, terracotta, plum, cherry, or classic red.
- NEVER recommend green, sage, olive, moss, mint, teal, emerald, chartreuse, or any fashion-green lipstick. Greens may appear in clothing palettes only — never on lips.
- Cheek colors stay soft and flattering (rose, peach, terracotta, soft berry) — never green.
- Beauty products should sound like real lipstick/blush names a woman would buy, not runway costume colors.`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
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

function resolvePriceId(envKeys, fallback) {
  for (const key of envKeys) {
    const val = process.env[key];
    if (val && /^price_/.test(String(val).trim())) return String(val).trim();
  }
  return fallback;
}

async function handleStripeCheckout(req, res, body) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !/^sk_/.test(secret)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'STRIPE_SECRET_KEY is not configured',
      code: 'missing_stripe_secret'
    }));
  }

  const priceId = body && body.priceId ? String(body.priceId).trim() : '';
  if (!priceId || !/^price_/.test(priceId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing or invalid priceId' }));
  }

  const monthlyId = resolvePriceId(
    ['STRIPE_MONTHLY_PRICE_ID', 'NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID'],
    'price_1UHfCx8MURYuyfuQfX02FkDg'
  );
  const annualId = resolvePriceId(
    ['STRIPE_ANNUAL_PRICE_ID', 'NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID'],
    'price_1UHfGR8MURYuyfuQroMfVfKq'
  );

  if (priceId !== monthlyId && priceId !== annualId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unrecognized priceId for Fiona VIP plans' }));
  }

  const plan = priceId === monthlyId ? 'monthly' : 'annual';
  const origin = siteOrigin(req);

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
    console.error('[fiona/glamour/style] Stripe checkout error', status, json);
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
}

async function handleStripeSession(req, res, sessionId) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'STRIPE_SECRET_KEY is not configured',
      code: 'missing_stripe_secret'
    }));
  }
  if (!sessionId || !/^cs_[a-zA-Z0-9]+/.test(sessionId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing or invalid session_id' }));
  }

  const stripeRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    { headers: { Authorization: `Bearer ${secret}` } }
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
}

function buildUserContent(body) {
  const mode = body.mode === 'palette' ? 'palette' : 'wardrobe';
  const images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
  const content = [];
  const infer = body.inferFromPhotos === true || images.length > 0;
  const autoSilhouette = !body.silhouette || /^auto/i.test(String(body.silhouette));
  const autoHarmony = !body.harmony || /^auto/i.test(String(body.harmony));
  const autoUndertone = !body.undertone || /^auto/i.test(String(body.undertone));

  for (const img of images) {
    if (!img || !img.data) continue;
    const mediaType = img.mediaType || img.media_type || 'image/jpeg';
    const data = String(img.data).replace(/^data:[^;]+;base64,/, '');
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data
      }
    });
  }

  const detectBlock = images.length
    ? `PHOTO DETECTION REQUIRED (${images.length} photo(s)):
- Study face, neck, and visible skin for undertone + overall skin-tone harmony.
- Study proportions, shoulder-to-hip balance, height cues, and how clothes hang for body silhouette/figure.
- Choose detectedSilhouette from ONLY: "Hourglass / Defined", "Petite", "Curvy / Soft Silhouette", "Tall / Long Lines", "Athletic / Straight".
- Choose detectedHarmony from ONLY: "Warm & Golden", "Cool & Rosy", "Deep & Rich", "Olive / Neutral".
- Choose detectedUndertone from ONLY: "Cool", "Warm", "Neutral", "Deep Olive".
- If manual filters are NOT "Auto from photos", treat them as soft overrides; if they ARE auto (or blank), trust the photos.
- Write a short detectionNotes sentence explaining what you saw (kind, factual, never shaming).`
    : `No photos attached — use the provided silhouette/harmony/undertone filters (if Auto, pick sensible defaults).`;

  if (mode === 'palette') {
    content.push({
      type: 'text',
      text: `Create a customized hair & makeup palette for this woman.

Filters:
- Undertone hint: ${body.undertone || 'Auto from photos'}
- Occasion context: ${body.occasion || 'Everyday'}
- Vibe: ${body.vibe || '(none provided)'}
- Silhouette hint: ${body.silhouette || 'Auto from photos'}
- Color harmony hint: ${body.harmony || 'Auto from photos'}
- inferFromPhotos: ${infer}
- autoUndertone: ${autoUndertone}
- Photos attached: ${images.length}

${detectBlock}

Lipstick MUST be a wearable real-world shade (rose, berry, mauve, nude, coral, terracotta, plum, cherry, red). NEVER sage, olive, green, mint, or teal lipstick.
Build the palette from the DETECTED undertone/harmony when photos exist.

Return JSON only:
{
  "detectedSilhouette": "one allowed silhouette or null",
  "detectedHarmony": "one allowed harmony",
  "detectedUndertone": "Cool|Warm|Neutral|Deep Olive",
  "detectionNotes": "one kind sentence about what you observed",
  "lip": ["#HEX", "Shade Name"],
  "cheek": ["#HEX", "Shade Name"],
  "eye": ["#HEX", "Shade Name"],
  "hair": ["#HEX", "Style Name"],
  "quote": "One Fiona-voice line",
  "note": "Undertone-matched beauty note tied to the photo/filters"
}`
    });
  } else {
    content.push({
      type: 'text',
      text: `Create a complete, distinct wardrobe + finishing look for THIS user.

Filters:
- Occasion: ${body.occasion || 'Desk to Dinner'}
- Vibe / event: ${body.vibe || '(none provided)'}
- Body silhouette hint: ${body.silhouette || 'Auto from photos'}
- Skin tone / color harmony hint: ${body.harmony || 'Auto from photos'}
- Undertone hint: ${body.undertone || 'Auto from photos'}
- inferFromPhotos: ${infer}
- autoSilhouette: ${autoSilhouette}
- autoHarmony: ${autoHarmony}
- Morning energy: ${body.morningEnergy ? `${body.morningEnergy.label} — ${body.morningEnergy.styleBias || ''}` : '(not logged yet)'}
- Photos attached: ${images.length}

${detectBlock}

If morning energy is provided, weight the outfit toward that bias (fumes = soft/low-friction; conquer = structured/bold; move = polished athleisure).
If photos are present, ground the look in her actual figure, coloring, and what she is wearing in frame.
If no photos, still invent a fresh look from the filters — do not reuse a canned plum-cami-blazer default.

Style the outfit for the DETECTED silhouette and DETECTED harmony when photos exist.
facePalette.lip MUST be a wearable lipstick (rose/berry/mauve/nude/coral/plum/red) — NEVER green, sage, or olive lipstick. Clothing palette may include olive/sage for garments only.

Return JSON only:
{
  "detectedSilhouette": "Hourglass / Defined|Petite|Curvy / Soft Silhouette|Tall / Long Lines|Athletic / Straight",
  "detectedHarmony": "Warm & Golden|Cool & Rosy|Deep & Rich|Olive / Neutral",
  "detectedUndertone": "Cool|Warm|Neutral|Deep Olive",
  "detectionNotes": "one kind sentence about figure + skin tone observed",
  "title": "Look title (unique)",
  "desc": "2-4 sentences describing the full look, tailored to detected figure/skin tone and photo",
  "quote": "One Fiona-voice line",
  "neckline": "short neckline note",
  "pieces": [
    { "name": "Piece name", "fabric": "Fabric — texture note", "cue": "One-line styling cue", "hex": "#HEX", "colorLabel": "Color name" },
    { "name": "...", "fabric": "...", "cue": "...", "hex": "#HEX", "colorLabel": "..." },
    { "name": "...", "fabric": "...", "cue": "...", "hex": "#HEX", "colorLabel": "..." }
  ],
  "palette": [
    { "hex": "#HEX", "label": "Name" },
    { "hex": "#HEX", "label": "Name" },
    { "hex": "#HEX", "label": "Name" },
    { "hex": "#HEX", "label": "Name" }
  ],
  "hairMove": {
    "title": "Hair move title",
    "body": "Advice based on face/outfit neckline and silhouette",
    "cues": ["Volume: ...", "Part: ...", "Texture: ..."]
  },
  "facePalette": {
    "lip": ["#HEX", "Name"],
    "cheek": ["#HEX", "Name"],
    "note": "Undertone-matching beauty note"
  }
}`
    });
  }

  return content;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  return JSON.parse(candidate.slice(start, end + 1));
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function isWearableLipColor(hex, label) {
  const name = String(label || '').toLowerCase();
  if (/sage|olive|moss|forest|kelly|chartreuse|lime|mint|emerald|teal|green/.test(name)) return false;
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  if (rgb.g > rgb.r + 12 && rgb.g > rgb.b + 8) return false;
  return true;
}

function sanitizeBeautyData(data, body) {
  if (!data || typeof data !== 'object') return data;
  const harmony = body && body.harmony ? String(body.harmony) : '';
  const fallbackLips = {
    'Warm & Golden': ['#C45C26', 'Spiced Coral'],
    'Cool & Rosy': ['#9E2A2B', 'Velvet Currant'],
    'Deep & Rich': ['#7A1F2B', 'Deep Merlot'],
    'Olive / Neutral': ['#B76E79', 'Muted Rosewood']
  };
  const lipFallback = fallbackLips[harmony] || ['#B76E79', 'Muted Rosewood'];

  if (Array.isArray(data.lip) && !isWearableLipColor(data.lip[0], data.lip[1])) {
    data.lip = lipFallback;
  }
  if (data.facePalette && Array.isArray(data.facePalette.lip)
    && !isWearableLipColor(data.facePalette.lip[0], data.facePalette.lip[1])) {
    data.facePalette.lip = lipFallback;
    data.facePalette.note = (data.facePalette.note || '') + ' Wearable lip only — never fashion greens.';
  }
  return data;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://www.fionamywingwoman.com');
    const sessionId = url.searchParams.get('session_id') || '';
    if (sessionId) {
      try {
        return await handleStripeSession(req, res, sessionId);
      } catch (err) {
        console.error('[fiona/glamour/style] session failure', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: 'Session lookup failed',
          detail: err && err.message ? err.message : String(err)
        }));
      }
    }
    // Lightweight probe — never exposes keys.
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      route: '/api/fiona/glamour/style',
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY && /^sk_/.test(process.env.STRIPE_SECRET_KEY)),
      monthlyPriceId: resolvePriceId(
        ['STRIPE_MONTHLY_PRICE_ID', 'NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID'],
        'price_1UHfCx8MURYuyfuQfX02FkDg'
      ),
      annualPriceId: resolvePriceId(
        ['STRIPE_ANNUAL_PRICE_ID', 'NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID'],
        'price_1UHfGR8MURYuyfuQroMfVfKq'
      ),
      trialDays: 7,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Invalid JSON body', code: 'invalid_json' }));
  }

  // Stripe Checkout path — same URL, body has priceId
  if (body && body.priceId) {
    try {
      return await handleStripeCheckout(req, res, body);
    } catch (err) {
      console.error('[fiona/glamour/style] checkout failure', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Checkout failed',
        detail: err && err.message ? err.message : String(err)
      }));
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'ANTHROPIC_API_KEY is not configured',
      code: 'missing_api_key',
      hint: 'Add ANTHROPIC_API_KEY in Vercel project Environment Variables, then redeploy.'
    }));
  }

  const content = buildUserContent(body || {});
  const temperature = 0.8;
  const modelCandidates = [
    process.env.ANTHROPIC_MODEL,
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929'
  ].filter(Boolean).filter((m, i, arr) => arr.indexOf(m) === i);

  try {
    let anthropicRes = null;
    let payload = {};
    let usedModel = modelCandidates[0];

    for (const model of modelCandidates) {
      usedModel = model;
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1800,
          temperature,
          system: FIONA_STYLE_SYSTEM,
          messages: [
            {
              role: 'user',
              content
            }
          ]
        })
      });

      payload = await anthropicRes.json().catch(() => ({}));
      if (anthropicRes.ok) break;

      const errType = payload && payload.error && payload.error.type;
      const errMsg = String((payload && payload.error && payload.error.message) || '');
      const modelMissing =
        anthropicRes.status === 404 ||
        /model/i.test(errMsg) && /not_found|not found|invalid/i.test(errMsg + ' ' + errType);
      console.error('[fiona/glamour/style] Anthropic model attempt failed', {
        model,
        status: anthropicRes.status,
        detail: payload.error || payload
      });
      if (!modelMissing) break;
    }

    if (!anthropicRes || !anthropicRes.ok) {
      const anthropicMsg =
        (payload && payload.error && (payload.error.message || payload.error.type)) ||
        (payload && payload.error) ||
        payload;
      console.error('[fiona/glamour/style] Anthropic error', anthropicRes && anthropicRes.status, anthropicMsg);
      res.statusCode = (anthropicRes && anthropicRes.status) || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Anthropic request failed',
        code: 'anthropic_error',
        status: anthropicRes && anthropicRes.status,
        model: usedModel,
        detail: anthropicMsg
      }));
    }

    const text = (payload.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const data = sanitizeBeautyData(extractJson(text), body);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      mode: body.mode === 'palette' ? 'palette' : 'wardrobe',
      temperature,
      model: usedModel,
      data
    }));
  } catch (err) {
    console.error('[fiona/glamour/style] handler failure', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Style analysis failed',
      code: 'handler_exception',
      detail: err && err.message ? err.message : String(err)
    }));
  }
};
