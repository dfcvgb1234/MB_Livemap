# MB Livemap — FS25 Livemap + Dashboard

Local-only Farming Simulator 25 companion: a Lua mod streams farm state to a Node bridge, which fans out over WebSocket to a tablet-first Next.js dashboard.

```
FS25 Lua mod  --named pipe JSON lines-->  Node bridge  --WebSocket-->  Tablet webapp
              \\.\pipe\mb-livemap              :18766
```

FS25 mods cannot load LuaSocket. On Windows the mod writes state to the named pipe above. Vehicle commands go back through `modSettings/FS25_MB_Livemap/commands.xml`.

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

- Bridge pipe (mod): `\\.\pipe\mb-livemap`
- Bridge WebSocket: `127.0.0.1:18766`
- Bridge health: `http://127.0.0.1:18767/health`

## Install for someone else

On a Windows PC, double-click `release\BuildRelease.ps1` (or run it from PowerShell). It writes `release\out\MB Livemap\`. Copy that folder to the player’s PC. They double-click **MB Livemap**. A window stays open while it is running, and the icon also appears by the clock. The first start copies `FS25_MB_Livemap.zip` into the Farming Simulator mods folder and opens the dashboard. They enable **MB Livemap Bridge** once in the mod list. Closing the window stops it.

If [Inno Setup 6](https://jrsoftware.org/isinfo.php) is installed, the same script also writes `release\out\MB-Livemap-Setup.exe`.

`release\StartLivemap.bat` is the developer launcher. It still needs Node.js and runs the live dev servers.

## Install the FS25 mod by hand

1. Run `release\CreateMod.bat` and copy `release\FS25_MB_Livemap.zip` to `%USERPROFILE%\Documents\My Games\FarmingSimulator2025\mods\`.
2. Double-click `release\StartLivemap.bat` before you load a save. It starts the bridge and the dashboard, then opens http://127.0.0.1:43127. Leave those two windows open while you play.
3. Enable **MB Livemap Bridge** in the mod selection screen and load a savegame.

See `mod/README.md` for protocol notes. The game must be restarted after updating the mod zip.

## Repo layout

| Path | Role |
|------|------|
| `mod/` | FS25 Lua mod — snapshots + whitelisted commands |
| `server/` | Named-pipe ↔ WebSocket bridge, state cache, mock injector |
| `web/` | Next.js tablet UI (home livemap, productions, animals) |
| `examples/` | Reference mods used while building this one |
| `release/` | Installer script, player packaging, and built packages |

## Commands (whitelist)

From the vehicle sheet on the livemap:

- `engine.start` / `engine.stop`
- `attach` / `detach` (requires FS25 API support; may return unsupported)

Unknown actions are rejected by the bridge and the mod.

AutoDrive adds destination listing plus `autodrive.start` / `autodrive.stop` (including a fieldwork mode that runs a Courseplay course). Courseplay adds the saved-course list plus `courseplay.start` / `courseplay.stop`. Precision Farming adds soil type, pH, and nitrogen on each field. Those show up only while the corresponding mod is loaded.

## AI / MCP

An MCP server in `server/` lets an assistant read fields, vehicles, weather, the crop calendar, productions, and animals, and run the same whitelisted commands. Start the bridge first (`npm run dev`, `npm run mock`, or the desktop app). It serves Streamable HTTP MCP at `http://127.0.0.1:18767/mcp` in development and `http://127.0.0.1:43127/mcp` for the packaged app. That is the server URL for a client that asks for one. Cursor can instead enable the **mb-livemap** stdio server from `.vscode/mcp.json`. Set `MB_LIVEMAP_HTTP` when that stdio server should talk to a bridge on another address.

AutoDrive commands are `list_autodrive_destinations`, `start_autodrive`, and `stop_autodrive`. Courseplay commands are `list_courseplay_courses`, `start_courseplay`, and `stop_courseplay`. They stay in the tool list; a call returns an error when that mod is not loaded. Precision Farming adds soil type, pH, and nitrogen on the field tools while it is active. The server is not part of the player installer.

## Map background

Place an optional top-down map PNG at `web/public/map-overlay.png` (from your map pack). Vehicles and field tints still work without it.

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `MB_LIVEMAP_TCP_PORT` | `18765` | Legacy TCP port (unused by the FS25 mod) |
| `MB_LIVEMAP_PIPE` | `\\.\pipe\mb-livemap` | Named pipe the mod writes to |
| `MB_LIVEMAP_SETTINGS_DIR` | `Documents/My Games/FarmingSimulator2025/modSettings/FS25_MB_Livemap` | Command and session XML |
| `MB_LIVEMAP_WS_PORT` | `18766` | Browser WebSocket port |
| `MB_LIVEMAP_HTTP_PORT` | `18767` | Health / mock control HTTP |
| `MB_LIVEMAP_MOCK` | unset | `1` to enable mock injector |
| `MB_LIVEMAP_TOKEN` | unset | Optional WS auth token |
| `MB_LIVEMAP_HTTP` | `http://127.0.0.1:18767`, then `:43127` | Bridge URL for the MCP server |
| `NEXT_PUBLIC_WS_URL` | `ws://<host>:18766` | Override WS URL in the webapp |

## Out of scope (v1)

Multiplayer / dedicated server sync, economy, missions, cloud hosting.

## License

Personal / local use with your FS25 install. Not affiliated with Giants Software.
