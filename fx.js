/* fx.js — the physical layer: motion, sound, haptics.
   The table is rebuilt wholesale on every state change, so movement is reproduced with ghosts:
   capture where a thing was, rebuild, capture where it landed, then fly a copy between the two. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.FX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var layer = null;
  function stage() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    document.body.appendChild(layer);
    return layer;
  }

  /* ---------- geometry ---------- */
  // Rects of every [data-fx] element currently on screen, keyed by its fx name.
  function capture(root) {
    var map = {};
    var nodes = (root || document).querySelectorAll('[data-fx]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = n.getAttribute('data-fx');
      if (map[k]) continue; // first wins: the board copy, not a duplicate in a panel
      var r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      map[k] = { x: r.left, y: r.top, w: r.width, h: r.height, el: n };
    }
    return map;
  }
  function rectOf(key, root) {
    var n = (root || document).querySelector('[data-fx="' + key + '"]');
    if (!n) return null;
    var r = n.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height, el: n };
  }

  /* ---------- flights ---------- */
  var running = 0, live = [];
  // End every flight at once: a measurement taken mid-flight would lie.
  function settle() {
    live.slice().forEach(function (a) { try { a.finish(); } catch (e) { try { a.cancel(); } catch (e2) {} } });
    live = [];
    if (layer) layer.innerHTML = '';
    running = 0;
  }
  // Fly a copy of `html` from rect `a` to rect `b`. Returns a promise that settles when it lands.
  function fly(a, b, html, opts) {
    opts = opts || {};
    if (reduced || !a || !b) return Promise.resolve();
    var ms = opts.ms || 380, delay = opts.delay || 0;
    var ghost = document.createElement('div');
    ghost.className = 'fx-ghost' + (opts.cls ? ' ' + opts.cls : '');
    ghost.style.cssText = 'left:0;top:0;width:' + a.w + 'px;height:' + a.h + 'px;';
    ghost.innerHTML = html;
    stage().appendChild(ghost);
    running++;
    // An arc reads as a hand lifting an object rather than dragging it across the table.
    var lift = opts.lift == null ? Math.min(28, Math.abs(b.y - a.y) * 0.12 + 10) : opts.lift;
    var sx = b.w / a.w, sy = b.h / a.h;
    var frames = [
      { transform: 'translate3d(' + a.x + 'px,' + a.y + 'px,0) scale(1) rotate(' + (opts.rot0 || 0) + 'deg)', opacity: 1, offset: 0 },
      { transform: 'translate3d(' + ((a.x + b.x) / 2) + 'px,' + (((a.y + b.y) / 2) - lift) + 'px,0) scale(' + (1 + (sx - 1) * 0.5) * 1.06 + ',' + (1 + (sy - 1) * 0.5) * 1.06 + ') rotate(' + ((opts.rot0 || 0) + (opts.rot1 || 0)) / 2 + 'deg)', opacity: 1, offset: 0.55 },
      { transform: 'translate3d(' + b.x + 'px,' + b.y + 'px,0) scale(' + sx + ',' + sy + ') rotate(' + (opts.rot1 || 0) + 'deg)', opacity: opts.fade ? 0 : 1, offset: 1 }
    ];
    var anim;
    try {
      anim = ghost.animate(frames, { duration: ms, delay: delay, easing: opts.easing || 'cubic-bezier(.33,.9,.33,1)', fill: 'both' });
      live.push(anim);
    } catch (e) {
      ghost.remove(); running--;
      return Promise.resolve();
    }
    return new Promise(function (res) {
      var done = false;
      function finish() {
        if (done) return; done = true; running--; ghost.remove();
        var i = live.indexOf(anim); if (i >= 0) live.splice(i, 1);
        res();
      }
      anim.onfinish = finish;
      anim.oncancel = finish;
      setTimeout(finish, ms + delay + 400); // belt and braces: a backgrounded tab never fires onfinish
    });
  }

  // Deal a card into a slot: it arrives from the deck and turns face-up on the way.
  function dealIn(el, from, opts) {
    opts = opts || {};
    if (reduced || !el || !from) return Promise.resolve();
    var b = el.getBoundingClientRect();
    var dx = from.x - b.left, dy = from.y - b.top;
    var ms = opts.ms || 420;
    var anim;
    try {
      anim = el.animate([
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) rotateY(88deg) scale(.94)', opacity: 0.85, offset: 0 },
        { transform: 'translate3d(' + dx * 0.35 + 'px,' + (dy * 0.35 - 10) + 'px,0) rotateY(46deg) scale(1.02)', opacity: 1, offset: 0.55 },
        { transform: 'none', opacity: 1, offset: 1 }
      ], { duration: ms, delay: opts.delay || 0, easing: 'cubic-bezier(.22,.85,.3,1)', fill: 'both' });
    } catch (e) { return Promise.resolve(); }
    return new Promise(function (res) {
      var done = false;
      function finish() { if (done) return; done = true; res(); }
      anim.onfinish = finish; anim.oncancel = finish;
      setTimeout(finish, ms + (opts.delay || 0) + 400);
    });
  }

  // A short, physical refusal: the object pushes back instead of moving.
  function nudge(el) {
    if (!el || reduced) return;
    try {
      el.animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' },
        { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }
      ], { duration: 260, easing: 'ease-out' });
    } catch (e) {}
  }
  function pop(el, scale) {
    if (!el || reduced) return;
    try {
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (scale || 1.14) + ')' }, { transform: 'scale(1)' }],
        { duration: 300, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    } catch (e) {}
  }

  /* ---------- sound: synthesized, no assets ---------- */
  // Everything here is an object on a table, not a user interface: short filtered noise for card
  // movement, struck resonant bodies for gems. Two buses give the table a near side and a far side,
  // so you can hear which side of the table a move came from.
  var ac = null, near = null, far = null, muted = false;
  try { muted = localStorage.getItem('splendor.muted') === '1'; } catch (e) {}

  function ctx() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { return null; }
    var limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 10;
    limiter.attack.value = 0.003; limiter.release.value = 0.15;
    limiter.connect(ac.destination);
    near = ac.createGain(); near.gain.value = 0.55; near.connect(limiter);
    // The far side of the table: quieter, and the air takes the top off it.
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.5;
    far = ac.createGain(); far.gain.value = 0.26; far.connect(lp); lp.connect(limiter);
    return ac;
  }
  // iOS will not start audio outside a gesture, so any first touch arms it.
  function arm() {
    var c = ctx();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  }
  function ready() {
    var c = ctx();
    return c && c.state === 'running' ? c : null;
  }
  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('splendor.muted', muted ? '1' : '0'); } catch (e) {}
    return muted;
  }
  function isMuted() { return muted; }

  var noiseBuf = null;
  function noise(c) {
    if (noiseBuf) return noiseBuf;
    var n = Math.floor(c.sampleRate * 0.5), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = buf;
    return buf;
  }
  function bus(side) { return side === 'far' ? far : near; }
  // One shaped envelope, the only way anything reaches a bus.
  function shape(c, node, gain, attack, decay, at, side) {
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(Math.max(0.0003, gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    node.connect(g); g.connect(bus(side));
    return g;
  }
  function noiseThrough(c, filt, gain, attack, decay, at, side, dur) {
    var src = c.createBufferSource(); src.buffer = noise(c);
    src.connect(filt);
    shape(c, filt, gain, attack, decay, at, side);
    src.start(at); src.stop(at + (dur || attack + decay + 0.05));
  }

  // Gems ring on an A minor pentatonic, so any three stones taken together are consonant.
  var GEM_HZ = { k: 880.0, r: 1046.5, g: 1174.7, u: 1318.5, w: 1568.0, y: 1760.0 };

  // A stone set down in a wooden tray: the click of contact, the body ringing, a short tail.
  function sGem(at, color, side, level) {
    var c = ready(); if (!c) return;
    var hz = GEM_HZ[color] || 1174.7;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz * 2.2; bp.Q.value = 1.3;
    noiseThrough(c, bp, 0.16 * level, 0.001, 0.012, at, side, 0.06);
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(hz, at);
    o.frequency.exponentialRampToValueAtTime(hz * 0.985, at + 0.12);
    shape(c, o, 0.13 * level, 0.002, 0.16, at, side);
    o.start(at); o.stop(at + 0.25);
    var o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2.76;
    shape(c, o2, 0.035 * level, 0.002, 0.07, at, side);
    o2.start(at); o2.stop(at + 0.15);
  }
  // A card pushed across felt: a band of hiss falling as it slows.
  function sSlide(at, side, level) {
    var c = ready(); if (!c) return;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(2600, at);
    f.frequency.exponentialRampToValueAtTime(1100, at + 0.11);
    noiseThrough(c, f, 0.2 * level, 0.008, 0.11, at, side, 0.22);
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3400;
    noiseThrough(c, hp, 0.055 * level, 0.001, 0.035, at + 0.004, side, 0.06);
  }
  // A card turned over: the same hiss, chirping up, then meeting the table.
  function sFlip(at, side, level) {
    var c = ready(); if (!c) return;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(900, at);
    f.frequency.exponentialRampToValueAtTime(3200, at + 0.07);
    noiseThrough(c, f, 0.17 * level, 0.004, 0.075, at, side, 0.16);
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    noiseThrough(c, lp, 0.1 * level, 0.002, 0.05, at + 0.075, side, 0.1);
  }
  // Paying for a card: the card moves, then a short handful of coins. Never a jackpot.
  function sBuy(at, side, level, cost) {
    var c = ready(); if (!c) return;
    sSlide(at, side, level * 1.05);
    var coins = Math.max(2, Math.min(4, Math.round((cost || 4) / 2)));
    var pitches = [GEM_HZ.y, GEM_HZ.w, GEM_HZ.r, GEM_HZ.g];
    for (var i = 0; i < coins; i++) {
      var t = at + 0.055 + i * 0.035 + (i * 7 % 3) * 0.004;
      var o = c.createOscillator(); o.type = 'triangle';
      var hz = pitches[i % pitches.length] * 0.75;
      o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 0.9, t + 0.05);
      shape(c, o, 0.06 * level, 0.002, 0.09, t, side);
      o.start(t); o.stop(t + 0.18);
    }
  }
  // A struck mallet: the warm partials of a small bell, kept under a lowpass.
  function mallet(c, hz, at, gain, decay, side) {
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    lp.connect(bus(side));
    [[1, gain, decay], [2, gain * 0.35, decay * 0.5], [3.01, gain * 0.16, decay * 0.28]].forEach(function (p) {
      var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz * p[0];
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(Math.max(0.0003, p[1]), at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.006 + p[2]);
      o.connect(g); g.connect(lp);
      o.start(at); o.stop(at + 0.02 + p[2]);
    });
  }
  // A noble arrives: the only musical moment in the game.
  function sNoble(at, side, level) {
    var c = ready(); if (!c) return;
    [523.25, 659.25, 783.99].forEach(function (hz, i) {
      mallet(c, hz, at + i * 0.075, 0.1 * level, 0.9 - i * 0.14, side);
    });
  }
  // A knuckle on the table: the energy sits where a phone speaker can actually move air.
  function sKnock(at, side, level) {
    var c = ready(); if (!c) return;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.9;
    noiseThrough(c, lp, 0.18 * level, 0.002, 0.05, at, side, 0.1);
    var o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(320, at); o.frequency.exponentialRampToValueAtTime(190, at + 0.07);
    shape(c, o, 0.09 * level, 0.003, 0.08, at, side);
    o.start(at); o.stop(at + 0.16);
  }
  // A dry tick: a stone put back, a selection cleared.
  function sTick(at, side, level) {
    var c = ready(); if (!c) return;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2;
    noiseThrough(c, bp, 0.09 * level, 0.001, 0.022, at, side, 0.05);
  }
  // The last chord of the game, and it knows whether you won.
  function sEnd(at, won, level) {
    var c = ready(); if (!c) return;
    [523.25, 659.25, 932.33].forEach(function (hz) { mallet(c, hz, at, 0.075 * level, 0.45, 'near'); });
    var t2 = at + 0.42;
    var chord = won ? [349.23, 440.0, 523.25, 698.46] : [349.23, 415.30, 523.25, 622.25];
    chord.forEach(function (hz, i) {
      mallet(c, hz, t2 + i * 0.045, 0.085 * level, won ? 1.3 : 1.05, 'near');
    });
  }

  // Keep a burst of identical sounds from smearing, and cap how many voices a moment can spend.
  var recent = {}, voices = [], lastAt = 0;
  function gate(key, at) {
    var prev = recent[key] || -1;
    if (at - prev < 0.035) return false;
    recent[key] = at;
    voices = voices.filter(function (t) { return t > at - 0.25; });
    if (voices.length > 10) return false;
    voices.push(at);
    return true;
  }
  function play(name, opts) {
    if (muted) return;
    var c = ready(); if (!c) return;
    opts = opts || {};
    var side = opts.side === 'far' ? 'far' : 'near';
    var at = c.currentTime + (opts.delay || 0) + 0.012;
    if (at < lastAt + 0.008) at = lastAt + 0.008;
    lastAt = at;
    var level = opts.level == null ? 1 : opts.level;
    if (!gate(name + (opts.color || '') + side, at)) return;
    switch (name) {
      case 'slide': return sSlide(at, side, level);
      case 'flip': return sFlip(at, side, level);
      case 'gem': return sGem(at, opts.color || 'w', side, level);
      case 'tick': return sTick(at, side, level);
      case 'buy': return sBuy(at, side, level, opts.cost);
      case 'noble': return sNoble(at, side, level);
      case 'deny': return sKnock(at, side, level);
      case 'knock': return sKnock(at, side, level * 0.8);
      case 'end': return sEnd(at, !!opts.won, level);
    }
  }

  /* ---------- haptics (Android honors this; iOS Safari ignores it) ---------- */
  var hapticsOff = false;
  try { hapticsOff = localStorage.getItem('splendor.haptics') === '0'; } catch (e) {}
  var HAPTIC = {
    pick: 8, place: [10], deny: 35, buy: [14, 40, 10],
    noble: [12, 60, 18], win: [16, 70, 16, 70, 26], lose: 40, deal: 6
  };
  // Named patterns, so call sites describe the sensation rather than a number.
  // Android Chrome honors this; iOS Safari has no API and silently does nothing.
  function buzz(name) {
    if (hapticsOff) return;
    var pat = typeof name === 'string' ? HAPTIC[name] : name;
    if (pat == null) return;
    try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {}
  }
  function setHaptics(on) {
    hapticsOff = !on;
    try { localStorage.setItem('splendor.haptics', on ? '1' : '0'); } catch (e) {}
  }

  return {
    reduced: function () { return reduced; },
    capture: capture, rectOf: rectOf, fly: fly, dealIn: dealIn, nudge: nudge, pop: pop, settle: settle,
    busy: function () { return running > 0; },
    play: play, arm: arm, buzz: buzz, setHaptics: setHaptics, setMuted: setMuted, isMuted: isMuted
  };
});
