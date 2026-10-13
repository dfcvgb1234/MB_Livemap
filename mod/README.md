# MB Livemap Bridge (FS25 Mod)

Lua mod that streams farm state to the local Node bridge and accepts whitelisted vehicle commands.

## Install

1. Copy this entire `mod/` folder into your FS25 mods directory as `FS25_MB_Livemap`:

   - **Windows**: `%USERPROFILE%\Documents\My Games\FarmingSimulator2025\mods\FS25_MB_Livemap`
   - **macOS / Proton / Linux**: follow your FS25 mods path for FarmingSimulator2025

2. Start the bridge first (`cd server && npm run mock` or `npm run start`).
3. Enable **MB Livemap Bridge** in the FS25 mod selection screen and load a savegame.

## Requirements

- Farming Simulator 2025
- Local bridge listening on `127.0.0.1:18765`
- LuaSocket available to the game Lua VM (common on Windows builds). If socket is missing, the mod logs a warning and does not stall the game — use the bridge mock injector for UI development.

## Protocol

JSON lines over TCP:

- Outbound: `{ "type":"state", ... }`
- Inbound commands: `{ "type":"command", "id":"...", "action":"engine.start|engine.stop|attach|detach", "vehicleId":"..." }`
- Ack: `{ "type":"commandResult", "id":"...", "ok":true|false }`

## API gaps

Where Giants APIs are missing or unverified, fields are sent as `null` (forecast, field polygons, some animal productivity metrics, attach without `targetId`). The web UI labels those as unsupported rather than inventing values.
