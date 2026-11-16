import { inRoom, oldChunkOf, openSave } from './game/save'
import { SEED } from './voxel/generate'
import { joinRequestedRoom } from './net/client'

// The save is read from IndexedDB before the game modules load, so they can read it synchronously.
// Version 1 saves were made on the old grid; they are upgraded to version 3 as they are opened.
// A room the player asked to join replaces the save in memory before the game loads (Phase 12).
void openSave({ chunkOf: oldChunkOf, seed: SEED })
  .then(() => joinRequestedRoom())
  .then(() => import('./App'))
  .then(async ({ mount }) => {
    // The room's animals and items are in place before the world is first drawn.
    if (inRoom()) (await import('./net/sync')).startSync()
    mount()
  })
