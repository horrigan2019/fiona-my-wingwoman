/**
 * Fiona Glamour Suite — live Anthropic style analysis + journal reflect + look photo
 * ALSO handles Stripe Checkout when body includes { priceId }
 * and session verify on GET ?session_id=cs_...
 *
 * POST /api/fiona/glamour/style
 *   - { priceId } → Stripe Checkout (7-day trial)
 *   - { journalEntry } → Anthropic journal reflection
 *   - { mode: "look" } → generate styled look photo of the user
 *   - style body → Anthropic wardrobe/palette (full glam: outfit + hair + makeup)
 * GET /api/fiona/glamour/style?session_id=cs_... → verify checkout session
 */

const FIONA_STYLE_SYSTEM = `You are Fiona, an impeccably dressed, emotionally untouchable wingwoman sipping an espresso.
Warm, grounded, stylishly witty — never a generic corporate life coach.

Philosophy: It's a marathon, not a sprint. Motto: "It's a marathon, not a sprint, darling. We aren't doing extreme makeovers; we're building an empire one tailored cuff at a time."
Celebrate 1% micro-wins. Preserve EQ rules: count wins, unruffled feathers, zero-penalty rest days.

CRITICAL STYLING RULES:
- Deliver TWO distinct Wardrobe options (Option A and Option B) AND TWO distinct Hair & Makeup beauty options (Option A and Option B). The user picks one wardrobe + one beauty look; Vision combines those picks. Do not collapse into a single bundled look.
- Wardrobe options cover outfit only (title, desc, pieces, palette, neckline). Beauty options cover hair + makeup only (hairMove, facePalette, hairStyleId). Both pairs must feel like real choices — not tiny tweaks of the same idea.
- Every recommendation MUST be distinct and customized to THIS user's uploaded photo(s) and selected filters (event/occasion/function, vibe, silhouette/body type, color harmony / undertone/skin tone, and morning energy when provided).
- USER QUESTION / VIBE TEXT: If the user typed a question or note (vibe / userQuestion field), your compliment AND both wardrobe option descriptions MUST directly answer that question first (e.g. which shirt + which legging color for desk-to-dinner). Do not ignore their words in favor of generic styling or inventing dresses.
- OWNED CLOTHES / SEPARATES (critical): If she uploaded shirts/tops/pants OR asked about shirts, tops, leggings, or specific colors she owns, BOTH wardrobe options MUST be pairings from THOSE owned pieces + named colors. NEVER invent a lace dress, cocktail dress, or unrelated gown when she asked about shirts/leggings. Describe the exact shirt/top + legging/pant pairing.
- HONEST WINGWOMAN FEEDBACK: If she asks "how does this look?" or similar about an uploaded outfit/selfie, answer honestly and kindly in compliment + both option descs: name what works, and if something is off, say so gently with a concrete improvement or alternate pairing. NEVER insult, shame, or degrade her body, face, age, or taste. Truth + encouragement.
- EVENT / FUNCTION: Match outfit formality and pieces to the selected occasion chip or free-text event (desk, date night, beach, wedding guest, brunch, power meeting, etc.). Never ignore the event.
- BODY TYPE HONESTY: Prescribe for the DETECTED or selected silhouette (Tall / Athletic / Petite / Curvy / Hourglass). Do not invent a curvier or slimmer body in descriptions than the photo shows.
- BEAUTY STYLING: Hair & Makeup Option A and Option B must be a real choice with different EFFORTLESS makeup stories. DEFAULT for short / chin-length / bob / pixie hair: BOTH options are HAIR DOWN (soft vs sleek) — NEVER prescribe a bun, claw-clip updo, or high pony that needs longer hair. Only offer hair-up when her photo clearly has enough length for a real updo without growing hair. Never invent longer hair.
- Always include at least one sincere, specific compliment about her presence, coloring, figure, energy, or taste — grounded in the photo or what she wrote (never generic "you're beautiful"). Compliments celebrate her body and presence; never euphemize or apologize for curves.
- When morning energy is logged, let it drive BOTH wardrobe options: fumes → easy elevated polish she can throw on fast (wrap that cinches, soft V, flats OK) — still flattering, never frumpy; conquer → sharp figure-flattering tailoring and bold statements (not boxy corporate armor); on the move → polished athleisure and movement-friendly layers that still show shape.
- If she says she feels frumpy / stuck / "nothing to wear," start with empathy + a compliment, then prescribe confidence-lifting wardrobe + beauty options she can actually put on today — glamorous and hot-on-her, not a cover-up.
- NEVER return a generic default like "Tailored wide-leg trousers in rich plum with a tucked silk cami" unless that literally matches what you see and the filters demand it.
- Reference visible garments, colors, body proportions, lighting, or accessories from the photo when images are provided. When closet or wardrobe / clothing-choice photos are mixed in with a selfie, Wardrobe Option A and B MUST pick among those EXACT uploaded garments (e.g. which dress for the wedding). Describe each piece accurately — neckline, straps or strapless, color, fabric, length. NEVER redesign an uploaded garment (do not turn strapless into spaghetti straps, change color, add sleeves, or invent a different dress). You may recommend hair, makeup, shoes, and setting. The IDENTITY photo is the person to dress — never treat a closet shelf as her body.
- PHOTO ANALYSIS (when photos are attached): You MUST visually assess the woman's body silhouette/figure and skin-tone / undertone from the images. Prefer what you see over manual filter chips when filters say "Auto from photos" or when inferFromPhotos is true. Be kind, specific, and never body-shame.
- SWIMWEAR / BIKINI / BEACHWEAR ON CANVAS: If the identity photo shows her in a bikini, swimsuit, or similar, celebrate that body and energy. Offer flattering, occasion-aware, hot-on-her options (elevated day-to-night slip or cut-out knit, tailored shorts + silk cami, linen set, wrap that cinches, soft V) — NEVER default to a matronly black midi wrap dress + cardigan/shawl "armor," heavy blazer stacks, or formal boardroom looks unless the occasion filter explicitly demands black-tie / corporate.
- Vary titles, fabrics, cues, and beauty notes across requests — creativity is required. Option A and Option B must clearly diverge (different silhouette strategy, fabrics, or color story for wardrobe; different hair finish + lip/cheek story for beauty).
- Return ONLY valid JSON matching the schema in the user message. No markdown fences.

FLATTERING FIT RULES (NON-NEGOTIABLE — WINGWOMAN ENERGY):
- Goal: make her feel gorgeous. Celebrate her body. Prefer elevated sexy / polished over frumpy, matronly, or tented.
- NEVER body-shame. NEVER "cover up," "hide," "minimize," "forgiving," or "distract from" her figure. NEVER treat curves as a problem to solve.
- NEVER default to heavy structured blazer + dark midi wrap / column dress as corporate armor — especially for casual, selfie, everyday, brunch, date, or "feel frumpy" contexts. Blazers only when the occasion truly needs polish, and then soft/open or cropped so the waist still reads.
- For Curvy / Soft Silhouette (and soft curves generally): prescribe cuts that CELEBRATE — wrap that CINCHES the waist, soft V-neck or wrap neckline, A-line that skims hips, intentional waist (belt, wrap tie, clean tuck), vertical lines, right proportions (fitted through waist, fluid through hip/bust — not clingy, not boxy).
- Ban shapeless tents, oversized boyfriend blazers over heavy dark midis, turtleneck-under-armor stacks, and anything that reads matronly or "hiding."
- Fit language: skim + define the waist. "Skim" means fabric follows her shape with ease — never tent, never sausage-cling.
- Match formality to occasion/vibe. A bedroom/closet selfie or casual ask gets glamorous everyday polish — not boardroom.
- CLEAN LOOKS ONLY (anti-silly — NON-NEGOTIABLE): Each wardrobe option is ONE clear hero look. Prefer a single dress/jumpsuit OR a clean top+bottom. Absolute max: 2 clothing pieces + optional shoes. At most ONE light outer layer (open blazer OR cardigan — never both, never plus an open shirt). FORBIDDEN: neck scarves, shawls, stoles, scarf+cardigan stacks, tank+plaid+cardigan piles, 3+ layers, or dressing her in everything from a closet rack. Closet photos are inventory to pick FROM — pick one hero piece (or one clean pairing), never the whole rack.
- Underwear / bra / lingerie selfies: prescribe ONE elevated, hot-on-her, occasion-right look (slip dress, wrap, tailored set) — never matronly cover-up layering or accessory piles.

MAKEUP / LIP RULES (NON-NEGOTIABLE):
- Lipstick MUST be wearable everyday-to-evening makeup: rose, berry, mauve, nude, coral, terracotta, plum, cherry, or classic red.
- NEVER recommend green, sage, olive, moss, mint, teal, emerald, chartreuse, or any fashion-green lipstick. Greens may appear in clothing palettes only — never on lips.
- Cheek colors stay soft and flattering (rose, peach, terracotta, soft berry) — never green.
- Beauty products should sound like real lipstick/blush names a woman would buy, not runway costume colors.

CALENDAR RULES:
- When the user message includes Today's weekday, treat that as ground truth for the woman's local calendar.
- If a quote/note mentions a day of the week, it MUST be today's weekday — never invent a random Monday/Tuesday/etc.
- Prefer timeless wording when a weekday is not needed.`;

