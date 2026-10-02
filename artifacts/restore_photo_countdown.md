# Restore 3s Countdown on Take Photo (Style Me)

## Change
Take Photo / Take a Selfie again opens the **live in-app camera** with:
- **3s Countdown** (primary button)
- Capture Now
- Flip Camera
- Device Camera (optional native OS camera fallback)

Native-only `<input capture>` removed as the primary path — that path had no countdown.

## Verify
Glamour → Take a Photo → live preview → tap **3s Countdown** → 3-2-1 overlay → photo lands on Canvas.
