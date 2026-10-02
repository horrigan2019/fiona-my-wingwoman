# Frameless camera + 3s countdown

## Intent
Debra wants:
1. **No frame** around the camera (no card/modal chrome around the preview)
2. A **3 second countdown**

## Implementation
Take Photo opens a **full-screen edge-to-edge** live camera (video fills the viewport; floating Close / controls only).
Countdown **auto-starts** after the feed is ready (3-2-1 overlay), then captures and closes.
