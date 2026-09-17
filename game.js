/* Splendor rules engine — shared by the server (Node) and the browser client.
   2-player rules: 4 tokens per gem, 5 gold, 3 nobles, 15 points ends the round. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Splendor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['w', 'u', 'g', 'r', 'k']; // white, blue, green, red, black
  var GOLD = 'y';
  var MAX_TOKENS = 10;
  var MAX_RESERVED = 3;
  var WIN_POINTS = 15;

  // Cost order: [w, u, g, r, k]
  var RAW = {
    1: {
      k: [[0, 1, 1, 1, 1, 0], [0, 1, 2, 1, 1, 0], [0, 2, 2, 0, 1, 0], [0, 0, 0, 1, 3, 1], [0, 0, 0, 2, 1, 0], [0, 2, 0, 2, 0, 0], [0, 0, 0, 3, 0, 0], [1, 0, 4, 0, 0, 0]],
      u: [[0, 1, 0, 1, 1, 1], [0, 1, 0, 1, 2, 1], [0, 1, 0, 2, 2, 0], [0, 0, 1, 3, 1, 0], [0, 1, 0, 0, 0, 2], [0, 0, 0, 2, 0, 2], [0, 0, 0, 0, 0, 3], [1, 0, 0, 0, 4, 0]],
      w: [[0, 0, 1, 1, 1, 1], [0, 0, 1, 2, 1, 1], [0, 0, 2, 2, 0, 1], [0, 3, 1, 0, 0, 1], [0, 0, 0, 0, 2, 1], [0, 0, 2, 0, 0, 2], [0, 0, 3, 0, 0, 0], [1, 0, 0, 4, 0, 0]],
      g: [[0, 1, 1, 0, 1, 1], [0, 1, 1, 0, 1, 2], [0, 0, 1, 0, 2, 2], [0, 1, 3, 1, 0, 0], [0, 2, 1, 0, 0, 0], [0, 0, 2, 0, 2, 0], [0, 0, 0, 0, 3, 0], [1, 0, 0, 0, 0, 4]],
      r: [[0, 1, 1, 1, 0, 1], [0, 2, 1, 1, 0, 1], [0, 2, 0, 1, 0, 2], [0, 1, 0, 0, 1, 3], [0, 0, 2, 1, 0, 0], [0, 2, 0, 0, 2, 0], [0, 3, 0, 0, 0, 0], [1, 4, 0, 0, 0, 0]]
    },
    2: {
      k: [[1, 3, 2, 2, 0, 0], [1, 3, 0, 3, 0, 2], [2, 0, 1, 4, 2, 0], [2, 0, 0, 5, 3, 0], [2, 5, 0, 0, 0, 0], [3, 0, 0, 0, 0, 6]],
      u: [[1, 0, 2, 2, 3, 0], [1, 0, 2, 3, 0, 3], [2, 5, 3, 0, 0, 0], [2, 2, 0, 0, 1, 4], [2, 0, 5, 0, 0, 0], [3, 0, 6, 0, 0, 0]],
      w: [[1, 0, 0, 3, 2, 2], [1, 2, 3, 0, 3, 0], [2, 0, 0, 1, 4, 2], [2, 0, 0, 0, 5, 3], [2, 0, 0, 0, 5, 0], [3, 6, 0, 0, 0, 0]],
      g: [[1, 2, 3, 0, 0, 2], [1, 3, 0, 2, 3, 0], [2, 4, 2, 0, 0, 1], [2, 0, 5, 3, 0, 0], [2, 0, 0, 5, 0, 0], [3, 0, 0, 6, 0, 0]],
      r: [[1, 2, 0, 0, 2, 3], [1, 0, 3, 0, 2, 3], [2, 1, 4, 2, 0, 0], [2, 3, 0, 0, 0, 5], [2, 0, 0, 0, 0, 5], [3, 0, 0, 0, 6, 0]]
    },
    3: {
      k: [[3, 3, 3, 5, 3, 0], [4, 0, 0, 0, 7, 0], [4, 0, 0, 3, 6, 3], [5, 0, 0, 0, 7, 3]],
      u: [[3, 3, 0, 3, 3, 5], [4, 7, 0, 0, 0, 0], [4, 6, 3, 0, 0, 3], [5, 7, 3, 0, 0, 0]],
      w: [[3, 0, 3, 3, 5, 3], [4, 0, 0, 0, 0, 7], [4, 3, 0, 0, 3, 6], [5, 3, 0, 0, 0, 7]],
      g: [[3, 5, 3, 0, 3, 3], [4, 0, 7, 0, 0, 0], [4, 3, 6, 3, 0, 0], [5, 0, 7, 3, 0, 0]],
      r: [[3, 3, 5, 3, 0, 3], [4, 0, 0, 7, 0, 0], [4, 0, 3, 6, 3, 0], [5, 0, 0, 7, 3, 0]]
    }
  };

  var CARDS = [];
  var CARD_BY_ID = {};
  [1, 2, 3].forEach(function (tier) {
    COLORS.forEach(function (color) {
      RAW[tier][color].forEach(function (row, i) {
        var card = { id: 'c' + tier + color + i, tier: tier, color: color, pts: row[0], cost: {} };
        COLORS.forEach(function (c, ci) { if (row[ci + 1]) card.cost[c] = row[ci + 1]; });
        CARDS.push(card);
        CARD_BY_ID[card.id] = card;
      });
    });
  });

  var NOBLE_RAW = [[0, 0, 4, 4, 0], [3, 3, 3, 0, 0], [0, 3, 3, 3, 0], [4, 0, 0, 0, 4], [3, 0, 0, 3, 3], [4, 4, 0, 0, 0], [0, 4, 4, 0, 0], [3, 3, 0, 0, 3], [0, 0, 3, 3, 3], [0, 0, 0, 4, 4]];
  var NOBLES = NOBLE_RAW.map(function (row, i) {
    var n = { id: 'n' + i, pts: 3, req: {} };
    COLORS.forEach(function (c, ci) { if (row[ci]) n.req[c] = row[ci]; });
    return n;
  });
  var NOBLE_BY_ID = {};
  NOBLES.forEach(function (n) { NOBLE_BY_ID[n.id] = n; });

  // Small deterministic PRNG so a seed reproduces a game.
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function zeroTokens() { return { w: 0, u: 0, g: 0, r: 0, k: 0, y: 0 }; }
  function sum(obj) { var t = 0; for (var k in obj) t += obj[k]; return t; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function newGame(names, seed) {
    var rand = rng(seed || (Date.now() & 0x7fffffff));
    var n = names.length;
    var perGem = n === 2 ? 4 : n === 3 ? 5 : 7;
    var state = {
      seed: seed,
      seq: 0,
      players: names.map(function (name) {
        return { name: name, tokens: zeroTokens(), cards: [], reserved: [], nobles: [], points: 0 };
      }),
      bank: { w: perGem, u: perGem, g: perGem, r: perGem, k: perGem, y: 5 },
      decks: {}, board: {},
      nobles: shuffle(NOBLES.map(function (x) { return x.id; }), rand).slice(0, n + 1),
      current: 0,
      turn: 1,
      phase: 'action',
      pendingNobles: null,
      endTriggered: false,
      winner: null,
      log: []
    };
    [1, 2, 3].forEach(function (tier) {
      var ids = CARDS.filter(function (c) { return c.tier === tier; }).map(function (c) { return c.id; });
      shuffle(ids, rand);
      state.board[tier] = ids.splice(0, 4);
      state.decks[tier] = ids;
    });
    return state;
  }

  function bonuses(player) {
    var b = { w: 0, u: 0, g: 0, r: 0, k: 0 };
    player.cards.forEach(function (id) { b[CARD_BY_ID[id].color]++; });
    return b;
  }

  // What the player would pay for a card: {w,u,g,r,k,y} or null if unaffordable.
  function payment(player, card) {
    var b = bonuses(player), pay = zeroTokens(), goldNeeded = 0;
    for (var i = 0; i < COLORS.length; i++) {
      var c = COLORS[i];
      var need = Math.max(0, (card.cost[c] || 0) - b[c]);
      var have = player.tokens[c];
      if (have >= need) pay[c] = need;
      else { pay[c] = have; goldNeeded += need - have; }
    }
    if (goldNeeded > player.tokens.y) return null;
    pay.y = goldNeeded;
    return pay;
  }

  function canAfford(player, card) { return payment(player, card) !== null; }

  function findReserved(player, id) {
    for (var i = 0; i < player.reserved.length; i++) if (player.reserved[i].id === id) return i;
    return -1;
  }

  function nobleEligible(player, nobleId) {
    var b = bonuses(player), req = NOBLE_BY_ID[nobleId].req;
    for (var c in req) if (b[c] < req[c]) return false;
    return true;
  }

  function fail(code) { var e = new Error(code); e.code = code; return e; }

  // Log entries carry a monotonic seq so a client can replay exactly the moves it has not seen,
  // even once the log is trimmed to its tail.
  function pushLog(s, entry) {
    s.seq = (s.seq || 0) + 1;
    entry.seq = s.seq;
    s.log.push(entry);
    return entry;
  }

  // True when the player can take, reserve, or buy anything this turn.
  function hasLegalAction(s, seat) {
    var p = s.players[seat];
    for (var i = 0; i < COLORS.length; i++) if (s.bank[COLORS[i]] > 0) return true;
    if (p.reserved.length < MAX_RESERVED) {
      for (var t = 1; t <= 3; t++) if (s.decks[t].length || s.board[t].some(function (id) { return !!id; })) return true;
    }
    for (t = 1; t <= 3; t++) for (i = 0; i < s.board[t].length; i++) if (s.board[t][i] && canAfford(p, CARD_BY_ID[s.board[t][i]])) return true;
    for (i = 0; i < p.reserved.length; i++) if (canAfford(p, CARD_BY_ID[p.reserved[i].id])) return true;
    return false;
  }

  // Applies an action to a copy of the state and returns the new state. Throws {code} on rule violation.
  function apply(prev, seat, action) {
    var s = clone(prev);
    if (s.phase === 'over') throw fail('gameOver');
    if (seat !== s.current) throw fail('notYourTurn');
    var p = s.players[seat];
    var entry = { seat: seat, turn: s.turn };

    if (s.phase === 'discard') {
      if (action.type !== 'discard') throw fail('mustDiscard');
      var give = action.tokens || {}, total = 0;
      for (var c in give) {
        if (!(c in p.tokens) || give[c] < 0 || give[c] !== Math.floor(give[c])) throw fail('invalidAction');
        if (give[c] > p.tokens[c]) throw fail('invalidAction');
        total += give[c];
      }
      if (sum(p.tokens) - total !== MAX_TOKENS) throw fail('discardCount');
      for (c in give) { p.tokens[c] -= give[c]; s.bank[c] += give[c]; }
      entry.type = 'discard'; entry.tokens = give;
      pushLog(s, entry);
      return afterAction(s, seat);
    }

    if (s.phase === 'noble') {
      if (action.type !== 'noble') throw fail('mustChooseNoble');
      if (!s.pendingNobles || s.pendingNobles.indexOf(action.nobleId) < 0) throw fail('invalidAction');
      awardNoble(s, seat, action.nobleId);
      s.pendingNobles = null;
      return endTurn(s);
    }

    // phase === 'action'
    switch (action.type) {
      case 'take': {
        var colors = action.colors || [];
        if (colors.length < 1 || colors.length > 3) throw fail('badTake');
        for (var i = 0; i < colors.length; i++) if (COLORS.indexOf(colors[i]) < 0) throw fail('badTake');
        var distinct = {}; colors.forEach(function (c) { distinct[c] = (distinct[c] || 0) + 1; });
        var keys = Object.keys(distinct);
        if (keys.length === 1 && colors.length === 2) {
          if (s.bank[keys[0]] < 4) throw fail('needFour');
        } else if (keys.length !== colors.length) throw fail('badTake');
        for (var k in distinct) if (s.bank[k] < distinct[k]) throw fail('bankShort');
        for (k in distinct) { s.bank[k] -= distinct[k]; p.tokens[k] += distinct[k]; }
        entry.type = 'take'; entry.colors = colors;
        break;
      }
      case 'reserve': {
        if (p.reserved.length >= MAX_RESERVED) throw fail('reserveFull');
        var tier = action.tier;
        if (![1, 2, 3].some(function (t) { return t === tier; })) throw fail('invalidAction');
        var hidden;
        if (action.cardId) {
          var idx = s.board[tier].indexOf(action.cardId);
          if (idx < 0) throw fail('cardGone');
          s.board[tier][idx] = s.decks[tier].length ? s.decks[tier].shift() : null;
          hidden = false;
          p.reserved.push({ id: action.cardId, hidden: false });
        } else {
          if (!s.decks[tier].length) throw fail('deckEmpty');
          hidden = true;
          p.reserved.push({ id: s.decks[tier].shift(), hidden: true });
        }
        var gotGold = s.bank.y > 0;
        if (gotGold) { s.bank.y--; p.tokens.y++; }
        entry.type = 'reserve'; entry.tier = tier; entry.hidden = hidden; entry.gold = gotGold;
        entry.cardId = hidden ? null : action.cardId;
        break;
      }
      case 'buy': {
        var card = CARD_BY_ID[action.cardId];
        if (!card) throw fail('invalidAction');
        var pay = payment(p, card);
        if (!pay) throw fail('cantAfford');
        var ri = findReserved(p, card.id);
        if (ri >= 0) {
          p.reserved.splice(ri, 1);
        } else {
          var bi = s.board[card.tier].indexOf(card.id);
          if (bi < 0) throw fail('cardGone');
          s.board[card.tier][bi] = s.decks[card.tier].length ? s.decks[card.tier].shift() : null;
        }
        for (var pc in pay) { p.tokens[pc] -= pay[pc]; s.bank[pc] += pay[pc]; }
        p.cards.push(card.id);
        p.points += card.pts;
        entry.type = 'buy'; entry.cardId = card.id; entry.fromReserve = ri >= 0;
        break;
      }
      case 'pass': {
        if (hasLegalAction(s, seat)) throw fail('invalidAction');
        entry.type = 'pass';
        break;
      }
      default:
        throw fail('invalidAction');
    }
    pushLog(s, entry);
    return afterAction(s, seat);
  }

  function awardNoble(s, seat, nobleId) {
    var p = s.players[seat];
    s.nobles.splice(s.nobles.indexOf(nobleId), 1);
    p.nobles.push(nobleId);
    p.points += 3;
    pushLog(s, { seat: seat, turn: s.turn, type: 'noble', nobleId: nobleId });
  }

  function afterAction(s, seat) {
    var p = s.players[seat];
    if (sum(p.tokens) > MAX_TOKENS) { s.phase = 'discard'; return s; }
    var eligible = s.nobles.filter(function (id) { return nobleEligible(p, id); });
    if (eligible.length === 1) awardNoble(s, seat, eligible[0]);
    else if (eligible.length > 1) { s.phase = 'noble'; s.pendingNobles = eligible; return s; }
    return endTurn(s);
  }

  function endTurn(s) {
    var p = s.players[s.current];
    if (p.points >= WIN_POINTS) s.endTriggered = true;
    s.current = (s.current + 1) % s.players.length;
    if (s.current === 0) s.turn++;
    s.phase = 'action';
    if (s.endTriggered && s.current === 0) finish(s);
    if (s.log.length > 60) s.log = s.log.slice(-60);
    return s;
  }

  function finish(s) {
    s.phase = 'over';
    var best = null, tie = false;
    s.players.forEach(function (p, i) {
      if (best === null) { best = i; return; }
      var b = s.players[best];
      if (p.points > b.points || (p.points === b.points && p.cards.length < b.cards.length)) { best = i; tie = false; }
      else if (p.points === b.points && p.cards.length === b.cards.length) tie = true;
    });
    s.winner = tie ? null : best;
  }

  // What one seat is allowed to see: opponents' deck-reserved cards stay face down.
  function viewFor(state, seat) {
    var v = clone(state);
    v.players.forEach(function (p, i) {
      if (i === seat) return;
      p.reserved = p.reserved.map(function (r) {
        return r.hidden ? { id: null, hidden: true, tier: CARD_BY_ID[r.id].tier } : r;
      });
    });
    return v;
  }

  return {
    COLORS: COLORS, GOLD: GOLD, MAX_TOKENS: MAX_TOKENS, MAX_RESERVED: MAX_RESERVED, WIN_POINTS: WIN_POINTS,
    CARDS: CARDS, CARD_BY_ID: CARD_BY_ID, NOBLES: NOBLES, NOBLE_BY_ID: NOBLE_BY_ID,
    newGame: newGame, apply: apply, viewFor: viewFor,
    bonuses: bonuses, payment: payment, canAfford: canAfford, nobleEligible: nobleEligible, hasLegalAction: hasLegalAction, sum: sum
  };
});
