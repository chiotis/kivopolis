# KivoPolis

![KivoPolis: a voxel temple, columns and theatre on a floating island above a terraced green valley](docs/cover.webp)

**KivoPolis** (from *κύβος*, cube, and *πόλις*, city) is a Greek-language browser game set on an island of ancient Greece. You build an ancient city block by block, a theatre, a sanctuary, an agora and a stadium, and learn about each building along the way. It can be played alone, or by up to five players in a shared room. It runs in the browser with no installation, accounts or personal data.

## The city

The island has four building areas, joined by an ancient road with bridges over a stream, boundary stones and a herm at the fork. A signpost stands at each area. Each building opens once the one before it is finished:

| Building | Where | Steps | Blocks |
| --- | --- | --- | --- |
| **The theatre** | Theatre Valley, at the centre | The orchestra, the analemmata, the first seats, the diazoma, the koilon, the stairs, the skene and the parodoi | 642 |
| **The sanctuary of Dionysus** | A terrace south-west of the theatre, across the stream | Ο περίβολος, ο βωμός, η κρηπίδα, ο σηκός, οι κίονες, ο θριγκός, η στέγη και τα αετώματα, το λατρευτικό άγαλμα: a Doric temple of 4 × 6 columns with its altar and boundary wall | 2,907 |
| **The agora** | The western plain, beyond the wooded ridge | Οι όροι, το δάπεδο και οι τοίχοι της στοάς, η κιονοστοιχία, τα καταστήματα, ο θριγκός και η στέγη, η κρήνη, ο αγωγός από την πηγή, οι πάγκοι: a stoa of 7 Doric columns with 3 shops, and a fountain house fed by a clay pipe from a spring | 2,507 |
| **The stadium** | A valley between low hills to the south-east | Ο δρόμος, οι βαλβίδες, τα πρανή των θεατών, η εξέδρα των ελλανοδικών, η κρυπτή είσοδος, οι καμπτήρες, το αυλάκι: a sand track of 40 × 4 units, a vaulted entrance, turning posts and a water channel fed from a second spring | 2,524 |

Every building is a voxel blueprint, built block by block in first person; there are no prefab pieces. At a building's sign the plan is activated, and the current step's blocks appear as glowing ghost blocks. A correct block placed in a ghost cell counts, a block that does not belong there is outlined in red, and breaking a block is the undo. The step card lists the materials still needed next to how many the player carries. Each finished step brings a short text about what was built and why.

When the theatre is finished, a tour flies round its hollow. The sanctuary's tour starts before the altar and climbs round the colonnade to the pediments, and the agora's rises over the square from the stalls to the stoa and looks into the fountain house; each lands on the building's signpost window, which can run it again. When the stadium, the last building, is finished, the camera runs the track from one starting line to the other and rises over the stadium, and a closing window, *Η πόλη σου στέκεται ολόκληρη*, lists the four buildings. The island stays open to explore and build on afterwards.

### The theatre in detail

The theatre's 642 blocks, in nine steps (the first is finding the site):
- **Orchestra (48):** an ashlar ring set flush into a trench, and an altar base (the thymele).
- **Analemmata (114):** the two ashlar retaining walls that close the koilon at its sides.
- **First seats (64):** the two marble rows of the lower tier, starting with the prohedria.
- **Diazoma (94):** a level gravel walkway between the lower and upper tiers.
- **Koilon (100):** the two marble rows of the upper tier.
- **Stairs (74):** the two marble aisle staircases that split the seats into three kerkides.
- **Skene (122):** ashlar platform and walls, olive-log posts and a terracotta roof.
- **Gates (26):** two ashlar parodos gateways with marble lintels.

### Water

Water placed above sea level is a source: it runs down and spreads up to seven blocks sideways, and dries up when its source is taken away. A hydria (three terracotta blocks at the workshop) carries water from one place to another. The agora and the stadium each have a spring on a hillside. A clay pipe laid from the spring feeds the lion's-head spouts of the fountain house and of the stadium's channel, and the water runs as soon as the pipe is joined.

## Ways to play

