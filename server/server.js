'use strict';
// Splendor online — accounts, friends, rooms and reconnection.
//
// There is no database. An account's identity is DERIVED from its nickname and
// password with a keyed hash, so the same credentials always produce the same
// user id and nothing has to survive a restart for a player to come back.
// Friend lists live on each player's own device; the server only needs to know
// who is connected right now, which is temporary by nature anyway.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Splendor = require('../game.js');

const PORT = process.env.PORT || 3000;
// Set SPLENDOR_SECRET in the host's environment. Without it, accounts on this
// deployment are only as private as this file: fine for a game between friends,
// not fine for anything else.
const SECRET = process.env.SPLENDOR_SECRET || 'splendor-local-development-secret';
const GRACE_MS = 20 * 60 * 1000;      // how long a game waits for someone to come back
const CLAIM_AFTER_MS = 60 * 1000;     // when the waiting player may end it instead
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_PASS = 4;
const SEP = String.fromCharCode(0);

/* ---------------- static files ---------------- */
const SITE = path.resolve(__dirname, '..');
const SERVABLE = new Set(['index.html', 'game.js', 'art.js', 'fx.js', 'manifest.webmanifest', 'icon.svg']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(SITE, path.normalize(file));
  const name = path.basename(full);
  if (path.dirname(full) !== SITE || !SERVABLE.has(name)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('not found');
  }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

/* ---------------- identity ---------------- */
function hmac(data) { return crypto.createHmac('sha256', SECRET).update(data).digest(); }
// The id IS the credential pair. No account rows, nothing to lose on a restart.
function userIdFor(nick, pass) {
  return hmac(nick.toLowerCase().trim() + SEP + pass).toString('hex').slice(0, 12);
}
function cleanName(n) { return String(n || '').trim().replace(/\s+/g, ' ').slice(0, 16); }
function makeToken(uid, name) {
  const body = Buffer.from(JSON.stringify({ u: uid, n: name })).toString('base64url');
  return body + '.' + hmac(body).toString('base64url').slice(0, 32);
}
function readToken(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 2) return null;
  const want = hmac(parts[0]).toString('base64url').slice(0, 32);
  const got = Buffer.from(parts[1].padEnd(32, '.').slice(0, 32));
  if (!crypto.timingSafeEqual(got, Buffer.from(want.padEnd(32, '.').slice(0, 32)))) return null;
  try {
    const o = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return o && o.u ? { userId: o.u, name: o.n } : null;
  } catch (e) { return null; }
}
function normId(s) { return String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 12); }

/* ---------------- live state ---------------- */
const online = new Map();   // userId -> ws
const rooms = new Map();    // roomId -> room
const roomOf = new Map();   // userId -> roomId
const invites = new Map();  // "from>to" -> { from, to, at }

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function toUser(uid, msg) { send(online.get(uid), msg); }

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from(crypto.randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join(''); } while (rooms.has(c));
  return c;
}
function makeRoom(code) {
  const room = { id: code || roomCode(), seats: [], game: null, rematch: [], over: null, touched: Date.now() };
  rooms.set(room.id, room);
  return room;
}
function seatOf(room, uid) { return room.seats.findIndex((s) => s.userId === uid); }

// The player still at the table may end a game their opponent has abandoned.
function canClaim(room, seat) {
  if (!room.game || room.game.phase === 'over' || room.seats.length < 2) return false;
  const other = room.seats[1 - seat];
  if (!other || online.has(other.userId)) return false;
  return Date.now() - (other.goneSince || 0) > CLAIM_AFTER_MS;
}
function pushRoom(room) {
  room.touched = Date.now();
  const players = room.seats.map((s) => ({
    id: s.userId,
    name: s.name,
    connected: online.has(s.userId),
    goneFor: online.has(s.userId) ? 0 : Date.now() - (s.goneSince || Date.now())
  }));
  room.seats.forEach((s, seat) => {
    toUser(s.userId, {
      t: 'state', room: room.id, seat, players,
      state: room.game ? Splendor.viewFor(room.game, seat) : null,
      rematch: room.rematch, over: room.over, canClaim: canClaim(room, seat)
    });
  });
}
function endRoom(room, reason, winnerSeat) {
  if (room.game) {
    room.game.phase = 'over';
    room.game.winner = winnerSeat == null ? null : winnerSeat;
  }
  room.over = { reason, winner: winnerSeat == null ? null : winnerSeat };
  pushRoom(room);
  room.seats.forEach((s) => { if (roomOf.get(s.userId) === room.id) roomOf.delete(s.userId); });
  rooms.delete(room.id);
}

