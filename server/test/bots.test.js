// The three computer opponents live in index.html. Lift them out and play them
// against each other: harder must win more, and none of them may ever hand the
// engine a move it refuses.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const S = require('../../game.js');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const from = html.indexOf('/* ---------------- Computer opponent');
const to = html.indexOf('// The beat before the computer reaches for the table.');
assert(from > 0 && to > from, 'the computer opponents are where the tests expect them');
const botAction = new Function('S', html.slice(from, to) + '\nreturn botAction;')(S);

// The bots always read themselves as players[1]; show seat 0 a swapped table.
function mirror(s) {
  const m = JSON.parse(JSON.stringify(s));
  m.players = [s.players[1], s.players[0]];
  m.current = 1 - s.current;
  return m;
}
let refused = 0, unfinished = 0;
function play(levelA, levelB) {
  let s = S.newGame(['A', 'B']);
  for (let i = 0; i < 600 && s.phase !== 'over'; i++) {
    const seat = s.current;
    const level = seat === 0 ? levelA : levelB;
    let action;
    try { action = botAction(seat === 1 ? s : mirror(s), level); }
    catch (e) { refused++; action = { type: 'pass' }; }
    try { s = S.apply(s, seat, action); }
    catch (e) {
      refused++;
      try { s = S.apply(s, seat, { type: 'pass' }); } catch (e2) { unfinished++; return null; }
    }
  }
  if (s.phase !== 'over') { unfinished++; return null; }
  return { winner: s.winner };   // winner is null on a draw, which is not a failure
}

const N = 120;
const lines = [];
[['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard']].forEach(([a, b]) => {
  let winA = 0, winB = 0, draws = 0, played = 0;
  for (let i = 0; i < N; i++) {
    // Half the games each way, so moving first is not what decides it.
    const flip = i % 2 === 1;
    const r = flip ? play(b, a) : play(a, b);
    if (!r) continue;
    played++;
    const seatA = flip ? 1 : 0;
    if (r.winner === seatA) winA++; else if (r.winner === 1 - seatA) winB++; else draws++;
  }
  assert(played > N * 0.9, a + ' vs ' + b + ' finishes its games');
  assert(winB > winA, b + ' must beat ' + a + ' (' + winB + ' - ' + winA + ')');
  lines.push(`${a} ${winA}-${winB} ${b}` + (draws ? ` (${draws} drawn)` : ''));
});
assert.strictEqual(refused, 0, 'no computer opponent offers an illegal move (' + refused + ')');
assert.strictEqual(unfinished, 0, 'every game reaches an end (' + unfinished + ')');
console.log('bots ok:', lines.join(', '), '- over', N, 'games each, both seats');
