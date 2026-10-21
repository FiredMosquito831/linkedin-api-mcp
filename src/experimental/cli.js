import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { text } from 'node:stream/consumers';
import { openExperimentalBrowser } from './browser.js';

const WARNING = 'EXPERIMENTAL: unofficial LinkedIn access can restrict your account. Use only your own account and permitted data. Browser profiles contain session credentials.';

async function ask(deps, message) {
  if (deps.confirmExperimental) return deps.confirmExperimental(message);
  if (!deps.stdin.isTTY) throw new Error('Interactive confirmation required, or pass --yes after reviewing the experimental warning.');
  const reader = createInterface({ input: deps.stdin, output: deps.stderr });
  try {
    return (await reader.question(`${message}\nType yes to continue: `)).trim() === 'yes';
  } finally {
    reader.close();
  }
}

async function gate(options, deps) {
  if (!options.experimental) throw new Error('Pass --experimental to enable this experimental command.');
  deps.stderr.write(`${WARNING}\n`);
  if (!options.yes && !await ask(deps, 'Enable experimental access for this command?')) throw new Error('Experimental command cancelled.');
}

function stateDirectory(deps) {
  const directory = deps.env.LINKEDIN_STATE_DIR || join(homedir(), '.linkedin-api-mcp');
  if (!isAbsolute(directory)) throw new Error('LINKEDIN_STATE_DIR must be an absolute private directory.');
  return directory;
}

function flags(command) {
  return command
    .option('--experimental', 'opt in to experimental unofficial access')
    .option('--yes', 'explicitly acknowledge the experimental warning for this invocation');
}

async function withBrowser(options, deps, execute) {
  const open = deps.openExperimentalBrowser ?? openExperimentalBrowser;
  const browser = await open({
    experimental: true,
    profileDirectory: join(stateDirectory(deps), 'browser-profile'),
    headless: false,
  });
  try {
    return await execute(browser);
  } finally {
    await browser.close();
  }
}

