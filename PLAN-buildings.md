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
| 13 | The sanctuary of Dionysus (small, 4 × 6 temple) | medium | The second building can be built |
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
- Not done: the ripple texture does not yet drift along the direction of flow; all water shares one drifting texture.
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

### A larger island
- The grid grows from 144 × 144 to **384 × 384 blocks** (192 × 192 world units), keeping 48 blocks of height and 0.5 m blocks. The theatre stays at the origin, so world coordinates, the theatre's block plan and the player's position stay the same. That's about 7.1 million cells (7 MB) and 576 chunks instead of 81.
- **The land within 29 units of the centre stays exactly as it is** (`ground()` is unchanged there), so builds in old saves still sit on the same ground. Beyond that, the island continues to the new shore with a dedicated area for each building:
  - **the sanctuary of Dionysus**: a level terrace just below the theatre, to the south-west;
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
Players build together in the same world. One player creates a room and gets a short code; up to 4 more join with the code and a nickname. Single-player stays exactly as it is and needs no server.

### How it is hosted
- **The game stays on Netlify** as static files. **A small Node room server runs on our own CloudPanel server**, on its own subdomain (for example `rooms.<domain>`). Browsers load the game from Netlify, then open a live connection to the room server.
- **Secure connection only:** the game is served over https, so the room server must use `wss://` with a Let's Encrypt certificate from CloudPanel.
- **nginx in front of Node** (CloudPanel's Node.js site) must let live connections through: `proxy_http_version 1.1`, `Upgrade` and `Connection "upgrade"` headers, and a read timeout of several minutes. Check the site's vhost and add these if the template does not have them.
- **PM2** keeps the server running and restarts it after a crash or reboot.
- **Storage:** one SQLite file holds every room: world edits per chunk, shared game state, each player's inventory and position, and the kilns.
- **The game finds the server** through a Netlify build setting, `VITE_ROOM_SERVER=wss://rooms.<domain>`. Without it, the multiplayer buttons are hidden.
- **The server accepts connections only** from the Netlify site's address and from localhost during development.
- **Deploying:** pull the repo on the server, build, restart with PM2. Later, a GitHub Action can do this on every merge to `main`.

### The room server (`server/`, in this repo)
- Node and TypeScript, using the `ws` package. It **imports the game's own rules** from `src/voxel/` and `src/game/` (blocks, world, water, the block plans, task counting, recipes and the kiln), so game and server never drift apart.
- **One room** holds the world (seed + edits), the shared game state, up to 5 players, the dropped items, the kilns, the animals and the clock. A room with nobody in it is saved and unloaded, and rooms unused for 60 days are deleted.
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
2. **Temple size:** small, 4 × 6 columns.
3. **Stadium length:** a shorter track is fine.
4. **Map:** one shared, large island, landscaped so that hills, a stream and groves separate the building areas. The road links them through passes and over a bridge.
5. **Multiplayer:** up to 5 players per room, through a small Node room server on our own CloudPanel server. The game itself stays on Netlify.

## Also update
- **README**: still says the koilon rows are limestone and that the mission card compares carried blocks with those needed. Update it in Phase 11, along with the list of buildings.
- **E2E test** (`tests/game.e2e.ts`): walk from the theatre along the road to the next signpost.
