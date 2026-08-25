const VALID_HALL_IDS = new Set([
  'johnjay', 'ferris', 'jjs', 'chefmikes', 'chefdons',
  'gracedodge', 'facultyhouse', 'facultyhouse-4', 'facshack',
  'johnnys', 'hewitt', 'diana-center-cafe', 'barnard-bubble-tea-sushi',
]);

const FP_PATTERN = /^[0-9a-f]{64}$/;
const TOP_N = 5;

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function topResults(tallies, n) {
  return Object.entries(tallies)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id, votes]) => ({ id, votes }));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function createDiningVoteService({ store, logger = console }) {
  return {
    async handle(request) {
      try {
        if (request.method === 'OPTIONS') {
          return { status: 204, headers: corsHeaders(), body: null };
        }

        const date = todayET();

        if (request.method === 'GET') {
          const fp = request.query?.fp;
          const tallies = await store.getResults(date);
          const userVote = fp && FP_PATTERN.test(fp)
            ? await store.getUserVote(date, fp)
            : null;
          const totalVotes = Object.values(tallies).reduce((sum, n) => sum + n, 0);

          return {
            status: 200,
            headers: {
              ...corsHeaders(),
              'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
            },
            body: {
              date,
              totalVotes,
              top: topResults(tallies, TOP_N),
              userVote,
            },
          };
        }

        if (request.method === 'POST') {
          const { fp, hallId } = request.body || {};

          if (!fp || !FP_PATTERN.test(fp)) {
            return {
              status: 400,
              headers: { ...corsHeaders(), 'Cache-Control': 'no-store' },
              body: { error: 'Invalid fingerprint — expected 64 hex characters' },
            };
          }
          if (!hallId || !VALID_HALL_IDS.has(hallId)) {
            return {
              status: 400,
              headers: { ...corsHeaders(), 'Cache-Control': 'no-store' },
              body: { error: 'Invalid hall ID' },
            };
          }

          await store.castVote(date, fp, hallId);

          const tallies = await store.getResults(date);
          const totalVotes = Object.values(tallies).reduce((sum, n) => sum + n, 0);

          return {
            status: 200,
            headers: { ...corsHeaders(), 'Cache-Control': 'no-store' },
            body: {
              date,
              totalVotes,
              top: topResults(tallies, TOP_N),
              userVote: hallId,
            },
          };
        }

        return {
          status: 405,
          headers: { ...corsHeaders(), Allow: 'GET, POST, OPTIONS' },
          body: { error: 'Method not allowed' },
        };
      } catch (error) {
        logger.error('Dining vote operation failed', { name: error?.name, message: error?.message });
        return {
          status: 500,
          headers: { ...corsHeaders(), 'Cache-Control': 'no-store' },
          body: { error: 'Internal server error' },
        };
      }
    },
  };
}
