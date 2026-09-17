// Plays random legal games through the engine to check that rules never desync.
const S = require('../../game.js');
const assert = require('assert');
function legalActions(s, seat) {
  const p = s.players[seat], acts = [];
  if (s.phase === 'discard') {
    const excess = S.sum(p.tokens) - S.MAX_TOKENS, tokens = { w: 0, u: 0, g: 0, r: 0, k: 0, y: 0 };
    let left = excess;
    for (const c of Object.keys(tokens)) { const n = Math.min(left, p.tokens[c]); tokens[c] = n; left -= n; }
    return [{ type: 'discard', tokens }];
  }
  if (s.phase === 'noble') return s.pendingNobles.map((id) => ({ type: 'noble', nobleId: id }));
  for (const t of [1, 2, 3]) for (const id of s.board[t]) if (id && S.canAfford(p, S.CARD_BY_ID[id])) acts.push({ type: 'buy', cardId: id });
  for (const r of p.reserved) if (S.canAfford(p, S.CARD_BY_ID[r.id])) acts.push({ type: 'buy', cardId: r.id });
  const avail = S.COLORS.filter((c) => s.bank[c] > 0);
  if (avail.length >= 3) acts.push({ type: 'take', colors: avail.slice(0, 3) }, { type: 'take', colors: avail.slice(-3) });
  else if (avail.length) acts.push({ type: 'take', colors: avail });
  for (const c of S.COLORS) if (s.bank[c] >= 4) acts.push({ type: 'take', colors: [c, c] });
  if (p.reserved.length < S.MAX_RESERVED) for (const t of [1, 2, 3]) { if (s.decks[t].length) acts.push({ type: 'reserve', tier: t }); const id = s.board[t][0]; if (id) acts.push({ type: 'reserve', tier: t, cardId: id }); }
  if (!acts.length) acts.push({ type: 'pass' });
  return acts;
}
let games = 0, turnsTotal = 0;
for (let seed = 1; seed <= 200; seed++) {
  let s = S.newGame(['A', 'B'], seed), guard = 0;
  while (s.phase !== 'over' && guard++ < 2000) {
    const acts = legalActions(s, s.current);
    assert(acts.length, 'no legal action');
    // Prefer buying so games end.
    const buys = acts.filter((a) => a.type === 'buy');
    const a = buys.length ? buys[0] : acts[Math.floor(((seed * 7919 + guard * 104729) % 1000) / 1000 * acts.length)];
    s = S.apply(s, s.current, a);
    // Invariants
    const total = { w: 0, u: 0, g: 0, r: 0, k: 0, y: 0 };
    for (const c in total) total[c] = s.bank[c] + s.players[0].tokens[c] + s.players[1].tokens[c];
    assert.deepStrictEqual(total, { w: 4, u: 4, g: 4, r: 4, k: 4, y: 5 }, 'token conservation');
    for (const p of s.players) { if (s.phase !== 'discard') assert(S.sum(p.tokens) <= 10); assert(p.reserved.length <= 3); }
    const cardsOut = [1, 2, 3].reduce((n, t) => n + s.decks[t].length + s.board[t].filter(Boolean).length, 0) + s.players.reduce((n, p) => n + p.cards.length + p.reserved.length, 0);
    assert.strictEqual(cardsOut, 90, 'card conservation');
  }
  assert.strictEqual(s.phase, 'over', 'game finished seed ' + seed);
  assert(s.players.some((p) => p.points >= 15));
  const top = Math.max(...s.players.map((p) => p.points));
  if (s.winner !== null) { assert.strictEqual(s.players[s.winner].points, top, 'winner has top score'); }
  else assert(s.players.filter((p) => p.points === top).length === 2, 'draw only on equal score');
  games++; turnsTotal += s.turn;
}
// Pass is only legal when nothing else is
assert.throws(() => S.apply(S.newGame(['A','B'],3), 0, { type: 'pass' }), /invalidAction/);
// Error paths
let s = S.newGame(['A', 'B'], 5);
assert.throws(() => S.apply(s, 1, { type: 'take', colors: ['w'] }), /notYourTurn/);
assert.throws(() => S.apply(s, 0, { type: 'take', colors: ['w', 'w', 'u'] }), /badTake/);
assert.throws(() => S.apply(s, 0, { type: 'buy', cardId: 'c3k0' }), /cantAfford/);
s.bank.w = 3;
assert.throws(() => S.apply(s, 0, { type: 'take', colors: ['w', 'w'] }), /needFour/);
// Hidden reserved card is masked for the opponent
s = S.newGame(['A', 'B'], 9);
s = S.apply(s, 0, { type: 'reserve', tier: 2 });
assert.strictEqual(S.viewFor(s, 1).players[0].reserved[0].id, null);
assert.strictEqual(S.viewFor(s, 0).players[0].reserved[0].id, s.players[0].reserved[0].id);
console.log('engine ok:', games, 'random games, avg', (turnsTotal / games).toFixed(1), 'rounds');
