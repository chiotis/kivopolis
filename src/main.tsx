import { openSave } from './game/save'
import { SEED } from './voxel/generate'
import { chunkOfCell } from './voxel/grid'

// The save is read from IndexedDB before the game modules load, so they can read it synchronously.
void openSave({ chunkOf: chunkOfCell, seed: SEED })
  .then(() => import('./App'))
  .then(({ mount }) => mount())
