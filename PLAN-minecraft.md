# Plan: Making Theatre Valley play like a voxel sandbox

## Where the game is today

| Area | Current implementation | Gap compared with a Minecraft-style game |
| --- | --- | --- |
| World | Smooth heightfield `ground(x,z)` in `game/terrain.ts`, low-poly triangle mesh, and instanced scenery in `world/landscape.tsx` | There are no blocks. The terrain can't be dug, edited, or generated procedurally. |
| Building | 61 fixed **slots** in `game/theatre.ts`. A piece can only go into its predefined slot during the matching mission. | The player can't place freely, choose positions, or break anything. |
| Movement | Circle-vs-circle collision (`canWalk`, `obstacles`), with no gravity or jumping | There is no voxel AABB physics, jumping, falling, or climbing. |
| Camera | Orbit "architect" camera plus a walk camera driven by drag-to-look | There is no pointer-lock first-person view or crosshair. |
| Items | Inventory = 10 piece types that unlock per mission | There are no item stacks, hotbar, drops, crafting, or tools. |
| Loop | Linear 7-mission tutorial that ends in a tour | There is no open-ended loop of gathering, crafting, building, and surviving. |
| Save | LocalStorage holding a list of placed slot IDs | A list of slot IDs can't store an edited world, which needs chunk diffs in IndexedDB. |

The codebase is about 2.2k lines of React, R3F, and zustand. That is small and clean enough to restructure instead of patching. **Keep** the Greek setting, island, UI shell, journal, and the theatre as a goal. Those are the game's own identity. Take the *mechanics* of the genre (voxels, mining, crafting, free building, day/night), but don't copy Minecraft's textures, block names, mobs, or look. Draw a palette of original Greek materials instead.

> The project is not a git repository. Run `git init` and commit the current state before Phase 1, because this is a rewrite of the world layer.

---

## Status (2026-11-12): Phases 1–3 done
Implemented in `src/voxel/` and `src/world/{VoxelTerrain,BlockInteraction,camera,input}.tsx`. Where it differs from the plan below:
- **Block size is 0.5 units** (finer detail). The theatre's tier height changed from 0.64 to 0.5 so the seats sit on block tops.
- **Meshing runs on the main thread** with per-face culling and AO, not greedy meshing in a worker. The whole island meshes quickly enough, and edits re-mesh at most four chunks. A worker is worth adding if the world grows.
- **There are no water blocks yet.** The sea is still the flat plane, and swimming is deferred to the water work in Phase 8.
- **The theatre site is protected** from free editing for now. The campaign still uses the old prefab construction mode (B). That is temporary: Phase 5 removes it and the theatre is built block by block.
- World edits are saved to LocalStorage (`ancient-polis-world`) for now. The move to IndexedDB stays in Phase 7.

## Status (2026-11-12): Phase 4 done
- The player starts with an empty inventory and progresses by tier. Punch olive logs, then craft planks, sticks and a workshop. Make wooden tools, then limestone tools, then mine copper and tin (stone pickaxe or better), fire them in a kiln, and alloy bronze (3 copper + 1 tin).
- Clay comes from under the beaches and fires into terracotta. Marble comes from veins on the northern ridge and needs a stone pickaxe.
- Tools wear out. The wrong tool, or none, is slower and drops nothing from blocks that need a tool.
- Not done yet: dropped items are not saved (they vanish on reload, as they do on leaving the world). There is no drag-to-spread across slots.

## Status (2026-11-12): Phase 5 done
- The prefab system is gone: no construction mode, slots, `pieces.tsx`, `picking.ts`, material panel, rotation or "Επόμενη θέση". B now opens a camera-only overview (Σχέδιο) whose eye button shows the whole plan.
- `src/game/blueprints/theatre.ts` holds the 332-cell blueprint:
  - Orchestra (48): an ashlar ring in a trench, and an altar.
  - Front-row marble seats (32).
  - Koilon (68).
  - Stairs (36): fill the aisle trenches.
  - Skene (122): platform, wall with doorway, log posts, terracotta roof.
  - Gates (26): ashlar piers with marble lintels.
