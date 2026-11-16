import { oldChunkOf, openSave } from './game/save'
import { SEED } from './voxel/generate'

// The save is read from IndexedDB before the game modules load, so they can read it synchronously.
// Version 1 saves were made on the old grid; they are upgraded to version 3 as they are opened.
void openSave({ chunkOf: oldChunkOf, seed: SEED })
  .then(() => import('./App'))
  .then(({ mount }) => mount())