const FIONA_REFLECT_SYSTEM = `You are Fiona, a high-EQ wingwoman reflecting on a private journal entry.
Warm, grounded, stylishly witty — never a generic corporate life coach and never a therapist lecture.

GROUNDING RULES (NON-NEGOTIABLE):
- Your reflection MUST be about THIS specific journal entry. Quote or closely paraphrase her words.
- Do NOT give a canned pep talk that could apply to anyone. If she wrote about work, answer work. If she wrote about feeling frumpy, answer feeling frumpy.
- Include at least one sincere, specific compliment tied to what she shared (her honesty, grit, taste, tenderness, courage, humor — something real in the text).
- Keep EQ rules: count wins, unruffled feathers, zero-penalty rest days. Marathon mindset — 1% better, not extreme overhauls.
- Return ONLY valid JSON. No markdown fences.

JSON shape:
{
  "clarityRefocus": "2-4 sentences that name what is really going on in HER words",
  "confidenceAnchor": "1-3 sentences with a concrete next step + one specific compliment",
  "wingwomanQuip": "1 punchy Fiona line that still references her situation",
  "compliment": "One stand-alone compliment sentence grounded in the entry"
}`;

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

  const weeklyId = resolvePriceId(
    ['STRIPE_WEEKLY_PRICE_ID', 'NEXT_PUBLIC_STRIPE_WEEKLY_PRICE_ID', 'STRIPE_MONTHLY_PRICE_ID', 'NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID'],
    'price_1UHfCx8MURYuyfuQfX02FkDg'
  );
  const annualId = resolvePriceId(
    ['STRIPE_ANNUAL_PRICE_ID', 'NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID'],
    'price_1UHfGR8MURYuyfuQroMfVfKq'
  );

  if (priceId !== weeklyId && priceId !== annualId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Unrecognized priceId for Fiona VIP plans' }));
  }

  const plan = priceId === weeklyId ? 'weekly' : 'annual';
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

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function resolveLocalWeekday(body) {
  const raw = body && body.localWeekday != null ? String(body.localWeekday).trim() : '';
  const match = WEEKDAY_NAMES.find((d) => d.toLowerCase() === raw.toLowerCase());
  if (match) return match;
  return WEEKDAY_NAMES[new Date().getDay()];
}

function alignTextToWeekday(text, weekday) {
  if (text == null || text === '' || !weekday) return text;
  return String(text).replace(
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(s?)\b/gi,
    (_, _day, plural) => weekday + (plural || '')
  );
}

async function callAnthropicJson({ apiKey, system, userContent, maxTokens = 1200, temperature = 0.7 }) {
  const modelCandidates = [
    process.env.ANTHROPIC_MODEL,
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929'
  ].filter(Boolean).filter((m, i, arr) => arr.indexOf(m) === i);

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
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: userContent }]
      })
    });
    payload = await anthropicRes.json().catch(() => ({}));
    if (anthropicRes.ok) break;
    const errType = payload && payload.error && payload.error.type;
    const errMsg = String((payload && payload.error && payload.error.message) || '');
    const modelMissing =
      anthropicRes.status === 404 ||
      (/model/i.test(errMsg) && /not_found|not found|invalid/i.test(`${errMsg} ${errType}`));
    if (!modelMissing) break;
  }

  if (!anthropicRes || !anthropicRes.ok) {
    const err = new Error('Anthropic request failed');
    err.status = (anthropicRes && anthropicRes.status) || 502;
    err.detail = (payload && payload.error) || payload;
    err.model = usedModel;
    throw err;
  }

  const text = (payload.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  return { data: extractJson(text), model: usedModel, raw: text };
}

const FIONA_FITCHECK_SYSTEM = `You are Fiona, an impeccably dressed, emotionally untouchable wingwoman.
Warm, grounded, stylishly witty — never a generic corporate life coach and NEVER cruel.

HONEST FIT-CHECK RULES (NON-NEGOTIABLE):
- The user asked "How does this look?" about an uploaded photo. Answer THAT look.
- Be honest and kind. Name what works first. If something is off (fit, color, occasion mismatch, proportion), say so gently with a concrete tweak or alternate outfit idea.
- NEVER insult, shame, or degrade her body, face, age, hair, or taste. No "frumpy on you," no body-shaming, no mean girl energy.
- If the look is great, say so clearly and specifically. If it needs work, frame it as "here's how we elevate this" — still encouraging.
- Ground comments in what you SEE (color, neckline, fit, shoes, setting) and any note she typed.
- Return ONLY valid JSON. No markdown fences.

JSON shape:
{
  "verdict": "short honest headline (e.g. Strong desk polish / Almost — one tweak)",
  "whatWorks": "2-3 sentences on what is working, specific and kind",
  "tweak": "1-3 sentences on what to adjust if needed (or say 'Nothing major — wear it with confidence' if it's already working)",
  "alternate": "One alternate outfit idea she could try, concrete and wearable",
  "compliment": "One sincere compliment grounded in the photo",
  "wingwomanQuip": "One punchy Fiona line that still feels honest"
}`;

async function handleFitCheck(req, res, body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'ANTHROPIC_API_KEY is not configured',
      code: 'missing_api_key',
      fionaMessage: "Fiona's fit-check isn't plugged in yet — add ANTHROPIC_API_KEY in Vercel."
    }));
  }

  const photo = body.photo || (Array.isArray(body.images) && body.images[0]) || null;
  if (!photo || !(photo.data || typeof photo === 'string')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'A photo is required',
      code: 'missing_photo',
      fionaMessage: 'Upload or take a photo of the look first, gorgeous.'
    }));
  }

  const note = String(body.note || body.vibe || body.userQuestion || '').trim();
  const occasion = String(body.occasion || '').trim();
  const mediaType = (typeof photo === 'object' && (photo.mediaType || photo.media_type)) || 'image/jpeg';
  const data = String(typeof photo === 'string' ? photo : photo.data).replace(/^data:[^;]+;base64,/, '');

  const content = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data }
    },
    {
      type: 'text',
      text: `How does this look? Give an honest, kind fit-check on the outfit/person in this photo.

Occasion context: ${occasion || '(not specified)'}
Her note: ${note || '(none — just read the photo)'}

Return the JSON shape from your instructions.`
    }
  ];

  try {
    const { data: json, model } = await callAnthropicJson({
      apiKey,
      system: FIONA_FITCHECK_SYSTEM,
      userContent: content,
      maxTokens: 900,
      temperature: 0.55
    });
    const out = json && typeof json === 'object' ? json : {};
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      mode: 'fitcheck',
      model,
      verdict: out.verdict || 'Honest read',
      whatWorks: out.whatWorks || out.compliment || '',
      tweak: out.tweak || '',
      alternate: out.alternate || '',
      compliment: out.compliment || '',
      wingwomanQuip: out.wingwomanQuip || out.quip || ''
    }));
  } catch (err) {
    console.error('[fiona/glamour/style] fitcheck failure', err);
    res.statusCode = (err && err.status) || 502;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Fit-check failed',
      detail: err && (err.detail || err.message),
      fionaMessage: "Fiona couldn't finish the fit-check — try again in a moment."
    }));
  }
}

