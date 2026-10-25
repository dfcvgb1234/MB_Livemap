# How MB Livemap works

MB Livemap is three programs on the same Windows PC as Farming Simulator 25.

```
Farming Simulator
  Lua mod  FS25_MB_Livemap
      |  one JSON object per line, on \\.\pipe\mb-livemap
      v
  Node bridge
      |  one JSON object per WebSocket message
      v
  The farm page, a tablet, or your own app
```

The mod reads the running save and writes snapshots. The bridge keeps the latest snapshot and sends it to every connected page. Commands travel back through a small XML file, because the game's Lua sandbox can read files with the engine XML API and can write the named pipe.

The bridge has to run on the computer that is running the game. The pipe is local to that computer. A phone on the same Wi-Fi only opens the page.

## Why a named pipe

Farming Simulator 25 does not let a mod load LuaSocket. On Windows the mod opens `\\.\pipe\mb-livemap` and writes UTF-8 JSON lines. The bridge hosts that pipe.

The bridge also listens on TCP port 18765. The shipping mod leaves that port alone and uses the pipe. A client that does have sockets can speak the same line protocol there.

Each line is one JSON object. The mod sends:

| `type` | When |
|--------|------|
| `state` | A farm snapshot. Often only the groups that were due. |
| `autodrive` | The AutoDrive road network, when it changes. |
| `courseplay` | The saved Courseplay course list, when it changes. |
| `notification` | An AutoDrive or Courseplay event. |
| `commandResult` | The answer to a command. |
| `hello` | Once, when the pipe connects. The bridge answers with `{ "type": "hello", "client": "bridge" }`. |

A WebSocket client never speaks this pipe protocol. The bridge turns it into the messages in [WebSocket](WebSocket.md). In particular, a `state` line from the mod may contain only vehicles, or only fields. The bridge folds that into the last complete snapshot and sends the **whole** snapshot to every page. A page replaces its copy on each `state` message.

## What the mod reads

The mod starts when a save loads and stops when the save ends (`mod/register.lua`). It keeps its own clock and sends each group on its own interval. The Normal profile is:

| Group | Every |
|-------|-------|
| Vehicles, players, farms, and the in-game date | 400 ms |
| Weather | 5 s |
| Fields | 5 s |
| Productions | 5 s |
| Animals | 5 s |
| AutoDrive network | 2 s, and only when the network changed |
| Courseplay course list | 2 s, and only when the list changed |

The first moment the pipe connects, the mod sends every group once.

The farm page can switch this to High, Low, or a custom profile. The bridge writes `performance.xml` in the mod settings folder, and the mod picks it up within about a second. High reads vehicles every 100 ms. Low reads them every 1 s. The limits are in `server/src/settingsStore.ts` and `mod/src/LivemapBridge.lua`.

Where the game does not report a value, the field is `null` or left out. The page shows that as unknown.

### Vehicles

Every vehicle, trailer, and tool the game still has in the world. `category` is `vehicle` for something you can drive, `trailer` for a cargo trailer, and `implement` for a tool. Attached tools are also listed on the vehicle that pulls them, by name, in `attached`. Fuel, DEF, and cargo are in `fills`, in liters.

Position is the world position of the vehicle root, in meters. The map is centered on the origin. World +Z points down the in-game map. `heading` is the game's yaw in radians; 0 faces +Z. `speed` is kilometers per hour. `damage` runs from 0 (fresh) to 1 (worn out) when the game reports it.

### Fields

Owned fields, with crop, growth, area, and the fieldwork the game says is still due: rolling, fertilizer, spraying, weeds, plowing, lime, and stones. A need is `null` when that mechanic is turned off, so a page can hide it. Weed names follow the game: None, Growing, Small, Medium, Large, Partial, Withered.

`polygon` is the field outline in world meters. Some fields have no outline until someone asks for one. The `field.scan` command traces the outline at a world position and, when it finishes, the next `state` includes that field.

With the Precision Farming mod loaded, each field also carries `precisionFarming`: soil type, pH, and nitrogen in kilograms per hectare.

### Weather, productions, animals

Weather is the current condition plus the game's hourly and daily forecast. Temperature is Celsius. Wind speed is the Beaufort number. Wind direction is radians.

Productions are the owned production points: each recipe line, and the input and output tanks in liters. A line status is a game name such as `RUNNING`, `MISSING_INPUTS`, `NO_OUTPUT_SPACE`, or `INACTIVE`. `enabled: false` means the player switched that recipe off.

Animal pens include the herd counts, average health as the game stores it, food and water, and products. `productivity` is a percent. Horses and pigs leave it empty. `palletBlocked` is true when pallets are sitting in the output and blocking the pen.

