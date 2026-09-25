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
- Every recommendation MUST be distinct and customized to THIS user's uploaded photo(s) and selected filters (occasion, vibe, silhouette, color harmony / undertone, and morning energy when provided).
- Always include at least one sincere, specific compliment about her presence, coloring, figure, energy, or taste — grounded in the photo or what she wrote (never generic "you're beautiful"). Compliments celebrate her body and presence; never euphemize or apologize for curves.
- When morning energy is logged, let it drive BOTH wardrobe options: fumes → easy elevated polish she can throw on fast (wrap that cinches, soft V, flats OK) — still flattering, never frumpy; conquer → sharp figure-flattering tailoring and bold statements (not boxy corporate armor); on the move → polished athleisure and movement-friendly layers that still show shape.
- If she says she feels frumpy / stuck / "nothing to wear," start with empathy + a compliment, then prescribe confidence-lifting wardrobe + beauty options she can actually put on today — glamorous and hot-on-her, not a cover-up.
- NEVER return a generic default like "Tailored wide-leg trousers in rich plum with a tucked silk cami" unless that literally matches what you see and the filters demand it.
- Reference visible garments, colors, body proportions, lighting, or accessories from the photo when images are provided. When closet or wardrobe photos are mixed in with a selfie, prefer pieces she already owns and restyle them flatteringly. The IDENTITY photo is always the person/selfie/full-body shot — never treat a closet shelf, hanger rack, or clothing pile as the woman to dress.
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

/** User-selected Vision hairstyles — polish within her real length/color; never invent a new woman. */
const FIONA_HAIRSTYLE_OPTIONS = [
  {
    id: 'keep-mine',
    label: 'Keep mine',
    short: 'Exact hair from your photo',
    vision: null
  },
  {
    id: 'soft-waves',
    label: 'Soft waves',
    short: 'Gentle wave, same length',
    vision: 'Restyle her EXISTING hair into soft, face-framing waves with natural movement — same color, density, hairline, and approximate length as the reference. Ends stay at her real length (chin/ear/as photographed).'
  },
  {
    id: 'sleek-side-part',
    label: 'Sleek side part',
    short: 'Polished deep side part',
    vision: 'Restyle her EXISTING hair with a polished deep side part and smooth, controlled finish — same color, density, hairline, and approximate length. Soft shine, not stiff; no added length.'
  },
  {
    id: 'polished-bob',
    label: 'Polished bob',
    short: 'Smooth chin-length bob',
    vision: 'Restyle her EXISTING cut into a polished chin-length bob with clean ends and soft face framing — keep her real color, density, and hairline. If her hair is already a bob/chin-length, refine it; never grow past chin length.'
  },
  {
    id: 'subtle-volume',
    label: 'Subtle volume',
    short: 'Lifted crown, soft body',
    vision: 'Keep her exact cut silhouette and length, but add subtle lifted crown volume and soft body through the mid-lengths — same color, density, and hairline. Polish only; no extensions or length change.'
  },
  {
    id: 'tousled-texture',
    label: 'Tousled texture',
    short: 'Lived-in piecey finish',
    vision: 'Restyle her EXISTING hair with soft tousled, piecey texture and a lived-in finish — same color, density, hairline, and approximate length. Flattering and intentional, still clearly HER cut family.'
  }
];

function resolveHairStyleOption(look, hairStyleId) {
  const raw = String(
    hairStyleId
      || (look && (look.hairStyleId || look.hairstyleId || look.selectedHairStyleId))
      || 'keep-mine'
  ).trim().toLowerCase();
  return FIONA_HAIRSTYLE_OPTIONS.find((o) => o.id === raw) || FIONA_HAIRSTYLE_OPTIONS[0];
}

function hairDirectionForVision(look, hairStyleId) {
  // Intentional user pick is allowed; free-form hairMove text is still risky (long hair / buns).
  const option = resolveHairStyleOption(look, hairStyleId);
  const lengthGuard = [
    'HAIR IDENTITY GUARD: Keep her real hair COLOR, density, hairline, and approximate length from the reference selfie.',
    'If her hair is short, textured, cropped, ear-length, or chin-length, it MUST stay in that length family. Never grow hair longer.',
    'Do NOT invent a bun, updo, ponytail, chignon, top knot, long hair, extensions, weave, or mid-length past her real length.'
  ].join(' ');

  if (!option.vision || option.id === 'keep-mine') {
    return [
      'HAIR LOCK: Keep her exact hair from the reference selfie — same length, cut, color, texture, density, and hairline.',
      lengthGuard,
      'Optional: light product polish of her EXISTING cut only (shine / soft tame) — do not invent a new silhouette.'
    ].join(' ');
  }

  return [
    lengthGuard,
    `INTENTIONAL HAIRSTYLE (user selected "${option.label}"): ${option.vision}`,
    'Ignore conflicting hairMove / outfit-desc hair notes that would change length drastically or create an updo.',
    'She must still look like herself — face locked; only styling direction above within her real cut family.'
  ].join(' ');
}