- The generator prepares the site: blueprint cells start empty and the lowest courses get ground underneath.
- `src/game/site.ts` counts built cells from the world. Missions, points, the journal, the tour and the "already celebrated" milestones all follow the blocks. Breaking a block is the undo.
- Ghost blocks show the current mission. Wrong blocks are outlined red. The mission card lists the materials needed against what the player carries.
- The site is no longer protected, except the bedrock and the two signposts.
- Saves upgrade from version 1 to version 2. Placed prefab pieces fill their blueprint cells, and a finished mission fills all of its cells.
- Deviations from the plan:
  - The hotbar is not reordered; the needs list replaces that.
  - The orchestra is a stone ring around the existing packed-earth floor rather than a fully paved disc, which keeps the first mission to 48 blocks.
  - The parodoi are not kept clear automatically.

## Status (2026-11-13): Phase 6 done, survival postponed
- **Day and night** (`game/daylight.ts`, `world/Sky.tsx`): a 20-minute day (about 12 minutes of light). One directional light follows the sun by day and the moon by night, so shadows keep working. Sky, fog, stars and the hand light all follow the clock. The time is saved; the setting «Κύκλος ημέρας και νύχτας» freezes it at mid-morning.
- **Oil lamps** (`lamp` block, «Λυχνοστάτης»: a clay lump on a stick gives two). Block light (0–15) spreads one level per block through non-opaque cells (`VoxelWorld.light`, recomputed from all lamps when lamps or nearby blocks change). The mesher passes smoothed per-vertex light, and the terrain shader adds it as warm emission, strongest at night.
- **Creative mode**, chosen on the start screen or for a new game, and switchable in settings:
  - instant breaking (no drops), placing that never runs out, and no tool wear;
  - a palette of every item in the backpack;
  - flight with a double tap of Space (Space rises, C sinks, touching ground lands);
  - empty hotbar slots are stocked with building blocks.
- **Animals** (`world/wildlife.ts` logic, `world/Animals.tsx` models, `world/herd.ts` interaction): 6 sheep, 4 goats and 6 chickens wander their meadows, avoid walls, cliffs and the building site, and rest at night. Hit a sheep for wool (it grows back after 2 minutes), right-click a goat for milk, and chickens drop feathers. They cannot be hurt and are not saved.
- **History notes** pop up top-right the first time night falls, a lamp is placed, or an animal is met. They also appear in the journal.
- Not done: survival (health, hunger, fall damage) is postponed by request and is now Phase 9, the last phase. Milk and feathers have no use yet; they are meant for survival food and later crafts.

## Phase 1: Voxel world foundation
**Goal:** the island is made of blocks and renders at 60 fps.

- `src/voxel/blocks.ts`: block registry with `id`, name (Greek), hardness, tool type, drop, transparency, and atlas UVs. Starter set: grass, soil, sand, limestone, marble, clay, terracotta tile, olive log, olive leaves, cypress leaves, water, gravel.
- `src/voxel/chunk.ts`: 16×16×64 `Uint8Array` chunks with get/set and dirty flags.
- `src/voxel/generate.ts`: fill the chunks by **sampling the existing `ground()` and `islandEdge()`**, so the island keeps its shape. Use 1 block = 0.5 current units, which gives about a 128×128 island. Fill with sea water outside the edge. Place trees and ruins as small voxel structures that replace `scenery()` and `relics()`.
- `src/voxel/mesher.worker.ts`: greedy meshing (per-face culling, then merging) in a Web Worker, with per-vertex ambient occlusion. Output one opaque and one transparent BufferGeometry per chunk.
- `src/voxel/atlas.ts`: 16×16 pixel textures drawn procedurally to a canvas at startup (original art, no external assets), using `NearestFilter`.
- `world/VoxelWorld.tsx` replaces `landscape.tsx`. Keep the sea plane, sky, and distant islands.
- Tests: mesher face counts, chunk get/set at borders, and that generation is deterministic.

## Phase 2: First-person controller and physics
**Goal:** walk, jump, fall, and climb one-block steps.

- `src/voxel/physics.ts`: player AABB (0.6×1.8×0.6 blocks), swept axis-by-axis collision against solid voxels, gravity, jump, sprint, crouch (no walking off edges), and swimming in water.
- Replace `canWalk`, `obstacles`, `treeObstacles`, and `constructionObstacles` entirely, because collision now comes from the voxels.
- `world/camera.tsx`: pointer-lock first-person view with a crosshair. A toggle switches to a third-person view. Keep the orbit "architect view" as a separate mode for overviewing the theatre (a good fit for the educational angle).
- Touch: a virtual joystick on the left, drag-to-look on the right, and jump, break, and place buttons. Keep the existing touch helpers in `ui/controls.ts`.

