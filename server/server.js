'use strict';
// Splendor online — tiny authoritative game server.
// Serves ./public over HTTP and runs rooms over WebSocket on the same port.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Splendor = require('../game.js');

const PORT = process.env.PORT || 3000;
// The playable site lives at the repository root so GitHub Pages can serve it directly;
// this server hands out exactly those files and nothing else.
const PUBLIC = path.resolve(__dirname, '..');
const SERVABLE = new Set(['index.html', 'game.js', 'art.js', 'fx.js', 'manifest.webmanifest', 'icon.svg']);
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC, file);
  const name = path.basename(full);
  if (!full.startsWith(PUBLIC) || path.dirname(full) !== PUBLIC || !SERVABLE.has(name)) {
    if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found');
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();
const wss = new WebSocketServer({ server });

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  do { c = Array.from(crypto.randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join(''); } while (rooms.has(c));
  return c;
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function cleanName(n) { return String(n || '').trim().slice(0, 16) || '?'; }

function broadcast(room) {
  room.updatedAt = Date.now();
  const players = room.players.map((p) => ({ name: p.name, connected: !!(p.ws && p.ws.readyState === 1) }));
  room.players.forEach((p, seat) => {
    send(p.ws, { t: 'state', code: room.code, seat, players, state: room.game ? Splendor.viewFor(room.game, seat) : null, rematch: room.rematch });
  });
}

function attach(ws, room, seat) {
  const p = room.players[seat];
  if (p.ws && p.ws !== ws && p.ws.readyState === 1) { try { p.ws.close(4000, 'replaced'); } catch (e) {} }
  p.ws = ws;
  ws.room = room; ws.seat = seat;
  send(ws, { t: 'joined', code: room.code, seat, token: p.token });
  broadcast(room);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    try { handle(ws, msg); } catch (e) { send(ws, { t: 'err', code: e.code || 'invalidAction' }); }
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const p = room.players[ws.seat];
    if (p && p.ws === ws) { p.ws = null; broadcast(room); }
  });
});

function handle(ws, msg) {
  switch (msg.t) {
    case 'ping': return send(ws, { t: 'pong' });
    case 'create': {
      const room = { code: code(), players: [{ name: cleanName(msg.name), token: crypto.randomBytes(12).toString('hex'), ws: null }], game: null, rematch: [], createdAt: Date.now(), updatedAt: Date.now() };
      rooms.set(room.code, room);
      return attach(ws, room, 0);
    }
    case 'join': {
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) throw Object.assign(new Error(), { code: 'roomNotFound' });
      if (room.players.length >= 2) throw Object.assign(new Error(), { code: 'roomFull' });
      room.players.push({ name: cleanName(msg.name), token: crypto.randomBytes(12).toString('hex'), ws: null });
      room.game = Splendor.newGame(room.players.map((p) => p.name));
      return attach(ws, room, 1);
    }
    case 'rejoin': {
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) throw Object.assign(new Error(), { code: 'roomNotFound' });
      const seat = room.players.findIndex((p) => p.token === msg.token);
      if (seat < 0) throw Object.assign(new Error(), { code: 'roomNotFound' });
      if (msg.name) room.players[seat].name = cleanName(msg.name);
      return attach(ws, room, seat);
    }
    case 'action': {
      const room = ws.room;
      if (!room || !room.game) throw Object.assign(new Error(), { code: 'invalidAction' });
      room.game = Splendor.apply(room.game, ws.seat, msg.action);
      return broadcast(room);
    }
    case 'rematch': {
      const room = ws.room;
      if (!room || !room.game || room.game.phase !== 'over') throw Object.assign(new Error(), { code: 'invalidAction' });
      if (room.rematch.indexOf(ws.seat) < 0) room.rematch.push(ws.seat);
      if (room.rematch.length >= room.players.length) {
        // Loser of the last game starts the next one.
        const names = room.players.map((p) => p.name);
        room.game = Splendor.newGame(names);
        if (room.game && typeof room.game.winner === 'number') room.game.current = 0;
        room.rematch = [];
      }
      return broadcast(room);
    }
    default:
      throw Object.assign(new Error(), { code: 'invalidAction' });
  }
}

// Heartbeat: drop dead sockets so the other player sees "offline".
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 30000);

// Forget rooms nobody touched for a day.
setInterval(() => {
  const now = Date.now();
  for (const [c, room] of rooms) if (now - room.updatedAt > ROOM_TTL_MS) rooms.delete(c);
}, 60 * 60 * 1000);

server.listen(PORT, () => console.log('Splendor server listening on http://localhost:' + PORT));
