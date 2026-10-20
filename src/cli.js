// Command-line interface. run(argv, deps) performs the command and resolves to the exit code.
// deps carries the token store, a client factory, env, and the streams, so tests never touch
// the credential store or LinkedIn.

import { Command, CommanderError } from 'commander';
import { text } from 'node:stream/consumers';
import { createTokenStore } from './auth/token-store.js';
import { createClient as createLinkedInClient, LinkedInApiError } from './linkedin/client.js';
import { findSurfaces } from './surfaces.js';

export function defaultDeps() {
  return {
    store: createTokenStore(),
    createClient: ({ accessToken }) => createLinkedInClient({ accessToken }),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

export async function run(argv, deps = defaultDeps()) {
  let exitCode = 0;
  const program = buildProgram(deps, (code) => {
    exitCode = code;
  });
  try {
    await program.parseAsync(argv, { from: 'node' });
    return exitCode;
  } catch (error) {
    // Commander throws for help and usage errors: exitCode is 0 for help and 1 for errors.
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    deps.stderr.write(`${error.message}\n`);
    return 1;
  }
}

function buildProgram(deps, setExitCode) {
  // exitOverride and configureOutput are set before any .command() call, because
  // .command() copies them to the subcommand at creation time only.
  const program = new Command('linkedin')
    .description('Work with your own LinkedIn account through the official API.')
    .exitOverride()
    .configureOutput({
      writeOut: (str) => deps.stdout.write(str),
      writeErr: (str) => deps.stderr.write(str),
    });

  const auth = program.command('auth').description('Manage the saved access token.');
  auth
    .command('login')
    .description('Save the token from LINKEDIN_ACCESS_TOKEN, or from stdin when that is unset.')
    .action(async () => setExitCode(await authLogin(deps)));
  auth
    .command('status')
    .description('Check the saved token with LinkedIn.')
    .action(async () => setExitCode(await authStatus(deps)));
  auth
    .command('logout')
    .description('Delete the saved token.')
    .action(() => setExitCode(authLogout(deps)));

  program
    .command('me')
    .description('Print the signed-in member identity as JSON.')
    .action(async () => setExitCode(await me(deps)));

  program
    .command('surfaces')
    .description('List the researched LinkedIn surfaces and their status.')
    .option('--status <status>', 'show only entries with this status')
    .option('--group <group>', 'show only entries in this group')
    .option('--json', 'print the entries as a JSON array')
    .action((options) => setExitCode(surfaces(options, deps)));

  return program;
}

async function authLogin(deps) {
  const raw = deps.env.LINKEDIN_ACCESS_TOKEN || (deps.stdin.isTTY ? '' : await text(deps.stdin));
  const token = raw.trim();
  if (token === '') {
    deps.stderr.write('No token given. Set LINKEDIN_ACCESS_TOKEN or pipe the token on stdin.\n');
    return 1;
  }
  try {
    deps.store.save(token);
  } catch (error) {
    deps.stderr.write(`Could not save token: ${error.message}\n`);
    return 1;
  }
  deps.stdout.write('Token saved.\n');
  return 0;
}

function authLogout(deps) {
  deps.stdout.write(deps.store.clear() ? 'Logged out.\n' : 'Nothing to clear.\n');
  return 0;
}

async function me(deps) {
  const identity = await fetchIdentity(deps);
  if (identity === null) return 1;
  deps.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
  return 0;
}

async function authStatus(deps) {
  const identity = await fetchIdentity(deps);
  if (identity === null) return 1;
  deps.stdout.write(`Logged in as ${identity.name} (${identity.sub}).\n`);
  return 0;
}

// Resolves to the identity, or to null after writing the reason to stderr.
async function fetchIdentity(deps) {
  const accessToken = deps.store.load();
  if (!accessToken) {
    deps.stderr.write('Not logged in. Run linkedin auth login.\n');
    return null;
  }
  try {
    const identity = await deps.createClient({ accessToken }).getIdentity();
    if (!identity) {
      deps.stderr.write('LinkedIn returned no identity.\n');
      return null;
    }
    return identity;
  } catch (error) {
    if (error instanceof LinkedInApiError && error.status === 401) {
      deps.stderr.write('LinkedIn rejected the saved token. Run linkedin auth login again.\n');
    } else {
      deps.stderr.write(`${error.message}\n`);
    }
    return null;
  }
}

function surfaces(options, deps) {
  const entries = findSurfaces({ status: options.status, group: options.group });
  if (options.json) {
    deps.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
  } else {
    for (const { id, status, terms, reason } of entries) {
      deps.stdout.write(`${[id, status, terms, reason].join('\t')}\n`);
    }
  }
  return 0;
}