## Phase 3: Breaking and placing blocks
**Goal:** the core voxel-sandbox interaction.

- `src/voxel/raycast.ts`: DDA voxel raycast from the camera, about 5 blocks of reach. It returns the hit block and face normal.
- A thin wireframe outline on the targeted block.
- Hold the left button to break, using a progress overlay timed by hardness and the held tool. Right-click places the held block against the hit face, but not inside the player's own AABB.
- Break particles and per-material sounds (extend `game/audio.ts`).
- Re-mesh only the affected chunk, plus its neighbor when the edited block is on a border.
- Delete `world/picking.ts`, `FreeGhost`, the slot-ghost rendering, and the "Επόμενη θέση" flow.

## Phase 4: Items, hotbar, inventory, and crafting
- `src/game/items.ts`: items = blocks + tools (bronze pickaxe, chisel, axe, shovel) + materials (clay lump, bronze ingot). Stacks hold up to 64.
- 9-slot hotbar (keys 1–9 and the scroll wheel) plus a 27-slot inventory screen (E). Rebuild `ui/Inventory.tsx` as a grid that supports drag and shift-click.
- Dropped item entities that bob in place and get picked up when the player comes near.
- `src/game/recipes.ts`: shaped and shapeless recipes on a 2×2 grid in the inventory and a 3×3 grid at a **workshop (εργαστήριο)** block. A **kiln** turns clay into terracotta and limestone into lime. Greek-themed tech progression: wood → stone → bronze tools.
- Tests: recipe matching, stack merge and split, and tool speed multipliers.

## Phase 5: The theatre built block by block (no ready-made parts)
**Requirement from you:** the theatre is built like any normal voxel-sandbox build, one block at a time, in first person. No prefab seats, sections, walls, roofs or gates.

- **Remove the prefab system entirely:** construction mode (B), the slot list in `theatre.ts`, `world/pieces.tsx`, `world/picking.ts`, the materials inventory, rotation, "Επόμενη θέση", and the seat-section prefab. The orbit "architect view" can stay as a camera only, for overviewing the build.
- **Voxel blueprint** (`src/game/blueprints/theatre.ts`): a list of `{x, y, z, block, mission}` cells generated from the same geometry as today, built from the existing block palette:
  - *Orchestra:* a disc of marble/path floor with an ashlar ring.
  - *First seats / koilon:* three curved rows of limestone seat blocks with marble tops on the terraces. The individual blocks follow the arc; rows two and three are more blocks, not prefab sections.
  - *Stairs:* two radial aisles of stepped limestone blocks.
  - *Skene:* an ashlar foundation, walls with a central doorway, olive-log posts, and a terracotta roof. The roof needs the walls and posts first, simply because blocks need something to rest on.
  - *Parodoi:* two ashlar gate piers with a marble lintel.
- **Ghost guide:** after the site is activated, the current mission's cells render as translucent ghost blocks. A correct block placed in a cell turns solid and counts. A wrong block in a cell is outlined red. Breaking blocks is the undo.
- **Mission progress** comes from the blocks (`done / total` = matching cells), so the HUD, journal, knowledge points and final tour keep working. The hotbar puts the current mission's materials first.
- **The site stops being protected for the blueprint cells.** The player builds the theatre directly in the world. Cells outside the blueprint stay free to edit as well, as long as they don't block the parodoi for the tour.
- **Save migration:** an old save's placed slots fill the matching blueprint cells, so finished missions stay finished.
- **Tests:** blueprint cell counts per mission, progress counted from world blocks, and an e2e that builds the orchestra by placing blocks in first person.
- **Size:** larger than first estimated (large, not medium), because it replaces the construction system instead of adapting it. **Recommended to do this before Phase 4**, so the campaign is never left in a half-prefab state.

