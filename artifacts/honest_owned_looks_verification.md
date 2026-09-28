# Honest owned looks + native camera verification

## Fixes shipped
1. **Native device camera** — Take a Photo / Take a Selfie uses `<input capture>` (OS camera), not the custom in-app frame.
2. **Shirts + leggings honored** — Style sends owned garment + closet inventory; offline + live prompts forbid inventing dresses when user asks about shirts/leggings; Vision has OWNED SEPARATES LOCK.
3. **Short hair** — Beauty defaults to soft-down vs sleek-down; short/bob context remaps hair-up → down; Vision refuses fake long buns.
4. **Style first click** — Instant A/B paint before paywall consume; second tap scrolls to picks instead of feeling dead.
5. **Honest wingwoman** — Style system prompt: if she asks how a look looks, answer kindly + truthfully with improvements; never insult.

## Smoke strings present
- Prefer the device's native camera
- asksOwnedSeparates / OWNED SEPARATES LOCK
- looksLikeShortHairContext / SHORT HAIR LOCK
- HONEST WINGWOMAN FEEDBACK
