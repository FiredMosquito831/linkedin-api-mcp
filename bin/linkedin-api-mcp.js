#!/usr/bin/env node
import { run } from '../src/cli.js';

process.exitCode = await run([process.argv[0], process.argv[1], 'mcp', ...process.argv.slice(2)]);
