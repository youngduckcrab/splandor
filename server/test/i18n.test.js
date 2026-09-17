// Every string the interface can show must exist in all three languages.
// A missing key renders as the key itself, which is the kind of thing that only
// shows up on the one phone you cannot test on.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// Pull `var I18N = { ... };` out by matching braces, then evaluate it as data.
const start = html.indexOf('var I18N = {');
assert(start > 0, 'I18N table found');
let i = html.indexOf('{', start), depth = 0, end = -1, inStr = null, esc = false;
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === inStr) inStr = null;
    continue;
  }
  if (c === "'" || c === '"') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
assert(end > 0, 'I18N table parses');
const I18N = eval('(' + html.slice(html.indexOf('{', start), end) + ')');

const langs = Object.keys(I18N);
assert.deepStrictEqual(langs.sort(), ['en', 'es', 'ko'], 'three languages');

function flatten(o, prefix) {
  return Object.keys(o).reduce((acc, k) => {
    const v = o[k], key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) return acc.concat(flatten(v, key));
    return acc.concat(key);
  }, []);
}

const keysByLang = {};
langs.forEach((l) => { keysByLang[l] = new Set(flatten(I18N[l], '')); });

// The union of every key any language defines is what each of them owes.
const all = new Set();
langs.forEach((l) => keysByLang[l].forEach((k) => all.add(k)));

const gaps = [];
langs.forEach((l) => {
  all.forEach((k) => {
    if (k.startsWith('rulesList')) return;          // an array, compared by length below
    if (!keysByLang[l].has(k)) gaps.push(l + ' is missing ' + k);
  });
});
assert.deepStrictEqual(gaps, [], 'no language is missing a string:\n  ' + gaps.join('\n  '));

// Rules and tutorial steps must line up one for one across languages.
const ruleCount = I18N.en.rulesList.length;
langs.forEach((l) => {
  assert.strictEqual(I18N[l].rulesList.length, ruleCount, l + ' has the same number of rules');
});
const stepIds = Object.keys(I18N.en.tut.s);
langs.forEach((l) => {
  assert.deepStrictEqual(Object.keys(I18N[l].tut.s).sort(), stepIds.slice().sort(), l + ' covers every tutorial step');
  stepIds.forEach((id) => {
    assert(I18N[l].tut.s[id].h, l + '/' + id + ' has a heading');
    assert(I18N[l].tut.s[id].p, l + '/' + id + ' has body text');
  });
});

// The tutorial script and its text must agree on which steps exist.
const scriptIds = (html.match(/\{\s*id:\s*'([a-zA-Z0-9]+)'/g) || [])
  .map((m) => m.replace(/.*'([^']+)'.*/, '$1'));
stepIds.forEach((id) => {
  assert(scriptIds.indexOf(id) >= 0, 'tutorial step "' + id + '" is in the script');
});
assert.strictEqual(scriptIds.length, stepIds.length, 'no tutorial step lacks text');

// Steps that ask for an action must say what to do, in every language.
const actingIds = [];
const tutBlock = html.slice(html.indexOf('var TUT = ['), html.indexOf('function tutStep()'));
tutBlock.split(/\{\s*id:\s*'/).slice(1).forEach((chunk) => {
  const id = chunk.slice(0, chunk.indexOf("'"));
  if (/allow:\s*\[/.test(chunk)) actingIds.push(id);
});
assert(actingIds.length >= 5, 'the tutorial makes the learner act');
langs.forEach((l) => {
  actingIds.forEach((id) => {
    assert(I18N[l].tut.s[id] && I18N[l].tut.s[id].do, l + '/' + id + ' tells the learner what to press');
  });
});

// Every key the markup or the code actually asks for must exist. Comparing the
// languages against each other cannot catch a key that no language defines.
function resolves(lang, key) {
  return key.split('.').reduce(function (o, part) {
    return (o && typeof o === 'object') ? o[part] : undefined;
  }, I18N[lang]) !== undefined;
}
const asked = new Set();
(html.match(/data-i18n="([^"]+)"/g) || []).forEach(function (m) {
  asked.add(m.slice(11, -1));
});
// Only static calls: t('a.b'). Keys built by concatenation are checked by their prefix below.
(html.match(/\bt\('([A-Za-z][A-Za-z0-9.]*)'\s*[),]/g) || []).forEach(function (m) {
  asked.add(m.replace(/.*'([^']+)'.*/, '$1'));
});
const unresolved = [];
asked.forEach(function (key) {
  langs.forEach(function (l) {
    if (!resolves(l, key)) unresolved.push(l + ' cannot resolve t("' + key + '")');
  });
});
assert.deepStrictEqual(unresolved, [], 'every key the interface asks for exists:\n  ' + unresolved.join('\n  '));

// Families built by concatenation (t('err.' + code), t('colors.' + c), t('log.' + type))
// must at least exist as tables with matching shapes.
['err', 'colors', 'log'].forEach(function (family) {
  const shape = Object.keys(I18N.en[family]).sort();
  langs.forEach(function (l) {
    assert.deepStrictEqual(Object.keys(I18N[l][family]).sort(), shape, l + '.' + family + ' matches');
  });
});

console.log('i18n ok:', all.size, 'strings x', langs.length, 'languages;',
  asked.size, 'keys referenced by the page all resolve;',
  stepIds.length, 'tutorial steps,', actingIds.length, 'of them hands-on');
