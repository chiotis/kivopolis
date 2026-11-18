# Plan: more buildings along an ancient route

Phases 1–8 of [PLAN-voxel-sandbox.md](PLAN-voxel-sandbox.md) are done, and the theatre can be built block by block. This plan carries on from there. The main point of the game is to let players build ancient buildings and areas and learn about them, so the next phases add three more, each in its own area of a larger island:

1. **The sanctuary of Dionysus**: a Doric temple and its altar, next to the theatre.
2. **The agora**: a stoa and a fountain house.
3. **The stadium**: the racetrack and the slopes the spectators sat on.

An ancient road joins every area, starting from the theatre's paths. Up to 5 players can share a game and build together, through a small room server. Survival stays at the very end.

## Order

| Phase | What | Size | Playable after? |
| --- | --- | --- | --- |
| 10 | Flowing water and the hydria | medium | Water runs above sea level, and players can carry it |
| 11 | A larger island, the ancient road, and a game with more than one building | large | Players walk the road to areas that are empty but marked |
| 12 | Multiplayer: up to 5 players in a shared room | large | Friends or a class group build the same theatre together |
| 13 | The sanctuary of Dionysus (small, 4 × 6 temple) — done | medium | The second building can be built |
| 14 | The agora: stoa and fountain house | large | The third building, with running water |
| 15 | The stadium (shortened track) | medium | The fourth building |
| 16 | Survival (last) | medium | The full gather → eat → build loop |

Phase 10 comes first because the agora's fountain house needs water that flows. Phase 11 has to come before any new building, because today the game only knows about the theatre. Multiplayer (Phase 12) comes before the new buildings, so the sanctuary, the agora and the stadium are built and tested as shared builds from the start. Phases 10 and 11 are designed to be ready for it (see "Ready for multiplayer" in each).

---

## Phase 10: Flowing water and the hydria

**Status (2026-11-16): done.** What changed from the plan above:
- Flowing water is stored as seven extra block ids (`flow1`–`flow7`, ids 23–29) instead of a separate level byte. Saves, edits and later network messages stay plain block changes, and no save format change was needed.
- Water spreads sideways only from a cell resting on solid ground, so falling water does not fan out over a pool or the sea.
- The empty hydria looks through flowing water to the nearest source; aiming at flowing water alone shows a hint. Filling takes the source, pouring places one.
- The ripples run along the flow (2026-11-17): each water vertex carries a flow direction (`flowDirection` in flow.ts, averaged at corners), and the voxel water's shader slides two copies of the ripple texture along it and cross-fades them. Sources and the sea keep the plain drift; the sides of flowing water run downwards.
- Rules: `src/voxel/flow.ts`. Ticks: `VoxelWorld.tickWater()`, driven at 4 per second from `VoxelTerrain`.
This is the work left over from Phase 8. Today water fills only cells at or below sea level (`SEA_Y`, 14), all at once, capped at 4096 cells (`VoxelWorld.flood` in `src/voxel/world.ts`). Above sea level, holes stay dry.

- **Sources and flowing water.** Water placed anywhere becomes a *source*. Flowing water runs down first, then spreads sideways up to 7 blocks, getting one level lower with each block. Each cell keeps a level from 0 to 7 next to its block id (one byte per cell, saved with the chunk). Flowing water with nothing feeding it dries up.
- **Spreading over time.** A queue of water updates is processed in fixed steps (ticks), about every 0.25 seconds, so water visibly runs instead of appearing all at once. Sea-level flooding works the same way, which removes the 4096-cell cap. The queue is rebuilt from the world when a save loads.
- **Rendering.** The water mesh takes its surface height from the cell's level, so flowing water slopes down. The ripple texture drifts along the direction of flow.
- **The hydria (υδρία), instead of a bucket.** It's a terracotta water jar: three terracotta blocks in a cup shape at the workshop. Right-clicking water fills it (the jar shows as full), and right-clicking a block face empties it as a source. A history note explains that women carried hydriai from the fountain house every day.
- **Swimming and the crosshair** work in flowing water as they do in the sea.
- **Ready for multiplayer.** The water rules live in plain TypeScript under `src/voxel/` with no React, three.js or browser APIs, so the room server can run them too. Each tick processes cells in a fixed order with no randomness and no dependence on frame time, so every machine gets the same water from the same edits. The tick counter is part of the world state.
- **Tests:** the same edits played twice give identical water; a source above sea level spreads 7 blocks on flat ground and runs down a step; removing the source dries the flow; the hydria fills and empties; a save keeps sources and levels.

## Phase 11: A larger island, the ancient road, and more than one building