async function handleJournalReflect(req, res, body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'ANTHROPIC_API_KEY is not configured',
      code: 'missing_api_key'
    }));
  }

  const journalEntry = String(body.journalEntry || body.text || '').trim();
  if (!journalEntry) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing journalEntry' }));
  }

  const moods = Array.isArray(body.moods) ? body.moods.filter(Boolean).slice(0, 3) : [];
  const appendix = body.systemPromptAppendix ? String(body.systemPromptAppendix) : '';
  const userText = `JOURNAL ENTRY (respond ONLY to this):
"""
${journalEntry.slice(0, 6000)}
"""

Selected moods: ${moods.length ? moods.join(', ') : '(none)'}

${appendix ? `Extra Fiona guidelines:\n${appendix}\n` : ''}
Write clarityRefocus, confidenceAnchor, wingwomanQuip, and compliment that are unmistakably about THIS entry. Quote her at least once.`;

  try {
    const { data, model } = await callAnthropicJson({
      apiKey,
      system: FIONA_REFLECT_SYSTEM,
      userContent: userText,
      maxTokens: 900,
      temperature: 0.65
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      model,
      clarityRefocus: data.clarityRefocus || '',
      confidenceAnchor: data.confidenceAnchor || '',
      wingwomanQuip: data.wingwomanQuip || '',
      compliment: data.compliment || ''
    }));
  } catch (err) {
    console.error('[fiona/glamour/style] reflect failure', err);
    res.statusCode = err.status || 502;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Journal reflection failed',
      detail: err.detail || (err && err.message) || String(err)
    }));
  }
}

/**
 * Vision hair STYLING options only — texture / part / finish / polish.
 * Never ship haircuts (bob, lob, crop, trim). Same cut + length as Canvas always.
 */
const FIONA_HAIRSTYLE_OPTIONS = [
  {
    id: 'keep-mine',
    label: 'Keep mine',
    short: 'Exact hair from your photo',
    category: 'as-is',
    vision: null
  },
  {
    id: 'hair-down-soft',
    label: 'Leave it down · soft',
    short: 'Hair down with soft waves',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN with soft texture/polish WITHIN her EXACT existing length — short stays short (piecey soft movement OK); longer hair may show soft waves but NEVER add length. Keep EXACT cut/color/density/hairline. Do NOT put hair up. NEVER shorten, grow, extend, bob, lob, trim, or cut.'
  },
  {
    id: 'hair-down-sleek',
    label: 'Leave it down · sleek',
    short: 'Hair down, sleek + polished',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN with a CLEARLY VISIBLE sleek polished finish — deep side part, smooth glossy finish on her EXISTING length (not beach waves, not longer hair). Keep EXACT length/cut/color/density/hairline. Do NOT put hair up. NEVER shorten, grow, extend, bob, lob, trim, or cut.'
  },
  {
    id: 'hair-up-playful',
    label: 'Hair up · cute playful',
    short: 'Easy cute playful updo',
    category: 'up',
    vision: 'HAIR UP styling (not a haircut): put her EXISTING hair UP in an EASY, CUTE, PLAYFUL style using ONLY her real length — claw-clip twist, soft playful pin-up, or undone half-up if she has enough length; if short, a tiny twist/tuck/lift only. NO extensions, NO growing hair for a bigger bun. Keep COLOR, density, hairline, and EXACT length. Face stays hers. Style only — never cut or lengthen.'
  },
  {
    id: 'hair-up-sleek',
    label: 'Hair up · sleek',
    short: 'Sleek pulled-up look',
    category: 'up',
    vision: 'HAIR UP styling (not a haircut): put her EXISTING hair UP in a SLEEK pulled-up look using ONLY her real length — low sleek pony/bun/twist if she has the length; if short, a sleek pinned tuck or polished short-hair up style. NO extensions, NO inventing longer hair. Keep COLOR, density, hairline, and EXACT length. Face stays hers. Style only — never cut or lengthen.'
  },
  // Back-compat aliases kept as first-class so old caches still resolve
  {
    id: 'soft-waves',
    label: 'Leave it down · soft',
    short: 'Hair down with soft waves',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN with soft texture within EXACT length — short stays short. Do NOT put hair up. NEVER cut, grow, or lengthen.'
  },
  {
    id: 'sleek-side-part',
    label: 'Leave it down · sleek',
    short: 'Hair down, sleek + polished',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN sleek and polished with a deep side part on her EXACT length — short stays short. Do NOT put hair up. NEVER cut, grow, or lengthen.'
  },
  {
    id: 'tousled-texture',
    label: 'Leave it down · soft',
    short: 'Hair down, tousled',
    category: 'down',
    vision: 'HAIR DOWN styling: leave hair DOWN with tousled piecey texture on EXACT length — short stays short. Do NOT put hair up. NEVER cut, grow, or lengthen.'
  },
  {
    id: 'subtle-volume',
    label: 'Leave it down · soft',
    short: 'Hair down with volume',
    category: 'down',
    vision: 'HAIR DOWN styling: leave hair DOWN with lifted crown volume on EXACT length — short stays short. Do NOT put hair up. NEVER cut, grow, or lengthen.'
  }
];

const LEGACY_HAIRCUT_STYLE_REMAP = {
  'polished-bob': 'hair-down-sleek',
  bob: 'hair-down-sleek',
  lob: 'hair-down-soft',
  'collarbone-lob': 'hair-down-sleek',
  'soft-long-layers': 'hair-down-soft',
  'face-framing-layers': 'hair-down-soft',
  'modern-shag': 'hair-down-soft',
  'sleek-long': 'hair-down-sleek',
  'new-haircut': 'keep-mine',
  haircut: 'keep-mine',
  'soft-waves': 'hair-down-soft',
  'sleek-side-part': 'hair-down-sleek',
  'tousled-texture': 'hair-down-soft',
  'subtle-volume': 'hair-down-soft'
};

function normalizeHairStyleId(hairStyleId) {
  const raw = String(hairStyleId || '').trim().toLowerCase();
  if (!raw) return 'keep-mine';
  if (LEGACY_HAIRCUT_STYLE_REMAP[raw]) return LEGACY_HAIRCUT_STYLE_REMAP[raw];
  return raw;
}

function resolveHairStyleOption(look, hairStyleId) {
  const raw = normalizeHairStyleId(
    hairStyleId
      || (look && (look.hairStyleId || look.hairstyleId || look.selectedHairStyleId))
      || 'keep-mine'
  );
  return FIONA_HAIRSTYLE_OPTIONS.find((o) => o.id === raw) || FIONA_HAIRSTYLE_OPTIONS[0];
}

function hairDirectionForVision(look, hairStyleId) {
  const option = resolveHairStyleOption(look, hairStyleId);
  const isUp = option.category === 'up' || String(option.id || '').startsWith('hair-up');
  const isDown = option.category === 'down' || String(option.id || '').startsWith('hair-down');

  const identityHair = [
    'Keep her real hair COLOR, density, and hairline from the reference selfie (IMAGE 1).',
    'HAIR LENGTH LOCK (NON-NEGOTIABLE): Match her EXACT length from the reference. If short, stay short. NEVER grow, lengthen, add extensions/weaves/clip-ins, or invent shoulder-length/long hair.',
    'NEVER give her a new haircut, bob, lob, crop, trim, or permanently shorten/grow her hair — styling for this look only.',
    'Face locked; EXACT body proportions locked (no added curves).'
  ].join(' ');

  if (!option.vision || option.id === 'keep-mine') {
    return [
      'HAIR LOCK: Keep her exact hair from the reference selfie — same LENGTH, whether it was up or down, color, texture, density, and hairline.',
      identityHair,
      'Optional: light product polish only — do not invent a new updo, longer waves, or change her length.'
    ].join(' ');
  }

  if (isUp) {
    return [
      identityHair,
      'If her hair is short / chin-length / bob, KEEP IT SHORT AND DOWN — do NOT create a bun, high pony, messy updo, or longer hair to fake an updo.',
      `INTENTIONAL HAIR NOTE (user selected "${option.label}"): only attempt an up style if she clearly has enough real length; otherwise polish her short hair DOWN at exact length.`,
      'NEVER grow hair to fill a bun. Makeup follows the selected effortless beauty option.'
    ].join(' ');
  }

  if (isDown) {
    return [
      identityHair,
      'HAIR DOWN LOCK: ends stay at the same place on her body as the reference length when worn down — short stays short; never past where her real ends sit.',
      `INTENTIONAL HAIR DOWN (user selected "${option.label}"): ${option.vision}`,
      'Hair MUST stay DOWN — do NOT put it in a bun, pony, claw clip, or updo for this pick. Soft texture only within her real length — NO long romantic waves if her hair is short.',
      'Makeup follows the selected effortless beauty option.'
    ].join(' ');
  }

  return [
    identityHair,
    `INTENTIONAL HAIR STYLING (user selected "${option.label}"): ${option.vision}`,
    'Makeup follows the selected effortless beauty option.'
  ].join(' ');
}

