import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { run } from '../src/cli.js';
import { LinkedInApiError } from '../src/linkedin/client.js';

function sink() {
  const out = { buf: '' };
  out.write = (chunk) => {
    out.buf += chunk;
    return true;
  };
  return out;
}

function fakeDeps(options = {}) {
  let stored = options.token ?? null;
  const clientTokens = [];
  return {
    store: {
      save(token) {
        if (options.saveError) throw new Error(options.saveError);
        stored = token;
      },
      load: () => stored,
      clear() {
        const hadToken = stored !== null;
        stored = null;
        return hadToken;
      },
    },
    createClient({ accessToken }) {
      clientTokens.push(accessToken);
      return {
        async getIdentity() {
          if (options.identityStatus !== undefined) {
            throw new LinkedInApiError({ status: options.identityStatus, retryAfter: null, body: {} });
          }
          return options.identity === undefined ? { sub: 'abc', name: 'Ada' } : options.identity;
        },
      };
    },
    clientTokens,
    env: options.env ?? {},
    stdin: Readable.from([]),
    stdout: sink(),
    stderr: sink(),
  };
}

test('me without a saved token exits 1 with a plain message', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'me'], deps), 1);
  assert.match(deps.stderr.buf, /Not logged in\. Run linkedin auth login\./);
});

test('me with a saved token prints the identity as JSON', async () => {
  const deps = fakeDeps({ token: 'tok' });
  assert.equal(await run(['node', 'linkedin', 'me'], deps), 0);
  assert.equal(JSON.parse(deps.stdout.buf).name, 'Ada');
});

test('auth login reads LINKEDIN_ACCESS_TOKEN and trims it', async () => {
  const deps = fakeDeps({ env: { LINKEDIN_ACCESS_TOKEN: ' tok \n' } });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 0);
  assert.equal(deps.store.load(), 'tok');
});

test('auth login with no token exits 1 and stores nothing', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 1);
  assert.match(deps.stderr.buf, /No token given/);
  assert.equal(deps.store.load(), null);
});

test('auth login with a failing credential store writes nothing', async () => {
  const deps = fakeDeps({ env: { LINKEDIN_ACCESS_TOKEN: 'tok' }, saveError: 'no credential store available' });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 1);
  assert.match(deps.stderr.buf, /Could not save token: no credential store available/);
  assert.equal(deps.store.load(), null);
});

test('a 401 from LinkedIn tells the user to log in again', async () => {
  const deps = fakeDeps({ token: 'old', identityStatus: 401 });
  assert.equal(await run(['node', 'linkedin', 'auth', 'status'], deps), 1);
  assert.match(deps.stderr.buf, /Run linkedin auth login again\./);
});

test('surfaces filters by status and rejects unknown values', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'available'], deps), 0);
  assert.match(deps.stdout.buf, /^sign-in-identity\t/);
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'maybe'], deps), 1);
});

test('auth status without a saved token exits 1 with a plain message', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'auth', 'status'], deps), 1);
  assert.match(deps.stderr.buf, /Not logged in\. Run linkedin auth login\./);
});

test('auth login rejects a whitespace-only token before the store is called', async () => {
  const deps = fakeDeps({ env: { LINKEDIN_ACCESS_TOKEN: ' \n ' } });
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 1);
  assert.equal(deps.stderr.buf, 'No token given. Set LINKEDIN_ACCESS_TOKEN or pipe the token on stdin.\n');
  assert.equal(deps.store.load(), null);
});

test('auth login reads the token from piped stdin when LINKEDIN_ACCESS_TOKEN is unset', async () => {
  const deps = { ...fakeDeps({}), stdin: Readable.from(['  tok\n']) };
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 0);
  assert.equal(deps.store.load(), 'tok');
  assert.equal(deps.stdout.buf, 'Token saved.\n');
});

test('auth login does not read a terminal stdin', async () => {
  const stdin = Readable.from(['tok\n']);
  stdin.isTTY = true;
  const deps = { ...fakeDeps({}), stdin };
  assert.equal(await run(['node', 'linkedin', 'auth', 'login'], deps), 1);
  assert.match(deps.stderr.buf, /No token given/);
  assert.equal(deps.store.load(), null);
});

test('auth status with a saved token prints who is logged in', async () => {
  const deps = fakeDeps({ token: 'tok' });
  assert.equal(await run(['node', 'linkedin', 'auth', 'status'], deps), 0);
  assert.equal(deps.stdout.buf, 'Logged in as Ada (abc).\n');
  assert.deepEqual(deps.clientTokens, ['tok']);
});

test('me treats a null identity as a failure, not a crash', async () => {
  const deps = fakeDeps({ token: 'tok', identity: null });
  assert.equal(await run(['node', 'linkedin', 'me'], deps), 1);
  assert.equal(deps.stderr.buf, 'LinkedIn returned no identity.\n');
  assert.equal(deps.stdout.buf, '');
});

test('auth status treats a null identity as a failure, not a crash', async () => {
  const deps = fakeDeps({ token: 'tok', identity: null });
  assert.equal(await run(['node', 'linkedin', 'auth', 'status'], deps), 1);
  assert.equal(deps.stderr.buf, 'LinkedIn returned no identity.\n');
  assert.equal(deps.stdout.buf, '');
});

test('other LinkedIn errors print their message and exit 1', async () => {
  const deps = fakeDeps({ token: 'tok', identityStatus: 429 });
  assert.equal(await run(['node', 'linkedin', 'auth', 'status'], deps), 1);
  assert.equal(deps.stderr.buf, 'LinkedIn API request failed with HTTP 429\n');
});

test('auth logout reports whether a saved token was removed', async () => {
  const withToken = fakeDeps({ token: 'tok' });
  assert.equal(await run(['node', 'linkedin', 'auth', 'logout'], withToken), 0);
  assert.equal(withToken.stdout.buf, 'Logged out.\n');
  assert.equal(withToken.store.load(), null);

  const withoutToken = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'auth', 'logout'], withoutToken), 0);
  assert.equal(withoutToken.stdout.buf, 'Nothing to clear.\n');
});

test('surfaces prints one tab-separated line per entry', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'available'], deps), 0);
  assert.equal(deps.stdout.buf, 'sign-in-identity\tavailable\tallowed\texplicitly allowed identity read\n');
});

test('surfaces --json prints the matching entries as a JSON array', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'available', '--json'], deps), 0);
  assert.deepEqual(JSON.parse(deps.stdout.buf).map((entry) => entry.id), ['sign-in-identity']);
});

test('surfaces prints the RangeError message for an unknown status', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'surfaces', '--status', 'maybe'], deps), 1);
  assert.match(deps.stderr.buf, /Unknown status "maybe"/);
});

test('an unknown command exits 1 and names it on stderr', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', 'bogus'], deps), 1);
  assert.match(deps.stderr.buf, /unknown command 'bogus'/);
});

test('--help is written to stdout and exits 0', async () => {
  const deps = fakeDeps({});
  assert.equal(await run(['node', 'linkedin', '--help'], deps), 0);
  assert.match(deps.stdout.buf, /Usage: linkedin/);
  assert.equal(deps.stderr.buf, '');
});