**Status (2026-11-16): done.**
- The grid is 384 × 384 blocks. Within 20 units of the theatre the ground is exactly the first island's; it blends into the new land by 30 units, and the old shore now slopes into land instead of sea.
- The layout lives in `src/game/regions.ts`: the areas (sanctuary at (-31, 20), agora at (-60, 4), stadium at (24, 40)), the stream, the road, the ridge with its pass and the stadium hills. New groves grow thick on the ridge and scattered elsewhere.
- The stream is one block of still water on a gravel bed; the road crosses it on two ashlar bridges with ramps and parapets. Boundary stones flank the road at each new area, and a herm stands at the fork below the theatre.
- Save version 3 moves version 1 and 2 saves (edits and kilns) onto the new grid. Chunks are meshed nearest first, 8 ms per frame. The overview zooms out to 150 units and pans 80 units, with the haze pushed back. Generating the world takes about 0.4 s.
- More than one building: `src/game/buildings.ts` keeps the opening order (theatre → sanctuary → agora → stadium) and per-building progress (`progress.buildings`; the theatre keeps its own fields). Each new area has a signpost beside the road; E shows the building's story and whether it is open, and an open building is marked as found and listed in the journal. While the player stands in a new area, the mission panel shows that building instead of the theatre's step. The completion screen now points to the sanctuary. Buildings without a plan yet say so; their steps arrive in Phases 13–15.
- Landscape changes drawn by the user: the stream now meanders (north, bending west, back past the theatre's west side, then south-west to the sea), a bay cuts into the east coast from the north-east to the stadium, and a rocky ore hill rises north-east of the theatre at (24, -42) with bare limestone and gravel and about three times the usual copper and tin.
- Second landscape pass, from the user's review: the stream bed is now a profile worked out along the whole stream, always at least one unit below the lowest ground across its cut and never rising, so the water lies one level below its banks on the hills too. The coast is irregular: four small coves with sandy heads, cliffs on three stretches (north, the bay's north side, west-south-west) and gentle beaches elsewhere, with four walk-in sea caves in the cliffs that rise from the sea into a dry chamber. The tallest hill (about 11 units) stands north-west of the theatre between the stream and the wooded ridge.
- Ready for multiplayer: `src/game/shared.ts` holds the shared game (`useShared`: started, discovered, completed, celebrated, buildings, facts found, time, creative); `useGame` keeps this player's position, panels and camera, and the device settings. The game record is now version 3 (`shared`, `player`, `settings`); versions 1 and 2 still load. `src/game/actions.ts` applies every player change (set, break, restart, strike, tend, pickup, throw, open, slot) through `apply()`. The day clock (`stepDay` in daylight.ts) and the herd (`stepHerd` in herd.ts) step in plain code. The kiln's smelting step is plain code too (`stepKiln` in kiln.ts); the game still calls it from the Drops component.
- Tests: `tests/island.test.ts` checks the unchanged theatre valley, the shore, level and dry building areas, both bridges, a walkable road with no step over one block, and water along the stream.

### A larger island
- The grid grows from 144 × 144 to **384 × 384 blocks** (192 × 192 world units), keeping 48 blocks of height and 0.5 m blocks. The theatre stays at the origin, so world coordinates, the theatre's block plan and the player's position stay the same. That's about 7.1 million cells (7 MB) and 576 chunks instead of 81.
- **The land within 29 units of the centre stays exactly as it is** (`ground()` is unchanged there), so builds in old saves still sit on the same ground. Beyond that, the island continues to the new shore with a dedicated area for each building:
  - **the sanctuary of Dionysus**: a level terrace just below the theatre, to the south-west (widened westwards in Phase 13);
  - **the agora**: a wide flat plain near the western coast;
  - **the stadium**: a long, straight valley between two low hills to the south-east, whose slopes serve as the spectators' banks, as at Olympia.
