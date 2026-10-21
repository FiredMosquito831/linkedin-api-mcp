import { readFileSync } from 'node:fs';

// Resolve from the installed package, not the current working directory.
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
