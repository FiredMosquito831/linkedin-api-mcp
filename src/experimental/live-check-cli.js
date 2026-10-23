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

import { LIVE_READ_OPERATIONS, NOT_ATTEMPTED_DETAIL, catalogReadOperations, requiredInputs, runLiveCheck, summarizeReport } from './live-check.js';
import { gate, flags } from './cli.js';
import { validateInput } from '../operations/catalog.js';
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
    .option('--query <text>', 'search text for operations that need one, such as jobs.search')
    .option('--all-reads', 'check every catalog read operation, in catalog order, instead of the default list'))
    .action(async (options, command) => {
      try {
        const operationsGiven = command.getOptionValueSource('operations') === 'cli';
        setExitCode(await liveCheck({ ...options, operationsGiven }, deps));
      } catch (error) {
        deps.stderr.write(`${error.message}\n`);
        setExitCode(1);
      }
    });
}

// Some read operations need a target or a query, as the catalog's input schema
// says. Without one, skip them with a note rather than reporting a false failure.
function missingInputs(operation, options) {
  return requiredInputs(operation).filter((field) => !options[field]);
}

function inputFor(operation, options) {
  return Object.fromEntries(requiredInputs(operation).map((field) => [field, options[field]]));
}

const REJECTED_INPUT_CODES = new Set(['VALIDATION_ERROR', 'INVALID_INPUT']);

// The catalog rejects some inputs before any adapter runs (for example a URL
// outside LinkedIn). Only those rejections mean "does not match"; any other
// validation outcome is left to the run.
function inputRejected(operation, input) {
  try {
    validateInput(operation, input);
    return false;
  } catch (error) {
    return REJECTED_INPUT_CODES.has(error?.code);
  }
}

async function liveCheck(options, deps) {
  if (options.allReads && options.operationsGiven) {
    deps.stderr.write('Use either --all-reads or --operations, not both.\n');
    return 1;
  }
  const requested = options.allReads
    ? [...catalogReadOperations()]
    : String(options.operations ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  // Only catalog reads are accepted; a write or an unknown name is rejected.
  const readable = new Set(catalogReadOperations());
  const unknown = requested.filter((name) => !readable.has(name));
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
    const missing = missingInputs(operation, options);
    if (missing.length > 0) {
      skipped.push({ operation, reason: `needs ${missing.map((field) => `--${field}`).join(' and ')}` });
      continue;
    }
    const input = inputFor(operation, options);
    if (inputRejected(operation, input)) skipped.push({ operation, reason: NOT_ATTEMPTED_DETAIL });
    else checked.push({ operation, input });
  }
  if (checked.length === 0) {
    deps.stderr.write('Nothing to check: pass --url or --query for the selected operations.\n');
    return 1;
  }

  const open = deps.openSession ?? openSurfaceSession;
  const session = await open({ profileDirectory: paths.profile, headless: false });
  try {
    // Records whether the current operation reached the browser. An input the
    // adapter rejects before any navigation was never attempted.
    let navigated = false;
    const tracked = {
      get page() { return session.page; },
      navigate: (url) => { navigated = true; return session.navigate(url); },
      check: () => session.check(),
    };
    const adapter = createReadAdapter(tracked);
    const report = await runLiveCheck({
      operations: checked.map((entry) => entry.operation),
      execute: async (operation) => {
        navigated = false;
        try {
          await adapter.execute(operation, checked.find((entry) => entry.operation === operation).input);
        } catch (error) {
          if (!navigated && REJECTED_INPUT_CODES.has(error?.code)) {
            throw Object.assign(new Error(NOT_ATTEMPTED_DETAIL), { notAttempted: true });
          }
          throw error;
        }
      },
    });
    const summary = summarizeReport(report);
    for (const line of summary.lines) deps.stdout.write(`${line}\n`);
    for (const { operation, reason } of skipped) {
      deps.stdout.write(`${operation}: skipped (${reason})\n`);
    }
    const skippedTotal = skipped.length + summary.skipped;
    deps.stdout.write(`\n${summary.checked} checked: ${summary.ok} ok, ${summary.unsupported} unsupported, ${summary.failed} failed.`);
    deps.stdout.write(skippedTotal ? ` ${skippedTotal} skipped.\n` : '\n');
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
