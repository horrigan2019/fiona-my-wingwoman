/**
 * POST /api/generate-outfit-look
 *
 * Body:
 * {
 *   photo: { data: base64|dataUrl, mediaType?: string },
 *   look: { title, desc, pieces[], hairMove, facePalette, compliment?, hairStyleId? },
 *   hairStyleId?: 'keep-mine' | 'soft-waves' | 'sleek-side-part' | 'subtle-volume' | 'tousled-texture',
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
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN with CLEARLY VISIBLE soft romantic waves and face-framing movement. Keep her EXACT hair length/cut/color/density/hairline from the reference. Do NOT put hair up. NEVER shorten, bob, lob, trim, or cut.'
  },
  {
    id: 'hair-down-sleek',
    label: 'Leave it down · sleek',
    short: 'Hair down, sleek + polished',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN with a CLEARLY VISIBLE sleek polished finish — deep side part, smooth glossy lengths (not the same loose beach waves). Keep EXACT length/cut/color/density/hairline. Do NOT put hair up. NEVER shorten, bob, lob, trim, or cut.'
  },
  {
    id: 'hair-up-playful',
    label: 'Hair up · cute playful',
    short: 'Easy cute playful updo',
    category: 'up',
    vision: 'HAIR UP styling (not a haircut): put her EXISTING hair UP in an EASY, CUTE, PLAYFUL style — messy claw-clip twist, soft playful bun, or undone half-up that feels fun and effortless. Use only her real hair (no extensions). Keep her real hair COLOR, density, and hairline. Face stays hers. NEVER cut or shorten her hair permanently — this is a style for the look only.'
  },
  {
    id: 'hair-up-sleek',
    label: 'Hair up · sleek',
    short: 'Sleek pulled-up look',
    category: 'up',
    vision: 'HAIR UP styling (not a haircut): put her EXISTING hair UP in a SLEEK pulled-up look — low sleek pony, smooth low bun, or polished twist. Clean, intentional, glossy. Use only her real hair (no extensions). Keep her real hair COLOR, density, and hairline. Face stays hers. NEVER cut or shorten her hair — style only.'
  },
  // Back-compat aliases kept as first-class so old caches still resolve
  {
    id: 'soft-waves',
    label: 'Leave it down · soft',
    short: 'Hair down with soft waves',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN with CLEARLY VISIBLE soft romantic waves. Keep EXACT length/cut/color. Do NOT put hair up. NEVER cut or shorten.'
  },
  {
    id: 'sleek-side-part',
    label: 'Leave it down · sleek',
    short: 'Hair down, sleek + polished',
    category: 'down',
    vision: 'HAIR DOWN styling (not a haircut): leave her hair DOWN sleek and polished with a deep side part. Keep EXACT length/cut/color. Do NOT put hair up. NEVER cut or shorten.'
  },
  {
    id: 'tousled-texture',
    label: 'Leave it down · soft',
    short: 'Hair down, tousled',
    category: 'down',
    vision: 'HAIR DOWN styling: leave hair DOWN with tousled piecey texture. Keep EXACT length/cut/color. Do NOT put hair up. NEVER cut or shorten.'
  },
  {
    id: 'subtle-volume',
    label: 'Leave it down · soft',
    short: 'Hair down with volume',
    category: 'down',
    vision: 'HAIR DOWN styling: leave hair DOWN with lifted crown volume. Keep EXACT length/cut/color. Do NOT put hair up. NEVER cut or shorten.'
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
    'Keep her real hair COLOR, density, and hairline from the reference.',
    'NEVER give her a new haircut, bob, lob, crop, trim, or permanently shorten/grow her hair — styling for this look only.',
    'Face locked; EXACT body proportions locked (no added curves).'
  ].join(' ');

  if (!option.vision || option.id === 'keep-mine') {
    return [
      'HAIR LOCK: Keep her exact hair from the reference selfie — same length, whether it was up or down, color, texture, density, and hairline.',
      identityHair,
      'Optional: light product polish only — do not invent a new updo or change her finish unless she picked a beauty style.'
    ].join(' ');
  }

  if (isUp) {
    return [
      identityHair,
      `INTENTIONAL HAIR UP (user selected "${option.label}"): ${option.vision}`,
      'Hair MUST be clearly UP / pulled up for this look — not left fully down like the reference if the reference was down.',
      'Makeup follows the selected effortless beauty option. Ignore notes that would cut her hair or leave it fully down.'
    ].join(' ');
  }

  if (isDown) {
    return [
      identityHair,
      'HAIR DOWN LOCK: ends stay at the same place on her body as the reference length when worn down.',
      `INTENTIONAL HAIR DOWN (user selected "${option.label}"): ${option.vision}`,
      'Hair MUST stay DOWN — do NOT put it in a bun, pony, claw clip, or updo for this pick.',
      'Makeup follows the selected effortless beauty option.'
    ].join(' ');
  }

  return [
    identityHair,
    `INTENTIONAL HAIR STYLING (user selected "${option.label}"): ${option.vision}`,
    'Makeup follows the selected effortless beauty option.'
  ].join(' ');
}

function buildEditorialPrompt(look, occasion, vibe, hairStyleId, extras) {
  extras = extras || {};
  const silhouette = extras.silhouette || look && look.silhouette || '';
  const harmony = extras.harmony || look && (look.harmony || look.undertone) || '';
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
  const allowHairStyle = Boolean(hairOption.vision && hairOption.id !== 'keep-mine');
  const exactGarment = Boolean(extras.exactGarment || extras.hasGarmentRef || look.exactGarment || look.fromUploads);
  const changeLine = exactGarment
    ? (allowHairStyle
      ? `CHANGE ALLOWED ONLY: fit her EXACT uploaded garment onto her body, place her in an event-appropriate setting, visible makeup, and a CLEARLY VISIBLE "${hairOption.label}" hair styling. Do NOT redesign the garment.`
      : 'CHANGE ALLOWED ONLY: fit her EXACT uploaded garment onto her body, event-appropriate setting, and light makeup. Do NOT redesign the garment. Keep exact hair unless a beauty style is selected.')
    : (allowHairStyle
      ? `CHANGE ALLOWED: clothing/outfit for the event, visible makeup (lipstick and blush), and a CLEARLY VISIBLE "${hairOption.label}" STYLING finish on her EXISTING cut — same exact length/shape as the reference. Keep pose geometry, face, and exact body proportions intact. NEVER bob, shorten, or cut her hair.`
      : 'CHANGE ONLY: clothing/outfit for the event and light makeup (lipstick and blush). Keep pose geometry, exact hair (cut + length + finish), and her identity intact.');

  const silLower = String(silhouette || '').toLowerCase();
  let bodyLock = 'BODY PROPORTION LOCK (critical): Keep her EXACT body from the reference — same frame, shoulder width, waist, hip width, thigh thickness, arm size, height cues, and muscle/softness. Do NOT add curves, widen hips/thighs, inflate bust, or thicken her. Do NOT slim, idealize, lengthen legs, or swap in a different body type. If she is slim, athletic, tall/long-lined, petite, or curvy — she stays exactly that.';
  if (/curvy|soft silhouette|hourglass/.test(silLower)) {
    bodyLock += ' Detected figure note: soft/hourglass — preserve her real waist-to-hip balance; do not exaggerate or invent extra weight.';
  } else if (/athletic|straight|tall|long lines|petite/.test(silLower)) {
    bodyLock += ` Detected figure note: ${silhouette} — keep that lean/long/athletic read; NEVER add softness or curves she does not have in the reference.`;
  }

  const fitLine = /athletic|straight|tall|long lines|petite/.test(silLower)
    ? 'FLATTERING FIT: Dress HER real proportions — clean verticals, intentional waist if it suits, garments that skim without adding bulk. Prefer pieces that flatter a long/lean or athletic frame when that is what the reference shows.'
    : 'FLATTERING FIT: Dress her to look intentional and gorgeous on HER body — define the waist, skim (never tent) bust and hips when she has soft curves. Prefer wrap that cinches, soft V / wrap neckline, A-line, vertical lines, right proportions.';

  return [
    'Edit the attached images: first image is her IDENTITY selfie (face + body); if a second image is attached it is the EXACT garment to wear — virtual try-on only, same person.',
    'IDENTITY LOCK — do not change: her exact face, facial geometry, eyes, nose, mouth, expression, skin tone, age, ethnicity, or likeness.',
    bodyLock,
    hairDirectionForVision(look, hairStyleId),
    changeLine,
    fitLine,
    exactGarment
      ? 'GARMENT LOCK (NON-NEGOTIABLE): A garment reference image is attached (or her uploaded clothing choice is selected). Dress her in that EXACT garment — same color, fabric, lace/embroidery, length, silhouette, neckline, and straps (strapless stays strapless; no adding spaghetti straps, sleeves, or a different neckline). Do NOT redesign, recolor, restyle, or invent a different dress. Only fit THAT piece onto her body with realistic drape.'
      : 'Do NOT drown her in an oversized heavy blazer, shapeless dark midi tent, or matronly corporate armor. Outfit should look hot-on-her and polished for the event — never frumpy or covering-up.',
    exactGarment
      ? `Put her in her exact uploaded piece${pieceLine ? ` (described as: ${pieceLine})` : ''}. Match the garment photo pixel-faithfully for design details — fit to HER body only; do not change the clothes.`
      : `Dress her in: ${pieceLine || (look && look.desc) || 'the recommended outfit'}. Fit garments to HER existing body with realistic fabric drape — not pasted on, not padded out, not tented.`,
    `Makeup for the look: ${lip} lipstick, ${cheek} blush — do not change facial structure or bone structure.`,
    occasion ? `EVENT / FUNCTION (dress the outfit for this): ${occasion}.` : '',
    vibe ? `Vibe / notes: ${vibe}.` : '',
    silhouette ? `Body type to honor: ${silhouette}.` : '',
    harmony ? `Skin tone / color harmony to honor: ${harmony}.` : '',
    look && look.title ? `Look title: ${look.title}.` : '',
    'Soft studio or wardrobe background is OK. Tasteful, non-sexual, photorealistic. No text overlays, no logos.',
    exactGarment
      ? `FINAL CHECK: face + body match identity selfie; garment matches the uploaded clothing photo EXACTLY (neckline/straps/color/details unchanged); hair styling follows "${hairOption.label}" if selected; setting suits ${occasion || 'the event'}. If anything conflicts, prefer identity selfie for face/body and garment photo for the clothes.`
      : (allowHairStyle
      ? `FINAL CHECK: face matches reference; body proportions match reference (no added curves/thickness); hair LENGTH matches reference but styling CLEARLY shows "${hairOption.label}"; outfit flatters her real figure for ${occasion || 'the event'}. If anything conflicts, prefer the reference selfie for face + body.`
      : `FINAL CHECK: face, hair, and body proportions match the reference (no added curves/thickness); outfit flatters her real figure for ${occasion || 'the event'}. If anything conflicts, prefer the reference selfie for identity.`)
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

async function generateWithOpenAI(apiKey, photo, prompt, garmentPhoto) {
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
      // OpenAI rejects duplicate "image" fields — use image[] when sending identity + garment.
      let garmentBytes = null;
      let garmentType = 'image/jpeg';
      if (garmentPhoto) {
        const gParsed = stripDataUrl(garmentPhoto.data || garmentPhoto);
        if (gParsed && gParsed.base64) {
          garmentBytes = Buffer.from(gParsed.base64, 'base64');
          garmentType = gParsed.mediaType || 'image/jpeg';
        }
      }
      const imageField = garmentBytes ? 'image[]' : 'image';
      form.append(
        imageField,
        new Blob([bytes], { type: parsed.mediaType || 'image/jpeg' }),
        'identity-selfie.jpg'
      );
      if (garmentBytes) {
        form.append(
          'image[]',
          new Blob([garmentBytes], { type: garmentType }),
          'garment-exact.jpg'
        );
      }

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
  const identityLead = 'You are editing the attached photo of a real woman. Keep her identical face and EXACT body proportions (do not add curves or thickness). Keep hair length/cut; when asked, apply a clearly visible styling change only. Change clothes + makeup for the event.\n\n';
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
  const garment = body.garment || body.garmentPhoto || null;
  const hasGarmentRef = Boolean(garment && (garment.data || typeof garment === 'string'));
  const exactGarment = Boolean(
    body.exactGarment
    || hasGarmentRef
    || look.exactGarment
    || look.fromUploads
  );
  const prompt = buildEditorialPrompt(look, body.occasion, body.vibe, hairStyleId, {
    silhouette: body.silhouette || look.silhouette || '',
    harmony: body.harmony || body.undertone || look.harmony || look.undertone || '',
    exactGarment,
    hasGarmentRef
  });
  const parsedPhoto = typeof photo === 'string' ? { data: photo } : photo;
  const dataUrl = String(parsedPhoto.data || '').startsWith('data:')
    ? String(parsedPhoto.data)
    : toDataUrl(parsedPhoto.mediaType || 'image/jpeg', stripDataUrl(parsedPhoto.data).base64);
  const parsedGarment = hasGarmentRef
    ? (typeof garment === 'string' ? { data: garment } : garment)
    : null;

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
      if (name === 'openai' && openAiKey) return generateWithOpenAI(openAiKey, parsedPhoto, prompt, parsedGarment);
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
      wardrobeOptionId: body.wardrobeOptionId || look.selectedWardrobeId || look.wardrobeOptionId || null,
      beautyOptionId: body.beautyOptionId || look.selectedBeautyId || look.beautyOptionId || null,
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
