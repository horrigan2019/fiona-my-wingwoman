/**
 * POST /api/generate-outfit-look
 *
 * Body:
 * {
 *   photo: { data: base64|dataUrl, mediaType?: string },
 *   look: { title, desc, pieces[], hairMove, facePalette, compliment? },
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

function buildEditorialPrompt(look, occasion, vibe) {
  const pieces = Array.isArray(look && look.pieces) ? look.pieces : [];
  const pieceLine = pieces
    .map((p) => {
      const color = p.colorLabel || p.hex || '';
      return `${p.name}${color ? ` in ${color}` : ''}${p.fabric ? ` (${p.fabric})` : ''}`;
    })
    .filter(Boolean)
    .join(', ');

  const hair = look && look.hairMove
    ? `${look.hairMove.title || 'styled hair'}${look.hairMove.body ? ` — ${look.hairMove.body}` : ''}`
    : 'soft polished hair';
  const lip = look && look.facePalette && Array.isArray(look.facePalette.lip)
    ? look.facePalette.lip[1] || 'soft berry lip'
    : 'soft berry lip';
  const cheek = look && look.facePalette && Array.isArray(look.facePalette.cheek)
    ? look.facePalette.cheek[1] || 'soft flush'
    : 'soft flush';

  return [
    'A high-fashion, realistic editorial photo of the SAME woman from the reference image.',
    'Preserve her exact face, facial features, skin tone, age, body proportions, and identity — do not invent a different person.',
    `Dress her in: ${pieceLine || (look && look.desc) || 'the recommended outfit'}.`,
    `Hair: ${hair}.`,
    `Makeup: ${lip} lipstick, ${cheek} blush, natural polished finish.`,
    occasion ? `Occasion: ${occasion}.` : '',
    vibe ? `Vibe: ${vibe}.` : '',
    look && look.title ? `Look title: ${look.title}.` : '',
    'Confident natural posture, chic soft-studio or wardrobe setting, tasteful non-sexual, no text overlays, no logos, magazine quality.'
  ].filter(Boolean).join(' ');
}

async function generateWithFal(apiKey, dataUrl, prompt) {
  const model = process.env.FAL_LOOK_MODEL || 'fal-ai/flux/dev/image-to-image';
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: dataUrl,
      prompt,
      strength: Number(process.env.FAL_LOOK_STRENGTH || 0.72),
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
        prompt_strength: Number(process.env.REPLICATE_LOOK_STRENGTH || 0.72),
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
  const modelsToTry = [
    process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    'gpt-image-1',
    'dall-e-2'
  ].filter((m, i, a) => a.indexOf(m) === i);

  let lastErr = null;
  for (const model of modelsToTry) {
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt.slice(0, 3200));
      if (model === 'dall-e-2') {
        form.append('size', '1024x1024');
        form.append('n', '1');
      } else {
        form.append('size', process.env.OPENAI_IMAGE_SIZE || '1024x1536');
        form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium');
      }
      form.append('image', new Blob([bytes], { type: parsed.mediaType || 'image/jpeg' }), 'selfie.jpg');

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
        continue;
      }
      const b64 = json.data && json.data[0] && (json.data[0].b64_json || json.data[0].b64);
      if (!b64) {
        lastErr = Object.assign(new Error('OpenAI returned no image'), { detail: json });
        continue;
      }
      return { mimeType: 'image/png', base64: b64, provider: `openai:${model}` };
    } catch (e) {
      lastErr = e;
    }
  }

  // Last resort: text-to-image generations (weaker identity match, but better than total failure)
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_GEN_MODEL || 'gpt-image-1',
        prompt: `${prompt}\nUse the reference woman's appearance from this description context; keep a realistic full-body editorial portrait.`,
        size: process.env.OPENAI_IMAGE_SIZE || '1024x1536',
        quality: process.env.OPENAI_IMAGE_QUALITY || 'medium'
      })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((json && json.error && json.error.message) || 'OpenAI generations failed');
      err.status = res.status;
      err.detail = json;
      throw err;
    }
    const row = json.data && json.data[0];
    if (row && row.b64_json) {
      return { mimeType: 'image/png', base64: row.b64_json, provider: 'openai:generations' };
    }
    if (row && row.url) {
      const imgRes = await fetch(row.url);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      return {
        mimeType: imgRes.headers.get('content-type') || 'image/png',
        base64: buf.toString('base64'),
        provider: 'openai:generations',
        url: row.url
      };
    }
  } catch (e) {
    lastErr = e;
  }

  throw lastErr || new Error('OpenAI image generation failed');
}

async function generateWithGemini(apiKey, photo, prompt) {
  const parsed = stripDataUrl(photo.data || photo);
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
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
  const prompt = buildEditorialPrompt(look, body.occasion, body.vibe);
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

    const order = [
      // Prefer OpenAI when configured — most common setup for Fiona right now
      openAiKey ? 'openai' : '',
      provider,
      'fal',
      'replicate',
      'fashn',
      'gemini'
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
