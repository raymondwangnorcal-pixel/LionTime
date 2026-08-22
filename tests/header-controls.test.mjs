import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mockupPath = new URL('../mockup-campus-V1.html', import.meta.url);
const html = readFileSync(mockupPath, 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

if (!script) {
  throw new Error('mockup-campus.html does not contain an inline script');
}

const testableScript = script.replace(
  /\/\* ── Events[\s\S]*/,
  `globalThis.headerControlsTestApi = {
    configureAboutDismissal: typeof configureAboutDismissal === 'function' ? configureAboutDismissal : undefined,
  };`,
);

const sandbox = {};
vm.runInNewContext(testableScript, sandbox);
const api = sandbox.headerControlsTestApi;

test('restores the Feedback and About controls in the redesigned header', () => {
  assert.match(
    html,
    /href="https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQLSdpToXB8tdcgGGDQYynTmuKIf2JU-3d3ojvyx7o9GIn8mRSSg\/viewform\?usp=publish-editor"[^>]*>Feedback<\/a>/,
  );
  assert.match(html, /<summary class="header-link">About<\/summary>/);
  assert.match(html, /\.header-link\s*\{[^}]*font-size:\s*1rem;/);
  assert.match(html, /\.header-actions\s*\{[^}]*top:\s*1\.9rem;\s*right:\s*1\.8rem;/);
});

test('does not render the mockup banner', () => {
  assert.doesNotMatch(html, /class="mockup-banner"/);
});

test('closes About when the visitor scrolls or presses outside it', () => {
  assert.equal(typeof api.configureAboutDismissal, 'function');

  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const insidePanel = {};
  const about = {
    open: true,
    contains(target) {
      return target === insidePanel;
    },
  };

  api.configureAboutDismissal(about, eventTarget);
  listeners.get('scroll')();
  assert.equal(about.open, false);

  about.open = true;
  listeners.get('pointerdown')({ target: {} });
  assert.equal(about.open, false);

  about.open = true;
  listeners.get('pointerdown')({ target: insidePanel });
  assert.equal(about.open, true);
});

test('renders embedded hours before guarded live hydration and exposes data status', () => {
  assert.match(indexHtml, /id="library-hours-status"[^>]*data-kind="fallback"/);
  const initialRender = indexHtml.lastIndexOf('updateClock();\nrender();');
  const hydration = indexHtml.lastIndexOf('LionHourLibraryHours.hydrate');
  assert.ok(initialRender >= 0 && hydration > initialRender);
  assert.match(indexHtml, /if \(window\.LionHourLibraryHours\)/);
  assert.match(indexHtml, /5 of 6 live/);
});

test('loads dining live data after static cards and identifies static café fallbacks', () => {
  assert.match(indexHtml, /id="dining-hours-status"[^>]*data-kind="fallback"/);
  assert.match(indexHtml, /assets\/dining-hours\.js/);
  assert.match(indexHtml, /id:'facultyhouse-4'/);
  assert.match(indexHtml, /id:'smith-dining'/);
  assert.match(indexHtml, /LionHourDiningHours\.hydrate/);
  assert.match(indexHtml, /16 of 20 live/);
  assert.match(indexHtml, /4 cafés using embedded schedules/);
});

test('loads Recreation hydration after embedded Fitness cards', () => {
  assert.match(indexHtml, /<script src="assets\/recreation-hours\.js"><\/script>/);
  assert.match(indexHtml, /id="recreation-hours-status"/);
  assert.match(indexHtml, /id:'barnard-fitness'.*cat:'fitness'/s);
  assert.match(indexHtml, /LionHourRecreationHours\.hydrate/);
  assert.ok(indexHtml.indexOf('<script src="assets/recreation-hours.js"></script>') > indexHtml.indexOf('const VENUES = ['));
});

test('keeps Dodge spaces nested instead of creating five Fitness venue cards', () => {
  assert.match(indexHtml, /<script src="assets\/recreation-hours-view\.js"><\/script>/);
  assert.match(indexHtml, /LionHourRecreationView\.renderSpaces/);
  assert.match(indexHtml, /View spaces/);
  assert.match(indexHtml, /recreation-spaces/);
  for (const id of ['blue-gym', 'levien-gymnasium', 'functional-fitness-studio', 'aerobics-room-4', 'squash-courts']) {
    assert.doesNotMatch(indexHtml, new RegExp(`id:'${id}'.*cat:'fitness'`));
  }
});
