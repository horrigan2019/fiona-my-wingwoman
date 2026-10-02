# Native camera + 3s countdown (no app frame)

## What Debra asked for
- **No frame** around the camera (phone’s own camera — not an in-app preview card)
- A **3 second timer**

## Flow
1. Tap **Take a Photo**
2. Full-screen black screen shows **3 → 2 → 1** (no camera preview / no card)
3. Phone’s native camera opens via `<input capture>`
4. She snaps the photo there — no in-app frame

Also bumps PWA shell/cache to **v21** so stale framed UI cannot stick.