function buildLookImagePrompt(look, occasion, vibe, hairStyleId) {
  const cleanPieces = sanitizeOutfitPieces(Array.isArray(look && look.pieces) ? look.pieces : []);
  const pieces = cleanPieces
    .map((p) => `${p.name} (${p.fabric || ''} ${p.colorLabel || p.hex || ''})`.trim())
    .join('; ');
  const face = look && look.facePalette
    ? `Lips ${((look.facePalette.lip || [])[1]) || ''}, cheeks ${((look.facePalette.cheek || [])[1]) || ''}. ${look.facePalette.note || ''}`
    : '';
  const hairOption = resolveHairStyleOption(look, hairStyleId);
  const allowHairRestyle = Boolean(hairOption.vision && hairOption.id !== 'keep-mine');
  const changeLine = allowHairRestyle
    ? `CHANGE ALLOWED: clothing/outfit, light makeup (lipstick and blush), and the intentional "${hairOption.label}" STYLING finish on her EXISTING cut — same exact length/shape as the reference (short stays short; NEVER grow longer or add extensions). Keep pose geometry, face, body type, and haircut length intact. NEVER bob, shorten, lengthen, or cut her hair.`
    : 'CHANGE ONLY: clothing/outfit and light makeup (lipstick and blush). Keep pose geometry, exact hair (cut + length), and her identity intact.';
  return [
    'Edit the attached reference selfie of this exact woman. Virtual try-on only — same person, not a new model.',
    'IDENTITY LOCK — do not change: her exact face, facial geometry, eyes, nose, mouth, expression, skin tone, age, ethnicity, or likeness.',
    'BODY PROPORTION LOCK: Keep her EXACT body from the reference — same frame, hips, thighs, waist, arms. Do NOT add curves or thickness; do NOT slim or idealize. Slim/athletic/tall stays that way.',
    hairDirectionForVision(look, hairStyleId),
    changeLine,
    'FLATTERING FIT: Dress her to look intentional and gorgeous on HER body — define the waist, skim (never tent) bust and hips, celebrate soft curves. Prefer wrap that cinches, soft V / wrap neckline, A-line, vertical lines, right proportions.',
    'If dressing from her uploaded clothing photos: keep the EXACT garment design (neckline, straps/strapless, color, fabric, details) — never redesign. Otherwise avoid matronly blazer armor; keep looks hot-on-her and polished for the event.',
    'CLEAN OUTFIT (anti-silly): ONE hero outfit only — a single dress OR top+bottom. Ban neck scarves, scarf+cardigan stacks, tank+open-shirt+cardigan piles, and pasted-on layers. Clothes must drape naturally.',
    `Look title: ${(look && look.title) || 'Curated look'}`,
    `EVENT / FUNCTION: ${occasion || 'everyday'}`,
    vibe ? `Vibe: ${vibe}` : '',
    look && look.desc ? `Outfit description (ignore any hair-length changes or scarf mentions in this text): ${look.desc}` : '',
    pieces ? `Dress her in ONLY these clean pieces (fit flatteringly — cinch waist, skim curves): ${pieces}` : '',
    face ? `Light makeup only: ${face}` : '',
    'Soft studio or wardrobe background OK. Tasteful, non-sexual, photorealistic. No text overlays, no logos.',
    allowHairRestyle
      ? `FINAL CHECK: face matches the reference; hair LENGTH and CUT/shape match the reference exactly (no bobbing, no shortening, no growing longer / no long waves if short); only the selected "${hairOption.label}" styling finish + makeup differ within that length; body type matches the reference; outfit is a clean hero look (no scarf piles) that flatters her real figure. If anything conflicts, prefer the reference selfie for face + body + hair length — keep the flattering fit and selected styling polish.`
      : 'FINAL CHECK: face matches the reference, hair length/cut/style matches the reference, body type matches the reference, outfit is a clean hero look (no scarf piles) that flatters her real figure. If anything conflicts, prefer the reference selfie for identity — keep the flattering fit.'
  ].filter(Boolean).join('\n');
}

async function generateLookWithOpenAI(images, prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const first = images && images[0];
  if (!first || !first.data) return null;
  const raw = String(first.data).replace(/^data:[^;]+;base64,/, '');
  const bytes = Buffer.from(raw, 'base64');
  const mediaType = first.mediaType || first.media_type || 'image/jpeg';
  const fidelity = String(process.env.OPENAI_INPUT_FIDELITY || 'high').toLowerCase() === 'low'
    ? 'low'
    : 'high';
  const modelsToTry = [
    process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
    'gpt-image-1.5',
    'gpt-image-1'
  ].filter((m, i, a) => a.indexOf(m) === i && !/^dall-e/i.test(m));

  let lastErr = null;
  for (const model of modelsToTry) {
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt.slice(0, 3200));
      form.append('size', process.env.OPENAI_IMAGE_SIZE || '1024x1536');
      form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'high');
      if (model === 'gpt-image-1' || model === 'gpt-image-1.5' || model.startsWith('gpt-image-1')) {
        form.append('input_fidelity', fidelity);
      }
      // Mask-free edit — identity/hair/body locks live in the prompt.
      // OpenAI rejects duplicate "image" fields — use image[] when sending identity + garment.
      const garment = images && images[1];
      let garmentBytes = null;
      let garmentType = 'image/jpeg';
      if (garment && garment.data) {
        const gRaw = String(garment.data).replace(/^data:[^;]+;base64,/, '');
        garmentBytes = Buffer.from(gRaw, 'base64');
        garmentType = garment.mediaType || garment.media_type || 'image/jpeg';
      }
      const imageField = garmentBytes ? 'image[]' : 'image';
      form.append(imageField, new Blob([bytes], { type: mediaType }), 'identity-selfie.jpg');
      if (garmentBytes) {
        form.append('image[]', new Blob([garmentBytes], { type: garmentType }), 'garment-exact.jpg');
      }

      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error((json && json.error && json.error.message) || `OpenAI image edit failed (${model})`);
        lastErr.status = res.status;
        lastErr.detail = json;
        continue;
      }
      const b64 = json.data && json.data[0] && (json.data[0].b64_json || json.data[0].b64);
      if (!b64) {
        lastErr = Object.assign(new Error('OpenAI returned no image'), { detail: json });
        continue;
      }
      return {
        mimeType: 'image/png',
        base64: b64,
        provider: `openai:${model}:edit:fidelity-${fidelity}`
      };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function generateLookWithGemini(images, prompt) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const first = images && images[0];
  if (!first || !first.data) return null;
  const raw = String(first.data).replace(/^data:[^;]+;base64,/, '');
  const mediaType = first.mediaType || first.media_type || 'image/jpeg';
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const identityLead = 'You are editing the attached photo of a real woman. Keep her identical face and body type. Keep hair in her real length/color family (short stays short). Change clothes, light makeup, and only an intentional selected hairstyle polish when the prompt asks for it.\n\n';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: identityLead + prompt },
          { inline_data: { mime_type: mediaType, data: raw } }
        ]
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json && json.error && json.error.message) || 'Gemini image generation failed');
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline && inline.data) {
      return {
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        base64: inline.data,
        provider: 'gemini'
      };
    }
  }
  return null;
}

