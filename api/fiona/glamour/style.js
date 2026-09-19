/**
 * Fiona Glamour Suite — live Anthropic style analysis
 * POST /api/fiona/glamour/style
 *
 * Body: {
 *   mode?: "wardrobe" | "palette",
 *   occasion, vibe, silhouette, harmony, undertone,
 *   images: [{ mediaType: "image/jpeg", data: "<base64>" }, ...]  // max 10
 * }
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
- Vary titles, fabrics, cues, and beauty notes across requests — creativity is required.
- Return ONLY valid JSON matching the schema in the user message. No markdown fences.`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJson(req) {
  // Vercel often pre-parses JSON into req.body; stream may already be consumed.
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

function buildUserContent(body) {
  const mode = body.mode === 'palette' ? 'palette' : 'wardrobe';
  const images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
  const content = [];

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

  if (mode === 'palette') {
    content.push({
      type: 'text',
      text: `Create a customized hair & makeup palette for this woman.

Filters:
- Undertone: ${body.undertone || 'Cool'}
- Occasion context: ${body.occasion || 'Everyday'}
- Vibe: ${body.vibe || '(none provided)'}
- Silhouette: ${body.silhouette || '(not specified)'}
- Color harmony: ${body.harmony || '(not specified)'}
- Photos attached: ${images.length}

Return JSON only:
{
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
- Body silhouette: ${body.silhouette || 'Hourglass / Defined'}
- Skin tone / color harmony: ${body.harmony || 'Warm & Golden'}
- Undertone (if known): ${body.undertone || '(derive from harmony/photo)'}
- Morning energy: ${body.morningEnergy ? `${body.morningEnergy.label} — ${body.morningEnergy.styleBias || ''}` : '(not logged yet)'}
- Photos attached: ${images.length}

If morning energy is provided, weight the outfit toward that bias (fumes = soft/low-friction; conquer = structured/bold; move = polished athleisure).
If photos are present, ground the look in what she is actually wearing or her coloring/proportions in frame.
If no photos, still invent a fresh look from the filters — do not reuse a canned plum-cami-blazer default.

Return JSON only:
{
  "title": "Look title (unique)",
  "desc": "2-4 sentences describing the full look, tailored to filters and photo",
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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  // Lightweight probe — never exposes the key, only whether it is present.
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      route: '/api/fiona/glamour/style',
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
    }));
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
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

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Invalid JSON body', code: 'invalid_json' }));
  }

  const content = buildUserContent(body || {});
  const temperature = 0.8;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
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

    const payload = await anthropicRes.json().catch(() => ({}));
    if (!anthropicRes.ok) {
      const anthropicMsg =
        (payload && payload.error && (payload.error.message || payload.error.type)) ||
        (payload && payload.error) ||
        payload;
      console.error('[fiona/glamour/style] Anthropic error', anthropicRes.status, anthropicMsg);
      res.statusCode = anthropicRes.status || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Anthropic request failed',
        code: 'anthropic_error',
        status: anthropicRes.status,
        detail: anthropicMsg
      }));
    }

    const text = (payload.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const data = extractJson(text);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      mode: body.mode === 'palette' ? 'palette' : 'wardrobe',
      temperature,
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
