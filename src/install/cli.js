// Install-surface commands: agent install/uninstall, environment doctor, and
// the explicit Chromium download.
//
// deps may carry home, projectDir, env, the streams, and test doubles for the
// command runner (execute), PATH lookup (which), install confirmation
// (confirmInstall), and the Chromium spawn (spawnImpl). setExitCode is the
// controller's exit-code sink; when it is absent, process.exitCode is set.

import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESSES, harnessDefinitions } from './harnesses.js';
import { checkEnvironment, installChromium } from './doctor.js';
import { OperationError, exitCode, publicError } from '../operations/errors.js';

const DEFAULT_SOURCE = 'FiredMosquito831/linkedin-api-mcp';
const DEFAULT_MARKETPLACE = 'linkedin-api-mcp';
const DEFAULT_PLUGIN = 'linkedin';
const PACKAGE_ROOT = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));

const KNOWN_TARGETS = Object.keys(HARNESSES);

function targetNames(value) {
  if (!value || value.length === 0) return KNOWN_TARGETS;
  const known = new Set(KNOWN_TARGETS);
  for (const name of value) {
    if (!known.has(name)) {
      throw new OperationError('VALIDATION_ERROR', `Unknown target "${name}". Known targets: ${KNOWN_TARGETS.join(', ')}.`);
    }
  }
  return value;
}

function selectedScope(value) {
  if (value !== 'global' && value !== 'project') {
    throw new OperationError('VALIDATION_ERROR', 'Scope must be "global" or "project".');
  }
  return value;
}

function printSteps(config, steps) {
  let failed = false;
  for (const entry of steps) {
    config.stdout.write(`${entry.harness}\t${entry.step}\t${entry.status}\t${entry.detail}\n`);
    if (entry.status === 'failed') failed = true;
  }
  return failed;
}

async function confirmInstall(config, message) {
  if (typeof config.confirmInstall === 'function') return Boolean(await config.confirmInstall(message));
  if (!config.stdin || !config.stdin.isTTY) {
    throw new OperationError('VALIDATION_ERROR', 'Non-interactive install requires --yes after reviewing the targets.');
  }
  const reader = createInterface({ input: config.stdin, output: config.stderr });
  try {
    return (await reader.question(`${message} [y/N] `)).trim().toLowerCase() === 'y';
  } finally {
    reader.close();
  }
}

function createAdapters(config, options) {
  return harnessDefinitions({
    home: config.home,
    projectDir: config.projectDir,
    source: options.source ?? DEFAULT_SOURCE,
    marketplace: options.marketplace ?? DEFAULT_MARKETPLACE,
    plugin: config.plugin ?? DEFAULT_PLUGIN,
    serverCommand: config.serverCommand ?? process.execPath,
    serverArgs: config.serverArgs ?? [join(PACKAGE_ROOT, 'bin', 'linkedin.js'), 'mcp', '--transport', 'stdio'],
    execute: config.execute,
    which: config.which,
  });
}

export function registerInstallCommands(program, deps = {}, setExitCode) {
  const config = {
    env: process.env,
    home: homedir(),
    projectDir: process.cwd(),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    ...deps,
  };
  const done = typeof setExitCode === 'function'
    ? setExitCode
    : typeof config.setExitCode === 'function'
      ? config.setExitCode
      : (code) => { process.exitCode = code; };
  const fail = (error) => {
    config.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    done(exitCode(error));
  };

  program
    .command('install [targets...]')
    .description('Install the LinkedIn plugin and MCP registration into agent harnesses (default: all).')
    .option('--scope <scope>', 'global or project', 'global')
    .option('--source <owner/repo>', 'plugin marketplace source', DEFAULT_SOURCE)
    .option('--marketplace <name>', 'marketplace name', DEFAULT_MARKETPLACE)
    .option('--yes', 'skip the confirmation prompt')
    .action(async (rawTargets, options) => {
      try {
        const names = targetNames(rawTargets);
        const scope = selectedScope(options.scope);
        if (!options.yes) {
          const proceed = await confirmInstall(config, `Install ${names.join(', ')} at ${scope} scope?`);
          if (!proceed) {
            config.stderr.write('Install cancelled.\n');
            done(1);
            return;
          }
        }
        const adapters = createAdapters(config, options);
        let failed = false;
        for (const name of names) {
          failed = printSteps(config, await adapters[name].install(scope)) || failed;
        }
        done(failed ? 1 : 0);
      } catch (error) {
        fail(error);
      }
    });

  program
    .command('uninstall [targets...]')
    .description('Reverse an install for agent harnesses (default: all).')
    .option('--scope <scope>', 'global or project', 'global')
    .action(async (rawTargets, options) => {
      try {
        const names = targetNames(rawTargets);
        const scope = selectedScope(options.scope);
        const adapters = createAdapters(config, options);
        let failed = false;
        for (const name of names) {
          failed = printSteps(config, await adapters[name].uninstall(scope)) || failed;
        }
        done(failed ? 1 : 0);
      } catch (error) {
        fail(error);
      }
    });

  const environmentDoctor = async () => {
    try {
      const report = await checkEnvironment({
        env: config.env,
        home: config.home,
        projectDir: config.projectDir,
        chromiumExecutable: config.chromiumExecutable,
        fetchImpl: config.fetchImpl,
      });
      let failed = false;
      for (const entry of report.checks) {
        config.stdout.write(`${entry.name}\t${entry.status}\t${entry.detail}\n`);
        if (entry.status === 'fail') failed = true;
      }
      done(failed ? 1 : 0);
    } catch (error) {
      fail(error);
    }
  };

  // Operation commands already register a `doctor`; Commander rejects a second
  // command with the same name. Run that existing action first and then print
  // the install environment checks, so both views stay available.
  const existingDoctor = program.commands.find((command) => command.name() === 'doctor');
  if (existingDoctor) {
    const previous = existingDoctor._actionHandler;
    existingDoctor.action(async (...args) => {
      if (typeof previous === 'function') await previous.apply(existingDoctor, args);
      await environmentDoctor();
    });
  } else {
    program
      .command('doctor')
      .description('Check the local install environment; never contacts LinkedIn.')
      .action(environmentDoctor);
  }

  const browser = program.command('browser').description('Manage the optional Chromium download.');
  browser
    .command('install')
    .description('Download Chromium for the browser adapters. Explicit only; never runs during npm install.')
    .action(async () => {
      try {
        const result = await installChromium({ spawnImpl: config.spawnImpl });
        config.stdout.write(`${result.detail}\n`);
        done(result.ok ? 0 : 1);
      } catch (error) {
        fail(error);
      }
    });
}