async function handleLookPhoto(req, res, body) {
  // Prefer explicit canvas selfie (`photo`) over a multi-image closet dump.
  const primary = body.photo && (body.photo.data || typeof body.photo === 'string')
    ? (typeof body.photo === 'string' ? { data: body.photo } : body.photo)
    : null;
  const garment = body.garment && (body.garment.data || typeof body.garment === 'string')
    ? (typeof body.garment === 'string' ? { data: body.garment } : body.garment)
    : null;
  const fromImages = Array.isArray(body.images)
    ? body.images.filter((img) => img && img.data)
    : [];
  // Identity first, optional exact garment second — never drop the garment on this fallback path.
  let images = [];
  if (primary) images.push(primary);
  for (const img of fromImages) {
    if (!images.some((x) => x && x.data === img.data)) images.push(img);
  }
  if (garment && !images.some((x) => x && x.data === garment.data)) {
    if (images.length) images = [images[0], garment];
    else images = [garment];
  }
  images = images.slice(0, 2);
  if (!images.length) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'A selfie/photo is required to generate your look',
      code: 'missing_photo',
      fionaMessage: "Add a photo to Your Canvas first, gorgeous — Fiona needs a face to dress."
    }));
  }

  const look = body.look || {};
  const hairStyleId = body.hairStyleId || body.hairstyleId || (look && look.hairStyleId) || 'keep-mine';
  let prompt = buildLookImagePrompt(look, body.occasion, body.vibe, hairStyleId);
  prompt += '\nOUTPUT MUST BE FULLY CLOTHED — tasteful, non-sexual fashion photo. No lingerie in the result.';
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (!hasOpenAI && !hasGemini) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Look photo generation is not configured',
      code: 'missing_image_api_key',
      hint: 'Add OPENAI_API_KEY (preferred) or GEMINI_API_KEY in Vercel, then redeploy.',
      fionaMessage: "Fiona's Vision isn't plugged in yet — add an image key in Vercel and she'll dress you in a blink."
    }));
  }

  try {
    let result = null;
    let lastErr = null;
    const preferGemini = String(process.env.VISION_PREFER_GEMINI || '').toLowerCase() === '1'
      || String(process.env.VISION_PREFER_GEMINI || '').toLowerCase() === 'true';
    const tryOpenAI = async (imgs, p) => { try { return await generateLookWithOpenAI(imgs, p); } catch (e) { lastErr = e; return null; } };
    const tryGemini = async (imgs, p) => { try { return await generateLookWithGemini(imgs, p); } catch (e) { lastErr = e; return null; } };
    if (preferGemini && hasGemini) result = await tryGemini(images, prompt);
    if (!result && hasOpenAI) result = await tryOpenAI(images, prompt);
    // Safety recovery: identity-only + softer prompt.
    if (!result && hasOpenAI && images.length > 1) {
      const safePrompt = ('TASTEFUL FASHION EDIT ONLY. Fully clothed output. Keep her exact face, body, and hair length.\n\n' + prompt)
        .replace(/\b(underwear|bra|lingerie|bralette|panties)\b/gi, 'current outfit');
      result = await tryOpenAI([images[0]], safePrompt);
    }
    if (!result && hasGemini) result = await tryGemini([images[0]], prompt);
    if (!result) {
      const detailMsg = String((lastErr && lastErr.message) || '');
      const safetyHint = /safety|moderation|rejected|not allowed|sensitive|policy/i.test(detailMsg + JSON.stringify((lastErr && lastErr.detail) || {}));
      res.statusCode = (lastErr && lastErr.status) || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Could not generate look photo',
        code: safetyHint ? 'safety_rejected' : 'vision_failed',
        detail: (lastErr && (lastErr.detail || lastErr.message)) || 'empty image response',
        fionaMessage: safetyHint
          ? "Fiona's image studio got shy about that photo — tap Generate again, or try a fully clothed photo. Your Style picks are still solid."
          : (detailMsg
            ? `Fiona couldn't finish the Vision look (${detailMsg}). Tap Generate My Look once more.`
            : "That look got stuck in the dressing room, darling. Tap Generate My Look again.")
      }));
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      provider: result.provider,
      hairStyleId: resolveHairStyleOption(look, hairStyleId).id,
      wardrobeOptionId: body.wardrobeOptionId || look.selectedWardrobeId || look.wardrobeOptionId || null,
      beautyOptionId: body.beautyOptionId || look.selectedBeautyId || look.beautyOptionId || null,
      image: {
        mimeType: result.mimeType,
        dataUrl: `data:${result.mimeType};base64,${result.base64}`
      }
    }));
  } catch (err) {
    console.error('[fiona/glamour/style] look photo failure', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Look photo generation failed',
      detail: err && err.message ? err.message : String(err),
      fionaMessage: "Fiona hit a tiny wardrobe snag. Tap Generate My Look again."
    }));
  }
}

