# KivoPolis room server

Rooms of up to five players building the same island (Phase 12). The game itself stays on Netlify;
this small Node server runs on our own CloudPanel server, and the game connects to it over a secure
WebSocket (`wss://`).

```
browser ── loads the game ──▶ Netlify
   └────── wss:// room ─────▶ rooms.<domain>  (nginx → Node, port 8787)
```

## What it stores

One JSON file per room in `DATA_DIR` (default `./rooms`): the room code, the creator's nickname,
every block change, the shared progress, and each player's inventory and last position, by nickname.
No accounts, e-mail or other personal data. Rooms nobody has used for 60 days are deleted when the
server starts.

## Settings (environment variables)

| Variable | Meaning | Example |
| --- | --- | --- |
| `PORT` | Port the server listens on | `8787` |
| `DATA_DIR` | Folder for the room files | `/home/kivopolis/rooms` |
| `ALLOWED_ORIGINS` | Sites allowed to connect, comma-separated (localhost is always allowed) | `https://<your-site>.netlify.app` |

## Setting it up on CloudPanel

1. **Create a Node.js site** in CloudPanel for a subdomain such as `rooms.<domain>`, with Node 22 and
   app port `8787`. Point the subdomain's DNS at the server first.
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

4. **Get the code onto the server** as the site's user (SSH). If the repository is private, add a
   read-only deploy key for the server in GitHub first.

   ```bash
   git clone https://github.com/chiotis/kivopolis.git ~/kivopolis
   cd ~/kivopolis
   npm ci
   npm run build:server
   ```

5. **Run it with PM2**, so it restarts after a crash or a reboot:

   ```bash
   npm install -g pm2
   PORT=8787 DATA_DIR=$HOME/rooms ALLOWED_ORIGINS=https://<your-site>.netlify.app pm2 start server/dist/index.mjs --name kivopolis-rooms --update-env
   pm2 save
   pm2 startup   # prints one command to run once, so PM2 starts on boot
   ```

6. **Check it:** `https://rooms.<domain>/health` should answer `ok`.
7. **Tell the game where it is:** on Netlify, Site configuration → Environment variables, add
   `VITE_ROOM_SERVER` = `wss://rooms.<domain>`, then trigger a new deploy. The start menu then shows
   «Παιχνίδι με φίλους». Without the variable the game stays single-player only.

## Updating

```bash
cd ~/kivopolis && git pull && npm ci && npm run build:server && pm2 restart kivopolis-rooms
```

Rooms are saved every five seconds and when the server stops, so a restart only drops players for
a moment; they reload the page to rejoin.

## Running it locally

```bash
npm run server
```

It listens on port 8787 and saves rooms to `./rooms`. For the dev game to use it, put
`VITE_ROOM_SERVER=ws://localhost:8787` in `.env.development.local` and restart `npm run dev`.
