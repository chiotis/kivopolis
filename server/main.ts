import { start } from './index'

/**
 * Starts the room server. This is the file that is built and run; the tests import index.ts
 * instead, so it never starts on its own. (Checking the script's name does not work under PM2,
 * which runs the server through its own wrapper.)
 */
void start().catch((error) => { console.error(error); process.exit(1) })
