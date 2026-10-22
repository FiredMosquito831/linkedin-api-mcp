// Live verification of the browser read adapters.
//
// The adapters are tested against local fixtures, which proves the parsing
// logic but not that LinkedIn's current pages match it. This command runs the
// read adapters against the member's own signed-in browser session and reports,
// per operation, whether the live page still matches the adapter.
//
// It is read-only by construction: only read operations are in the list, no
// write path is reachable from here, and a result never contains a page body,
// a token, or a cookie. It is never run automatically.

import { LIVE_READ_OPERATIONS, runLiveCheck, summarizeReport } from './live-check.js';

export function registerLiveCheckCommand(program, deps, setExitCode) {
  const experimental = program.commands.find((command) => command.name() === 'experimental')
    ?? program.command('experimental');
  experimental
    .command('live-check')
    .description('Check the read adapters against your own signed-in LinkedIn session (read-only).')
    .option('--operations <list>', 'comma-separated operations to check', LIVE_READ_OPERATIONS.join(','))
    .option('--account <name>', 'named account to use')
    .action(async (options) => setExitCode(await liveCheck(options, deps)));
}

async function liveCheck(options, deps) {
  const requested = String(options.operations ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = requested.filter((name) => !LIVE_READ_OPERATIONS.includes(name));
  if (unknown.length > 0) {
    deps.stderr.write(`Unknown operation(s): ${unknown.join(', ')}. Live checks are read-only.\n`);
    return 1;
  }
  if (requested.length === 0) {
    deps.stderr.write('No operations selected.\n');
    return 1;
  }
  const execute = deps.liveCheckExecute;
  if (typeof execute !== 'function') {
    deps.stderr.write('Live checks need a signed-in browser session. Run linkedin experimental browser login --experimental first.\n');
    return 1;
  }
  const report = await runLiveCheck({ operations: requested, execute: (operation) => execute(operation, options) });
  const summary = summarizeReport(report);
  for (const line of summary.lines) deps.stdout.write(`${line}\n`);
  deps.stdout.write(`\n${summary.checked} checked: ${summary.ok} ok, ${summary.unsupported} unsupported, ${summary.failed} failed.\n`);
  if (summary.failed > 0) {
    deps.stderr.write('Some adapters failed. The report holds no page content, so read the failure detail only.\n');
    return 1;
  }
  if (summary.unsupported > 0) {
    deps.stdout.write('Unsupported means LinkedIn changed the page, or the account lacks access. The adapter fails closed rather than guessing.\n');
  }
  return 0;
}
