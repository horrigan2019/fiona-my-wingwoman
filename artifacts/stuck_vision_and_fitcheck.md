# Stuck Vision + How does this look?

## Vision “stuck in the dressing room”
Root causes we harden against:
- OpenAI **safety/moderation** on lingerie/underwear selfies (seen in Debra’s screenshots)
- First Vision endpoint failing and client **not trying** the Style fallback
- Style look fallback **dropping the garment** image

Fixes:
1. Safer clothed-output prompt language (no “underwear” wording in the image edit)
2. OpenAI auto-retries: primary → safe identity-only → safe with garment
3. Client tries both `/api/generate-outfit-look` and Glamour Style look mode; auto-retries without garment on safety
4. Clearer fionaMessage for safety vs billing vs generic stuck
5. Style `handleLookPhoto` now keeps identity + garment

## How does this look?
New Glamour card with button **How does this look? ✨**
- Uses Canvas photo (or Take/Upload first)
- Optional note field
- API `mode: fitcheck` → honest kind JSON (verdict, whatWorks, tweak, alternate, compliment, quip)
- Never insults; truth + encouragement