- **Landscaping that separates the areas (decided).** Each area sits in its own hollow or terrace, and the land between them closes the view, so every building feels like its own place:
  - a **wooded ridge** of olives and cypresses between the theatre and the agora plain;
  - a **stream** that comes down from the hills, past the sanctuary, to the sea. The road crosses it on a small **stone bridge** (Phase 10's flowing water makes the stream run);
  - **low hills** around the stadium valley, which also give the spectators their slopes;
  - the road reaches each area through a **pass** or a gap between hills, where the area's marker stands.
  The heightfield gets one raised band per divider, with a gap where the road passes; the road is levelled into the slope with a gentle grade the player can walk.
- The marble quarry, the clay beaches, the copper and tin, and the olive groves stay where they are. Each new area gets its own nearby source of the materials it needs: limestone outcrops near the agora, and gravel and sand for the stadium.
- **Performance.** First-person view distance already limits what is drawn. Generating the larger world needs measuring, and should take under 1.5 s on a laptop. The overview camera and the menu draw the whole island today; they get a cheaper far version, or show only the current area.
- **Save version 3.** Chunk records store cell indices, which depend on the grid width, so every stored edit is moved by the new offset (120 blocks in x and z). The world header stores the grid size. Old saves load with their theatre intact.

### The ancient road
- A paved road (ὁδός) of `path` blocks with stone edging continues from the theatre's existing paths. It runs from the landing near the spawn point, past the theatre's west side road (parodos), down to the sanctuary, across to the agora, and along the south to the stadium. It forks to the beach where clay is found.
- Along the road: **markers (ὅροι)** at the start of each area, small boundary stones and a resting place or two. A **herm** (ἑρμῆς, a stone pillar with a carved head) stands where the road forks.
- Each area's signpost stands where the road enters it, so following the road leads to every building.
- Rough layout (north is uphill, as in the theatre):

```
                         marble quarry
                               │
            wooded         sanctuary
   agora ═══ ridge ═══ pass ── of Dionysus ── THEATRE ── landing / spawn
 (west plain)  ▲▲▲            ≈≈ stream ≈≈        │
      ║                       (stone bridge)      │
      ╚══════ road ══════ pass ── low hills ── stadium (south-east valley)

  ═ road   ▲▲▲ ridge with groves   ≈≈ stream
```

### More than one building
Today `objectives`, the signpost, the tour and saved progress are all written for the theatre (`src/game/theatre.ts`, `src/game/store.ts`, `src/game/site.ts`).
- A **list of buildings**. Each one has: an id, a title, a block plan, an ordered list of tasks with rewards, a signpost, a tour point, history notes and an area on the map. The theatre becomes the first entry and its data stays the same.
- **Progress per building.** Each building has its own discovered, celebrated and completed state. Points and the journal add up across buildings, and the journal is grouped by building.
- **Opening order (decided): one building at a time.** Each building's signpost opens once the previous building is finished. Players can still walk the whole road from the start, and locked areas show a short note about what will be built there.
- The mission panel, the plan overview (B), the "red block" warnings and the tour all follow the building whose area the player is standing in.
- **Tests:** theatre saves from version 2 load into version 3 unchanged; two buildings track progress separately; the road connects every signpost (walkability check); every area is on dry land and level enough.

### Ready for multiplayer
- **Split the store** (`src/game/store.ts`, proposed in the old plan and not done yet):
  - **shared game state**: buildings discovered, celebrated and completed, unlocks, points, history notes found, time of day, creative mode;
  - **per-player state**: position, inventory and hotbar, open panels, camera mode, photo mode;
  - **device settings**: quality, sound, field of view, sensitivity, invert-Y.
  In single-player all three stay in the browser. In multiplayer the room owns the shared state.
- **Every player change goes through actions.** Placing or breaking a block, picking up or dropping an item, using a kiln, shearing a sheep and restarting a task each become one small action object (`{ type: 'set', x, y, z, block }` and so on), applied by one function. Single-player applies actions directly; Phase 12 sends them to the room instead. Nothing else in the game writes to the world.
- **Animals and the day clock** move out of React components into plain step functions (`wildlife.ts` is already mostly there), so the server can run them.

## Phase 12: Multiplayer: up to 5 players in a shared room

**Status (2026-11-16): done.** Rooms, shared building and progress, other players, inventories kept by the room, and the deployment notes (`server/README.md`).
- `server/room.ts` (the room: checks, orders and applies changes, runs water and the clock, saves) and `server/index.ts` (WebSocket server, origin check, rate limit, heartbeat, saving every 5 s). Rooms are saved as one JSON file each instead of SQLite: no native module to build on the server, and enough for a few rooms of five.
- `src/net/`: `protocol.ts` (messages, nickname and code rules), `client.ts` (joining at boot: the room's snapshot replaces the browser's save in memory, and nothing is written to the browser's save while in a room), `sync.ts` (sends changes, shared progress, position and inventory; applies everyone else's), `roomState.ts`.
- In the game: «Παιχνίδι με φίλους» on the start menu (only when `VITE_ROOM_SERVER` is set), create or join with a nickname, the room code and players in the HUD, other players drawn in their tunic colour with a name tag, leave from the menu or pause. Only the room's creator can restart a step or switch creative play.
- Second slice (2026-11-17): nine preset phrases (T, then 1–9, or the «Φράσεις» button) shown as a toast and a bubble above the speaker; pointing (G, or from the phrase menu) marks a block for everyone with an outline and a beam in the player's colour for 8 seconds; the room's creator can remove a player, who may not rejoin for 10 minutes; a dropped connection reconnects in place with growing pauses for about two minutes, using a per-player secret token so the player takes their own place back, and the game catches up from the room's snapshot. Name tags and bubbles are canvas sprites (drei's Html overlay lost its root when the figure re-rendered).
- Third slice (2026-11-16): the room runs the dropped items, the animals and the kilns for everyone. Items: the room gives each one an id, sends new ones and what is left after a pickup, and moves them with the same `stepDrop` as the game; a broken block's drop is checked against what that block can give. Animals: the room steps the herd (`stepAnimals`) and sends their places five times a second; the game glides towards them; hitting and tending go to the room, and milk comes back to whoever tended the goat. Kilns: one player uses a kiln at a time (others are told it is in use); while it is open it burns in that player's game and its contents go to the room; once closed, or if the player leaves, it burns in the room; breaking it spills its contents and closes it for its user. Kilns are saved with the room.
- A room is kept in memory for 30 seconds after its last use, so a new room is never unloaded before its creator is in it (building the island takes about 0.4 s, and the save loop could run in that gap).
- Two-browser end-to-end test: `tests/rooms.e2e.ts` (Playwright starts its own room server on port 8788).
- Load check (2026-11-17): `npm run load-check` runs 10 rooms of 5 simulated players (positions 12 times a second, a block change every 2 s each). On a laptop: every change confirmed, 95% within 1.1 ms, about 630 messages a second in and 930 out, 7% of one core and 78 MB for server and bots together. On the CloudPanel server (`LOAD_URL=wss://rooms.kivopolis.com`, 2026-11-17): all 1,567 changes confirmed, none refused, 12 ms median and 16 ms at the 95th percentile (mostly the network), one outlier at 403 ms, 50 players joined one after another in 8.1 s.
- Old rooms are now cleaned up once a day while the server runs, not only at start-up.
Players build together in the same world. One player creates a room and gets a short code; up to 4 more join with the code and a nickname. Single-player stays exactly as it is and needs no server.

