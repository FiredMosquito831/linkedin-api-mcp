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
import { gate, flags } from './cli.js';
import { createReadAdapter } from '../operations/reads.js';
import { openSurfaceSession } from '../operations/session.js';
import { accountPaths, createAccountStore, stateDirectory } from '../operations/accounts.js';

export function registerLiveCheckCommand(program, deps, setExitCode) {
  const experimental = program.commands.find((command) => command.name() === 'experimental')
    ?? program.command('experimental');
  flags(experimental
    .command('live-check')
    .description('Check the read adapters against your own signed-in LinkedIn session (read-only).')
    .option('--operations <list>', 'comma-separated operations to check', LIVE_READ_OPERATIONS.join(','))
    .option('--account <name>', 'named account to use')
    .option('--url <url>', 'target for operations that need one, such as companies.get')
    .option('--query <text>', 'search text for operations that need one, such as jobs.search'))
    .action(async (options) => {
      try {
        setExitCode(await liveCheck(options, deps));
      } catch (error) {
        deps.stderr.write(`${error.message}\n`);
        setExitCode(1);
      }
    });
}

// Some read operations need a target or a query. Without one, skip them with a
// note rather than reporting a false failure.
function inputFor(operation, options) {
  if (operation === 'companies.get') return options.url ? { url: options.url } : null;
  if (operation === 'jobs.search') return options.query ? { query: options.query } : null;
  return {};
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

  // Same opt-in and acknowledgement as every other experimental command.
  await gate(options, deps);

  const selected = options.account || deps.env.LINKEDIN_ACCOUNT;
  const directory = stateDirectory(deps.env);
  const account = selected || createAccountStore({ directory }).current();
  const paths = accountPaths(directory, account);

  const checked = [];
  const skipped = [];
  for (const operation of requested) {
    const input = inputFor(operation, options);
    if (input === null) skipped.push(operation);
    else checked.push({ operation, input });
  }
  if (checked.length === 0) {
    deps.stderr.write('Nothing to check: pass --url or --query for the selected operations.\n');
    return 1;
  }

  const open = deps.openSession ?? openSurfaceSession;
  const session = await open({ profileDirectory: paths.profile, headless: false });
  try {
    const adapter = createReadAdapter(session);
    const report = await runLiveCheck({
      operations: checked.map((entry) => entry.operation),
      execute: (operation) => adapter.execute(operation, checked.find((entry) => entry.operation === operation).input),
    });
    const summary = summarizeReport(report);
    for (const line of summary.lines) deps.stdout.write(`${line}\n`);
    for (const operation of skipped) {
      deps.stdout.write(`${operation}: skipped (needs ${operation === 'companies.get' ? '--url' : '--query'})\n`);
    }
    deps.stdout.write(`\n${summary.checked} checked: ${summary.ok} ok, ${summary.unsupported} unsupported, ${summary.failed} failed.`);
    deps.stdout.write(skipped.length ? ` ${skipped.length} skipped.\n` : '\n');
    if (summary.failed > 0) {
      deps.stderr.write('Some adapters failed. The report holds no page content, so read the failure detail only.\n');
      return 1;
    }
    if (summary.unsupported > 0) {
      deps.stdout.write('Unsupported means LinkedIn changed the page, or the account lacks access. The adapter fails closed rather than guessing.\n');
    }
    return 0;
  } finally {
    await session.close();
  }
}
