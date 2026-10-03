# Take Photo: countdown then actual photo (no silent fail)

## Bug Debra hit
Countdown 3→2→1 ran, then **nothing** — phones block `input.click()` after a timer (needs a fresh tap).

## Fix
1. On **Take a Photo** tap, warm the camera offscreen (keeps the gesture) — no framed preview
2. Blank full-screen **3 → 2 → 1**
3. Auto-snap onto Your Canvas when the stream is ready
4. If live camera is blocked: show **Open Camera** (one tap → native camera)

PWA shell/cache bumped to **v22**.
