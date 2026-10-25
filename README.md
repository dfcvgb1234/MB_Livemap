# MB Livemap

MB Livemap shows your Farming Simulator 25 farm in a web page. Open it on the computer you play on, or on a phone or tablet on the same Wi-Fi.

The page shows your vehicles, fields, weather, productions, and animals. From a vehicle you can start and stop the engine. If AutoDrive or Courseplay is in your mod list, you can start those from the page too. Precision Farming soil, pH, and nitrogen show up while that mod is loaded.

## Play

You need Windows and Farming Simulator 25.

1. Download **MB Livemap.zip** from the [latest release](https://github.com/dfcvgb1234/MB_Livemap/releases).
2. Extract the zip into a folder you choose. Leave those files where they are. MB Livemap runs from that folder.
3. In the extracted files, open the `mod` folder and copy `FS25_MB_Livemap.zip` into your Farming Simulator mods folder: `Documents\My Games\FarmingSimulator2025\mods`. If the game is already open, close it first so it picks up the new mod.
4. Double-click **MB Livemap.exe**. A small window opens and stays open, and the farm page opens in your browser. An icon also sits by the clock. Double-click that icon to bring the window back after you minimize it.
5. The page on this computer opens without an administrator prompt. The first time a phone or tablet on your Wi-Fi connects, Windows Firewall asks whether to allow **MB Livemap**. Click **Allow access**. That question is from Windows Firewall. MB Livemap does not ask to run as administrator, and this computer's page still works if you click **Cancel**.
6. Start Farming Simulator. On the screen where you choose mods, turn on **MB Livemap Bridge**, then load your save. When the save has loaded, go back to the browser. The map fills in on its own.

Leave the MB Livemap window open while you play. You can minimize it. To turn the page off, close that window or click **Stop**. The game keeps running.

**On a phone or tablet:** join the same Wi-Fi as the computer. On the farm page, tap the tablet icon and scan the code with the camera. The game stays on the computer. The phone only shows the page.

Windows asks that firewall question when the Wi-Fi is a private network. If the phone cannot open the page, set the computer's Wi-Fi to a private network: Windows Settings, Network and internet, Wi-Fi, your network name, then Private. A public network blocks the phone without asking. If you chose Cancel earlier, allow MB Livemap on private networks under Windows Security, Firewall and network protection, Allow an app through firewall.

## Run it from this project

This uses the files in the repository. Install [Node.js 22](https://nodejs.org), then put the mod in the game:

1. Double-click `release\CreateMod.bat`.
2. Copy `release\FS25_MB_Livemap.zip` to `Documents\My Games\FarmingSimulator2025\mods`.
3. In the game, turn on **MB Livemap Bridge** and load a save. After you replace that zip, restart the game.

Double-click `release\StartLivemap.bat`. The first time, it installs the dependencies, starts the bridge and the page, and opens the browser. Leave both windows open. On a tablet, use the address the script prints. It asks Windows to allow ports 43127 and 18766 on private networks.

Or start the two programs yourself:

```bash
cd server
npm install
npm start
```

```bash
cd web
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

| What | Address |
|------|---------|
| Farm page | http://127.0.0.1:43127 |
| Live updates | ws://127.0.0.1:18766 |
| Health, state, and commands | http://127.0.0.1:18767 |

The packaged program is different: the page, the live updates, and the health address all share port **43127**.

## Develop

Two terminals, from this repository, with Node.js 22:

```bash
# Terminal 1 — bridge. Reloads when server/src changes.
cd server
npm install
npm run dev

# Terminal 2 — farm page
cd web
npm install
npm run dev
```

To work on the page with no game running, start the bridge with a moving sample farm instead:

```bash
cd server
npm run mock
```

The sample farm works on Windows, macOS, and Linux. The Farming Simulator mod itself needs Windows, because the game writes to a named pipe.

`npm start` in `server` runs the bridge once. `npm run dev` restarts it when the source changes. `npm run typecheck` checks the bridge. `npm run bundle` writes `server\dist\bridge.cjs`, which the packaged program runs.

An MCP server in `server/` can read the same farm and run the same vehicle commands. Start the bridge first. In development it is at `http://127.0.0.1:18767/mcp`. The packaged program serves it at `http://127.0.0.1:43127/mcp`. Both accept that connection from this computer only. Cursor can enable the **mb-livemap** stdio server from `.vscode/mcp.json`. Set `MB_LIVEMAP_HTTP` when that stdio server should talk to a bridge on another address. The player setup program does not include it.

Optional map picture: the page asks for one, or you can place a top-down PNG at `web/public/map-overlay.png`. Vehicles and field colors still work without it.

| Variable | Default | Meaning |
|----------|---------|---------|
| `MB_LIVEMAP_PIPE` | `\\.\pipe\mb-livemap` | Named pipe the mod writes to |
| `MB_LIVEMAP_TCP_PORT` | `18765` | Extra TCP listener. The FS25 mod uses the pipe. |
| `MB_LIVEMAP_WS_PORT` | `18766` | WebSocket port while developing |
| `MB_LIVEMAP_HTTP_PORT` | `18767` | Health, state, and settings while developing |
| `MB_LIVEMAP_PORT` | `43127` | Page, WebSocket, and HTTP of the packaged program |
| `MB_LIVEMAP_SETTINGS_DIR` | `Documents/My Games/FarmingSimulator2025/modSettings/FS25_MB_Livemap` | Command file, session file, and saved settings |
| `MB_LIVEMAP_MOCK` | unset | `1` to run the sample farm |
| `MB_LIVEMAP_TOKEN` | unset | When set, a WebSocket client must send this token |
| `MB_LIVEMAP_HTTP` | `http://127.0.0.1:18767`, then `:43127` | Bridge address for the MCP server |
| `MB_LIVEMAP_STATIC` | unset | Folder of the built page. Setting it turns on the packaged host. |
| `NEXT_PUBLIC_WS_URL` | `ws://<host>:18766` in development | Override the page's WebSocket address |
| `NEXT_PUBLIC_HTTP_URL` | `http://<host>:18767` in development | Override the page's bridge address |

## Make your own app

The page in this repo is one client. A phone, a script, or another site can open the same WebSocket, read the farm, and send the same commands. Two pages are written so they can be copied into the wiki:

- [How it works](docs/How-it-works.md) — the mod, the pipe, and the bridge
- [WebSocket](docs/WebSocket.md) — every message, with the fields a client needs

## License

Personal / local use with your FS25 install. Not affiliated with Giants Software.
