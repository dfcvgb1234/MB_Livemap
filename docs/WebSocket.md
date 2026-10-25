# WebSocket

A custom page talks to the MB Livemap bridge with one WebSocket. Each message is one JSON object, as a text frame. The bridge is the server. Your app is the client.

This page is the contract for that socket. [How it works](How-it-works.md) explains where the data comes from.

## Where to connect

| How the bridge was started | WebSocket | HTTP |
|----------------------------|-----------|------|
| `npm start`, `npm run dev`, or `npm run mock` in `server/` | `ws://<computer>:18766` | `http://<computer>:18767` |
| The packaged **MB Livemap** program | `ws://<computer>:43127` | `http://<computer>:43127` |

On the computer that runs the game, `<computer>` is `127.0.0.1`. From a phone on the same Wi-Fi, use that computer's Wi-Fi address. The socket is open on the LAN. By default any client that can reach the port can read the farm and send commands. Set `MB_LIVEMAP_TOKEN` on the bridge to require a token: pass it as `?token=` on the WebSocket URL, or as the header `x-mb-livemap-token`. A wrong token gets `{ "type": "error", "message": "Unauthorized" }` and the socket closes with code 1008.

The packaged program's firewall rule allows port 43127 on private networks. A development bridge uses 43127 for the bundled page and 18766 for this socket.

## When you connect

The bridge keeps the latest farm in memory. As soon as the socket opens it sends four messages, in this order:

1. `status`
2. `state` — the whole farm, even if nothing has changed
3. `autodrive`
4. `courseplay`

After that it pushes a new message whenever the farm, the network, a command result, or a notification changes. Keep the last `state`, the last `autodrive`, and the last `courseplay`. Replace each one when a newer message of that type arrives.

`state` is always a complete farm. The game mod often sends only the group it just refreshed. The bridge merges that into its cache before your client sees it. Apply `state` by replacement.

Notifications are not replayed. A client only hears the ones that happen while it is connected.

There is no hello message to send. Connecting is enough. You may send `ping`.

## Messages from the bridge

Every object has a `type` string.

### `status`

```json
{ "type": "status", "modConnected": true, "mockActive": false, "lastStateTs": 120450 }
```

| Field | Meaning |
|-------|---------|
| `modConnected` | The game mod's pipe is open. |
| `mockActive` | The sample farm is running. A real save connecting stops it. |
| `lastStateTs` | `ts` from the latest `state`, or `null` before the first one. |

While `modConnected` is false the bridge keeps serving the last farm. Commands then fail with `Mod not connected`.

### `state`

The farm. `source` is `"mod"` for a real save and `"mock"` for the sample farm.

```json
{
  "type": "state",
  "ts": 120450,
  "source": "mod",
  "mapName": "MapUS",
  "mapSize": 2048,
  "customEnvironment": "",
  "mapDirectory": "C:/.../maps/mapUS/",
  "missionDirectory": null,
  "calendar": { "period": 8, "day": 3, "daysPerPeriod": 1 },
  "multiplayer": true,
  "localFarmId": 1,
  "farms": [{ "id": 1, "name": "My farm", "color": "#e2b657", "balance": 150000, "loan": 0, "equity": 150000 }],
  "players": [{ "id": "1", "name": "Player", "x": 12.5, "z": -40.0, "heading": 1.2, "farmId": 1 }],
  "vehicles": [],
  "weather": { "condition": "SUN", "temperatureC": 18, "hourly": [], "daily": [] },
  "fields": [],
  "productions": [],
  "animals": []
}
```

`multiplayer`, `localFarmId`, `farms`, and `players` are present on a hosted multiplayer game. A single-player save omits them.

`ts` from a real save is the mission clock in milliseconds, from when the save became active. The sample farm uses the computer's clock. `calendar.period` is the month, 1 for January through 12 for December.

`mapSize` is the terrain width in meters. The playable square runs from `-mapSize / 2` to `+mapSize / 2` on both X and Z. `customEnvironment` is empty on the base-game maps. `mapDirectory` and `missionDirectory` are game paths; a path that starts with `$pdlc` is not a file on disk.

#### Vehicle