function buildLookImagePrompt(look, occasion, vibe, hairStyleId) {
  const pieces = Array.isArray(look && look.pieces)
    ? look.pieces.map((p) => `${p.name} (${p.fabric || ''} ${p.colorLabel || p.hex || ''})`.trim()).join('; ')
    : '';
  const face = look && look.facePalette
    ? `Lips ${((look.facePalette.lip || [])[1]) || ''}, cheeks ${((look.facePalette.cheek || [])[1]) || ''}. ${look.facePalette.note || ''}`
    : '';
  const hairOption = resolveHairStyleOption(look, hairStyleId);
  const allowHairRestyle = Boolean(hairOption.vision && hairOption.id !== 'keep-mine');
  const changeLine = allowHairRestyle
    ? `CHANGE ALLOWED: clothing/outfit, light makeup (lipstick and blush), and the intentional "${hairOption.label}" hairstyle within her real length/color. Keep pose geometry, face, and body type intact.`
    : 'CHANGE ONLY: clothing/outfit and light makeup (lipstick and blush). Keep pose geometry, exact hair, and her identity intact.';
  return [
    'Edit the attached reference selfie of this exact woman. Virtual try-on only — same person, not a new model.',
    'IDENTITY LOCK — do not change: her exact face, facial geometry, eyes, nose, mouth, expression, skin tone, age, ethnicity, or likeness.',
    'BODY LOCK: Preserve her real body type, soft/curvy proportions if present, shoulder-to-hip balance, and figure. Do not slim, idealize, lengthen legs, or cast a fashion-model body.',
    hairDirectionForVision(look, hairStyleId),
    changeLine,
    'FLATTERING FIT: Dress her to look intentional and gorgeous on HER body — define the waist, skim (never tent) bust and hips, celebrate soft curves. Prefer wrap that cinches, soft V / wrap neckline, A-line, vertical lines, right proportions.',
    'Do NOT drown her in an oversized heavy blazer, shapeless dark midi tent, or matronly corporate armor. Outfit should look hot-on-her and polished — never frumpy or covering-up.',
    `Look title: ${(look && look.title) || 'Curated look'}`,
    `Occasion: ${occasion || 'everyday'}`,
    vibe ? `Vibe: ${vibe}` : '',
    look && look.desc ? `Outfit description (ignore any hair-length changes in this text): ${look.desc}` : '',
    pieces ? `Dress her in these pieces (fit flatteringly to HER body — cinch waist, skim curves): ${pieces}` : '',
    face ? `Light makeup only: ${face}` : '',
    'Soft studio or wardrobe background OK. Tasteful, non-sexual, photorealistic. No text overlays, no logos.',
    allowHairRestyle
      ? `FINAL CHECK: face matches the reference, hair stays in her real length/color family with the selected "${hairOption.label}" finish, body type matches the reference, outfit flatters her real figure (waist visible, not tented). If anything conflicts, prefer the reference selfie for face + body — keep the flattering fit and selected hair polish.`
      : 'FINAL CHECK: face matches the reference, hair length/style matches the reference, body type matches the reference, outfit flatters her real figure (waist visible, not tented). If anything conflicts, prefer the reference selfie for identity — keep the flattering fit.'
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
      form.append('image', new Blob([bytes], { type: mediaType }), 'canvas-selfie.jpg');

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
  const fromImages = Array.isArray(body.images)
    ? body.images.filter((img) => img && img.data)
    : [];
  const images = (primary ? [primary, ...fromImages] : fromImages).slice(0, 1);
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
  const prompt = buildLookImagePrompt(look, body.occasion, body.vibe, hairStyleId);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (!hasOpenAI && !hasGemini) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Look photo generation is not configured',
      code: 'missing_image_api_key',
      hint: 'Add OPENAI_API_KEY (preferred) or GEMINI_API_KEY in Vercel, then redeploy.'
    }));
  }

  try {
    let result = null;
    let lastErr = null;
    const preferGemini = String(process.env.VISION_PREFER_GEMINI || '').toLowerCase() === '1'
      || String(process.env.VISION_PREFER_GEMINI || '').toLowerCase() === 'true';
    const tryOpenAI = async () => { try { return await generateLookWithOpenAI(images, prompt); } catch (e) { lastErr = e; return null; } };
    const tryGemini = async () => { try { return await generateLookWithGemini(images, prompt); } catch (e) { lastErr = e; return null; } };
    if (preferGemini && hasGemini) result = await tryGemini();
    if (!result && hasOpenAI) result = await tryOpenAI();
    if (!result && hasGemini) result = await tryGemini();
    if (!result) {
      res.statusCode = (lastErr && lastErr.status) || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Could not generate look photo',
        detail: (lastErr && (lastErr.detail || lastErr.message)) || 'empty image response'
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
      detail: err && err.message ? err.message : String(err)
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
If photos are present, ground both wardrobe options in her actual figure, coloring, and what she is wearing in frame. If multiple photos include closet/wardrobe shots, pull from pieces she owns when possible and restyle them to flatter — but the identity selfie/full-body person photo is who you are dressing (never the closet shelf).
If the identity photo shows swimwear/bikini/beachwear, celebrate that body: prescribe flattering, occasion-aware, hot-on-her options that match vibe/occasion — NOT a default matronly black midi wrap + cardigan/shawl, and NOT boardroom blazer armor unless occasion is explicitly corporate/black-tie.
Hair advice in EVERY beauty option MUST work with her CURRENT hair length and cut visible in the photo. Short or cropped hair stays short — recommend texture, product, part, or soft polish for HER cut. Never invent long hair, extensions, mid-length waves, or length-requiring buns/updos unless she explicitly asked for a hair change.
For each beauty option set hairStyleId to ONE Vision-safe polish id (still her length/color family): "keep-mine" | "soft-waves" | "sleek-side-part" | "polished-bob" | "subtle-volume" | "tousled-texture". The two beauty options MUST use different hairStyleId values when possible (e.g. one keep-mine / soft polish, one more intentional restyle). Prefer flattering alternatives when her current finish looks flat/frumpy.
If no photos, still invent fresh options from the filters — do not reuse a canned plum-cami-blazer or navy-wrap-plus-charcoal-blazer default.
If she feels frumpy or needs "what to wear" help, lead with empathy + a specific compliment that celebrates her body, then glamorous confidence-lifting options — never a cover-up.
Include field "compliment" with one sincere compliment grounded in her photo or vibe — warm, specific, body-positive (curves as assets).
If quote/note/desc mentions a weekday, it MUST say ${localWeekday} (today) — never invent a different day.

Style BOTH wardrobe options for the DETECTED silhouette and DETECTED harmony when photos exist.
SILHOUETTE FIT GUIDE:
- Curvy / Soft Silhouette: celebrate curves — wrap that cinches, soft V/wrap neckline, A-line skim, intentional waist, vertical lines. Ban tents, heavy blazer armor, matronly dark columns.
- Hourglass / Defined: keep waist the star — tuck, soft belt, or wrap; structure at shoulder without boxing her in.
- Petite: raise visual waist, crop cleanly, scale pieces so she looks elongated — still polished, not childish.
- Tall / Long Lines: unbroken verticals, high-rise, length that flatters — intentional midi only when occasion warrants; for casual / selfie / swimwear energy prefer hot-on-her proportions (not matronly column dresses).
- Athletic / Straight: add soft shape with wrap, peplum, or nipped layer — feminine without bulk.
Match formality to occasion/vibe. Casual / selfie / swimwear / everyday ≠ boardroom blazer stack or funeral-formal black midi + cardigan.
facePalette.lip MUST be a wearable lipstick (rose/berry/mauve/nude/coral/plum/red) — NEVER green, sage, or olive lipstick. Clothing palette may include olive/sage for garments only.

Wardrobe Option A and Option B must be CLEARLY different (e.g. dress vs separates, or different color stories / necklines) while both flattering. Beauty Option A and Option B must be CLEARLY different (different hair finish + lip/cheek story).

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
      "desc": "2-4 sentences focused on the OUTFIT (not hair/makeup), tailored to detected figure/skin tone and photo",
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
      ]
    },
    {
      "id": "B",
      "title": "Wardrobe option B title (clearly different from A)",
      "desc": "2-4 sentences focused on the OUTFIT",
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
      ]
    }
  ],
  "beautyOptions": [
    {
      "id": "A",
      "title": "Hair & makeup option A title",
      "summary": "1-2 sentences on this beauty look",
      "hairMove": {
        "title": "Hair move title (compatible with her CURRENT length/cut)",
        "body": "Advice based on her actual hair length in the photo — polish her existing cut; never recommend length she does not have",
        "cues": ["Volume: ...", "Part: ...", "Texture: ..."]
      },
      "hairStyleId": "keep-mine|soft-waves|sleek-side-part|polished-bob|subtle-volume|tousled-texture",
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
        "title": "Hair move title",
        "body": "Different polish direction than option A — still her real length/cut family",
        "cues": ["Volume: ...", "Part: ...", "Texture: ..."]
      },
      "hairStyleId": "keep-mine|soft-waves|sleek-side-part|polished-bob|subtle-volume|tousled-texture",
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

function flattenSelectedGlamourLook(data, wardrobeOpt, beautyOpt) {
  if (!data || typeof data !== 'object') return data;
  const w = wardrobeOpt || {};
  const b = beautyOpt || {};
  data.title = w.title || data.title || 'Curated look';
  data.desc = w.desc || data.desc || '';
  data.neckline = w.neckline || data.neckline || '';
  data.pieces = Array.isArray(w.pieces) ? w.pieces : data.pieces;
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
  const hairA = String((data && data.suggestedHairStyleId) || 'keep-mine').trim().toLowerCase();
  const altHair = hairA === 'soft-waves' ? 'sleek-side-part' : 'soft-waves';
  const faceA = sanitizeFacePaletteObj(data && data.facePalette, lipFallback, weekday);
  const moveA = sanitizeHairMoveObj(data && data.hairMove, weekday);
  return [
    {
      id: 'A',
      title: (moveA && moveA.title) || 'Beauty Option A',
      summary: (moveA && moveA.body) || 'Polished hair and wearable makeup.',
      hairMove: moveA,
      facePalette: faceA,
      hairStyleId: allowedHair.has(hairA) ? hairA : 'keep-mine'
    },
    {
      id: 'B',
      title: 'Soft Glow Alternate',
      summary: 'A second beauty direction with a different hair polish and lip story — still her real length.',
      hairMove: {
        title: altHair === 'soft-waves' ? 'Soft wave polish' : 'Sleek side polish',
        body: 'Same length family as her photo, different finish for a second mood.',
        cues: ['Volume: intentional', 'Part: deliberate', 'Texture: polished']
      },
      facePalette: {
        lip: lipFallback,
        cheek: (faceA && faceA.cheek) || ['#E07A5F', 'Rose Radiance'],
        note: 'Alternate wearable lip — still rose/berry/nude family.'
      },
      hairStyleId: altHair
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
    if (!Array.isArray(next.palette)) next.palette = data.palette || [];
    if (!next.title) next.title = id === 'A' ? 'Wardrobe Option A' : 'Wardrobe Option B';
    return next;
  });

  const usedHair = new Set();
  beautyOptions = beautyOptions.slice(0, 2).map((opt, i) => {
    const id = i === 0 ? 'A' : 'B';
    const next = { ...(opt || {}), id };
    if (typeof next.title === 'string') next.title = alignTextToWeekday(next.title, weekday);
    if (typeof next.summary === 'string') next.summary = alignTextToWeekday(next.summary, weekday);
    next.hairMove = sanitizeHairMoveObj(next.hairMove, weekday);
    next.facePalette = sanitizeFacePaletteObj(next.facePalette, lipFallback, weekday);
    let hairId = String(next.hairStyleId || next.suggestedHairStyleId || '').trim().toLowerCase();
    if (!allowedHair.has(hairId)) hairId = i === 0 ? 'keep-mine' : 'soft-waves';
    if (usedHair.has(hairId) && i === 1) {
      hairId = hairId === 'soft-waves' ? 'sleek-side-part' : 'soft-waves';
    }
    usedHair.add(hairId);
    next.hairStyleId = hairId;
    if (!next.title) next.title = id === 'A' ? 'Beauty Option A' : 'Beauty Option B';
    delete next.suggestedHairStyleId;
    return next;
  });

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
          max_tokens: 4500,
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