Chosen when a game starts, and switchable in settings:
- **Συλλογή υλικών (gathering):** cut wood, craft tools, fire clay, smelt copper and tin into bronze, and dress stone before building. A «Πρώτα βήματα» guide walks through the first steps.
- **Επιβίωση (survival):** gathering, with health and hunger, shown above the hotbar.
  - A fall of more than 3 blocks costs a point of health for every block beyond.
  - Hunger falls as you go about, faster when sprinting. Health comes back slowly, but only while you are fed, and an empty stomach wears it down to its last point (never further).
  - Food: olives from olive leaves, figs from fig trees, milk from goats, and bread (3 wild wheat make dough, which the kiln bakes).
  - A player whose health runs out faints and wakes with full health, keeping everything: on their κλίνη, if they have lain on one, or else at the theatre.
- **Δημιουργικό (creative):** every item in the backpack palette, instant breaking, blocks that never run out, and flight. Meant for classrooms.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk, jump, crouch | WASD or arrow keys. Shift to walk faster, Space to jump, C to crouch. | Hold a directional button or the jump button. |
| Look around | Click the world to lock the mouse, then move it (Esc releases). Dragging also works. | Drag the scene. |
| Break a block | Hold the left button on the outlined block. | Hold the pickaxe button. |
| Place a block | Right-click a block face. Pick the block with 1–9 or the scroll wheel. | Tap the + button. Tap a hotbar slot to pick. |
| Eat, drink, or lie on a κλίνη (survival) | Right-click with food in hand, or on a bed. | Tap the + button. |
| First/third person | Press V. | — |
| Backpack and crafting | Press E (away from the signs) for a 2 × 2 crafting grid. Right-click a workshop for 3 × 3, or a kiln to fire, smelt and bake. Q drops the held item. Crouch to build against a workshop, kiln or bed. | Tap the backpack button. |
| Read a sign, activate a plan, start a tour | Approach it and press E. | Approach it and tap the interaction button. |
| Overview camera (Σχέδιο) | Press B or use the mode button; the eye button shows the whole plan. | Tap the mode button. |
| Orbit, pan, and zoom in the overview | Drag, Shift-drag, and scroll. | Drag to orbit and pinch to zoom. |
| Fly (creative only) | Double-tap Space; Space rises, C sinks, touch the ground to land. | Double-tap the jump button. |
| Animals | Hit a sheep for wool, right-click a goat for milk; chickens drop feathers. | Pickaxe button on a sheep, + on a goat. |
| Photo mode | The camera button hides the interface. | The camera button. |

## The world

The island is 384 × 48 × 384 blocks of half a unit each, with 46 kinds of block and 59 items in all. Olive, cypress and fig trees grow in groves, wild wheat in the meadows, clay along the shore, and copper and tin in an ore hill. 34 recipes cover tools in wood, stone and bronze, building parts such as column drums, capitals, triglyphs, metopes, vault stones and starting sills, and the furnishings of a city: lamps, jars, market stalls and beds.

Day turns to night over 20 minutes, and oil lamps («Λυχνοστάτης») light their surroundings; the day cycle can be switched off in settings. Sheep, goats and chickens roam the meadows. Fifteen short history notes pop up in the top-right corner the first time something happens, such as night falling, an animal being met, a column drum or a vault stone being set, a pipe being laid, or a first meal, and they are kept in the journal.

## Saving

Progress and settings are saved automatically in the browser (IndexedDB). The save keeps the shared game (buildings found and finished, history notes, time of day, the way of playing), this player's position, health, hunger, bed and inventory, the device settings, and the world's edits chunk by chunk. Step progress, knowledge points and the tours are worked out from the blocks in the world, and the world is regenerated from the current island on load, so saves pick up new trees and landscaping. Older saves are upgraded once, and are still stored under the `ancient-polis` name, so renaming the game kept everyone's progress. The pause menu can restart the current step, which takes its blocks down and returns them to the inventory. Settings offers a confirmation dialog before starting over.

## Play with friends

With the room server running, the start menu shows «Παιχνίδι με φίλους». One player creates a room and shares its six-character code; up to four more join with the code and a nickname. Everyone builds in the same world and shares the progress, the water, the animals, the dropped items and the kilns. The room keeps each player's inventory, position, health, hunger and bed for when they come back.

Because the players are children, there is no free text chat: nine preset phrases (T, then 1–9) and a pointer (G) that marks a block for everyone. Only the room's creator can restart a step, switch creative or survival play, or remove a player. No accounts, e-mail or personal data are collected, and nothing is sent to third-party services. Setting up the server is described in [server/README.md](server/README.md).

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite in a browser with WebGL 2. To try rooms locally, run `npm run server` alongside it with `VITE_ROOM_SERVER=ws://localhost:8787` in `.env.development.local` (see [server/README.md](server/README.md)).

