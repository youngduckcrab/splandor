// Drives two real clients through the account, friend, reconnect and leave flows.
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');

const PORT = process.env.TEST_PORT || 3999;
const URL = 'ws://localhost:' + PORT;

function client() {
  return new Promise((res) => {
    const ws = new WebSocket(URL);
    ws.q = [];
    ws.waiters = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      const i = ws.waiters.findIndex((w) => !w.type || w.type === m.t);
      if (i >= 0) ws.waiters.splice(i, 1)[0].res(m);
      else ws.q.push(m);
    });
    ws.on('open', () => res(ws));
  });
}
function next(ws, type, ms) {
  const i = ws.q.findIndex((m) => !type || m.t === type);
  if (i >= 0) return Promise.resolve(ws.q.splice(i, 1)[0]);
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout waiting for ' + (type || 'any'))), ms || 5000);
    ws.waiters.push({ type, res: (m) => { clearTimeout(to); res(m); } });
  });
}
function say(ws, msg) { ws.send(JSON.stringify(msg)); }

(async () => {
  const srv = spawn('node', [__dirname + '/../server.js'], {
    env: Object.assign({}, process.env, { PORT, SPLENDOR_SECRET: 'test-secret' }),
    stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 900));
  const done = (code) => { srv.kill(); process.exit(code); };

  try {
    // --- accounts ---------------------------------------------------------
    // Signing in replaces that account's previous socket, so each check below
    // uses its own connection and the live one is established last.
    const probe = await client();
    say(probe, { t: 'login', name: '철수', pass: 'pw12' });
    const authA = await next(probe, 'auth');
    assert(/^[0-9a-f]{12}$/.test(authA.userId), 'user id is a 12-hex friend code');
    assert(authA.token, 'a session token comes back');

    const dup = await client();
    say(dup, { t: 'login', name: '철수', pass: 'pw12' });
    assert.strictEqual((await next(dup, 'auth')).userId, authA.userId, 'same credentials, same id');
    const replaced = await new Promise((r) => probe.on('close', (code) => r(code)));
    assert.strictEqual(replaced, 4001, 'the older session is signed out');
    dup.close();

    const other = await client();
    say(other, { t: 'login', name: '철수', pass: 'other' });
    assert.notStrictEqual((await next(other, 'auth')).userId, authA.userId, 'a wrong password is a different account');
    other.close();

    const weak = await client();
    say(weak, { t: 'login', name: '철수', pass: 'x' });
    assert.strictEqual((await next(weak, 'err')).code, 'passShort', 'short passwords are refused');
    say(weak, { t: 'login', name: '   ', pass: 'pw12' });
    assert.strictEqual((await next(weak, 'err')).code, 'nameNeeded', 'a blank name is refused');
    weak.close();

    const b = await client();
    say(b, { t: 'login', name: 'María', pass: 'clave' });
    const authB = await next(b, 'auth');

    // --- a saved session signs back in without the password ---------------
    const aLive = await client();
    say(aLive, { t: 'auth', token: authA.token });
    assert.strictEqual((await next(aLive, 'auth')).userId, authA.userId, 'token signs the same person back in');

    const forged = await client();
    say(forged, { t: 'auth', token: 'forged.value' });
    assert.strictEqual((await next(forged, 'err')).code, 'sessionExpired', 'a forged token is rejected');
    forged.close();

    // --- friends and presence --------------------------------------------
    say(b, { t: 'watch', ids: [authA.userId] });
    assert.deepStrictEqual((await next(b, 'presence')).online, [authA.userId], 'a watched friend shows as online');

    // --- invitation -------------------------------------------------------
    say(aLive, { t: 'invite', to: authB.userId });
    await next(aLive, 'inviteSent');
    const invited = await next(b, 'invited');
    assert.strictEqual(invited.from.name, '철수', 'the invitation names who sent it');

    say(b, { t: 'inviteAccept', from: authA.userId });
    const sa = await next(aLive, 'state');
    const sb = await next(b, 'state');
    assert(sa.state && sb.state, 'both sides receive the opening board');
    assert.strictEqual(sa.seat, 0);
    assert.strictEqual(sb.seat, 1);
    assert.strictEqual(sa.state.players[1].name, 'María');

    // --- playing ----------------------------------------------------------
    say(aLive, { t: 'action', action: { type: 'take', colors: ['w', 'u', 'g'] } });
    const afterA = await next(b, 'state');
    assert.strictEqual(afterA.state.current, 1, 'the turn passes to the other seat');
    await next(aLive, 'state');
    say(aLive, { t: 'action', action: { type: 'take', colors: ['r'] } });
    assert.strictEqual((await next(aLive, 'err')).code, 'notYourTurn', 'out-of-turn moves are refused');

    // --- dropping out and coming back ------------------------------------
    aLive.close();
    const gone = await next(b, 'state');
    assert.strictEqual(gone.players[0].connected, false, 'the opponent is shown as disconnected');
    assert(gone.state, 'the game is still there while they are away');

    const back = await client();
    say(back, { t: 'auth', token: authA.token });
    await next(back, 'auth');
    const resumed = await next(back, 'state');
    assert(resumed.state, 'signing back in lands straight in the game');
    assert.strictEqual(resumed.state.players[0].tokens.w, 1, 'the position is exactly as it was left');
    assert.strictEqual((await next(b, 'state')).players[0].connected, true, 'the opponent sees them return');

    // --- leaving ends the game -------------------------------------------
    say(back, { t: 'leave' });
    const overB = await next(b, 'state');
    assert(overB.over, 'the other player is told the game ended');
    assert.strictEqual(overB.over.reason, 'left');
    assert.strictEqual(overB.over.winner, 1, 'the player who stayed wins');
    assert.strictEqual(overB.state.phase, 'over');
    await next(back, 'left');

    // --- after leaving, both are free to start again ---------------------
    say(back, { t: 'invite', to: authB.userId });
    await next(back, 'inviteSent');
    say(b, { t: 'inviteAccept', from: authA.userId });
    await next(b, 'state');
    await next(back, 'state');

    // --- an invitation can be declined -----------------------------------
    say(back, { t: 'leave' });
    await next(back, 'left');
    await next(b, 'state');
    say(back, { t: 'invite', to: authB.userId });
    await next(back, 'inviteSent');
    await next(b, 'invited');
    say(b, { t: 'inviteDecline', from: authA.userId });
    assert.strictEqual((await next(back, 'inviteDeclined')).by.name, 'María', 'a decline names who declined');

    // --- inviting someone who is not there -------------------------------
    say(back, { t: 'invite', to: 'aaaaaaaaaaaa' });
    assert.strictEqual((await next(back, 'err')).code, 'friendOffline', 'an absent friend cannot be invited');
    say(back, { t: 'invite', to: authA.userId });
    assert.strictEqual((await next(back, 'err')).code, 'badFriendCode', 'you cannot invite yourself');

    // --- room codes still work, and need an account ----------------------
    const c = await client();
    say(c, { t: 'create' });
    assert.strictEqual((await next(c, 'err')).code, 'notLoggedIn', 'anonymous play is refused');
    say(c, { t: 'login', name: 'Guest', pass: 'pass' });
    await next(c, 'auth');
    say(c, { t: 'create' });
    const made = await next(c, 'state');
    assert(/^[A-Z0-9]{4}$/.test(made.room), 'a four-letter room code is issued');
    assert.strictEqual(made.state, null, 'the game waits for a second player');
    say(b, { t: 'join', code: made.room });
    assert((await next(b, 'state')).state, 'joining by code starts the game');
    say(back, { t: 'join', code: 'ZZZZ' });
    assert.strictEqual((await next(back, 'err')).code, 'roomNotFound', 'a bad code is refused');

    console.log('online ok: accounts, tokens, presence, invitations, reconnect, leave, room codes');
    done(0);
  } catch (e) {
    console.error('FAILED:', e.message);
    done(1);
  }
})();
