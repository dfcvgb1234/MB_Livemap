# MB Livemap Bridge (FS25 Mod)

Lua mod that streams farm state to the local Node bridge and accepts whitelisted vehicle commands.

## Install

1. Copy this entire `mod/` folder into your FS25 mods directory as `FS25_MB_Livemap`:

   - **Windows**: `%USERPROFILE%\Documents\My Games\FarmingSimulator2025\mods\FS25_MB_Livemap`
   - **macOS / Proton / Linux**: follow your FS25 mods path for FarmingSimulator2025

2. Start the bridge first (`cd server && npm run dev`). Use `npm run mock` only for UI testing without the game.
3. Enable **MB Livemap Bridge** in the FS25 mod selection screen and load a savegame.
4. After changing this mod, replace `FS25_MB_Livemap.zip` in the mods folder and restart the game.

## Requirements

- Farming Simulator 2025 on Windows
- Local bridge hosting named pipe `\\.\pipe\mb-livemap`
- FS25's Lua sandbox has no sockets, so the mod does not use LuaSocket. It writes JSON lines to that pipe. The bridge writes vehicle commands to `modSettings/FS25_MB_Livemap/commands.xml`, which the mod reads with the game's XML API.

## Protocol

The mod writes one JSON object per line to the named pipe. Commands come back through `commands.xml`. The bridge turns that into the WebSocket a page connects to.

Message shapes, fields, and the command list are in [docs/WebSocket.md](../docs/WebSocket.md). How the pieces connect is in [docs/How-it-works.md](../docs/How-it-works.md).

## API gaps

Where Giants APIs are missing or unverified, fields are sent as `null`. The web UI labels those as unsupported rather than inventing values. Attach needs a `targetId`. Some field outlines stay empty until a `field.scan` command traces them.
