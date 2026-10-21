import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { text } from 'node:stream/consumers';
import { createOperations } from './service.js';
import { createApprovalStore } from './approvals.js';
import { accountPaths, createAccountStore, stateDirectory } from './accounts.js';
import { OPERATIONS } from './catalog.js';
import { OperationError, exitCode, publicError } from './errors.js';

function print(deps, value) { deps.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function experimentalEnabled(value) { return value === '1' || value === 'true'; }
function account(deps, options = {}) {
  const directory = stateDirectory(deps.env);
  const store = createAccountStore({ directory });
  const selected = options.account || deps.env.LINKEDIN_ACCOUNT || store.current();
  if (!store.list().accounts.some((entry) => entry.name === selected)) throw new OperationError('VALIDATION_ERROR', 'Unknown account. Add it with accounts add.');
  return { directory, selected, paths: accountPaths(directory, selected), store };
}
function service(deps, options) {
  const { directory, selected } = account(deps, options);
  const experimental = options.experimental === true || experimentalEnabled(deps.env.LINKEDIN_EXPERIMENTAL);
  return deps.operationsFactory?.({ stateDirectory: directory, account: selected, experimental }) ?? createOperations({ stateDirectory: directory, account: selected, experimental });
}
function select(data, fields) {
  if (!fields) return data;
  const names = fields.split(',');
  if (names.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) throw new OperationError('VALIDATION_ERROR', 'Fields must be comma-separated top-level field names.');
  const project = (item) => item && typeof item === 'object' ? Object.fromEntries(names.filter((name) => Object.hasOwn(item, name)).map((name) => [name, item[name]])) : item;
  return Array.isArray(data) ? data.map(project) : data?.items ? { ...data, items: data.items.map(project) } : project(data);
}
function output(deps, result, options) {
  if (options.quiet) return;
  const projected = { ...result, data: select(result.data, options.fields) };
  if (options.jsonl && Array.isArray(projected.data?.items)) {
    for (const item of projected.data.items) deps.stdout.write(`${JSON.stringify({ schemaVersion: 1, success: true, operation: result.operation, account: result.account, data: item })}\n`);
  } else print(deps, projected);
}

export function registerOperationCommands(program, deps, setExitCode) {
  const handle = (fn) => async (...args) => {
    try { await fn(...args); } catch (error) {
      print(deps, publicError(error));
      setExitCode(exitCode(error));
    }
  };
  function flags(command) {
    return command.option('--account <name>', 'named account').option('--experimental', 'enable experimental adapters')
      .option('--fields <names>', 'return only selected top-level data fields').option('--jsonl', 'emit list items as JSONL').option('--quiet', 'suppress successful output');
  }
  async function input(options) {
    const value = {};
    for (const key of ['url', 'query', 'limit', 'cursor', 'reaction', 'imagePath']) {
      if (options[key] !== undefined) value[key] = ['limit', 'cursor'].includes(key) ? Number(options[key]) : options[key];
    }
    if (options.input && options.stdin) throw new OperationError('VALIDATION_ERROR', 'Choose --input or --stdin, not both.');
    if (options.input || options.stdin) {
      let json;
      try { json = JSON.parse(options.input ? await readFile(options.input, 'utf8') : await text(deps.stdin)); }
      catch { throw new OperationError('VALIDATION_ERROR', 'The input file or stdin must contain a readable JSON payload.'); }
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new OperationError('VALIDATION_ERROR', 'The JSON payload must be an object.');
      }
      // Merge, JSON wins on conflicts. The payload can supply text privately
      // while a URL or query arrives as a CLI flag.
      return { ...value, ...json };
    }
    return value;
  }
  function inputs(command) {
    return flags(command).option('--input <file>', 'JSON payload file; do not put private content in arguments')
      .option('--stdin', 'read JSON payload from stdin').option('--url <url>', 'target LinkedIn URL')
      .option('--query <query>', 'search query').option('--limit <count>', 'bounded result limit (1..50)')
      .option('--cursor <offset>', 'nonnegative page offset').option('--reaction <type>', 'reaction enum')
      .option('--image-path <path>', 'absolute PNG/JPEG path');
  }
  const operations = program.command('operations').description('Discover shared structured LinkedIn operations.');
  operations.command('list').action(() => print(deps, { schemaVersion: 1, success: true, data: OPERATIONS }));
  inputs(operations.command('call <name>')).action(handle(async (name, options) => output(deps, await service(deps, options).call(name, await input(options)), options)));
  inputs(operations.command('prepare <name>')).action(handle(async (name, options) => output(deps, await service(deps, options).prepare(name, await input(options)), options)));

  const groups = new Map();
  for (const entry of OPERATIONS) {
    const parts = entry.name.split('.');
    const action = parts.pop();
    let parent = program;
    let prefix = '';
    for (const part of parts) {
      prefix = prefix ? `${prefix}.${part}` : part;
      if (!groups.has(prefix)) groups.set(prefix, parent.command(part).description(`Named ${prefix} operations.`));
      parent = groups.get(prefix);
    }
    inputs(parent.command(action).description(`${entry.description}${entry.access === 'write' ? ' (prepare only; approval required)' : ''}`))
      .action(handle(async (options) => {
        const api = service(deps, options);
        const payload = await input(options);
        output(deps, await (entry.access === 'read' ? api.call(entry.name, payload) : api.prepare(entry.name, payload)), options);
      }));
  }

  const approvals = program.command('approvals').description('Operator-only approval of exact reviewed payloads.');
  flags(approvals.command('inspect <id>')).action(handle(async (id, options) => {
    const { paths, selected } = account(deps, options);
    const store = createApprovalStore({ directory: paths.root });
    const record = store.get(id);
    if (record.account !== selected) throw new OperationError('APPROVAL_REQUIRED', 'Approval belongs to a different account.');
    print(deps, { approvalId: id, account: selected, operation: record.operation, input: record.input, digest: record.digest, expiresAt: new Date(record.expiresAt).toISOString(), status: record.status });
  }));
  flags(approvals.command('approve <id>').requiredOption('--digest <sha256>', 'exact digest from the reviewed preview'))
    .action(handle(async (id, options) => {
      if (!deps.stdin.isTTY && !deps.confirmApproval) throw new OperationError('APPROVAL_REQUIRED', 'Approval requires an interactive operator terminal. MCP cannot approve itself.');
      const { paths, selected } = account(deps, options);
      const store = createApprovalStore({ directory: paths.root });
      const record = store.get(id);
      print(deps, { preview: { operation: record.operation, account: record.account, input: record.input }, digest: record.digest });
      let confirmed;
      if (deps.confirmApproval) confirmed = await deps.confirmApproval(record);
      else {
        const reader = createInterface({ input: deps.stdin, output: deps.stderr });
        try { confirmed = (await reader.question(`Type approve ${id} to authorize this exact action: `)) === `approve ${id}`; }
        finally { reader.close(); }
      }
      if (!confirmed) throw new OperationError('APPROVAL_REQUIRED', 'Approval cancelled.');
      print(deps, store.approve(id, { account: selected, expectedDigest: options.digest }));
    }));
  flags(approvals.command('status <id>')).action(handle(async (id, options) => print(deps, service(deps, options).approvalStatus(id))));
  flags(approvals.command('execute <id>')).action(handle(async (id, options) => output(deps, await service(deps, options).execute(id), options)));

  const accounts = program.command('accounts').description('Isolated local account names and browser/token namespaces.');
  accounts.command('list').action(handle(async () => print(deps, createAccountStore({ directory: stateDirectory(deps.env) }).list())));
  accounts.command('add <name>').option('--label <label>', 'display label').action(handle(async (name, options) => print(deps, createAccountStore({ directory: stateDirectory(deps.env) }).add(name, options.label ?? name))));
  accounts.command('use <name>').action(handle(async (name) => print(deps, createAccountStore({ directory: stateDirectory(deps.env) }).use(name))));
  accounts.command('rename <name> <label>').action(handle(async (name, label) => print(deps, createAccountStore({ directory: stateDirectory(deps.env) }).rename(name, label))));

  flags(program.command('doctor').description('Local setup diagnostics; never contacts LinkedIn.')).action(handle(async (options) => {
    const { selected, paths } = account(deps, options);
    const { chromium } = await import('playwright');
    let browserInstalled = true;
    try { await access(chromium.executablePath()); } catch { browserInstalled = false; }
    print(deps, { schemaVersion: 1, success: true, data: { node: process.version, account: selected, chromiumInstalled: browserInstalled, profileDirectory: paths.profile, liveConnectionChecked: false } });
  }));

  flags(program.command('mcp').description('Start the local MCP server; no interactive prompts.')
    .option('--transport <transport>', 'stdio or streamable-http', 'stdio').option('--port <number>', 'loopback HTTP port (0 picks a free port)', '0'))
    .action(async (options) => {
      try {
        const { startMcp } = await import('../mcp/start.js');
        const lifecycle = await startMcp({ operations: service(deps, options), experimental: options.experimental || experimentalEnabled(deps.env.LINKEDIN_EXPERIMENTAL), transport: options.transport, port: Number(options.port), token: deps.env.LINKEDIN_MCP_TOKEN });
        const shutdown = () => {
          process.removeListener('SIGINT', shutdown);
          process.removeListener('SIGTERM', shutdown);
          lifecycle.close().catch(() => { process.exitCode = 1; });
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
      } catch (error) {
        deps.stderr.write(`${JSON.stringify(publicError(error))}\n`);
        setExitCode(exitCode(error));
      }
    });
}
