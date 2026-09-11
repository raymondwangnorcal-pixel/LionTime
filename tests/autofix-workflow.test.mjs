import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/autofix-parser.yml', 'utf8');
const job = name => {
  const match = workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|$)`));
  assert.ok(match, `job ${name}`);
  return match[1];
};

test('runs after every scrape workflow whatever its conclusion, plus a dry-run dispatch', () => {
  assert.match(workflow, /workflow_run:\n    workflows:\n      - Update dining hours\n      - Update library hours\n      - Update recreation hours\n      - Update student services hours\n    types: \[completed\]/);
  assert.match(workflow, /workflow_dispatch:\n    inputs:\n      run_id:/);
  assert.match(workflow, /force:\n[\s\S]*?type: boolean/);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /concurrency:\n  group: autofix-parser/);
});

test('triage reads the manifest with read-only permissions and no secrets', () => {
  const triage = job('triage');
  assert.match(triage, /permissions:\n      contents: read\n      actions: read\n      pull-requests: read/);
  assert.match(triage, /pattern: scrape-manifest-\*/);
  assert.match(triage, /run-id: \$\{\{ steps\.source\.outputs\.run_id \}\}/);
  assert.match(triage, /node scripts\/autofix-triage\.mjs --manifest/);
  assert.doesNotMatch(triage, /secrets\./);
  assert.doesNotMatch(triage, /ANTHROPIC/);
});

test('generate is gated on AUTOFIX_ENABLED, holds only the model key, and cannot write or publish', () => {
  const generate = job('generate');
  assert.match(generate, /if: needs\.triage\.outputs\.count != '0' && vars\.AUTOFIX_ENABLED == 'true'/);
  assert.match(generate, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(generate, /contents: write|pull-requests: write/);
  assert.match(generate, /anthropic_api_key: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
  assert.doesNotMatch(generate, /LIONTIME_TELEGRAM|LIBRARY_HOURS_UPDATE_SECRET|VERCEL_TOKEN|GH_TOKEN/);
  assert.match(generate, /uses: anthropics\/claude-code-action@v1\n        with:\n(?:          [^\n]*\n)*?          claude_args: >-/, 'claude_args is an input of the action, not a stray step key');
  // Cost controls (docs §7): a mid-tier model, a tight turn cap, the fixture written by the
  // trusted side before the model runs, and the actual cost recorded next to the patch.
  assert.match(generate, /--model claude-sonnet-5/);
  assert.match(generate, /--max-turns 25\b/);
  assert.ok(generate.indexOf('Write the sanitised fixture from the captured page') < generate.indexOf('Render the prompt'));
  assert.ok(generate.indexOf('Render the prompt') < generate.indexOf('claude-code-action'));
  assert.match(generate, /autofix-propose\.mjs fixture --source/);
  assert.match(generate, /--evidence "tests\/fixtures\/\$FIXTURE_NAME"/);
  assert.match(generate, /cost\.json/);
  // Claude Code permission rules are `Tool(prefix:*)`; a bare `Bash(node *)` matches nothing.
  assert.match(generate, /--allowedTools "[^"]*Bash\(node:\*\)[^"]*Bash\(npm test:\*\)/);
  assert.doesNotMatch(generate, /Bash\([a-z]+ \*\)/, 'no space-wildcard tool rules');
  assert.match(generate, /--disallowedTools "[^"]*Bash\(git push:\*\)[^"]*Bash\(gh:\*\)[^"]*Bash\(curl:\*\)[^"]*Bash\(wget:\*\)/);
  assert.match(generate, /--disallowedTools "[^"]*WebFetch,WebSearch"/);
  // Partial work and the execution log survive an action failure
  assert.match(generate, /Capture the working-tree diff as the only output\n        id: patch\n        if: always\(\)/);
  assert.match(generate, /execution-log\.json/);
  assert.match(generate, /git diff --binary > "\$RUNNER_TEMP\/patch\/autofix\.diff"/);
  // `git push` may appear only inside the deny list, never as a step
  assert.doesNotMatch(generate.replace(/--disallowedTools "[^"]*"/, ''), /git push|gh pr create/);
  assert.match(generate, /max-parallel: 1/);
  // Both write-side jobs build on current main so the tooling is never older than the scrape.
  assert.match(generate, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(job('propose'), /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.doesNotMatch(workflow, /needs\.triage\.outputs\.commit \|\|/);
});

test('propose is the only job with write access and never runs the model', () => {
  const propose = job('propose');
  assert.match(propose, /permissions:\n      contents: write\n      pull-requests: write/);
  assert.doesNotMatch(propose, /ANTHROPIC|claude-code-action/);
  assert.match(propose, /node scripts\/autofix-propose\.mjs check --patch/);
  // The branch is pushed before the tests run so the same page is never retried (§3.3),
  // and the PR only opens when the whole suite passed.
  assert.ok(propose.indexOf('git push -u origin "$BRANCH"') < propose.indexOf('npm test'));
  assert.match(propose, /if: steps\.check\.outputs\.verdict == 'accepted' && steps\.tests\.outcome == 'success'\n[\s\S]*?gh pr create --base main --head "\$BRANCH"/);
  assert.match(propose, /node scripts\/autofix-values-table\.mjs --source/);
  assert.doesNotMatch(propose, /gh pr merge|--auto|--admin/);
  assert.match(propose, /Fail the job when nothing was proposed/);
  assert.match(propose, /Model cost: \$/, 'the outcome message carries the cost');
});

test('the same-name workflows the trigger lists actually exist', () => {
  for (const file of ['update-dining-hours', 'update-library-hours', 'update-recreation-hours', 'update-student-services-hours']) {
    const name = readFileSync(`.github/workflows/${file}.yml`, 'utf8').match(/^name: (.+)$/m)[1];
    assert.ok(workflow.includes(`      - ${name}\n`), `${name} is a workflow_run trigger`);
  }
});
