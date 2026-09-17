/* Procedural card art for Splendor — engraved scenes and cut gems, drawn as inline SVG.
   Tier 1 = mines, tier 2 = workshops of the town, tier 3 = the palace. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Art = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PAL = {
    w: { sky1: '#6f7f93', sky2: '#c9d3de', hill: '#2f3a47', hill2: '#1a212b', light: '#ffffff', base: '#dfe6ee', dark: '#8794a6', table: '#f6f8fb', glow: '#ffffff' },
    u: { sky1: '#0f1f4e', sky2: '#3a6bd6', hill: '#0c1a3f', hill2: '#060d22', light: '#a9c4ff', base: '#3d6fd8', dark: '#12306f', table: '#d6e2ff', glow: '#9fc0ff' },
    g: { sky1: '#0b2e1c', sky2: '#2f9c5f', hill: '#0a2a19', hill2: '#04150c', light: '#9defbf', base: '#2c9c5c', dark: '#0d4526', table: '#dcf7e6', glow: '#8ff2b6' },
    r: { sky1: '#3a0a10', sky2: '#c93a3f', hill: '#330a0e', hill2: '#1a0407', light: '#ffa3a3', base: '#cf3a3a', dark: '#5c0f12', table: '#ffe1e1', glow: '#ff9c9c' },
    k: { sky1: '#1b1b22', sky2: '#5e5e6c', hill: '#131318', hill2: '#08080b', light: '#9a9aae', base: '#3b3b47', dark: '#0b0b0f', table: '#6d6d7e', glow: '#c9c9d8' }
  };
  var GOLD = '#d6a84e', GOLD2 = '#f0cf7a';

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rnd(seed) { var s = seed || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function pt(x, y) { return x.toFixed(1) + ',' + y.toFixed(1); }
  function star(x, y, r, fill, op) {
    return '<path d="M' + pt(x, y - r) + ' Q' + pt(x, y) + ' ' + pt(x + r, y) + ' Q' + pt(x, y) + ' ' + pt(x, y + r) + ' Q' + pt(x, y) + ' ' + pt(x - r, y) + ' Q' + pt(x, y) + ' ' + pt(x, y - r) + 'Z" fill="' + fill + '" opacity="' + op + '"/>';
  }

  // A cut gem seen from above: an outer ring of facets around a polished table.
  var CUTS = {
    w: { n: 8, sx: 1, sy: 1, rot: 22.5, inner: 0.5 },      // round brilliant
    u: { n: 8, sx: 0.88, sy: 1, rot: 0, inner: 0.52 },      // oval cushion
    g: { n: 8, sx: 1.25, sy: 0.85, rot: 22.5, inner: 0.6 },  // emerald step cut
    r: { n: 6, sx: 1, sy: 0.95, rot: 0, inner: 0.5 },       // hexagonal cushion
    k: { n: 12, sx: 1, sy: 0.9, rot: 15, inner: 0.35 }      // cabochon-like
  };
  function gem(color, cx, cy, R, tilt) {
    var p = PAL[color], c = CUTS[color], n = c.n, out = [], i;
    var O = [], I = [];
    for (i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n, b = a + Math.PI / n;
      O.push([Math.cos(a) * R, Math.sin(a) * R]);
      I.push([Math.cos(b) * R * c.inner, Math.sin(b) * R * c.inner]);
    }
    var s = '<g transform="translate(' + cx + ',' + cy + ') rotate(' + (c.rot + tilt) + ') scale(' + c.sx + ',' + c.sy + ')">';
    // shadow under the stone
    s += '<ellipse cx="1.5" cy="3" rx="' + (R * 1.05) + '" ry="' + (R * 1.0) + '" fill="#000" opacity=".45"/>';
    for (i = 0; i < n; i++) {
      var o1 = O[i], o2 = O[(i + 1) % n], i1 = I[i], i0 = I[(i + n - 1) % n];
      // light comes from the upper left: facets facing it are brighter
      var ang = Math.atan2((o1[1] + o2[1]) / 2, (o1[0] + o2[0]) / 2);
      var lit = (Math.cos(ang + Math.PI * 0.75) + 1) / 2; // 0..1
      var f1 = lit > 0.6 ? p.light : lit > 0.3 ? p.base : p.dark;
      var f2 = lit > 0.7 ? p.base : lit > 0.35 ? p.dark : p.dark;
      out.push('<polygon points="' + pt(o1[0], o1[1]) + ' ' + pt(o2[0], o2[1]) + ' ' + pt(i1[0], i1[1]) + '" fill="' + f1 + '"/>');
      out.push('<polygon points="' + pt(o1[0], o1[1]) + ' ' + pt(i1[0], i1[1]) + ' ' + pt(i0[0], i0[1]) + '" fill="' + f2 + '" opacity=".92"/>');
    }
    s += out.join('');
    s += '<polygon points="' + I.map(function (q) { return pt(q[0], q[1]); }).join(' ') + '" fill="' + p.table + '" opacity=".95"/>';
    s += '<polygon points="' + O.map(function (q) { return pt(q[0], q[1]); }).join(' ') + '" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>';
    s += '<ellipse cx="' + (-R * 0.32) + '" cy="' + (-R * 0.42) + '" rx="' + (R * 0.28) + '" ry="' + (R * 0.14) + '" fill="#fff" opacity=".55" transform="rotate(-30)"/>';
    s += '</g>';
    s += star(cx - R * 0.55 * c.sx, cy - R * 0.62 * c.sy, R * 0.28, '#fff', 0.9);
    return s;
  }

  function scene(tier, color, r) {
    var p = PAL[color], s = '';
    if (tier === 1) {
      // mountains and a mine mouth
      s += '<polygon points="0,66 12,52 24,60 38,40 52,56 66,44 80,58 92,48 100,56 100,140 0,140" fill="' + p.hill + '"/>';
      s += '<polygon points="0,92 16,78 30,86 48,70 62,82 78,74 100,84 100,140 0,140" fill="' + p.hill2 + '"/>';
      s += '<path d="M40,140 V116 A10,10 0 0 1 60,116 V140 Z" fill="#000" opacity=".7"/>';
      s += '<path d="M40,140 V116 A10,10 0 0 1 60,116 V140" fill="none" stroke="' + GOLD + '" stroke-opacity=".6" stroke-width="1"/>';
      s += '<rect x="36" y="112" width="28" height="3" fill="' + GOLD + '" opacity=".5"/>';
      for (var i = 0; i < 4; i++) s += star(10 + r() * 80, 96 + r() * 30, 1.2 + r() * 1.2, p.glow, 0.7);
      s += '<circle cx="' + (22 + r() * 10) + '" cy="' + (26 + r() * 8) + '" r="7" fill="' + p.glow + '" opacity=".85"/>';
    } else if (tier === 2) {
      // rooftops of the goldsmiths' quarter, lit windows
      s += '<polygon points="0,86 0,70 10,70 10,60 18,52 26,60 26,74 38,74 38,58 45,50 52,58 52,68 62,68 62,60 68,60 68,46 72,40 76,46 76,66 88,66 88,72 100,72 100,140 0,140" fill="' + p.hill + '"/>';
      s += '<rect x="0" y="104" width="100" height="36" fill="' + p.hill2 + '"/>';
      s += '<polygon points="0,104 100,104 100,100 0,100" fill="' + p.hill2 + '" opacity=".7"/>';
      var wins = [[14, 64], [21, 66], [43, 62], [47, 62], [70, 52], [80, 70], [30, 80], [58, 78], [84, 84]];
      for (var w = 0; w < wins.length; w++) if (r() > 0.35) s += '<rect x="' + wins[w][0] + '" y="' + wins[w][1] + '" width="3" height="4" fill="' + GOLD2 + '" opacity=".85"/>';
      s += '<path d="M72,40 l0,-8 m-2,2 l2,-2 l2,2" stroke="' + GOLD + '" stroke-width="1" fill="none" opacity=".8"/>';
      s += '<circle cx="' + (80 + r() * 8) + '" cy="' + (24 + r() * 6) + '" r="6" fill="' + p.glow + '" opacity=".8"/>';
    } else {
      // the palace: dome, colonnade, steps, night sky
      for (var k = 0; k < 7; k++) s += star(6 + r() * 88, 8 + r() * 40, 0.9 + r() * 1.2, p.glow, 0.7);
      s += '<circle cx="' + (18 + r() * 8) + '" cy="' + (22 + r() * 6) + '" r="6.5" fill="' + p.glow + '" opacity=".85"/>';
      s += '<path d="M28,84 Q50,42 72,84 Z" fill="' + p.hill + '"/>';
      s += '<rect x="46" y="36" width="8" height="10" fill="' + p.hill + '"/><circle cx="50" cy="34" r="2.2" fill="' + GOLD + '"/>';
      s += '<rect x="24" y="84" width="52" height="8" fill="' + p.hill + '"/>';
      s += '<rect x="8" y="92" width="84" height="5" fill="' + p.hill2 + '"/>';
      for (var c = 0; c < 7; c++) s += '<rect x="' + (12 + c * 12.4) + '" y="97" width="4.5" height="24" fill="' + p.hill2 + '"/>';
      s += '<rect x="8" y="121" width="84" height="4" fill="' + p.hill2 + '"/><rect x="2" y="126" width="96" height="5" fill="' + p.hill2 + '" opacity=".85"/><rect x="0" y="131" width="100" height="9" fill="' + p.hill2 + '"/>';
      s += '<path d="M28,84 Q50,42 72,84" fill="none" stroke="' + GOLD + '" stroke-opacity=".55" stroke-width="1"/>';
    }
    return s;
  }

  var cache = {};
  function card(color, tier, id) {
    var key = color + tier + id;
    if (cache[key]) return cache[key];
    var p = PAL[color], r = rnd(hash(key));
    var gid = 'sky' + color + tier;
    var s = '<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.sky1 + '"/><stop offset="1" stop-color="' + p.sky2 + '"/></linearGradient>';
    s += '<radialGradient id="vig' + color + '" cx=".5" cy=".55" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient></defs>';
    s += '<rect width="100" height="140" fill="url(#' + gid + ')"/>';
    s += scene(tier, color, r);
    s += gem(color, 58 + (r() - 0.5) * 6, (tier === 3 ? 82 : 88) + (r() - 0.5) * 6, 17 + tier * 1.5, (r() - 0.5) * 24);
    s += '<rect width="100" height="140" fill="url(#vig' + color + ')"/>';
    s += '<rect x="2" y="2" width="96" height="136" rx="5" fill="none" stroke="' + GOLD + '" stroke-opacity=".45" stroke-width="1"/>';
    s += '</svg>';
    cache[key] = s;
    return s;
  }

  // Noble portraits: silhouettes in a gilt oval, a different headdress for each patron.
  function noble(index) {
    var key = 'n' + index;
    if (cache[key]) return cache[key];
    var hat = index % 5, femme = index >= 5, ink = '#120a0c';
    var s = '<svg viewBox="0 0 60 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<defs><linearGradient id="nbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2430"/><stop offset="1" stop-color="#22101a"/></linearGradient>';
    s += '<linearGradient id="ngold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc95"/><stop offset=".5" stop-color="#c9962f"/><stop offset="1" stop-color="#f0cf7a"/></linearGradient>';
    s += '<clipPath id="noval' + index + '"><ellipse cx="30" cy="27" rx="15" ry="19"/></clipPath></defs>';
    s += '<rect width="60" height="56" rx="6" fill="url(#nbg)"/>';
    s += '<ellipse cx="30" cy="27" rx="15" ry="19" fill="#0e0709"/>';
    s += '<g clip-path="url(#noval' + index + ')">';
    s += '<rect x="15" y="8" width="30" height="38" fill="#7a5238"/><rect x="15" y="8" width="30" height="38" fill="url(#nbg)" opacity=".35"/>';
    s += '<path d="M12,52 Q30,30 48,52 Z" fill="' + ink + '"/>';
    if (femme) s += '<path d="M21,30 Q22,10 30,12 Q38,10 39,30 Z" fill="' + ink + '"/>';
    s += '<circle cx="30" cy="22" r="7.2" fill="' + ink + '"/>';
    if (hat === 0) s += '<polygon points="23,17 24.5,9 27.5,14 30,7 32.5,14 35.5,9 37,17" fill="url(#ngold)"/>';
    if (hat === 1) s += '<ellipse cx="30" cy="15.5" rx="9.5" ry="3.6" fill="' + ink + '"/><path d="M21,16 Q30,12 39,16" stroke="url(#ngold)" stroke-width="1.3" fill="none"/>';
    if (hat === 2) s += '<path d="M20,26 Q21,6 30,8 Q39,6 40,26 Z" fill="' + ink + '"/><circle cx="30" cy="9" r="1.6" fill="url(#ngold)"/>';
    if (hat === 3) s += '<rect x="24.5" y="6.5" width="11" height="9" rx="1" fill="' + ink + '"/><ellipse cx="30" cy="15.5" rx="10" ry="2.2" fill="' + ink + '"/><rect x="24.5" y="12.5" width="11" height="1.4" fill="url(#ngold)"/>';
    if (hat === 4) s += '<circle cx="30" cy="17" r="8.4" fill="' + ink + '"/><path d="M22,18 Q30,11 38,18" stroke="url(#ngold)" stroke-width="1.2" fill="none"/><circle cx="30" cy="12" r="1.5" fill="url(#ngold)"/>';
    s += '<circle cx="30" cy="36" r="1.6" fill="url(#ngold)"/>';
    s += '</g>';
    s += '<ellipse cx="30" cy="27" rx="15" ry="19" fill="none" stroke="url(#ngold)" stroke-width="1.6"/>';
    s += '<ellipse cx="30" cy="27" rx="13" ry="17" fill="none" stroke="#f0cf7a" stroke-opacity=".35" stroke-width=".6"/>';
    s += '<path d="M56,5 h-6 M56,5 v6 M56,51 h-6 M56,51 v-6 M4,51 h6 M4,51 v-6" stroke="url(#ngold)" stroke-width="1" fill="none" opacity=".8"/>';
    s += '</svg>';
    cache[key] = s;
    return s;
  }

  // The card back: the same face every deck shows, so a face-down card is recognizable.
  function back(tier) {
    var key = 'b' + tier;
    if (cache[key]) return cache[key];
    var rim = ['', '#4f6e4d', '#6e6a3f', '#6e4a68'][tier] || GOLD;
    var s = '<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<defs><linearGradient id="bk' + tier + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c2436"/><stop offset=".5" stop-color="#1d1827"/><stop offset="1" stop-color="#2a2233"/></linearGradient>';
    s += '<pattern id="bp' + tier + '" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">';
    s += '<path d="M7 1 L9 7 L7 13 L5 7 Z" fill="' + GOLD + '" fill-opacity=".16"/>';
    s += '<circle cx="0" cy="7" r="1" fill="' + GOLD + '" fill-opacity=".12"/><circle cx="14" cy="7" r="1" fill="' + GOLD + '" fill-opacity=".12"/></pattern></defs>';
    s += '<rect width="100" height="140" fill="url(#bk' + tier + ')"/><rect width="100" height="140" fill="url(#bp' + tier + ')"/>';
    s += '<rect x="5" y="5" width="90" height="130" rx="5" fill="none" stroke="' + GOLD + '" stroke-opacity=".4"/>';
    s += '<rect x="8" y="8" width="84" height="124" rx="4" fill="none" stroke="' + rim + '" stroke-opacity=".7" stroke-width="1.2"/>';
    s += '<g transform="translate(50,70)"><circle r="20" fill="#1a1521" stroke="' + GOLD + '" stroke-opacity=".55"/>';
    s += '<polygon points="0,-13 11,-3 0,14 -11,-3" fill="' + GOLD + '" fill-opacity=".85"/>';
    s += '<polygon points="0,-13 5.5,-3 -5.5,-3" fill="' + GOLD2 + '"/></g>';
    s += '</svg>';
    cache[key] = s;
    return s;
  }

  // The lobby emblem: a large diamond on velvet.
  function emblem() {
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="60" cy="62" r="46" fill="#221a2a"/><circle cx="60" cy="62" r="46" fill="none" stroke="' + GOLD + '" stroke-opacity=".6"/><circle cx="60" cy="62" r="52" fill="none" stroke="' + GOLD + '" stroke-opacity=".25"/>' +
      gem('w', 60, 62, 30, 0) + '</svg>';
  }

  return { card: card, back: back, noble: noble, emblem: emblem, PAL: PAL, hash: hash };
});