| Field | Meaning |
|-------|---------|
| `id` | String. Use this in commands. It is the game's vehicle id. |
| `name` | Display name. |
| `type` | Game type name, or `null`. |
| `category` | `vehicle`, `trailer`, or `implement`. Older builds omitted this; treat a missing value as `vehicle`. |
| `x`, `z` | World meters. |
| `heading` | Yaw in radians. 0 faces world +Z, which is down the in-game map. |
| `speed` | Kilometers per hour. |
| `engineOn` | Motor is started. |
| `occupied` | A player is entered in it. |
| `attached` | Names of the tools currently attached. These are names, for display. |
| `fills` | Tanks on the vehicle and on attached tools. Liters. |
| `damage` | 0 fresh to 1 worn out. Omitted when the game has no figure. |
| `farmId`, `farmName` | Owner, on a hosted game. |
| `adCapable` | Present and `true` when the vehicle has AutoDrive. |
| `adActive`, `adDestination`, `adSecondDestination`, `adMode` | The AutoDrive job, when one is running. |
| `adFillTypes` | `{ "id", "name" }[]`. `id` is the fill-type index as a string. Send that `id` as `fillType` on `autodrive.start`. |
| `cpCapable`, `cpActive`, `cpCourse` | Courseplay, same idea. `cpCourse` is the course name while one is loaded. |

`adMode` is `drive`, `pickup`, `deliver`, `load`, `unload`, or `fieldwork`.

A fill:

| Field | Meaning |
|-------|---------|
| `name` | Label. On a tool this can include the tool name. |
| `fillLevel`, `capacity` | Liters. `null` when unknown. |
| `fillType` | Game fill name, such as `DIESEL` or `SEEDS`. |
| `role` | On an animal pen, `input` or `output`. |
| `usage` | On an animal pen, `food`, `water`, `straw`, or `product`. |

#### Field

| Field | Meaning |
|-------|---------|
| `id` | String. Stable for the save. |
| `name` | Number shown on the in-game map, when the mod can read it. |
| `fruitType` | Crop name, or `null`. |
| `fruitColor` | CSS color from the game's fruit color, when sent. |
| `growthState`, `growthMax` | Growth index and the top of the scale. |
| `cropState` | `Growing`, `Ready to harvest`, `Withered`, `Harvested`, or a ground label. |
| `owned` | |
| `x`, `z` | A point on the field, world meters. |
| `polygon` | Outline as `{ "x", "z" }[]`, or `null` until a scan or the game provides one. |
| `areaHa` | Hectares. |
| `needsRolling`, `needsFertilizer`, `needsSpraying`, `needsPlowing`, `needsLime`, `needsStones` | `null` when that mechanic is turned off. |
| `fertilizerLevel`, `fertilizerMax` | Applications already on the field. Vanilla game. |
| `weeds` | `None`, `Growing`, `Small`, `Medium`, `Large`, `Partial`, or `Withered`. |
| `precisionFarming` | Present while Precision Farming is loaded. |

`precisionFarming` contains `soilType`, `ph`, `phStatus` (`Low`, `Optimal`, or `High`), `nitrogen` (kilograms per hectare), and `nitrogenTarget`.

#### Weather

`condition` is a game weather name such as `SUN`, `RAIN`, `CLOUDY`, `SNOW`, `PARTIALLY_CLOUDY`, `THUNDER`, `HAIL`, or `TWISTER`.

`hourly` and `daily` are lists of:

| Field | Meaning |
|-------|---------|
| `label` | Hour or day label from the game. |
| `type` | Weather name, or `null`. |
| `temperatureC`, `lowTemperatureC`, `highTemperatureC` | Celsius. |
| `windRotation` | Radians. |
| `windVelocity` | Beaufort number. |

#### Production

| Field | Meaning |
|-------|---------|
| `id`, `name` | |
| `status` | Point status, such as `RUNNING`, `MISSING_INPUTS`, `NO_OUTPUT_SPACE`, or `INACTIVE`. |
| `lines` | `{ "name", "status", "enabled" }`. `enabled: false` means the player switched the recipe off. |
| `inputs`, `outputs` | Fills, in liters. |

#### Animal pen

| Field | Meaning |
|-------|---------|
| `id`, `name`, `animalType` | |
| `count`, `capacity` | Animals in the pen, and the pen size when known. |
| `health` | Average health, in the game's units. |
| `productivity` | Percent. Empty for horses and pigs. |
| `herds` | `{ "name", "count" }[]`, the age or breed groups. |
| `fills` | Food, water, straw, and products. |
| `palletBlocked` | Output pallets are blocking the pen. |
| `x`, `z` | World meters, or `null`. |