/* ---------------- presence ---------------- */
function pushPresence(ws) {
  if (!ws.userId) return;
  send(ws, { t: 'presence', online: (ws.watch || []).filter((id) => online.has(id)) });
}
// Tell everyone watching this person that their light changed.
function announce(uid) {
  online.forEach((peer) => { if (peer.watch && peer.watch.indexOf(uid) >= 0) pushPresence(peer); });
}

/* ---------------- websocket ---------------- */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.watch = [];
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    try { handle(ws, msg); }
    catch (e) { send(ws, { t: 'err', code: e.code || 'invalidAction' }); }
  });
  ws.on('close', () => dropped(ws));
});

function dropped(ws) {
  const uid = ws.userId;
  if (!uid || online.get(uid) !== ws) return;
  online.delete(uid);
  const rid = roomOf.get(uid);
  if (rid && rooms.has(rid)) {
    const room = rooms.get(rid);
    const seat = seatOf(room, uid);
    if (seat >= 0) room.seats[seat].goneSince = Date.now();
    pushRoom(room);
  }
  announce(uid);
}
function fail(code) { const e = new Error(code); e.code = code; return e; }

function signIn(ws, userId, name) {
  const prev = online.get(userId);
  if (prev && prev !== ws) { try { prev.close(4001, 'replaced'); } catch (e) {} }
  ws.userId = userId;
  ws.name = name;
  online.set(userId, ws);
  send(ws, { t: 'auth', userId, name, token: makeToken(userId, name) });
  announce(userId);
  // Walk straight back into the game that was left running.
  const rid = roomOf.get(userId);
  if (rid && rooms.has(rid)) {
    const room = rooms.get(rid);
    const seat = seatOf(room, userId);
    if (seat >= 0) {
      room.seats[seat].goneSince = 0;
      room.seats[seat].name = name;
      pushRoom(room);
    }
  }
}

