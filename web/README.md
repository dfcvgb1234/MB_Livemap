# MB Livemap Web

Tablet-first Next.js dashboard for the FS25 livemap bridge.

```bash
npm install
npm run dev   # http://127.0.0.1:43127
```

Requires the bridge WebSocket on `ws://127.0.0.1:18766` (override with `NEXT_PUBLIC_WS_URL`).

Optional map background: replace `public/map-overlay.png` with a top-down PNG from your map pack.