## Status (2026-11-13): Phase 7 done
- **Save version 2 in IndexedDB** (`game/save.ts`): one store holds `game`, `inventory`, a `world` header (`version: 2`, island `seed`) and one record per edited chunk (`chunk:N` with typed arrays of cells and block ids). Only changed chunks are rewritten. `main.tsx` reads the whole save before importing the game (`App.tsx`), so the stores still load synchronously. Writes are batched into one transaction and flushed when the tab is hidden.
- **Migration:** LocalStorage saves (version 1) are moved in at boot and then removed. Prefab-era saves still rebuild their placed slots as blueprint blocks. Without IndexedDB the game plays from memory and the save icon shows it is not saving.
- **Performance:** three.js already skipped chunks outside the camera by their bounding spheres. Quality now also sets the first-person view distance (low: 44 units, auto on touch devices: 60, otherwise the whole island), with the fog pulled in to match, and low quality turns off corner shading (AO). The menu, overview and tour always draw the whole island.
- The `WorldBoundary` WebGL fallback is unchanged.

## Phase 6: Survival-lite and world life
- Day/night cycle with a moving sun, shadows, sky color, and torches or oil lamps as light sources (a simple block-light flood fill in the mesher).
- **Game modes:** *Creative* (unlimited blocks, flying, instant break) and *Survival*. Survival has moved to Phase 9.
- Passive animals (goats, sheep, chickens) with simple wander AI that drop wool, milk, or feathers. Hostile creatures are optional and come later, if at all.

## Phase 7: Persistence and performance
- Save version **2**: world seed + per-chunk diffs stored in **IndexedDB** (LocalStorage is too small), plus inventory and player state. Migrate a v1 save by applying its placed slots as blueprint blocks.
- Chunk-level frustum culling. If the island grows into infinite terrain, load and unload chunks by render distance. The "quality" setting controls render distance and AO.
- Keep the `WorldBoundary` WebGL fallback.

## Phase 8: Polish
Water rendering (transparent, animated UV), fog, footstep sounds per block, a block-place "pop" animation (reuse `effect` in the store), screenshot mode, and settings for FOV, mouse sensitivity, and invert-Y.

## Phase 9: Survival (last, by request)
- *Survival* mode: health, hunger from food like olives, bread, figs, and milk, and fall damage.
- Give milk and feathers (already dropped by animals in Phase 6) their uses as food and in crafts.

---

## Store restructuring (`game/store.ts`)
Split the one zustand store:
- `worldStore`: chunk data (outside React state as typed arrays, with only a version counter in the store)
- `playerStore`: position, velocity, health, hunger, mode
- `inventoryStore`: hotbar, inventory, selected slot
- `campaignStore`: blueprint progress, missions, knowledge points (the current progression logic, adapted)

Physics and voxel data must **not** live in React state. Mutate them in `useFrame` and keep only UI-relevant values in the stores, because re-rendering on every block change would be too slow.

## Order and size
| Phase | Estimate | Playable after? |
| --- | --- | --- |
| 1 Voxel world | large | You can view the voxel island |
| 2 Controller | medium | You can walk and jump around |
| 3 Break/place | medium | **Core sandbox loop works** |
| 4 Items/crafting | large | Gather → craft → build |
| 5 Block-by-block theatre | large | The campaign is built from blocks |
| 6 Day-night/animals/creative | medium | Living world |
| 7 Save/perf | medium | |
| 8 Polish | ongoing | |
| 9 Survival | medium | Full loop |

Phases 1–3 are the minimum to *feel* like the genre. Do them first, in order, because each one depends on the previous. Phases 4 and 6 can then be developed in parallel.

## Decisions needed before starting
1. **Creative-first or survival-first?** I recommend creative and blueprint first, with survival as an optional mode, because that fits the educational goal.
2. **Keep the guided theatre campaign** as the main goal (recommended), or make it pure sandbox?
3. **World size:** a fixed island (simpler, keeps the art direction) or infinite procedural terrain?
4. **Block scale:** 0.5 m blocks (finer theatre detail) or 1 m blocks (classic chunky feel)?

## Tests to update
- Replace `tests/theatre.test.ts` slot tests with tests for the blueprint, mesher, raycast, physics, and recipes.
- Rewrite `tests/game.e2e.ts` to cover these steps: load, pointer-lock walk, break a block, place a block, complete the orchestra blueprint layer, reload, and confirm the world persisted.