## Build and deploy

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to any static web host. For Netlify or Vercel, use `npm run build` as the build command and `dist` as the output directory. Playing alone needs no server. For rooms, set `VITE_ROOM_SERVER` (for example `wss://rooms.kivopolis.com`) in the build environment; without it the multiplayer button is hidden. The room server is built with `npm run build:server`.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Vitest covers:
- the four blueprints and their progress: the theatre's missions, and the sanctuary's, agora's and stadium's steps, with their ground, water and footings;
- the opening order of the buildings, the signposts, and the closing tour;
- the sanctuary's and the agora's tours: their flights stay in open air, keep the building in sight and glide without jumps;
- the voxel world: generation, edits and persistence, meshing, raycasts and physics;
- items: recipes, mining and drops, inventory moves, tool wear, and the kiln;
- flowing water, springs and pipes;
- the island: the theatre valley, the shore, the building areas, bridges and a walkable road;
- survival: fall damage, healing, hunger, eating, food on the island, and the bed;
- old-save upgrades, the shared game record, and the room server's rules.

Playwright activates the plan and lays an orchestra block in first person, upgrades an old save into a finished theatre and runs the tour, walks the road from the theatre to the sanctuary's signpost, checks the blueprint guide on a phone, exercises the break, pick up and place loop, plays in creative mode, and plays two browsers in one room (`tests/rooms.e2e.ts`).

GitHub Actions (`.github/workflows/ci.yml`) runs the type check, both builds, the unit tests and the Playwright tests on every pull request and every push to `main`. When the Playwright tests fail, the report and screenshots are kept as a download on the run for a week.

`npm run load-check` starts a room server and fills 10 rooms with 5 simulated players each, then reports message rates and round-trip times. Point it at a deployed server with `LOAD_URL=wss://rooms.kivopolis.com` (and an `Origin` the server allows, through `LOAD_ORIGIN`).

## Project layout

- `src/game/blueprints/` holds the four buildings as voxel blueprints (`theatre.ts`, `sanctuary.ts`, `agora.ts`, `stadium.ts`) and the springs (`springs.ts`). `src/game/theatre.ts` and `site.ts` run the theatre's missions; `src/game/plans.ts` runs the other buildings' steps by counting built cells in the world.
- `src/game/buildings.ts` keeps the buildings' opening order and progress; `src/game/regions.ts` lays out the island: the areas, the stream, the road, the ridge and the hills. `src/game/terrain.ts` defines the heightfield and island edge that the voxel generator samples.
- `src/game/shared.ts` holds the shared game, `src/game/store.ts` this player's state and the device settings, and `src/game/save.ts` the IndexedDB save and its upgrades. `src/game/actions.ts` applies every player change through one function, alone and in rooms.
- `src/game/items.ts`, `recipes.ts`, `inventory.ts` and `kiln.ts` define items, tools and food, mining and drops, crafting, the 36-slot inventory and the kiln. `src/game/survival.ts` holds health, hunger and the bed.
- `src/voxel/` holds the block world: the block registry, the 384 × 48 × 384 grid, the island generator, flowing water (`flow.ts`), springs and pipes (`plumbing.ts`), the 16 × 16 texture atlas drawn in code, the face-culled mesher with ambient occlusion, the raycast and the player's physics.
- `src/net/` is the room client: messages, joining, and keeping the game in step with the room. `server/` is the room server (see [server/README.md](server/README.md)).
- `src/game/el.ts` contains all the Greek text: the interface, the steps, the history notes and the journal.
- `src/world/` renders the terrain, the blueprint ghosts, drops, animals and block interaction, and runs the camera, the tours and input. `src/ui/` contains the HUD, inventory and dialogs.

## Sources

The buildings are fictional educational interpretations, drawn from real examples such as the theatre at Delphi, the temples and stadium at Olympia, and the stoas and fountain houses of the Athenian agora. Historical references include the [Hellenic Ministry of Culture's ancient theatre educational programme](https://ancienttheater.culture.gr/en/), the [Ephorate of Antiquities of Phocis's description of Delphi's theatre](https://www.e-delphi.gr/en-gb/site/monuments/thetheatre.aspx), and the [Metropolitan Museum of Art's essay on Greek theatre](https://www.metmuseum.org/essays/theater-in-ancient-greece). The building plans and decisions are kept in [PLAN-buildings.md](PLAN-buildings.md), and the voxel engine's in [PLAN-voxel-sandbox.md](PLAN-voxel-sandbox.md).
