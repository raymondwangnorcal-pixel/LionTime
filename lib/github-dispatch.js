/**
 * Start a GitHub Actions workflow by `workflow_dispatch`. Content-free: the caller says which
 * workflow file, nothing else crosses over. Configured entirely from the environment:
 *   TICKET_DISPATCH_REPO   owner/name of the repository holding the workflows
 *   TICKET_DISPATCH_TOKEN  fine-grained token with Actions: write on that repository
 *   TICKET_DISPATCH_REF    branch to run on (default main)
 * Returns true only when GitHub answered 204 (run queued); anything else is false.
 */
export async function dispatchWorkflow(workflow, { env = process.env, fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  const { TICKET_DISPATCH_REPO: repo, TICKET_DISPATCH_TOKEN: token } = env;
  if (!repo || !token || !workflow) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: env.TICKET_DISPATCH_REF || 'main' }),
      signal: controller.signal,
    });
    return response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
