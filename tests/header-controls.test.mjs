import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mockupPath = new URL('../Mockups/mockup-campus-V1.html', import.meta.url);
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

test('keeps the title left-aligned without a mascot above the phone breakpoint', () => {
  // The plushie is a phone-only CSS background: hidden by default, never an <img>.
  assert.doesNotMatch(indexHtml, /<img[^>]*lionhour-mascot\.png/);
  assert.match(indexHtml, /\.lion-icon\s*\{\s*display:\s*none;\s*\}/);
  assert.match(indexHtml, /\.header\s*\{[^}]*text-align:\s*left;/);
  assert.match(indexHtml, /\.header-content\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/);
  assert.match(indexHtml, /\.logo\s*\{[^}]*justify-content:\s*flex-start;/);
});

test('vertically centers the title and the combined header action group', () => {
  assert.match(indexHtml, /\.header\s*\{[^}]*display:\s*grid;[^}]*align-items:\s*center;/);
  assert.match(indexHtml, /\.site-title\s*\{[^}]*margin:\s*0;/);
  assert.match(indexHtml, /\.header-content\s*\{[^}]*grid-area:\s*title;[^}]*display:\s*flex;[^}]*align-items:\s*center;/);
  assert.match(indexHtml, /\.header-actions\s*\{[^}]*grid-area:\s*actions;[^}]*position:\s*relative;[^}]*display:\s*grid;[^}]*justify-items:\s*end;[^}]*gap:\s*0\.3rem;[^}]*text-align:\s*right;/);
  assert.match(indexHtml, /\.header\s*\{[^}]*padding:\s*0\.45rem 1\.5rem;/);
});

test('keeps the leaderboard visible and only shrinks it when the header runs out of room', () => {
  assert.match(indexHtml, /<aside class="desktop-ad-slot" aria-label="Advertisement slot">/);
  assert.match(indexHtml, /<img src="assets\/gapless-leaderboard-1456x180\.png" width="728" height="90" alt="Gapless Labs — Real Problems\. Simple Solutions\. gaplesslabs\.com">/);
  assert.match(indexHtml, /\.desktop-ad-slot\s*\{[^}]*grid-area:\s*ad;[^}]*display:\s*block;[^}]*width:\s*min\(100%,\s*520px\);[^}]*height:\s*auto;[^}]*aspect-ratio:\s*728\s*\/\s*90;/);
  assert.match(indexHtml, /\.desktop-ad-slot img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/);
  assert.doesNotMatch(indexHtml, /\.desktop-ad-slot\s*\{[^}]*display:\s*none/);
  assert.match(indexHtml, /\.header\s*\{[^}]*grid-template-columns:\s*minmax\(max-content,1fr\) minmax\(0,520px\) minmax\(max-content,1fr\);[^}]*grid-template-areas:\s*"title ad actions";/);
  // 621-855px: the whole header scales by viewport / 856 so title, ad and links stay on one line.
  assert.match(indexHtml, /@media \(min-width:\s*621px\) and \(max-width:\s*855px\)\s*\{[\s\S]*?\.header\s*\{[^}]*--u:\s*calc\(100vw \/ 856\);[^}]*grid-template-columns:\s*max-content minmax\(0, calc\(520 \* var\(--u\)\)\) max-content;/);
  assert.match(indexHtml, /@media \(min-width:\s*621px\) and \(max-width:\s*855px\)\s*\{[\s\S]*?\.site-title\s*\{[^}]*font-size:\s*calc\(41\.6 \* var\(--u\)\);[\s\S]*?\.header-link\s*\{[^}]*font-size:\s*calc\(16 \* var\(--u\)\);/);
});

