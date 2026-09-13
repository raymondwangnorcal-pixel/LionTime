/**
 * Post-publish verification: prove the snapshot the site serves is the one this run
 * just PUT.
 *
 * Why this exists. On 2026-09-10 lionhour.com became the primary Vercel domain and
 * www.lionhour.com started 308-redirecting to it. The four `*_API_URL` repository
 * variables still named the www host, and the publish step's curl does not follow
 * redirects — so every PUT landed on the redirect, curl reported success, the step
 * went green, and no hours reached the site for three days. The scrapers were fine
 * the whole time; nothing in the pipeline looked at what the site was actually
 * serving afterwards.
 *
 * The check is therefore deliberately about the *published result*, not about the
 * request: fetch the endpoint and require its `generated` to be exactly the
 * `generated` of the batch this run published. That catches a redirect, a silently
 * ignored non-2xx, a write to the wrong store, and a CDN serving a stale copy —
 * without needing to guess at clock skew or an age threshold.
 */

/** A redirect means curl's PUT never reached the API, whatever the GET here does. */
export class PublishVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublishVerificationError';
  }
}

function fail(message) {
  throw new PublishVerificationError(message);
}

/** Read the `generated` stamp out of a snapshot or attempt batch. */
export function readGenerated(document, label = 'snapshot') {
  const generated = document?.generated;
  if (typeof generated !== 'string' || Number.isNaN(Date.parse(generated))) {
    fail(`${label} has no usable "generated" timestamp`);
  }
  return generated;
}

/**
 * The services store what they are given (`generated: batch.generated`), so the
 * published stamp is byte-identical to the one that was sent. Compare as instants
 * rather than strings so a re-serialisation that changes the offset still passes.
 */
export function verifyPublishedSnapshot({ expectedGenerated, snapshot }) {
  const published = readGenerated(snapshot, 'the published snapshot');
  if (Date.parse(published) !== Date.parse(expectedGenerated)) {
    fail(
      `the site is not serving this run's snapshot: published "${published}", `
      + `this run sent "${expectedGenerated}". The PUT did not take effect — check the `
      + `API URL variable (a redirect is not followed), the update secret, and the publish step's status code.`,
    );
  }
  return snapshot;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * GET the published snapshot, defeating the edge cache (`s-maxage=300`) with a
 * one-shot query parameter. A redirect is an error in its own right: the publish
 * step's curl would have stopped at it.
 */
export async function fetchPublishedSnapshot(apiUrl, {
  attempts = 3,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  retryDelayMs = 5_000,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    fail('verification attempts must be an integer from one through five');
  }
  const endpoint = new URL(apiUrl);
  if (endpoint.protocol !== 'https:') fail('the publish API URL must use HTTPS');
  endpoint.search = '';

  let lastError = new PublishVerificationError('verification did not run');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const requestUrl = new URL(endpoint);
      requestUrl.searchParams.set('verify', `${Date.now()}-${attempt}`);
      const response = await fetchImpl(requestUrl, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });
      if (response.redirected && new URL(response.url).origin !== endpoint.origin) {
        fail(
          `${endpoint.origin} redirects to ${new URL(response.url).origin}. The publish step's `
          + `curl does not follow redirects, so its PUT never arrived. Point the API URL variable `
          + `at ${new URL(response.url).origin} directly.`,
        );
      }
      if (!response.ok) fail(`the publish API returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new PublishVerificationError('verification failed');
      // A redirect will not resolve itself; retrying only delays the real message.
      if (error instanceof PublishVerificationError && /redirects to/.test(error.message)) throw error;
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  throw lastError;
}
