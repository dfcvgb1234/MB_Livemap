# MB Livemap — FS25 Livemap + Dashboard

Local-only Farming Simulator 25 companion: a Lua mod streams farm state to a Node bridge, which fans out over WebSocket to a tablet-first Next.js dashboard.

```
FS25 Lua mod  --TCP JSON lines-->  Node bridge  --WebSocket-->  Tablet webapp
                     :18765              :18766
```

## Quick start (UI without the game)

```bash
# Terminal 1 — bridge with animated mock farm
cd server
npm install
npm run mock   # works on Windows/macOS/Linux (sets MB_LIVEMAP_MOCK via cross-env)

# Terminal 2 — tablet dashboard
cd web
npm install
npm run dev
```

Open **[http://127.0.0.1:43127](http://127.0.0.1:43127)**.

- Bridge TCP (mod): `127.0.0.1:18765`
- Bridge WebSocket: `127.0.0.1:18766`
- Bridge health: `http://127.0.0.1:18767/health`

## Install the FS25 mod

1. Copy `mod/` to your FS25 mods folder as `FS25_MB_Livemap`:
   - Windows: `%USERPROFILE%\Documents\My Games\FarmingSimulator2025\mods\FS25_MB_Livemap`
2. Start the bridge **before** loading a save (`cd server && npm start`). Omit mock once the game is connected — live mod snapshots replace mock automatically.
3. Enable **MB Livemap Bridge** in the mod selection screen and load a savegame.
4. Open the web dashboard on this machine (or later on LAN with `MB_LIVEMAP_TOKEN` set).

See `mod/README.md` for protocol notes and LuaSocket requirements.

## Repo layout

| Path | Role |
|------|------|
| `mod/` | FS25 Lua mod — snapshots + whitelisted commands |
| `server/` | TCP ↔ WebSocket bridge, state cache, mock injector |
| `web/` | Next.js tablet UI (home livemap, productions, animals) |

## Commands (whitelist)

From the vehicle sheet on the livemap:

- `engine.start` / `engine.stop`
- `attach` / `detach` (requires FS25 API support; may return unsupported)

Unknown actions are rejected by the bridge and the mod.

## Map background

Place an optional top-down map PNG at `web/public/map-overlay.png` (from your map pack). Vehicles and field tints still work without it.

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `MB_LIVEMAP_TCP_PORT` | `18765` | Mod TCP port |
| `MB_LIVEMAP_WS_PORT` | `18766` | Browser WebSocket port |
| `MB_LIVEMAP_HTTP_PORT` | `18767` | Health / mock control HTTP |
| `MB_LIVEMAP_MOCK` | unset | `1` to enable mock injector |
| `MB_LIVEMAP_TOKEN` | unset | Optional WS auth token |
| `NEXT_PUBLIC_WS_URL` | `ws://<host>:18766` | Override WS URL in the webapp |

## Out of scope (v1)

Multiplayer / dedicated server sync, economy, missions, cloud hosting.

## License

Personal / local use with your FS25 install. Not affiliated with Giants Software.