test('phones stack the banner above a centred plushie + title with the links pinned right', () => {
  const phone = indexHtml.match(/@media \(max-width:\s*620px\)\s*\{\s*\.header\s*\{[\s\S]*?\.header-link\s*\{[^}]*\}\s*\}/);
  assert.ok(phone, 'phone header block exists');
  assert.match(phone[0], /grid-template-columns:\s*minmax\(0,1fr\) auto minmax\(0,1fr\);/);
  assert.match(phone[0], /grid-template-areas:\s*"ad ad ad" "\. title actions";/);
  assert.match(phone[0], /padding:\s*0\.7rem 1rem;/);
  assert.match(phone[0], /\.logo\s*\{[^}]*justify-content:\s*center;[^}]*gap:\s*0\.4rem;/);
  assert.match(phone[0], /\.lion-icon\s*\{[^}]*display:\s*block;[^}]*width:\s*2\.4rem;[^}]*height:\s*2\.4rem;[^}]*lionhour-mascot\.png/);
  assert.match(phone[0], /\.site-title\s*\{\s*font-size:\s*2rem;/);
  assert.match(phone[0], /\.header-actions\s*\{\s*gap:\s*0\.2rem;\s*justify-self:\s*end;/);
  assert.match(phone[0], /\.header-link\s*\{\s*font-size:\s*0\.82rem;/);
  assert.match(indexHtml, /<div class="logo"><span class="lion-icon" aria-hidden="true"><\/span><h1 class="site-title">/);
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
  const initialRender = indexHtml.lastIndexOf('render();');
  const hydration = indexHtml.lastIndexOf('LionHourLibraryHours.hydrate');
  assert.ok(initialRender >= 0 && hydration > initialRender);
  assert.match(indexHtml, /if \(window\.LionHourLibraryHours\)/);
  assert.match(indexHtml, /status\.updatedCount.*status\.totalCount.*live/s);
  assert.match(indexHtml, /id:'milstein'.*name:'Milstein Library'.*cat:'library'/s);
  assert.match(indexHtml, /id:'milstein'.*hours: ALL\(null\).*sourceStatuses: ALL\('Hours load from official schedule'\)/s);
});

test('loads dining live data after static cards and identifies Barnard and Joe fallbacks', () => {
  const venueData = indexHtml.match(/const VENUES = (?:window\.VENUES = )?\[([\s\S]*?)\n\];/)?.[1] || '';
  assert.match(indexHtml, /id="dining-hours-status"[^>]*data-kind="fallback"/);
  assert.match(indexHtml, /assets\/dining-hours\.js/);
  assert.match(indexHtml, /id:'facultyhouse-4'/);
  assert.match(indexHtml, /LionHourDiningHours\.hydrate/);
  assert.match(indexHtml, /status\.updatedCount.*status\.totalCount.*live/s);
  assert.match(indexHtml, /id:'hewitt'.*name:'Hewitt Dining'.*cat:'dining'/s);
  assert.match(indexHtml, /id:'diana-center-cafe'.*cat:'dining'/s);
  assert.match(indexHtml, /id:'barnard-bubble-tea-sushi'.*cat:'dining'/s);
  assert.match(indexHtml, /id:'lizs-place'.*cat:'cafe'/s);
  assert.equal([...venueData.matchAll(/cat:'(?:dining|cafe)'/g)].length, 23);
  assert.doesNotMatch(venueData, /smith-dining|LeFrak Byte Kiosk|Barnard Kosher/);
  assert.match(indexHtml, /const fallbackCount = status\.staticFallbackIds/);
  assert.match(indexHtml, /3 cafés using embedded schedules/);
  assert.match(indexHtml, /status\.updatedCount.*status\.totalCount.*live/s);
});

test('loads Recreation hydration after embedded Fitness cards', () => {
  assert.match(indexHtml, /<script src="assets\/recreation-hours\.js"><\/script>/);
  assert.match(indexHtml, /id="recreation-hours-status"/);
  assert.match(indexHtml, /id:'barnard-fitness'.*cat:'fitness'/s);
  assert.match(indexHtml, /LionHourRecreationHours\.hydrate/);
  assert.ok(indexHtml.indexOf('<script src="assets/recreation-hours.js"></script>') > indexHtml.indexOf('const VENUES = ['));
});

test('keeps the live Recreation source control an atomic polite link', () => {
  const recreationAnchor = indexHtml.match(/<a class="library-hours-status" id="recreation-hours-status"[\s\S]*?<\/a>/)?.[0];
  assert.ok(recreationAnchor, 'expected a Recreation source anchor');
  assert.match(recreationAnchor, /href="https:\/\/perec\.columbia\.edu\/hours-operation"/);
  assert.match(recreationAnchor, /aria-live="polite"/);
  assert.match(recreationAnchor, /aria-atomic="true"/);
  assert.doesNotMatch(recreationAnchor, /\brole="status"/);
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
