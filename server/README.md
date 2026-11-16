# KivoPolis room server

Rooms of up to five players building the same island (Phase 12). The game itself stays on Netlify;
this small Node server runs on our own CloudPanel server, and the game connects to it over a secure
WebSocket (`wss://`).

```
browser ── loads the game ──▶ Netlify
   └────── wss:// room ─────▶ rooms.kivopolis.com  (nginx → Node, port 3000)
```

## What it stores

One JSON file per room in `DATA_DIR` (default `./rooms`): the room code, the creator's nickname,
every block change, the shared progress, and each player's inventory and last position, by nickname.
No accounts, e-mail or other personal data. Rooms nobody has used for 60 days are deleted when the
server starts.

## Settings (environment variables)

| Variable | Meaning | Example |
| --- | --- | --- |
| `PORT` | Port the server listens on (8787 if not set) | `3000` |
| `DATA_DIR` | Folder for the room files | `/home/kivopolis-rooms/rooms` |
| `ALLOWED_ORIGINS` | Sites allowed to connect, comma-separated with no spaces (localhost is always allowed) | `https://game.kivopolis.com,https://kivopolis.netlify.app` |

## Setting it up on CloudPanel

1. **Create a Node.js site** in CloudPanel for the subdomain (here `rooms.kivopolis.com`), with Node 22
   or newer and an app port (here `3000`). Point the subdomain's DNS at the server first.
2. **Issue a Let's Encrypt certificate** for the site (SSL/TLS → Actions → New Let's Encrypt
   Certificate). The game runs on https, so browsers only allow a `wss://` connection.
3. **Let WebSockets through nginx.** In the site's Vhost editor, make sure the `location /` block
   that proxies to the app has these lines (add the ones that are missing), then save:

   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   proxy_read_timeout 600s;
   proxy_send_timeout 600s;
   ```

4. **Get the code onto the server** as the site's own user (`ssh kivopolis-rooms@…`): CloudPanel
   installs Node only for that user, so `npm` is missing for other SSH users. If the repository is
   private, add a read-only deploy key for the server in GitHub first.

   ```bash
   git clone https://github.com/chiotis/kivopolis.git ~/htdocs/rooms.kivopolis.com/kivopolis
   cd ~/htdocs/rooms.kivopolis.com/kivopolis
   npm ci
   npm run build:server
   ```

5. **Run it with PM2**, so it restarts after a crash or a reboot. The port must be the site's app
   port, and `ALLOWED_ORIGINS` every address the game is opened from:

   ```bash
   npm install -g pm2
   PORT=3000 DATA_DIR=$HOME/rooms ALLOWED_ORIGINS=https://game.kivopolis.com,https://kivopolis.netlify.app pm2 start server/dist/index.mjs --name kivopolis-rooms --update-env
   pm2 save
   pm2 startup
   ```

   `pm2 startup` prints one `sudo env PATH=…` command; run it once as a user who may use `sudo`
   (root or the server's admin), so PM2 starts again after a reboot.

6. **Check it:** `curl -s http://localhost:3000/health` on the server, then
   `https://rooms.kivopolis.com/health` in a browser, should both answer `ok`. If the browser shows
   a 502, nothing is listening on the port: see `pm2 status` and `pm2 logs kivopolis-rooms`.
7. **Tell the game where it is:** on Netlify, Site configuration → Environment variables, add
   `VITE_ROOM_SERVER` = `wss://rooms.kivopolis.com`, then trigger a new deploy. The start menu then shows
   «Παιχνίδι με φίλους». Without the variable the game stays single-player only.

## Updating

```bash
cd ~/htdocs/rooms.kivopolis.com/kivopolis && git pull && npm ci && npm run build:server && pm2 restart kivopolis-rooms
```

Rooms are saved every five seconds and when the server stops, so a restart only drops players for
a moment; they reload the page to rejoin.

## Running it locally

```bash
npm run server
```

It listens on port 8787 and saves rooms to `./rooms`. For the dev game to use it, put
`VITE_ROOM_SERVER=ws://localhost:8787` in `.env.development.local` and restart `npm run dev`.