### How it is hosted
- **The game stays on Netlify** as static files. **A small Node room server runs on our own CloudPanel server**, on its own subdomain (for example `rooms.<domain>`). Browsers load the game from Netlify, then open a live connection to the room server.
- **Secure connection only:** the game is served over https, so the room server must use `wss://` with a Let's Encrypt certificate from CloudPanel.
- **nginx in front of Node** (CloudPanel's Node.js site) must let live connections through: `proxy_http_version 1.1`, `Upgrade` and `Connection "upgrade"` headers, and a read timeout of several minutes. Check the site's vhost and add these if the template does not have them.
- **PM2** keeps the server running and restarts it after a crash or reboot.
- **Storage:** one JSON file per room (decided instead of SQLite, see the status above): world edits, shared game state, each player's inventory and position, and the kilns.
- **The game finds the server** through a Netlify build setting, `VITE_ROOM_SERVER=wss://rooms.<domain>`. Without it, the multiplayer buttons are hidden.
- **The server accepts connections only** from the Netlify site's address and from localhost during development.
- **Deploying:** pull the repo on the server, build, restart with PM2. Later, a GitHub Action can do this on every merge to `main`.

### The room server (`server/`, in this repo)
- Node and TypeScript, using the `ws` package. It **imports the game's own rules** from `src/voxel/` and `src/game/` (blocks, world, water, the block plans, task counting, recipes and the kiln), so game and server never drift apart.
- **One room** holds the world (seed + edits), the shared game state, up to 5 players, the dropped items, the kilns, the animals and the clock. A room with nobody in it is saved and unloaded, and rooms unused for 60 days are deleted (at start-up and once a day).
- **The server decides the order of changes.** It checks each action (inside the world, a known block, within reach of the player), applies it with the same function the game uses, and sends it to everyone with a sequence number. If two players act on the same cell, the first to arrive wins.
- **The server runs the simulation:** water ticks (Phase 10), animals (wandering, resting, wool growing back) and the day/night clock, sending updates a few times a second.
- **Dropped items and kilns are shared.** The server owns every item on the ground, and the first player to pick it up gets it. A kiln's contents and its fire are the same for everyone who opens it.

### Messages
- **Joining:** the player sends the room code and nickname. The server answers with a snapshot: seed, edits, shared state, the player's own inventory and position, the other players, items, kilns, animals and the time.
- **Actions:** the player sends an action; the server sends the result to everyone. The player sees their own block straight away, and it is corrected if the server refuses it.
- **Movement:** each player sends position, view direction and held item about 10–15 times a second. The others are smoothed between updates.
- **Events:** task finished, history note found, building unlocked. Everyone sees the congratulations together.

### In the game
- **Start screen:** "Play alone", "Create a room" (shows the code to share) and "Join a room" (code + nickname).
- **Other players** are drawn with the third-person body, each in their own colour, with a name tag above them. The overview camera shows them too.
- **A player list** in the HUD with colours and who created the room.
- **No free text chat**, because the players are children. Instead, a few preset phrases ("Έλα εδώ", "Χρειάζομαι μάρμαρο", "Μπράβο!") and a marker you can point at a block.
- **The room creator** can restart a task (it breaks everyone's blocks), switch creative mode on or off, and remove a player.
- **Losing the connection:** the game keeps the view, tries to reconnect, and then catches up from a new snapshot.

### Privacy and safety
- No accounts, no e-mail and no personal data: a nickname of up to 16 characters, checked against a short list of banned words.
- Room codes are 6 random characters, and rooms are private to whoever has the code.
- Nothing is sent to third-party services; all room data stays on our own server.
- A short note in the game explains this for teachers and parents.

### Tests
- Server unit tests: actions are checked, ordered and applied the same way as in single-player; two players placing in the same cell; picking up the same item; the snapshot rebuilds the same world.
- An end-to-end test with two browsers in one room: both see each other, one places a block, the other's task progress goes up.
- A load check: 10 rooms of 5 simulated players on the CloudPanel server.

## Phase 13: The sanctuary of Dionysus (Ἱερὸ τοῦ Διονύσου)
Theatres stood in the sanctuary of Dionysus, so this is the natural next step.

**Status (2026-11-17): 13a done (blocks).** Six new blocks after the flowing water (ids 30–35), so saved worlds keep their ids: column drum (fluted on every side, a dowel hole in its bed), Doric capital (abacus, echinus, annulets), triglyph (painted dark blue, as temples were), metope (a plain panel), statue base (with carved letters) and bronze. Workshop recipes: 1 marble → 1 drum, 2 marble side by side → 1 capital, 2 marble stacked → 2 triglyphs, 4 marble → 4 metopes, marble–bronze ingot–marble → 2 statue bases, 1 bronze ingot → 1 bronze block. The cult statue is built block by block from bronze blocks on the statue base, like everything else. Three history notes come the first time a part is placed: the Doric column, triglyphs and metopes, bronze statues. Animals do not climb any of them. Next: 13b, the terrace and tasks 1–4.

**Status (2026-11-17): 13b done (terrace and the first four steps).**
- The terrace is centred at (-34, 20.5) with rx 11.5 and rz 8.5. The generator levels the sacred ground itself (a grass rectangle one block wider than the boundary wall) and heaps up the temple's earth core, so the krepis is built as steps round it. The road now runs through the sanctuary: in by the east gateway at the old entrance, out by the west gateway towards the pass.
- `src/game/plans.ts` holds the plans of the buildings after the theatre: steps, cells, counting from the world, materials, and restart by step id (also in rooms). The theatre's missions are unchanged.
- `src/game/blueprints/sanctuary.ts`: the boundary wall with two gateways (280 blocks), the altar (56), the krepis (560: two ashlar steps, the stylobate's 2-block marble band for the columns, and a floor of any dressed stone) and the cella with its door and porch (432). 1,328 blocks in all.
- Reading the signpost activates the plan; the mission panel, the ghost blocks, red outlines, the chime, a corner note per finished step, journal notes and restarting a step all work as for the theatre. Steps 5–8 show as still to come.

**Status (2026-11-17): 13c done, Phase 13 complete.**
- Columns (704 blocks): 16 Doric columns, 2 × 2 blocks, ten drums and a capital each, one block in from the stylobate's edge. The stylobate's marble band is now three blocks wide so every column stands on marble.
- Entablature (400): a marble architrave over the column ring, the frieze with a triglyph over every column and between them and metopes in the gaps, and a marble cornice to the stylobate's edge.
- Roof (432): terracotta in two slopes, rising one block for every two to a ridge along the temple, closed by a marble pediment at each end.
- Statue (43): a statue base at the west end of the cella and a bronze Dionysus built block by block, with the thyrsus in his right hand, facing the door.
- 2,907 blocks in all. When every step stands, the sanctuary is finished: the signpost window says so, and the agora's signpost opens (its plan comes in Phase 14). Not done: a tour of the sanctuary like the theatre's.

**Size and layout (decided 2026-11-17)**
- **Columns 2 × 2 blocks** (1 m thick), about 11 blocks tall with the capital, roughly the Doric 1 : 5.5. Axial spacing 4 blocks (a 2-block gap between columns).
- **The temple faces east**, with the altar in front of it to the east and the gateway in the boundary wall on the road, which arrives from the east.
- Footprint: the columns span 14 × 22 blocks; the stylobate 16 × 24; with the three steps of the krepis about **20 × 28 blocks (10 × 14 units)**, the long side running east–west. With the altar, the space around the temple and the boundary wall, the sacred ground needs about **44 × 28 blocks (22 × 14 units)**.
- **The terrace grows to the west.** Today it is 17 × 15 units (`regions.ts`: centre (-31, 20), rx 8.5, rz 7.5). The stream runs just east of it, so the east edge stays where it is and the terrace widens westwards to about 24 × 16 units (centre near (-34.5, 20), rx 12, rz 8). The road's exit to the agora, now at (-39.5, 20), moves to the new west edge. The island tests (level and dry area, a walkable road, entrances on the road) must still pass.

**Tasks, in order**
1. **The boundary wall (περίβολος)**: a low limestone wall around the sacred ground, with a gateway on the road.
2. **The altar (βωμός)**: an ashlar altar in front of the temple, where sacrifices took place in the open air.
3. **The stepped platform (κρηπίς)**: three marble steps; the top one is the **stylobate (στυλοβάτης)**.
4. **The cella walls (σηκός)**: the inner room, with a porch (πρόναος) at the front.
5. **The columns (κίονες)**: Doric columns stacked from column drums, each topped with a capital. **A small temple (decided): 4 columns at each end and 6 along each side**, 16 columns in all.
6. **The entablature (θριγκός)**: a plain marble beam (ἐπιστύλιον) on the columns, then the frieze of alternating grooved panels (τρίγλυφα) and plain panels (μετόπαι).
7. **The roof and the pediments (αετώματα)**: a terracotta roof and a triangular gable at each end.
8. **The cult statue**: a simple block statue of Dionysus inside the cella.

**New blocks**
- **Column drum** (marble, carved at the workshop: 1 marble → 1 drum), with fluting on its sides.
- **Doric capital** (2 marble → 1).
- **Triglyph** and **metope** (marble, carved).
- **Statue base** and **statue**: bronze, made from bronze ingots, which already exist.

**What players learn:** the parts of a temple, the Doric order, why the altar stands outside, and the link between theatre and worship.

## Phase 14: The agora (Ἀγορά)
The city's public square, where people met, traded and discussed public affairs.

**Size and layout (decided 2026-11-17)**
- **A medium stoa** along the north side of the square, facing south as real stoas did for the winter sun: 7 Doric columns of 2 × 2 blocks like the temple's, about 26 × 14 blocks, with 3 shops at the back. Roughly 1,500 blocks for the stoa.
- **Water from a spring on the hill above the agora**, brought down by a terracotta pipe that players lay, to a lion's-head spout in the fountain house. The spout runs only while the pipe joins it to the spring.
- Built in three slices, like Phase 13: **14a** the new blocks, **14b** the square, the boundary stones and the stoa with its shops, **14c** the spring, the pipe, the fountain house and the market stalls.

**Status (2026-11-17): 14a done (blocks).** Five new blocks after the temple's (ids 36–40): the lion's-head spout (a lion's head carved in a marble slab), the clay pipe (drawn as a run laid in packed earth), the pithos and the amphora (cut-out jars, like the lamp, that cannot be walked through), and the market stall (a plank counter under a striped woollen awning). Workshop recipes: 3 marble in an L → spout; 2 terracotta side by side → 2 pipes; 7 terracotta in a U → pithos; 4 terracotta in a diamond → amphora; 3 wool over 2 planks → stall. Two history notes come the first time one is placed: water for the city (clay pipes, lion-head spouts, the Enneakrounos) and the market (amphorae, pithoi, the agoranomoi). The spout does not run water yet; that comes with the pipe network in 14c.

**Status (2026-11-17): 14b done (square and stoa).** The agora is a plan like the sanctuary (`src/game/blueprints/agora.ts`), with seven steps: the boundary stones, the stoa's floor and walls, the colonnade, the shops, and the entablature and roof, then two still to come in 14c (the fountain house, the market stalls), so the agora does not count as finished yet. The stoa is 28 × 14 blocks on the north side of the square, facing south: an ashlar-edged limestone floor one course high, back and end walls 9 blocks high, 7 Doric columns of 2 × 2 blocks (8 drums and a capital) along the open front, a frieze with a triglyph over every column, and a terracotta roof in two slopes with marble pediments. At the back, three shops behind a wall with a doorway 2 blocks wide and 4 high into each. Six boundary stones (two limestone courses and a marble cap) mark the corners and sides of the open square in front. 2,162 blocks in all. The generator now levels each plan's ground from the plan itself (`Plan.ground`), and the agora's area reaches 1.5 units further north (centre z 3, rz 12) so the whole stoa stands inside it.

**Status (2026-11-17): 14c done: Phase 14 complete.** Three more steps finish the agora, 2,507 blocks in all:
- **The fountain house** (κρήνη), in the square's south-east corner and open to the west: a floor, walls on three sides, two Doric columns at the front, a basin behind a parapet one block high, the lion's head in the middle of the back wall, a marble ceiling and a small tiled roof.
- **The pipe** (σωλῆνες): a spring of four water cells in a limestone rim sits on the ridge's west slope (block 94, 191; generated with the island). From a gap in its rim a trench runs south along the slope, west to the fountain house and up its back wall: 33 pipe sections, each touching the next face to face. The trench is flush with the ground, steps down where the ground does, and keeps off the road. Its ground heights are kept as data in the blueprint (a test checks them against the terrain), because asking the terrain while the modules load made generating the island half as fast again.
- **The market stalls**: three counters across the square, three stall blocks each, with two pithoi and an amphora behind each.

**How the water works** (`src/voxel/plumbing.ts`, run by `VoxelWorld`, so the game and the room server always agree):
- A lion's-head spout runs while pipe sections join it to the spring. It pours a water source into its first open side, which falls into the basin and spreads there with the Phase 10 water rules. Any spout works, not only the planned one.
- The rule is checked whenever a pipe, a spout or the spring changes, and when a save is loaded. Cutting the pipe, or taking the spout away, stops the water, and the basin drains.
- The spring and a running spout's mouth fill up again when a hydria takes their water, so the fountain never runs dry.
- The spring's water stays in its rim: it does not spill into the empty trench.
- A stopped spout takes away any water a player placed at its mouth.

**Tasks, in order**
1. **The boundary stones (ὅροι τῆς ἀγορᾶς)**: marking out the open square, as in the Athenian agora.
2. **The stoa's floor and back wall**: a long hall that is open at the front, built of limestone and ashlar.
3. **The stoa's colonnade**: a row of columns along the front (reusing the column drums and capitals from Phase 13), with an entablature and a terracotta roof.
4. **The shops at the back of the stoa**: small rooms with doorways.
5. **The fountain house (κρήνη)**: a small building with a basin. Water runs from a **lion's-head spout** into the basin, using the flowing water from Phase 10. A pipe of terracotta sections (σωλῆνες) runs from a spring on the hill.
6. **Market stalls and goods**: wooden stalls with storage jars (πίθοι), amphorae, and wool or milk from the animals.

**New blocks**
- **Lion's-head spout** (a marble water source that never runs dry).
- **Terracotta pipe section.**
- **Storage jar**, **amphora** (terracotta, fired in the kiln).
- **Wooden stall** (planks).

**What players learn:** public life, trade, the stoa as shelter and meeting place, and how water reached the city. The hydria from Phase 10 gets used here.

## Phase 15: The stadium (Στάδιον)
**Size and layout (decided 2026-11-17)**
- **The track is 40 × 4 units (80 × 8 blocks)**, four lanes of 2 blocks, surfaced with packed sand that players lay: about 640 blocks. It runs along the valley floor, leaving room at the west end for the entrance tunnel and at the east end for the turning posts.
- **Water from a second spring** on the valley's hill, brought by a clay pipe to a lion's head at the head of the channel, using the agora's water rules (`plumbing.ts`). The channel runs along the track and fills the drinking basins.
- Built in three slices, like Phases 13 and 14: **15a** the new blocks; **15b** the track, the starting lines and the spectator banks; **15c** the tunnel, the turning posts, the water channel and the closing tour with a run along the track.

**Status (2026-11-17): 15a done (blocks).** Two new blocks (ids 41–42), which take the atlas's last two tiles:
- **Βαλβίδα (the starting sill):** limestone with two grooves across its top for the runners' toes. 3 limestone in a row → 2 sills.
- **Σφηνόλιθος (the vault stone):** an ashlar wedge, its joints leaning in towards the arch's centre. 3 ashlar in a V → 3 stones.

The first time a player places one, a history note appears: the stade race, the unit of length that gave the stadium its name, and the balbis; or how an arch stands, with Olympia's vaulted entrance. Animals keep off both blocks. The track is surfaced with ordinary sand.

**Status (2026-11-17): 15b done (track, starting lines, banks).** The stadium is a plan like the agora (`src/game/blueprints/stadium.ts`), with seven steps. The first four are built now:
1. **The track:** sand laid in a bed one block deep, 80 × 8 blocks (40 × 4 units) down the middle of the valley floor.
2. **The starting lines:** a row of 8 starting sills across the track, two blocks in from each end, flush with the sand.
3. **The spectator banks:** earth (grass or soil) heaped in two steps, each 3 blocks deep, on both sides of the track between the starting lines. A 2-block walkway runs between each bank and the track. Where the hills reach over the banks, the generator cuts them back.
4. **The judges' seats:** in the middle of the south bank, as at Olympia, a marble floor on the upper step with a marble bench and back.

The last three steps (the vaulted entrance, the turning posts, the water channel) have no cells yet and arrive in 15c, so the stadium is not marked finished. 2,032 blocks so far. The track starts 5 units east of the road's entrance, leaving room for the tunnel.

**Status (2026-11-18): 15c done: Phase 15 and the four buildings are complete.** The stadium's last three steps, 2,524 blocks in all:
- **Η κρυπτή είσοδος (the vaulted entrance):** at the west end, in line with the road. Ashlar walls three courses high carry a stepped arch of vault stones in two rows, with earth on top. The passage is four blocks high under the keystones. The entrance's two boundary stones now flank the tunnel mouth (`Area.stones`); either side of the road, one of them stood in the way.
- **Οι καμπτήρες (the turning posts):** four posts just beyond the east end, one per lane, each an ashlar base with two marble blocks.
- **Το αυλάκι (the water channel):**
  - The channel runs along the north side of the track, one block wide and flush with the ground, on an ashlar bed with an ashlar kerb on the bank side. The track's sand forms its other side.
  - Six lion's heads set in the kerb pour into it, one every 14 blocks, because flowing water reaches only 7 blocks from a source.
  - A second spring, on the north hill at the west end beside the road, feeds them by pipe. The pipe comes down the slope west of the north bank, so a finished bank needn't be dug up, then runs east under the kerb past every spout.
  - The step counts the channel's water cells, so it is finished only once the water runs. The materials list leaves the water out.

**The water rule, reused from the agora:** both springs are listed in `src/game/blueprints/springs.ts`. Placing a block in a running spout's mouth now re-checks the water, so a spout that took a free side because its neighbour wasn't built yet turns to its proper side.

**The ending:** when the stadium's last step stands, the closing tour starts:
- the camera runs the track at a runner's eye height, from one starting line to the other;
- it rises over the east end to look back over the stadium;
- the closing window then lists the four buildings, under *Η πόλη σου στέκεται ολόκληρη*.

With reduced motion, the tour is a still view. The stadium's signpost and the result button lead to the closing window. The theatre's tour is unchanged.

**Tasks, in order**
1. **The track (δρόμος)**: a long, straight, level strip of packed sand or soil. **Shorter than a real stade (decided)**: as long as the valley allows, about 50–60 world units. The history note gives the real length, about 180–190 metres.
2. **The starting line (βαλβίς)**: a row of stone sills with grooves for the runners' toes, at each end.
3. **The spectator banks**: grass slopes on the valley's sides, with a few stone seats for the judges (ἑλλανοδίκαι).
4. **The vaulted entrance tunnel (κρυπτὴ ἔσοδος)**: the arched passage the athletes walked through, as at Olympia.
5. **The turning posts and the water channel**: stone posts at the ends, and a channel along the track with basins for drinking water (flowing water again).

**New blocks:** a starting sill (limestone, carved) and a vault stone (ashlar).

**What players learn:** the games, the footrace (the stade race) and where the word "stadium" comes from, and how a natural valley was shaped into a venue. The tour ends with a short run along the track.

## Phase 16: Survival (last)
Unchanged from the old Phase 9, and done only after everything above: a *Survival* mode with health, hunger from food such as olives, bread, figs and milk, and fall damage; uses for milk and feathers.

---

## Decisions (2026-11-16)
1. **Opening order:** one building at a time. The next signpost opens when the previous building is finished.
2. **Temple size:** small, 4 × 6 columns, each column 2 × 2 blocks; facing east; the terrace widens to the west (2026-11-17).
3. **Stadium length:** a shorter track is fine.
4. **Map:** one shared, large island, landscaped so that hills, a stream and groves separate the building areas. The road links them through passes and over a bridge.
5. **Multiplayer:** up to 5 players per room, through a small Node room server on our own CloudPanel server. The game itself stays on Netlify.

## Also update
Done (2026-11-17): the README describes the island, the four buildings, rooms, the save in IndexedDB and the 642-block theatre; `tests/game.e2e.ts` walks from the theatre along the road to the sanctuary's signpost.