### `autodrive`

Sent when the network changes, and once when you connect.

```json
{
  "type": "autodrive",
  "available": true,
  "revision": 3,
  "waypoints": [{ "id": 1, "x": 10.0, "z": 20.0, "out": [2, 5] }],
  "markers": [{ "id": 4, "name": "Farm silo", "x": 10.0, "z": 20.0 }]
}
```

`available` is false when AutoDrive is not loaded. `revision` increases when the mod rebuilds the message. `waypoints[].out` lists the waypoint ids you can drive to from that point. `markers[].id` is the destination id. Send it as a string in `targetId` when you start a drive.

`GET /autodrive` on the HTTP port returns `available` and `markers` only. The road network is on this WebSocket message.

### `courseplay`

```json
{
  "type": "courseplay",
  "available": true,
  "revision": 2,
  "courses": [
    {
      "id": "C:/Users/.../FS25_Courseplay/Courses/Field 12.xml",
      "name": "Field 12",
      "folder": "Courses",
      "vehicles": 1
    }
  ]
}
```

`id` is the full path of the saved course. That path is what you send as `targetId` to start it. `vehicles` is how many vehicles the course was generated for, from 1 to 5. `available` is false when Courseplay is not loaded.

### `notification`

A live event from AutoDrive or Courseplay. Not replayed on connect.

```json
{
  "type": "notification",
  "id": "…",
  "kind": "arrived",
  "level": "info",
  "text": "Tractor arrived at Farm silo",
  "vehicleId": "42",
  "vehicleName": "Tractor",
  "ts": 130000
}
```

`kind` is `arrived`, `stuck`, `problem`, `info`, or `finished`. `level` is `info`, `warn`, or `error`. `vehicleId` and `vehicleName` are omitted when the event is not about one vehicle.

### `commandResult`

The answer to a `command`. The `id` matches the id you sent.

```json
{ "type": "commandResult", "id": "…", "ok": true }
```

On failure, `ok` is false and `error` is a short sentence. A successful `field.sample` also includes `field`, with the same crop and care fields as a field in `state` (no id, name, or polygon).

The bridge delivers the result to the socket that sent the command, and also to every connected socket. The sender can see the same `id` twice. Treat a repeated id as the same result.

A field scan answers late. The bridge waits up to 60 seconds for `field.scan` and 8 seconds for every other action, then sends `ok: false` and `error: "Command timed out waiting for mod"`. The outline itself arrives in a later `state`, not inside the result.

### `error`

A message your client sent could not be used: invalid JSON, a command missing `id`, `action`, or `vehicleId`, a scan missing `x` and `z`, or a rejected token. `message` explains which.

### `pong`

Answer to `ping`. `ts` here is the computer's clock in milliseconds.

```json
{ "type": "pong", "ts": 1730000000000 }
```

## Messages you can send

### `command`

```json
{
  "type": "command",
  "id": "8f1c…",
  "action": "engine.start",
  "vehicleId": "42"
}
```

`id` is your id. A UUID is a good choice. The result comes back with the same id.

| `action` | Required | Also accepted |
|----------|----------|----------------|
| `engine.start` | `vehicleId` | |
| `engine.stop` | `vehicleId` | |
| `attach` | `vehicleId`, `targetId` | `targetId` is the other vehicle's `id`. |
| `detach` | `vehicleId` | Detaches the first implement on that vehicle. |
| `autodrive.start` | `vehicleId` | See below. |
| `autodrive.stop` | `vehicleId` | |
| `courseplay.start` | `vehicleId`, `targetId` | `targetId` is the course `id` (the file path). |
| `courseplay.stop` | `vehicleId` | |
| `field.scan` | `x`, `z` | World meters. `vehicleId` may be `""`. |
| `field.sample` | `x`, `z` | Returns the crop and care at that point. |

Anything else is rejected with `Unsupported action: …`.

`autodrive.start` defaults to mode `drive`.

| `mode` | What else to send |
|--------|-------------------|
| `drive` | `targetId`: destination marker id, as a string. |
| `deliver` | `targetId`: destination marker id. |
| `pickup` | `targetId`, `secondTargetId`, and `fillType`. |
| `load` | `targetId`, `secondTargetId`, and `fillType`. |
| `unload` | `targetId` and `secondTargetId`. |
| `fieldwork` | `targetId`: a Courseplay course id. Optional `cpStart` and `cpLane`. |

