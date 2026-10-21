import fs from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OperationError } from './errors.js';

export function stateDirectory(env = process.env) {
  const directory = env.LINKEDIN_STATE_DIR || join(homedir(), '.linkedin-api-mcp');
  if (!isAbsolute(directory)) throw new OperationError('VALIDATION_ERROR', 'LINKEDIN_STATE_DIR must be an absolute private directory.');
  return directory;
}

export function accountName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value)) {
    throw new OperationError('VALIDATION_ERROR', 'Account names use 1..48 lowercase letters, digits, underscores, or hyphens.');
  }
  return value;
}

export function accountPaths(directory, account = 'default') {
  accountName(account);
  if (account === 'default') return { root: directory, profile: join(directory, 'browser-profile'), jobs: join(directory, 'jobs'), credentialAccount: 'default' };
  const root = join(directory, 'accounts', account);
  return { root, profile: join(root, 'browser-profile'), jobs: join(root, 'jobs'), credentialAccount: `account:${account}` };
}

export function createAccountStore({ directory }) {
  const file = join(directory, 'accounts.json');
  const lock = `${file}.lock`;
  function read() {
    if (!fs.existsSync(file)) return { version: 1, current: 'default', accounts: [{ name: 'default', label: 'Default' }] };
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new OperationError('VALIDATION_ERROR', 'Account metadata is unreadable or corrupt.'); }
    if (data.version !== 1 || !Array.isArray(data.accounts) || data.accounts.length > 50) throw new OperationError('VALIDATION_ERROR', 'Account metadata is invalid.');
    const names = new Set();
    for (const entry of data.accounts) {
      accountName(entry.name);
      if (names.has(entry.name) || typeof entry.label !== 'string') throw new OperationError('VALIDATION_ERROR', 'Account metadata is invalid.');
      names.add(entry.name);
    }
    if (!names.has(data.current)) throw new OperationError('VALIDATION_ERROR', 'Selected account does not exist.');
    return data;
  }
  function mutate(update) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); } catch (error) {
      if (error.code === 'EEXIST') throw new OperationError('LOCKED', 'Account metadata is locked. Verify the owning process exited before manually removing accounts.json.lock; locks are never stolen.');
      throw error;
    }
    const tmp = `${file}.${randomUUID()}.tmp`;
    let wrote = false;
    try {
      const data = read();
      const result = update(data);
      try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
        wrote = true;
        fs.renameSync(tmp, file);
      } catch (error) {
        fs.rmSync(tmp, { force: true });
        throw error;
      }
      return result;
    } finally {
      fs.closeSync(fd);
      fs.rmSync(lock, { force: true });
      if (wrote) fs.rmSync(tmp, { force: true });
    }
  }
  return {
    list: () => structuredClone(read()),
    current: () => read().current,
    add(name, label = name) {
      accountName(name);
      if (typeof label !== 'string' || label.length > 100) throw new OperationError('VALIDATION_ERROR', 'Account label must be at most 100 characters.');
      return mutate((data) => {
        if (data.accounts.some((entry) => entry.name === name)) throw new OperationError('VALIDATION_ERROR', 'Account already exists.');
        if (data.accounts.length >= 50) throw new OperationError('VALIDATION_ERROR', 'At most 50 named accounts are supported.');
        data.accounts.push({ name, label });
        return { name, label };
      });
    },
    use(name) {
      accountName(name);
      return mutate((data) => {
        if (!data.accounts.some((entry) => entry.name === name)) throw new OperationError('VALIDATION_ERROR', 'Unknown account; add it first.');
        data.current = name;
        return { current: name };
      });
    },
    rename(name, label) {
      accountName(name);
      if (typeof label !== 'string' || !label.trim() || label.length > 100) throw new OperationError('VALIDATION_ERROR', 'A label of 1..100 characters is required.');
      return mutate((data) => {
        const entry = data.accounts.find((entry) => entry.name === name);
        if (!entry) throw new OperationError('VALIDATION_ERROR', 'Unknown account.');
        entry.label = label;
        return structuredClone(entry);
      });
    },
  };
}
