import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/dining-menus.js', import.meta.url), 'utf8');
const sandbox = {
  window: {},
  document: { addEventListener() {}, querySelector: () => null, getElementById: () => null },
  console,
  fetch: () => Promise.reject(new Error('no network in tests')),
};
vm.runInNewContext(source, sandbox);
const api = sandbox.window.LionHourDiningMenus;

const SHORT = ['Scrambled Eggs', 'Home Fries', 'Bacon'];
const OMELET = ['Omelet: assorted toppings'];
const LONG = [
  'Baja Steak Burrito: Baja steak, refried black beans, yellow rice, shredded cheese, pico de gallo, on a flour tortilla',
];

test('splitItem leaves a short plain item alone', () => {
  const p = api.splitItem('Scrambled Eggs');
  assert.equal(p.name, 'Scrambled Eggs');
  assert.equal(p.desc, '');
  assert.equal(p.long, false);
});

test('splitItem separates name from description at the first colon', () => {
  const p = api.splitItem(LONG[0]);
  assert.equal(p.name, 'Baja Steak Burrito');
  assert.ok(p.desc.startsWith('Baja steak, refried black beans'));
  assert.equal(p.long, true);
});

test('splitItem splits on the FIRST colon only', () => {
  const p = api.splitItem('Combo: rice, beans: extra');
  assert.equal(p.name, 'Combo');
  assert.equal(p.desc, 'rice, beans: extra');
});

test('splitItem ignores a leading or trailing colon', () => {
  assert.equal(api.splitItem(': orphan').name, ': orphan');
  assert.equal(api.splitItem('Trailing:').name, 'Trailing:');
  assert.equal(api.splitItem(': orphan').desc, '');
});

test('splitItem tolerates empty and nullish input', () => {
  for (const v of [null, undefined, '', '   ']) {
    const p = api.splitItem(v);
    assert.equal(p.name, '');
    assert.equal(p.long, false);
  }
});

test('short stations still render as chips', () => {
  const html = api.stationItemsHTML(SHORT);
  assert.ok(!html.includes('as-list'), 'should not switch to list mode');
  assert.ok(html.includes('<span class="menu-item">Scrambled Eggs</span>'));
  assert.ok(!html.includes('menu-row'));
});

test('a short colon item keeps its chip and its full text', () => {
  const html = api.stationItemsHTML(OMELET);
  assert.ok(!html.includes('as-list'));
  assert.ok(html.includes('Omelet: assorted toppings'));
});

test('a long item switches the station to rows', () => {
  const html = api.stationItemsHTML(LONG);
  assert.ok(html.includes('menu-items as-list'));
  assert.ok(html.includes('<span class="menu-row-name">Baja Steak Burrito</span>'));
  assert.ok(html.includes('menu-row-desc'));
  assert.ok(!html.includes('class="menu-item"'), 'no chips left in list mode');
});

test('one long item pulls its whole station into rows', () => {
  const html = api.stationItemsHTML(SHORT.concat(LONG));
  assert.ok(html.includes('as-list'));
  assert.equal((html.match(/menu-row-name/g) || []).length, 4);
  assert.equal((html.match(/menu-row-desc/g) || []).length, 1, 'only the split item gets a description');
});

test('item text is escaped in both modes', () => {
  const evil = 'Tacos & <script>alert(1)</script>';
  assert.ok(!api.stationItemsHTML([evil]).includes('<script>'));
  assert.ok(!api.stationItemsHTML([evil + ': with a very long description of ingredients here'])
    .includes('<script>'));
});

test('an empty station renders an empty container', () => {
  assert.equal(api.stationItemsHTML([]), '<div class="menu-items"></div>');
  assert.equal(api.stationItemsHTML(undefined), '<div class="menu-items"></div>');
});