function buildUserContent(body) {
  const mode = body.mode === 'palette' ? 'palette' : 'wardrobe';
  const images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
  const content = [];
  const infer = body.inferFromPhotos === true || images.length > 0;
  const autoSilhouette = !body.silhouette || /^auto/i.test(String(body.silhouette));
  const autoHarmony = !body.harmony || /^auto/i.test(String(body.harmony));
  const autoUndertone = !body.undertone || /^auto/i.test(String(body.undertone));
  const localWeekday = resolveLocalWeekday(body);

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
- PHOTO ROLES: Images may include an IDENTITY person/selfie/full-body shot AND closet/wardrobe inventory shots. Dress the WOMAN in the identity photo. Closet shelves/hangers/piles are wardrobe inventory ONLY — never treat a closet-only image as her body or face.
- Image role hints (when provided on payloads): ${images.map((img, i) => `#${i + 1}=${img.role || 'reference'}`).join(', ') || 'none'} — prefer role=identity for figure/face; use role=closet only for owned pieces.
- Study face, neck, and visible skin for undertone + overall skin-tone harmony (from the identity/person photo).
- Study proportions, shoulder-to-hip balance, height cues, and how clothes hang for body silhouette/figure.
- Choose detectedSilhouette from ONLY: "Hourglass / Defined", "Petite", "Curvy / Soft Silhouette", "Tall / Long Lines", "Athletic / Straight".
- Choose detectedHarmony from ONLY: "Warm & Golden", "Cool & Rosy", "Deep & Rich", "Olive / Neutral".
- Choose detectedUndertone from ONLY: "Cool", "Warm", "Neutral", "Deep Olive".
- If manual filters are NOT "Auto from photos", treat them as soft overrides; if they ARE auto (or blank), trust the photos.
- If she is in swimwear/bikini/beachwear in the identity photo, note that energy and do NOT prescribe matronly formal black midi + cardigan armor unless occasion truly demands it.
- Write a short detectionNotes sentence explaining what you saw (kind, factual, never shaming).`
    : `No photos attached — use the provided silhouette/harmony/undertone filters (if Auto, pick sensible defaults).`;

  if (mode === 'palette') {
    content.push({
      type: 'text',
      text: `Create a customized hair & makeup palette for this woman.

Filters:
- Today's weekday (her local calendar): ${localWeekday}
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
If quote/note mentions a weekday, it MUST say ${localWeekday} (today) — never invent a different day.

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
      text: `Create Glamour Suite CHOICES for THIS user: TWO distinct Wardrobe options AND TWO distinct Hair & Makeup options. She will pick one of each; Vision combines her picks.

Filters:
- Today's weekday (her local calendar): ${localWeekday}
- Occasion: ${body.occasion || 'Desk to Dinner'}
- USER TYPED QUESTION / VIBE (ANSWER THIS DIRECTLY): ${body.userQuestion || body.vibe || '(none — still give clear A/B choices)'}
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

If morning energy is provided, weight ease vs polish on BOTH wardrobe options — but ALWAYS stay flattering (fumes = easy elevated that still cinches/defines; conquer = sharp figure-flattering, not boxy armor; move = polished athleisure with shape).
If photos are present, ground both wardrobe options in her actual figure, coloring, and uploaded clothing. If she uploaded clothing-choice photos (shirts/dresses/outfits) OR closet inventory, Option A and B MUST each recommend exact owned pieces (or a clear pairing from them) — describe faithfully; NEVER redesign the garment and NEVER invent a dress when she asked about shirts/leggings. Identity selfie = who you dress; closet/garment shots = exact clothes only.
If she typed colors she owns (e.g. black/cream/navy/brown/maroon leggings) + asked which shirt, answer with two concrete shirt+legging pairings using those colors — not cocktail dresses.
If she asks how an uploaded look looks: be honest and kind — what works, what to tweak, one better alternate. Never insult.
If the identity photo shows swimwear/bikini/beachwear, celebrate that body: prescribe flattering, occasion-aware, hot-on-her options that match vibe/occasion — NOT a default matronly black midi wrap + cardigan/shawl, and NOT boardroom blazer armor unless occasion is explicitly corporate/black-tie.
Hair & Makeup options are STYLING + effortless makeup only — NEVER haircuts. Keep her real hair (no extensions, no cutting, no growing).
SHORT HAIR LOCK: If her photo shows short / chin-length / bob / pixie hair, Beauty Option A and B MUST BOTH be hair DOWN:
- hairStyleId "hair-down-soft" AND "hair-down-sleek" (different makeup stories). Do NOT use hair-up-playful or hair-up-sleek — short hair cannot honestly wear a big updo.
Only when she clearly has medium/long hair may you offer one UP + one DOWN.
Also set different EFFORTLESS makeup on each (titles like "Effortless Fresh Glow", "Effortless Soft Berry") with distinct lip/cheek stories — wearable, natural, not heavy glam unless the event truly needs it.
Allowed hairStyleId values: "keep-mine" | "hair-up-playful" | "hair-up-sleek" | "hair-down-soft" | "hair-down-sleek" (legacy soft-waves/sleek-side-part remapped server-side).
If no photos, still invent fresh options from the filters — do not reuse a canned plum-cami-blazer or navy-wrap-plus-charcoal-blazer default.
If she feels frumpy or needs "what to wear" help, lead with empathy + a specific compliment that celebrates her body, then glamorous confidence-lifting options — never a cover-up.
Include field "compliment" with one sincere compliment grounded in her photo or vibe — warm, specific, body-positive (curves as assets). Mention short/bob hair honestly when relevant ("that sharp bob…").
If quote/note/desc mentions a weekday, it MUST say ${localWeekday} (today) — never invent a different day.

Style BOTH wardrobe options for the DETECTED silhouette and DETECTED harmony when photos exist.
SILHOUETTE FIT GUIDE:
- Curvy / Soft Silhouette: celebrate curves — wrap that cinches, soft V/wrap neckline, A-line skim, intentional waist, vertical lines. Ban tents, heavy blazer armor, matronly dark columns.
- Hourglass / Defined: keep waist the star — tuck, soft belt, or wrap; structure at shoulder without boxing her in.
- Petite: raise visual waist, crop cleanly, scale pieces so she looks elongated — still polished, not childish.
- Tall / Long Lines: unbroken verticals, high-rise, length that flatters — intentional midi only when occasion warrants; for casual / selfie / swimwear energy prefer hot-on-her proportions (not matronly column dresses).
- Athletic / Straight: add soft shape with wrap, peplum, or nipped layer — feminine without bulk.
Match formality to occasion/vibe. Casual / selfie / swimwear / everyday ≠ boardroom blazer stack or funeral-formal black midi + cardigan. Elevated event (wedding/banquet/gala) → one polished dress or clean tailored set — never lounge layers + scarf at a formal venue.
facePalette.lip MUST be a wearable lipstick (rose/berry/mauve/nude/coral/plum/red) — NEVER green, sage, or olive lipstick. Clothing palette may include olive/sage for garments only.

Wardrobe Option A and Option B must be CLEARLY different (e.g. dress vs separates, or different color stories / necklines) while both flattering. Beauty Option A and Option B must be CLEARLY different (different hair finish + lip/cheek story).
pieces arrays: 1–2 clothing items (+ optional shoes). NO scarves/shawls. At most one outer layer total.

Return JSON only:
{
  "detectedSilhouette": "Hourglass / Defined|Petite|Curvy / Soft Silhouette|Tall / Long Lines|Athletic / Straight",
  "detectedHarmony": "Warm & Golden|Cool & Rosy|Deep & Rich|Olive / Neutral",
  "detectedUndertone": "Cool|Warm|Neutral|Deep Olive",
  "detectionNotes": "one kind sentence about figure + skin tone observed",
  "compliment": "One specific compliment about her",
  "quote": "One Fiona-voice line",
  "wardrobeOptions": [
    {
      "id": "A",
      "title": "Wardrobe option A title (unique)",
      "desc": "2-4 sentences focused on the OUTFIT (not hair/makeup), tailored to detected figure/skin tone and photo — clean hero look, no scarf piles",
      "neckline": "short neckline note",
      "pieces": [
        { "name": "Hero piece (e.g. wrap dress)", "fabric": "Fabric — texture note", "cue": "One-line styling cue", "hex": "#HEX", "colorLabel": "Color name" },
        { "name": "Optional second piece or shoes", "fabric": "...", "cue": "...", "hex": "#HEX", "colorLabel": "..." }
      ],
      "palette": [
        { "hex": "#HEX", "label": "Name" },
        { "hex": "#HEX", "label": "Name" },
        { "hex": "#HEX", "label": "Name" },
        { "hex": "#HEX", "label": "Name" }
      ]
    },
    {
      "id": "B",
      "title": "Wardrobe option B title (clearly different from A)",
      "desc": "2-4 sentences focused on the OUTFIT — clean hero look, no scarf piles",
      "neckline": "short neckline note",
      "pieces": [
        { "name": "Hero piece", "fabric": "Fabric — texture note", "cue": "One-line styling cue", "hex": "#HEX", "colorLabel": "Color name" },
        { "name": "Optional second piece or shoes", "fabric": "...", "cue": "...", "hex": "#HEX", "colorLabel": "..." }
      ],
      "palette": [
        { "hex": "#HEX", "label": "Name" },
        { "hex": "#HEX", "label": "Name" },
        { "hex": "#HEX", "label": "Name" },
        { "hex": "#HEX", "label": "Name" }
      ]
    }
  ],
  "beautyOptions": [
    {
      "id": "A",
      "title": "Hair & makeup option A title",
      "summary": "1-2 sentences on this beauty look",
      "hairMove": {
        "title": "Hair styling title (same cut/length as photo — texture/part/finish only)",
        "body": "Styling advice for her actual haircut length in the photo — polish her existing cut; never recommend a new haircut, bob, or different length",
        "cues": ["Volume: ...", "Part: ...", "Texture: ..."]
      },
      "hairStyleId": "keep-mine|hair-up-playful|hair-up-sleek|hair-down-soft|hair-down-sleek",
      "facePalette": {
        "lip": ["#HEX", "Name"],
        "cheek": ["#HEX", "Name"],
        "note": "Undertone-matching beauty note"
      }
    },
    {
      "id": "B",
      "title": "Hair & makeup option B title (clearly different from A)",
      "summary": "1-2 sentences on this beauty look",
      "hairMove": {
        "title": "Hair styling title",
        "body": "If A was hair up, this is hair down (or vice versa) — effortless makeup variant, no haircut",
        "cues": ["Volume: ...", "Part: ...", "Texture: ..."]
      },
      "hairStyleId": "keep-mine|hair-up-playful|hair-up-sleek|hair-down-soft|hair-down-sleek",
      "facePalette": {
        "lip": ["#HEX", "Name"],
        "cheek": ["#HEX", "Name"],
        "note": "Undertone-matching beauty note"
      }
    }
  ]
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
  if (start === -1) throw new Error('No JSON object in model response');
  const slice = candidate.slice(start);
  try {
    const end = slice.lastIndexOf('}');
    if (end === -1) throw new Error('No closing brace');
    return JSON.parse(slice.slice(0, end + 1));
  } catch (firstErr) {
    // Truncated dual-option payloads (hit max_tokens) — try to close open braces/brackets.
    let repaired = slice.replace(/,\s*$/, '');
    const opens = (repaired.match(/\{/g) || []).length;
    const closes = (repaired.match(/\}/g) || []).length;
    const openArr = (repaired.match(/\[/g) || []).length;
    const closeArr = (repaired.match(/\]/g) || []).length;
    // Trim a trailing incomplete key/value fragment after the last complete comma or brace.
    repaired = repaired.replace(/,\s*"[^"]*":\s*("[^"]*)?$/g, '');
    repaired = repaired.replace(/,\s*\{[^}]*$/g, '');
    repaired = repaired.replace(/,\s*"[^"]*$/g, '');
    repaired = repaired.replace(/,\s*$/, '');
    let arrFix = Math.max(0, openArr - closeArr);
    let objFix = Math.max(0, opens - closes);
    while (arrFix--) repaired += ']';
    while (objFix--) repaired += '}';
    try {
      return JSON.parse(repaired);
    } catch (_) {
      throw firstErr;
    }
  }
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

function sanitizeFacePaletteObj(facePalette, lipFallback, weekday) {
  if (!facePalette || typeof facePalette !== 'object') {
    return {
      lip: lipFallback,
      cheek: ['#E07A5F', 'Rose Radiance'],
      note: 'Wearable everyday color near the face.'
    };
  }
  const next = { ...facePalette };
  if (Array.isArray(next.lip) && !isWearableLipColor(next.lip[0], next.lip[1])) {
    next.lip = lipFallback;
    next.note = ((next.note || '') + ' Wearable lip only — never fashion greens.').trim();
  }
  if (typeof next.note === 'string') next.note = alignTextToWeekday(next.note, weekday);
  return next;
}

function sanitizeHairMoveObj(hairMove, weekday) {
  if (!hairMove || typeof hairMove !== 'object') {
    return {
      title: 'Soft polish on your cut',
      body: 'Keep your real length and add soft shine — face-framing polish only.',
      cues: ['Volume: soft crown', 'Part: natural', 'Texture: flexible hold']
    };
  }
  const next = { ...hairMove };
  if (typeof next.body === 'string') next.body = alignTextToWeekday(next.body, weekday);
  if (typeof next.title === 'string') next.title = alignTextToWeekday(next.title, weekday);
  if (!Array.isArray(next.cues)) next.cues = ['Volume: soft crown', 'Part: natural', 'Texture: flexible hold'];
  return next;
}

function normalizeOptionId(raw, fallback) {
  const s = String(raw || '').trim().toUpperCase();
  if (s === 'A' || s === 'OPTION A' || s === '1') return 'A';
  if (s === 'B' || s === 'OPTION B' || s === '2') return 'B';
  return fallback;
}

/** Drop scarves / stacked outer layers so Style never ships silly piled looks to Vision. */
function pieceTextForSanitize(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return [p.name, p.fabric, p.cue, p.colorLabel].filter(Boolean).join(' ');
}

function sanitizeOutfitPieces(pieces) {
  if (!Array.isArray(pieces)) return [];
  const SILLY_ACCESSORY = /\b(scarf|shawls?|stoles?|pashmina|muffler|neck\s*wrap|infinity\s*scarf|fringed?\s*scarf)\b/i;
  const OUTER_LAYER = /\b(cardigan|blazer|coat|jacket|kimono|shrug|overshirt|open\s*(shirt|layer)|button[- ]?down|plaid\s*shirt)\b/i;
  const SHOE = /\b(shoe|heel|sneaker|boot|sandal|flat|loafer|mule|pump)\b/i;
  const NON_CLOTHING = /\b(lipstick|lip\b|blush|makeup|earring|necklace|bracelet|jewelry|handbag|clutch|purse|bag)\b/i;
  const DRESS = /\b(dress|gown|jumpsuit|romper|slip)\b/i;
  const CORE = /\b(dress|gown|jumpsuit|romper|slip|top|pant|trouser|skirt|blouse|tee|tank|cami|jean|denim|short)\b/i;

  const cores = [];
  const outers = [];
  const shoes = [];
  for (const p of pieces) {
    const text = pieceTextForSanitize(p);
    if (!String(text).trim()) continue;
    if (SILLY_ACCESSORY.test(text)) continue;
    if (SHOE.test(text)) {
      shoes.push(p);
      continue;
    }
    if (OUTER_LAYER.test(text)) {
      outers.push(p);
      continue;
    }
    if (NON_CLOTHING.test(text) && !CORE.test(text)) continue;
    cores.push(p);
  }

  const dresses = cores.filter((p) => DRESS.test(pieceTextForSanitize(p)));
  if (dresses.length) {
    return [dresses[0], ...shoes.slice(0, 1)];
  }
  // Prefer a clean top+bottom. Only add one outer if we lack a second core piece.
  const chosen = cores.slice(0, 2);
  if (chosen.length < 2 && outers.length) chosen.push(outers[0]);
  return [...chosen, ...shoes.slice(0, 1)].slice(0, 3);
}

function flattenSelectedGlamourLook(data, wardrobeOpt, beautyOpt) {
  if (!data || typeof data !== 'object') return data;
  const w = wardrobeOpt || {};
  const b = beautyOpt || {};
  data.title = w.title || data.title || 'Curated look';
  data.desc = w.desc || data.desc || '';
  data.neckline = w.neckline || data.neckline || '';
  data.pieces = sanitizeOutfitPieces(Array.isArray(w.pieces) ? w.pieces : data.pieces);
  data.palette = Array.isArray(w.palette) ? w.palette : data.palette;
  data.hairMove = b.hairMove || data.hairMove;
  data.facePalette = b.facePalette || data.facePalette;
  data.suggestedHairStyleId = b.hairStyleId || data.suggestedHairStyleId || 'keep-mine';
  data.selectedWardrobeId = w.id || 'A';
  data.selectedBeautyId = b.id || 'A';
  data.beautyTitle = b.title || '';
  data.beautySummary = b.summary || '';
  return data;
}

function synthesizeWardrobeB(optA) {
  const a = optA || {};
  const baseTitle = String(a.title || 'Look').replace(/\s*[—-]\s*Soft Alternate\s*$/i, '').trim() || 'Look';
  return {
    id: 'B',
    title: `${baseTitle} — Soft Alternate`,
    desc: (a.desc || 'A flattering alternate wardrobe direction.')
      + ' Alternate styling: swap the hero layer for a softer open finish and keep the waist intentional — still celebrate her curves, never tent.',
    neckline: a.neckline || 'soft V / wrap',
    pieces: Array.isArray(a.pieces) ? a.pieces.map((p) => (p && typeof p === 'object' ? { ...p } : p)) : [],
    palette: Array.isArray(a.palette) ? a.palette.map((p) => (p && typeof p === 'object' ? { ...p } : p)) : []
  };
}

function synthesizeBeautyPair(data, lipFallback, weekday, allowedHair) {
  const faceA = sanitizeFacePaletteObj(data && data.facePalette, lipFallback, weekday);
  const softId = allowedHair.has('hair-down-soft') ? 'hair-down-soft' : 'keep-mine';
  const sleekId = allowedHair.has('hair-down-sleek') ? 'hair-down-sleek' : softId;
  return [
    {
      id: 'A',
      title: 'Effortless Fresh Glow — Soft & Down',
      summary: 'Hair stays down at her exact length with effortless fresh makeup — soft skin, rosy cheek, wearable nude-pink lip. No fake updo.',
      hairMove: {
        title: 'Leave it down · soft',
        body: 'Soft piecey movement on her real length only — never grow hair for a bun.',
        cues: ['Style: hair down', 'Mood: fresh', 'Length: unchanged']
      },
      facePalette: faceA,
      hairStyleId: softId
    },
    {
      id: 'B',
      title: 'Effortless Soft Berry — Sleek & Down',
      summary: 'Leave it down sleek with a second effortless makeup story — soft berry lip, healthy flush.',
      hairMove: {
        title: 'Leave it down · sleek',
        body: 'Hair stays down with a sleek deep side part — clearly different from soft, never an updo.',
        cues: ['Style: hair down', 'Finish: sleek', 'Length: unchanged']
      },
      facePalette: {
        lip: lipFallback,
        cheek: (faceA && faceA.cheek) || ['#E07A5F', 'Rose Radiance'],
        note: 'Effortless soft berry — still rose/berry/nude family.'
      },
      hairStyleId: sleekId
    }
  ];
}

function ensureDualGlamourOptions(data, lipFallback, weekday) {
  if (!data || typeof data !== 'object') return data;
  const allowedHair = new Set(FIONA_HAIRSTYLE_OPTIONS.map((o) => o.id));

  let wardrobeOptions = Array.isArray(data.wardrobeOptions) ? data.wardrobeOptions.filter(Boolean) : [];
  let beautyOptions = Array.isArray(data.beautyOptions) ? data.beautyOptions.filter(Boolean) : [];

  // Legacy single-look OR truncated dual (only one wardrobe) → always end with A + B.
  if (wardrobeOptions.length === 0 && data.title && Array.isArray(data.pieces)) {
    wardrobeOptions = [{
      id: 'A',
      title: data.title,
      desc: data.desc || '',
      neckline: data.neckline || '',
      pieces: data.pieces,
      palette: Array.isArray(data.palette) ? data.palette : []
    }];
  }
  if (wardrobeOptions.length === 1) {
    wardrobeOptions = [wardrobeOptions[0], synthesizeWardrobeB(wardrobeOptions[0])];
  }
  if (wardrobeOptions.length === 0) {
    // Last-resort placeholders so the first Style click never returns zero wardrobe picks.
    wardrobeOptions = [
      {
        id: 'A',
        title: data.title || 'Cinched Confidence Wrap',
        desc: data.desc || 'A waist-defining wrap and clean vertical line — flattering, never tented.',
        neckline: data.neckline || 'soft V / wrap',
        pieces: Array.isArray(data.pieces) ? data.pieces : [],
        palette: Array.isArray(data.palette) ? data.palette : []
      },
      {
        id: 'B',
        title: 'Soft Alternate Separates',
        desc: 'Second wardrobe direction with an intentional waist and softer open layer — still celebrate her shape.',
        neckline: 'soft scoop',
        pieces: Array.isArray(data.pieces) ? data.pieces : [],
        palette: Array.isArray(data.palette) ? data.palette : []
      }
    ];
  }

  if (beautyOptions.length === 0) {
    beautyOptions = synthesizeBeautyPair(data, lipFallback, weekday, allowedHair);
  } else if (beautyOptions.length === 1) {
    const pair = synthesizeBeautyPair({
      ...data,
      hairMove: beautyOptions[0].hairMove || data.hairMove,
      facePalette: beautyOptions[0].facePalette || data.facePalette,
      suggestedHairStyleId: beautyOptions[0].hairStyleId || data.suggestedHairStyleId
    }, lipFallback, weekday, allowedHair);
    beautyOptions = [beautyOptions[0], pair[1]];
  }

  // Ensure exactly two labeled options.
  wardrobeOptions = wardrobeOptions.slice(0, 2).map((opt, i) => {
    const id = i === 0 ? 'A' : 'B';
    const next = { ...(opt || {}), id };
    for (const key of ['title', 'desc', 'neckline']) {
      if (typeof next[key] === 'string') next[key] = alignTextToWeekday(next[key], weekday);
    }
    if (!Array.isArray(next.pieces)) next.pieces = data.pieces || [];
    next.pieces = sanitizeOutfitPieces(next.pieces);
    if (!Array.isArray(next.palette)) next.palette = data.palette || [];
    if (!next.title) next.title = id === 'A' ? 'Wardrobe Option A' : 'Wardrobe Option B';
    // Strip scarf/pile language from copy so Vision is not steered into silly stacks.
    if (typeof next.desc === 'string') {
      next.desc = next.desc
        .replace(/\b(silk\s+)?scar(?:f|ves)\b/gi, '')
        .replace(/\bshawls?\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    return next;
  });

  const hairCat = (id) => {
    const o = FIONA_HAIRSTYLE_OPTIONS.find((x) => x.id === id);
    if (o && o.category) return o.category;
    if (String(id).startsWith('hair-up')) return 'up';
    if (String(id).startsWith('hair-down')) return 'down';
    return 'other';
  };
  beautyOptions = beautyOptions.slice(0, 2).map((opt, i) => {
    const id = i === 0 ? 'A' : 'B';
    const next = { ...(opt || {}), id };
    if (typeof next.title === 'string') next.title = alignTextToWeekday(next.title, weekday);
    if (typeof next.summary === 'string') next.summary = alignTextToWeekday(next.summary, weekday);
    next.hairMove = sanitizeHairMoveObj(next.hairMove, weekday);
    next.facePalette = sanitizeFacePaletteObj(next.facePalette, lipFallback, weekday);
    let hairId = normalizeHairStyleId(next.hairStyleId || next.suggestedHairStyleId || '');
    if (!allowedHair.has(hairId) || hairId === 'keep-mine') {
      hairId = i === 0 ? 'hair-down-soft' : 'hair-down-sleek';
    }
    next.hairStyleId = hairId;
    if (!next.title) {
      next.title = i === 0
        ? 'Hair Up · Cute Playful + Effortless Glow'
        : 'Hair Down · Soft + Effortless Soft Berry';
    }
    delete next.suggestedHairStyleId;
    return next;
  });
  // Prefer honest short-hair styling: if notes say bob/short, force two DOWN finishes.
  const shortHairBlob = [
    data.compliment,
    data.detectionNotes,
    data.quote,
    data.detectedSilhouette
  ].filter(Boolean).join(' ');
  const shortHair = /\b(short\s*hair|chin[- ]?length|pixie|bob\b|cropped)\b/i.test(shortHairBlob);
  if (shortHair && beautyOptions.length === 2) {
    beautyOptions[0].hairStyleId = 'hair-down-soft';
    beautyOptions[1].hairStyleId = 'hair-down-sleek';
    if (!/down/i.test(beautyOptions[0].title || '')) {
      beautyOptions[0].title = 'Effortless Fresh Glow — Soft & Down';
    }
    if (!/down|sleek/i.test(beautyOptions[1].title || '')) {
      beautyOptions[1].title = 'Effortless Soft Berry — Sleek & Down';
    }
  } else if (beautyOptions.length === 2) {
    // Longer hair: keep a real UP vs DOWN choice when possible.
    const c0 = hairCat(beautyOptions[0].hairStyleId);
    const c1 = hairCat(beautyOptions[1].hairStyleId);
    if (c0 === c1 || c0 === 'other' || c1 === 'other') {
      if (c0 === 'up') {
        beautyOptions[1].hairStyleId = 'hair-down-soft';
        if (!/down/i.test(beautyOptions[1].title || '')) {
          beautyOptions[1].title = 'Hair Down · Soft + Effortless Soft Berry';
        }
      } else if (c0 === 'down' && c1 === 'down') {
        // Two downs is OK (soft vs sleek) — ensure they differ.
        beautyOptions[0].hairStyleId = 'hair-down-soft';
        beautyOptions[1].hairStyleId = 'hair-down-sleek';
      } else {
        beautyOptions[0].hairStyleId = 'hair-down-soft';
        beautyOptions[1].hairStyleId = 'hair-down-sleek';
      }
    }
  }

  data.wardrobeOptions = wardrobeOptions;
  data.beautyOptions = beautyOptions;

  // Flatten Option A onto legacy fields for any older clients / Vision payload builders.
  flattenSelectedGlamourLook(data, wardrobeOptions[0], beautyOptions[0]);
  return data;
}

function sanitizeBeautyData(data, body) {
  if (!data || typeof data !== 'object') return data;
  const harmony = body && body.harmony ? String(body.harmony) : '';
  const weekday = resolveLocalWeekday(body);
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

  // Fiona sometimes invents a random weekday in quips — force today's local day.
  for (const key of ['quote', 'note', 'desc', 'detectionNotes', 'neckline', 'compliment']) {
    if (typeof data[key] === 'string') data[key] = alignTextToWeekday(data[key], weekday);
  }
  if (data.facePalette && typeof data.facePalette === 'object') {
    if (typeof data.facePalette.note === 'string') {
      data.facePalette.note = alignTextToWeekday(data.facePalette.note, weekday);
    }
  }
  if (data.hairMove && typeof data.hairMove === 'object' && typeof data.hairMove.body === 'string') {
    data.hairMove.body = alignTextToWeekday(data.hairMove.body, weekday);
  }
  const allowedHair = new Set(FIONA_HAIRSTYLE_OPTIONS.map((o) => o.id));
  const suggested = String(data.suggestedHairStyleId || '').trim().toLowerCase();
  data.suggestedHairStyleId = allowedHair.has(suggested) ? suggested : 'keep-mine';

  if (body && body.mode !== 'palette') {
    ensureDualGlamourOptions(data, lipFallback, weekday);
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
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      weeklyPriceId: resolvePriceId(
        ['STRIPE_WEEKLY_PRICE_ID', 'NEXT_PUBLIC_STRIPE_WEEKLY_PRICE_ID', 'STRIPE_MONTHLY_PRICE_ID', 'NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID'],
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

  // Journal reflection path
  if (body && (body.journalEntry || body.mode === 'reflect')) {
    return handleJournalReflect(req, res, body);
  }

  // Honest "How does this look?" fit-check
  if (body && (body.mode === 'fitcheck' || body.fitCheck === true || body.howDoesThisLook === true)) {
    return handleFitCheck(req, res, body);
  }

  // AI look photo of the user in the recommended glam
  if (body && (body.mode === 'look' || body.generateLook === true)) {
    return handleLookPhoto(req, res, body);
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
          max_tokens: 2800,
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

    if (payload.stop_reason === 'max_tokens') {
      console.warn('[fiona/glamour/style] Anthropic hit max_tokens — dual options may be truncated; sanitizer will pad to 2+2');
    }

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