### The in-game date

`calendar.period` is the calendar month, 1 for January through 12 for December. The game's own period starts in March; the mod converts it before sending. `day` is the day inside that month, and `daysPerPeriod` is the month length from the save.

`ts` on a live snapshot is the mission clock in milliseconds (`g_time`), counted from when the save became active. The sample farm uses the computer's clock instead. Compare `ts` with other messages from the same source.

## Commands back into the game

A page sends a command over the WebSocket. The bridge checks that the action is on its list, then writes one command to:

`Documents\My Games\FarmingSimulator2025\modSettings\FS25_MB_Livemap\commands.xml`

The mod polls that file about every 200 ms, runs the action, deletes the file, and writes a `commandResult` line back up the pipe. The bridge forwards that result to the pages.

One command is in the file at a time. The bridge waits until the file is gone, or older than 10 seconds, before it writes the next one. A vehicle command that gets no answer within 8 seconds is reported as timed out. A field outline scan gets 60 seconds, because it walks the density map across many frames.

The actions are listed in [WebSocket](WebSocket.md). The mod refuses anything else. In a hosted multiplayer game it also refuses a vehicle that belongs to another farm.

## Optional mods

AutoDrive, Courseplay, and Precision Farming are read when they are loaded in the same save. With AutoDrive absent, the bridge still sends `{ "type": "autodrive", "available": false }`. Courseplay does the same with `courseplay`. Precision Farming fields are simply absent from each field.

AutoDrive destinations and the road network come from AutoDrive's graph. Courseplay courses are the saved course files for the current map. Starting AutoDrive in `fieldwork` mode hands the vehicle a Courseplay course.

The bridge watches the saved course files. When one is newer than the list it last received, it asks the mod to send the list again.

## Hosted multiplayer

On a hosted game the vehicle snapshot also includes:

- `multiplayer: true`
- `localFarmId`, the farm the host is playing
- `farms`, with name, color, balance, loan, and equity
- `players`, with name and position
- `farmId` and `farmName` on each vehicle

The host farm is always included. Equipment with no farm is included. Other farms are included when a page asks for them with a `farmFilter` message. The bridge stores that choice in `farms.xml`, and the next vehicle snapshot follows it. A single-player save omits the multiplayer fields, and every vehicle can take commands.

The bridge and the mod run in the host's game on that Windows PC. A dedicated server on another machine is outside this setup.

## What the bridge adds

- It merges partial snapshots into one cache and fans that cache out to every WebSocket client.
- On connect, a client receives the current status, the full farm, the AutoDrive network, and the Courseplay list. Notifications are live only; a client that connects later does not receive the old ones.
- It serves `GET /health`, `GET /state`, `GET /autodrive`, and `GET /courseplay` for a client that wants a single JSON response. `GET /autodrive` returns destinations only. The WebSocket `autodrive` message is the one that includes the road network.
- It can build a map image from the map's overview picture, or from a PNG, JPEG, or WebP the player uploads. That image is for the bundled page.
- It copies `FS25_MB_Livemap.zip` into the mods folder when the packaged program starts, and writes a session id. The mod reconnects the pipe when that id changes, so restarting the bridge is picked up without reloading the save.

`POST /api/command` and `/mcp` accept connections from this computer only. A phone or a second app on the network sends commands through the WebSocket.

## The packaged program

`MB Livemap.exe` opens a small window and a tray icon, then starts a private Node runtime on `bridge.cjs`. The program accepts network connections on port **43127** and forwards them to that runtime, which listens only on this computer. The first time a phone or tablet connects, Windows Firewall asks to allow MB Livemap. The program does not ask for administrator access. The development layout uses three ports: the page on 43127, the WebSocket on 18766, and HTTP on 18767.

The window can be minimized. The icon by the clock brings it back. Closing the window stops the bridge. Starting the program again while it is already running brings that window back and opens the page.

## Files on disk

| Path | Role |
|------|------|
| `mod/` | The Lua mod |
| `server/` | The bridge |
| `web/` | The farm page |
| `release/` | The scripts that zip the mod and build the player folder |
| `Documents\My Games\FarmingSimulator2025\mods\FS25_MB_Livemap.zip` | The mod the game loads |
| `Documents\My Games\FarmingSimulator2025\modSettings\FS25_MB_Livemap\` | `commands.xml`, `session.xml`, `farms.xml`, `performance.xml`, `coursewatch.txt`, and the page's saved settings |

Logs for the packaged program are in its `app\logs\bridge.log`.