function handle(ws, msg) {
  switch (msg.t) {
    case 'ping': return send(ws, { t: 'pong' });
    case 'login': {
      const name = cleanName(msg.name);
      const pass = String(msg.pass || '');
      if (!name) throw fail('nameNeeded');
      if (pass.length < MIN_PASS) throw fail('passShort');
      return signIn(ws, userIdFor(name, pass), name);
    }
    case 'auth': {
      const t = readToken(msg.token);
      if (!t) throw fail('sessionExpired');
      return signIn(ws, t.userId, cleanName(msg.name) || t.name);
    }
    case 'logout': {
      const uid = ws.userId;
      if (uid && online.get(uid) === ws) { online.delete(uid); announce(uid); }
      ws.userId = null;
      return send(ws, { t: 'loggedOut' });
    }
  }

  if (!ws.userId) throw fail('notLoggedIn');
  const me = ws.userId;

  switch (msg.t) {
    case 'watch': {
      ws.watch = (Array.isArray(msg.ids) ? msg.ids : []).map(normId).filter(Boolean).slice(0, 50);
      return pushPresence(ws);
    }
    case 'invite': {
      const to = normId(msg.to);
      if (!to || to === me) throw fail('badFriendCode');
      if (!online.has(to)) throw fail('friendOffline');
      if (roomOf.has(me)) throw fail('alreadyPlaying');
      if (roomOf.has(to)) throw fail('friendBusy');
      invites.set(me + '>' + to, { from: me, to, at: Date.now() });
      toUser(to, { t: 'invited', from: { id: me, name: ws.name } });
      return send(ws, { t: 'inviteSent', to });
    }
    case 'inviteCancel': {
      const to = normId(msg.to);
      invites.delete(me + '>' + to);
      return toUser(to, { t: 'inviteOff', from: me });
    }
    case 'inviteDecline': {
      const from = normId(msg.from);
      invites.delete(from + '>' + me);
      return toUser(from, { t: 'inviteDeclined', by: { id: me, name: ws.name } });
    }
    case 'inviteAccept': {
      const from = normId(msg.from);
      if (!invites.get(from + '>' + me)) throw fail('inviteGone');
      invites.delete(from + '>' + me);
      const host = online.get(from);
      if (!host) throw fail('friendOffline');
      if (roomOf.has(from) || roomOf.has(me)) throw fail('alreadyPlaying');
      const room = makeRoom();
      room.seats = [
        { userId: from, name: host.name, goneSince: 0 },
        { userId: me, name: ws.name, goneSince: 0 }
      ];
      room.game = Splendor.newGame(room.seats.map((s) => s.name));
      roomOf.set(from, room.id);
      roomOf.set(me, room.id);
      return pushRoom(room);
    }
    case 'create': {
      if (roomOf.has(me)) throw fail('alreadyPlaying');
      const room = makeRoom(roomCode());
      room.seats = [{ userId: me, name: ws.name, goneSince: 0 }];
      roomOf.set(me, room.id);
      return pushRoom(room);
    }
    case 'join': {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) throw fail('roomNotFound');
      if (seatOf(room, me) >= 0) return pushRoom(room);
      if (room.seats.length >= 2) throw fail('roomFull');
      if (roomOf.has(me)) throw fail('alreadyPlaying');
      room.seats.push({ userId: me, name: ws.name, goneSince: 0 });
      roomOf.set(me, room.id);
      room.game = Splendor.newGame(room.seats.map((s) => s.name));
      return pushRoom(room);
    }
    case 'action': {
      const room = rooms.get(roomOf.get(me));
      if (!room || !room.game) throw fail('invalidAction');
      const seat = seatOf(room, me);
      if (seat < 0) throw fail('invalidAction');
      room.game = Splendor.apply(room.game, seat, msg.action);
      return pushRoom(room);
    }
    case 'rematch': {
      const room = rooms.get(roomOf.get(me));
      if (!room || !room.game || room.game.phase !== 'over') throw fail('invalidAction');
      const seat = seatOf(room, me);
      if (room.rematch.indexOf(seat) < 0) room.rematch.push(seat);
      if (room.rematch.length >= room.seats.length) {
        room.game = Splendor.newGame(room.seats.map((s) => s.name));
        room.rematch = [];
        room.over = null;
      }
      return pushRoom(room);
    }
    // Walking away ends the game. Deliberate, and different from dropping out.
    case 'leave': {
      const room = rooms.get(roomOf.get(me));
      if (!room) return send(ws, { t: 'left' });
      const seat = seatOf(room, me);
      endRoom(room, 'left', room.seats.length > 1 ? 1 - seat : null);
      return send(ws, { t: 'left' });
    }
    // The opponent has been gone a while; whoever is still here may take the win.
    case 'claimWin': {
      const room = rooms.get(roomOf.get(me));
      if (!room) throw fail('invalidAction');
      const seat = seatOf(room, me);
      if (!canClaim(room, seat)) throw fail('cannotClaim');
      return endRoom(room, 'abandoned', seat);
    }
    default:
      throw fail('invalidAction');
  }
}

// Drop sockets that stopped answering, so the presence lights stay honest.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { dropped(ws); return ws.terminate(); }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);

// Forget rooms nobody came back to, and invitations nobody answered.
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, id) => {
    const everyoneGone = room.seats.every((s) => !online.has(s.userId));
    const idle = now - room.touched;
    if ((everyoneGone && idle > GRACE_MS) || idle > ROOM_TTL_MS) {
      room.seats.forEach((s) => { if (roomOf.get(s.userId) === id) roomOf.delete(s.userId); });
      rooms.delete(id);
    }
  });
  invites.forEach((inv, k) => { if (now - inv.at > 2 * 60 * 1000) invites.delete(k); });
}, 60 * 1000);

// Let the waiting player know the moment ending it becomes possible.
setInterval(() => {
  rooms.forEach((room) => {
    if (!room.game || room.game.phase === 'over') return;
    if (room.seats.some((s, i) => canClaim(room, i) && online.has(s.userId))) pushRoom(room);
  });
}, 15000);

server.listen(PORT, () => console.log('Splendor server on http://localhost:' + PORT));