`fillType` is the `id` from that vehicle's `adFillTypes`. `cpStart` is `first`, `nearest`, or `last`. Omitted, the course starts at the first waypoint. `cpLane` is the lane: negative is left, positive is right, `0` is the middle.

`courseplay.start` takes the same `cpStart` and `cpLane`.

On a hosted game the mod runs the command only when the vehicle belongs to the host's farm. Otherwise the result is `Vehicle is not on your farm`.

Common failures, in `error`:

| `error` | Meaning |
|---------|---------|
| `Mod not connected` | The save is not running, or the mod cannot see the pipe. |
| `Command timed out waiting for mod` | The mod did not answer in time. |
| `Vehicle not found` | That `vehicleId` is not in the current save. |
| `Vehicle does not support AutoDrive` / `Courseplay` | The specialization is absent on that vehicle. |
| `AutoDrive is not loaded` / `Courseplay is not loaded` | That mod is not in the save. |
| `Unknown destination` / `Unknown course` | The marker id or course path is not in the last list. |
| `AutoDrive is already running` / `Courseplay is already running` | Stop it before starting another job. |

### `farmFilter`

On a hosted game, choose which other farms are included in the vehicle list.

```json
{ "type": "farmFilter", "farmIds": [2, 3] }
```

`farmIds` is a list of farm ids. The host's own farm is always included, and so is equipment with no owner. An empty list leaves only those. There is no reply; the next `state` is the filtered list. A single-player save ignores this.

### `ping`

```json
{ "type": "ping" }
```

The bridge answers with `pong`.

## Drawing the map

World X increases to the right of the in-game map. World Z increases toward the bottom. The terrain is a square of `mapSize` meters centered on the origin, so a point at `(-mapSize / 2, -mapSize / 2)` is the top-left of the terrain.

For a view that is `span` meters across and starts at `minX`, `minZ`:

```
leftPercent = (x - minX) / span * 100
topPercent  = (z - minZ) / span * 100
```

Use at least `mapSize` for the span. Grow it if a field outline or an AutoDrive road sits outside the terrain, and keep a small margin so the outer fields are not clipped. Vehicles can sit outside the terrain; leave them out of the span calculation or the map will resize as they drive.

A heading of 0 points down the map (+Z). Rotate the vehicle icon by `heading` in radians.

The bundled page can also show a picture of the map. That picture is optional and is not part of `state`. A client that wants it can `GET /api/map-overlay.png` on the HTTP port.

## A minimal client

```js
const ws = new WebSocket("ws://127.0.0.1:18766");

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "state") {
    // Replace the farm you are showing.
  } else if (msg.type === "autodrive") {
    // Replace the road network.
  } else if (msg.type === "courseplay") {
    // Replace the course list.
  } else if (msg.type === "commandResult") {
    // Match msg.id. Ignore a second copy of the same id.
  } else if (msg.type === "notification") {
    // Show msg.text.
  } else if (msg.type === "status") {
    // msg.modConnected tells you whether the save is on the pipe.
  }
};

function startEngine(vehicleId) {
  ws.send(JSON.stringify({
    type: "command",
    id: crypto.randomUUID(),
    action: "engine.start",
    vehicleId,
  }));
}
```

Against the packaged program, open `ws://<computer>:43127` instead.

## HTTP beside the socket

These are useful for a script that wants one response. They follow the same JSON shapes.

| Method and path | Who can call it | Body |
|-----------------|-----------------|------|
| `GET /health` | Anyone who can reach the port | `ok`, ports, `modConnected`, `mockActive`, `lastStateTs` |
| `GET /state` | Anyone | The same object as a `state` message |
| `GET /autodrive` | Anyone | `{ available, markers }` — destinations only |
| `GET /courseplay` | Anyone | `{ available, courses }` |
| `POST /api/command` | This computer only | A command object. The response is the `commandResult`, after the mod answers. |
| `GET /api/settings` and `PUT /api/settings` | Anyone who can reach the port | The bundled page's settings, including how often the mod reads the game |
| `GET /api/connect` | Anyone | Wi-Fi addresses and QR codes for the bundled page |

Send commands from a phone or another computer through the WebSocket. `POST /api/command` refuses any caller that is not on this computer.

The sample farm, if you are developing the bridge, is `POST /mock/start` and `POST /mock/stop` on the HTTP port. The packaged program leaves those routes off.
