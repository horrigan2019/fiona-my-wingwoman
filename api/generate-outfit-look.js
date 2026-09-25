/**
 * POST /api/generate-outfit-look
 *
 * Body:
 * {
 *   photo: { data: base64|dataUrl, mediaType?: string },
 *   look: { title, desc, pieces[], hairMove, facePalette, compliment?, hairStyleId? },
 *   hairStyleId?: 'keep-mine' | 'soft-waves' | 'sleek-side-part' | 'polished-bob' | 'subtle-volume' | 'tousled-texture',
 *   occasion?: string,
 *   vibe?: string
 * }
 *
 * Env:
 *   IMAGE_GEN_API_KEY   — Fal / Replicate / Fashn key (preferred)
 *   IMAGE_GEN_PROVIDER  — fal | replicate | fashn | openai | gemini (default: fal)
 *   OPENAI_API_KEY      — fallback
 *   GEMINI_API_KEY      — fallback
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

function stripDataUrl(data) {
  const raw = String(data || '');
  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) return { mediaType: m[1], base64: m[2] };
  return { mediaType: 'image/jpeg', base64: raw.replace(/^data:[^;]+;base64,/, '') };
}

function toDataUrl(mediaType, base64) {
  return `data:${mediaType || 'image/png'};base64,${base64}`;
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

function buildEditorialPrompt(look, occasion, vibe, hairStyleId) {
  const pieces = Array.isArray(look && look.pieces) ? look.pieces : [];
  const pieceLine = pieces
    .map((p) => {
      const color = p.colorLabel || p.hex || '';
      return `${p.name}${color ? ` in ${color}` : ''}${p.fabric ? ` (${p.fabric})` : ''}`;
    })
    .filter(Boolean)
    .join(', ');

  const lip = look && look.facePalette && Array.isArray(look.facePalette.lip)
    ? look.facePalette.lip[1] || 'soft berry lip'
    : 'soft berry lip';
  const cheek = look && look.facePalette && Array.isArray(look.facePalette.cheek)
    ? look.facePalette.cheek[1] || 'soft flush'
    : 'soft flush';

  const hairOption = resolveHairStyleOption(look, hairStyleId);
  const allowHairRestyle = Boolean(hairOption.vision && hairOption.id !== 'keep-mine');
  const changeLine = allowHairRestyle
    ? `CHANGE ALLOWED: clothing/outfit, light makeup (lipstick and blush), and the intentional "${hairOption.label}" hairstyle within her real length/color. Keep pose geometry, face, and body type intact.`
    : 'CHANGE ONLY: clothing/outfit and light makeup (lipstick and blush). Keep pose geometry, exact hair, and her identity intact.';

  // Virtual try-on pattern (OpenAI cookbook): lock person (+ hair unless user picked a polish style).
  return [
    'Edit the attached reference selfie of this exact woman. Virtual try-on only — same person, not a new model.',
    'IDENTITY LOCK — do not change: her exact face, facial geometry, eyes, nose, mouth, expression, skin tone, age, ethnicity, or likeness.',
    'BODY LOCK: Preserve her real body type, soft/curvy proportions if present, shoulder-to-hip balance, and figure. Do not slim, idealize, lengthen legs, or cast a fashion-model body.',
    hairDirectionForVision(look, hairStyleId),
    changeLine,
    'FLATTERING FIT: Dress her to look intentional and gorgeous on HER body — define the waist, skim (never tent) bust and hips, celebrate soft curves. Prefer wrap that cinches, soft V / wrap neckline, A-line, vertical lines, right proportions.',
    'Do NOT drown her in an oversized heavy blazer, shapeless dark midi tent, or matronly corporate armor. Outfit should look hot-on-her and polished — never frumpy or covering-up.',
    `Dress her in: ${pieceLine || (look && look.desc) || 'the recommended outfit'}. Fit garments flatteringly to HER existing body with realistic fabric drape that cinches the waist and skims curves — not pasted on, not tented.`,
    `Light makeup only: ${lip} lipstick, ${cheek} blush — do not change facial structure or bone structure.`,
    occasion ? `Occasion: ${occasion}.` : '',
    vibe ? `Vibe: ${vibe}.` : '',
    look && look.title ? `Look title: ${look.title}.` : '',
    'Soft studio or wardrobe background is OK. Tasteful, non-sexual, photorealistic. No text overlays, no logos.',
    allowHairRestyle
      ? `FINAL CHECK: face matches the reference, hair stays in her real length/color family with the selected "${hairOption.label}" finish, body type matches the reference, outfit flatters her real figure (waist visible, not tented). If anything conflicts, prefer the reference selfie for face + body — keep the flattering fit and selected hair polish.`
      : 'FINAL CHECK: face matches the reference, hair length/style matches the reference, body type matches the reference, outfit flatters her real figure (waist visible, not tented). If anything conflicts, prefer the reference selfie for identity — keep the flattering fit.'
  ].filter(Boolean).join(' ');
}

async function generateWithFal(apiKey, dataUrl, prompt) {
  // Prefer identity-friendly img2img when configured; flux/dev still needs low strength.
  const model = process.env.FAL_LOOK_MODEL || 'fal-ai/flux/dev/image-to-image';
  // Lower strength = keep more of the selfie (face/body/hair). 0.45 still drifted identity.
  const strength = Number(process.env.FAL_LOOK_STRENGTH || 0.35);
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: dataUrl,
      prompt,
      strength: Number.isFinite(strength) ? Math.min(0.5, Math.max(0.2, strength)) : 0.35,
      num_images: 1,
      enable_safety_checker: true
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json && (json.detail || json.error || json.message)) || 'Fal image generation failed');
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  const img = (json.images && json.images[0]) || (json.image) || null;
  const url = img && (img.url || img);
  if (!url || typeof url !== 'string') {
    throw Object.assign(new Error('Fal returned no image'), { detail: json });
  }
  if (url.startsWith('data:')) {
    const parsed = stripDataUrl(url);
    return { mimeType: parsed.mediaType, base64: parsed.base64, provider: 'fal', url };
  }
  const imgRes = await fetch(url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mimeType = imgRes.headers.get('content-type') || 'image/png';
  return { mimeType, base64: buf.toString('base64'), provider: 'fal', url };
}

async function generateWithReplicate(apiKey, dataUrl, prompt) {
  const model = process.env.REPLICATE_LOOK_MODEL || 'black-forest-labs/flux-dev';
  const create = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait'
    },
    body: JSON.stringify({
      version: process.env.REPLICATE_LOOK_VERSION || undefined,
      model,
      input: {
        prompt,
        image: dataUrl,
        // Lower prompt_strength preserves more identity from the input selfie.
        prompt_strength: Number(process.env.REPLICATE_LOOK_STRENGTH || 0.35),
        num_outputs: 1
      }
    })
  });
  let json = await create.json().catch(() => ({}));
  if (!create.ok && create.status !== 201) {
    const err = new Error((json && json.detail) || 'Replicate create failed');
    err.status = create.status;
    err.detail = json;
    throw err;
  }

  // Poll if not completed
  let tries = 0;
  while (json && (json.status === 'starting' || json.status === 'processing') && tries < 40) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(json.urls.get, {
      headers: { Authorization: `Token ${apiKey}` }
    });
    json = await poll.json().catch(() => ({}));
    tries += 1;
  }
  if (!json || json.status !== 'succeeded') {
    const err = new Error((json && json.error) || 'Replicate prediction did not succeed');
    err.status = 502;
    err.detail = json;
    throw err;
  }
  const out = Array.isArray(json.output) ? json.output[0] : json.output;
  if (!out) throw Object.assign(new Error('Replicate returned empty output'), { detail: json });
  const imgRes = await fetch(out);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return {
    mimeType: imgRes.headers.get('content-type') || 'image/png',
    base64: buf.toString('base64'),
    provider: 'replicate',
    url: out
  };
}

async function generateWithFashn(apiKey, dataUrl, prompt) {
  // Fashn.ai try-on style API (generic JSON). Model endpoint configurable.
  const endpoint = process.env.FASHN_API_URL || 'https://api.fashn.ai/v1/run';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model_image: dataUrl,
      prompt,
      category: 'full_body',
      mode: process.env.FASHN_MODE || 'quality'
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json && (json.error || json.message)) || 'Fashn generation failed');
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  const url = json.output || json.image || (json.images && json.images[0]) || null;
  if (!url) throw Object.assign(new Error('Fashn returned no image'), { detail: json });
  const imgUrl = typeof url === 'string' ? url : url.url;
  const imgRes = await fetch(imgUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return {
    mimeType: imgRes.headers.get('content-type') || 'image/png',
    base64: buf.toString('base64'),
    provider: 'fashn',
    url: imgUrl
  };
}

async function generateWithOpenAI(apiKey, photo, prompt) {
  const parsed = stripDataUrl(photo.data || photo);
  const bytes = Buffer.from(parsed.base64, 'base64');
  // Identity-preserving edits only — never fall back to text-to-image (invents a different woman).
  // gpt-image-1.5 first: stronger identity / try-on preservation per OpenAI prompting guide.
  const modelsToTry = [
    process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
    'gpt-image-1.5',
    'gpt-image-1'
  ].filter((m, i, a) => a.indexOf(m) === i && m !== 'dall-e-2' && m !== 'dall-e-3');

  const fidelity = String(process.env.OPENAI_INPUT_FIDELITY || 'high').toLowerCase() === 'low'
    ? 'low'
    : 'high';
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'high';

  let lastErr = null;
  for (const model of modelsToTry) {
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt.slice(0, 3200));
      form.append('size', process.env.OPENAI_IMAGE_SIZE || '1024x1536');
      form.append('quality', quality);
      // Critical for face/body likeness on gpt-image-1 / 1.5 (default is low).
      if (model === 'gpt-image-1' || model === 'gpt-image-1.5' || model.startsWith('gpt-image-1')) {
        form.append('input_fidelity', fidelity);
      }
      // Mask-free full-image edit — model must follow IDENTITY/HAIR/BODY locks in the prompt.
      form.append(
        'image',
        new Blob([bytes], { type: parsed.mediaType || 'image/jpeg' }),
        'canvas-selfie.jpg'
      );

      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error((json && json.error && json.error.message) || `OpenAI edits failed (${model})`);
        lastErr.status = res.status;
        lastErr.detail = json;
        console.error('[generate-outfit-look] OpenAI edit failed', model, lastErr.message);
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

  // Do NOT call /v1/images/generations here — text-only invents a generic model.
  throw lastErr || new Error('OpenAI identity-preserving image edit failed');
}

async function generateWithGemini(apiKey, photo, prompt) {
  const parsed = stripDataUrl(photo.data || photo);
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const identityLead = 'You are editing the attached photo of a real woman. Keep her identical face and body type. Keep hair in her real length/color family (short stays short). Change clothes, light makeup, and only an intentional selected hairstyle polish when the prompt asks for it.\n\n';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: identityLead + prompt },
          { inline_data: { mime_type: parsed.mediaType || 'image/jpeg', data: parsed.base64 } }
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
  throw Object.assign(new Error('Gemini returned no image'), { detail: json });
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

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  const photo = body.photo || (Array.isArray(body.images) && body.images[0]) || null;
  if (!photo || !(photo.data || typeof photo === 'string')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'A canvas photo is required',
      code: 'missing_photo',
      fionaMessage: "Add a photo to Your Canvas first, gorgeous — Fiona needs a face to dress."
    }));
  }

  const look = body.look || {};
  const hairStyleId = body.hairStyleId || body.hairstyleId || (look && look.hairStyleId) || 'keep-mine';
  const prompt = buildEditorialPrompt(look, body.occasion, body.vibe, hairStyleId);
  const parsedPhoto = typeof photo === 'string' ? { data: photo } : photo;
  const dataUrl = String(parsedPhoto.data || '').startsWith('data:')
    ? String(parsedPhoto.data)
    : toDataUrl(parsedPhoto.mediaType || 'image/jpeg', stripDataUrl(parsedPhoto.data).base64);

  const imageGenKey = process.env.IMAGE_GEN_API_KEY || '';
  const provider = String(process.env.IMAGE_GEN_PROVIDER || (imageGenKey ? 'fal' : '')).toLowerCase();
  const openAiKey = process.env.OPENAI_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  if (!imageGenKey && !openAiKey && !geminiKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Image generation is not configured',
      code: 'missing_image_api_key',
      hint: 'Add IMAGE_GEN_API_KEY (Fal/Replicate/Fashn) or OPENAI_API_KEY in Vercel.',
      fionaMessage: "Fiona's Vision isn't plugged in yet — add an image key in Vercel and she'll dress you in a blink."
    }));
  }

  try {
    let result = null;
    let lastErr = null;

    const tryProvider = async (name) => {
      if (name === 'fal' && imageGenKey) return generateWithFal(imageGenKey, dataUrl, prompt);
      if (name === 'replicate' && imageGenKey) return generateWithReplicate(imageGenKey, dataUrl, prompt);
      if (name === 'fashn' && imageGenKey) return generateWithFashn(imageGenKey, dataUrl, prompt);
      if (name === 'openai' && openAiKey) return generateWithOpenAI(openAiKey, parsedPhoto, prompt);
      if (name === 'gemini' && geminiKey) return generateWithGemini(geminiKey, parsedPhoto, prompt);
      return null;
    };

    // VISION_PREFER_GEMINI=1 tries Gemini likeness path first when both keys exist.
    const preferGemini = String(process.env.VISION_PREFER_GEMINI || '').toLowerCase() === '1'
      || String(process.env.VISION_PREFER_GEMINI || '').toLowerCase() === 'true';
    const order = [
      preferGemini && geminiKey ? 'gemini' : '',
      // Prefer OpenAI when configured — most common setup for Fiona right now
      openAiKey ? 'openai' : '',
      provider,
      geminiKey ? 'gemini' : '',
      'fal',
      'replicate',
      'fashn'
    ]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    for (const name of order) {
      try {
        result = await tryProvider(name);
        if (result) break;
      } catch (e) {
        lastErr = e;
        console.error('[generate-outfit-look] provider failed', name, e && e.message);
      }
    }

    if (!result) {
      const detailMsg = typeof (lastErr && lastErr.message) === 'string' ? lastErr.message : '';
      const billingHint = /billing|quota|credit|payment|limit/i.test(detailMsg + JSON.stringify((lastErr && lastErr.detail) || {}));
      res.statusCode = (lastErr && lastErr.status) || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'Could not generate outfit look',
        detail: lastErr && (lastErr.detail || lastErr.message),
        fionaMessage: billingHint
          ? "OpenAI needs billing credit for image generation — add a little credit at platform.openai.com, then try Generate My Look again."
          : (detailMsg
            ? `Fiona couldn't finish the Vision look (${detailMsg}). Check OPENAI_API_KEY / billing, then try again.`
            : "That look got stuck in the dressing room, darling. Try again in a moment — your text recommendation is still perfect.")
      }));
    }

    const dataUrlOut = toDataUrl(result.mimeType, result.base64);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      ok: true,
      provider: result.provider,
      prompt,
      hairStyleId: resolveHairStyleOption(look, hairStyleId).id,
      image: {
        mimeType: result.mimeType,
        dataUrl: dataUrlOut,
        url: result.url || null
      }
    }));
  } catch (err) {
    console.error('[generate-outfit-look] failure', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'Look generation failed',
      detail: err && err.message ? err.message : String(err),
      fionaMessage: "Fiona hit a tiny wardrobe snag. Refresh and try Generate My Look again."
    }));
  }
};