function print(deps, result) {
  deps.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function jobs(deps) {
  const { createJobStore, runDueJobs, runWorker } = await import('./jobs.js');
  return {
    store: deps.jobStore ?? createJobStore({ directory: join(stateDirectory(deps), 'jobs') }),
    runDueJobs,
    runWorker,
  };
}

function jobAction(options) {
  if (options.type === 'voyager.me') return { type: options.type };
  const action = { type: options.type, url: options.url };
  if (options.type === 'browser.extract') {
    action.selector = options.selector;
    action.limit = Number(options.limit ?? 10);
  }
  return action;
}

async function executeRead(action, options, deps) {
  return withBrowser(options, deps, async (browser) => {
    let result;
    if (action.type === 'browser.snapshot') result = await browser.snapshot(action);
    else if (action.type === 'browser.extract') result = await browser.extract(action);
    else if (action.type === 'voyager.me') result = await browser.voyagerMe();
    else throw new Error('Only allowlisted read actions can run from a job.');
    print(deps, result);
    return undefined;
  });
}

export function registerExperimentalCommands(program, deps) {
  const experimental = program.command('experimental').description('Opt-in unofficial browser access and local read-job scheduling.');
  experimental.command('capabilities').description('Show experimental capabilities and unsupported actions.').action(() => print(deps, {
    experimental: ['browser.login', 'browser.snapshot', 'browser.extract', 'browser.click', 'browser.fill', 'voyager.me', 'jobs', 'batch', 'worker'],
    unsupported: ['captcha-bypass', 'stealth-evasion', 'rate-limit-evasion', 'bulk-outreach'],
    scheduling: 'Finite, allowlisted read jobs only. No automatic messaging or engagement.',
    warning: WARNING,
  }));

  const browser = experimental.command('browser').description('Use a dedicated, visibly automated browser profile.');
  flags(browser.command('login').description('Open Chromium for manual sign-in and manual verification.'))
    .action(async (options) => {
      await gate(options, deps);
      const result = await withBrowser(options, deps, (client) => client.login({
        waitForUser: async () => {
          if (!await ask(deps, 'Complete login and any verification in the browser, then confirm.')) throw new Error('Login cancelled.');
        },
      }));
      print(deps, result);
    });
  flags(browser.command('snapshot').requiredOption('--url <url>', 'one LinkedIn page URL'))
    .action(async (options) => {
      await gate(options, deps);
      print(deps, await withBrowser(options, deps, (client) => client.snapshot({ url: options.url })));
    });
  flags(browser.command('extract').requiredOption('--url <url>', 'one LinkedIn page URL')
    .requiredOption('--selector <selector>', 'selector for visible text').option('--limit <count>', 'maximum elements (1..50)', '10'))
    .action(async (options) => {
      await gate(options, deps);
      print(deps, await withBrowser(options, deps, (client) => client.extract({ url: options.url, selector: options.selector, limit: Number(options.limit) })));
    });
  flags(browser.command('click').requiredOption('--url <url>', 'one LinkedIn page URL')
    .requiredOption('--selector <selector>', 'selector matching exactly one element')
    .option('--confirm-action', 'approve this one click and its external effects'))
    .action(async (options) => {
      await gate(options, deps);
      if (!options.confirmAction) throw new Error('Use --confirm-action to approve this one click.');
      print(deps, await withBrowser(options, deps, (client) => client.click({ url: options.url, selector: options.selector, confirmed: true })));
    });
  flags(browser.command('fill').requiredOption('--url <url>', 'one LinkedIn page URL')
    .requiredOption('--selector <selector>', 'selector matching exactly one field')
    .option('--confirm-action', 'approve this one edit, including any autosave effects'))
    .action(async (options) => {
      await gate(options, deps);
      if (!options.confirmAction) throw new Error('Use --confirm-action to approve this one edit.');
      if (deps.stdin.isTTY) throw new Error('Pipe the field text on stdin; do not pass credentials or private text as arguments.');
      const value = await text(deps.stdin);
      print(deps, await withBrowser(options, deps, (client) => client.fill({ url: options.url, selector: options.selector, value, confirmed: true })));
    });

  const voyager = experimental.command('voyager').description('Experimental fixed-endpoint internal API reads.');
  flags(voyager.command('me').description('Read /voyager/api/me through your own browser session.'))
    .action(async (options) => {
      await gate(options, deps);
      print(deps, await withBrowser(options, deps, (client) => client.voyagerMe()));
    });

  const queue = experimental.command('jobs').description('Persist finite read actions, not credentials or results.');
  flags(queue.command('add').requiredOption('--type <type>', 'browser.snapshot, browser.extract, or voyager.me')
    .requiredOption('--at <timestamp>', 'execution time with timezone')
    .option('--url <url>', 'one LinkedIn page URL').option('--selector <selector>', 'extraction selector').option('--limit <count>', 'extraction cap', '10'))
    .action(async (options) => {
      await gate(options, deps);
      const { store } = await jobs(deps);
      print(deps, await store.add({ action: jobAction(options), runAt: options.at }));
    });
  flags(queue.command('list')).action(async (options) => {
    await gate(options, deps);
    print(deps, await (await jobs(deps)).store.list());
  });
  flags(queue.command('cancel <id>')).action(async (id, options) => {
    await gate(options, deps);
    print(deps, await (await jobs(deps)).store.cancel(id));
  });
  flags(queue.command('run').option('--max <count>', 'maximum due reads per invocation (1..20)', '10'))
    .action(async (options) => {
      await gate(options, deps);
      const { store, runDueJobs } = await jobs(deps);
      const events = await runDueJobs({ store, maxJobs: Number(options.max), execute: (action) => executeRead(action, options, deps) });
      print(deps, events);
      if (events.some((event) => event.type === 'failed' || event.type === 'blocked')) {
        throw new Error('One or more read jobs failed or were blocked. See job status; nothing is retried automatically.');
      }
    });

  flags(experimental.command('batch <file>').description('Validate up to 20 explicit read jobs from a JSON array; enqueue only.'))
    .action(async (file, options) => {
      await gate(options, deps);
      const entries = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(entries) || entries.length < 1 || entries.length > 20) throw new Error('A batch must contain 1..20 explicit jobs.');
      const { store } = await jobs(deps);
      // Validate all rows before writing any. Each successful add is reported separately.
      const { validateJobInput } = await import('./jobs.js');
      for (const entry of entries) validateJobInput(entry);
      for (const entry of entries) print(deps, await store.add(entry));
    });

  flags(experimental.command('worker').description('Run the sequential foreground worker until Ctrl+C; read jobs only.')
    .option('--interval <ms>', 'poll interval in milliseconds (1000..3600000)', '5000'))
    .action(async (options) => {
      await gate(options, deps);
      const { store, runWorker } = await jobs(deps);
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once('SIGINT', abort);
      process.once('SIGTERM', abort);
      let failed = false;
      try {
        await runWorker({ store, intervalMs: Number(options.interval), signal: controller.signal,
          execute: (action) => executeRead(action, options, deps), onEvent: (event) => {
            print(deps, event);
            if (event.type === 'failed' || event.type === 'blocked') failed = true;
          } });
        if (failed) throw new Error('The worker encountered failed or blocked jobs. Review job status before restarting.');
      } finally {
        process.removeListener('SIGINT', abort);
        process.removeListener('SIGTERM', abort);
      }
    });
}
