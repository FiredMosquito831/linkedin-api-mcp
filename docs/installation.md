# Installation

Ways to use the LinkedIn CLI, library, and MCP server. The npm package is **not published yet** — every `npm`/`npx` command below works once `@firedmosquito831/linkedin-api-mcp` is published. The GitHub repository is public; marketplace installation uses the files pushed to GitHub and merged into its default branch. The local-clone route works without npm publication.

## Prerequisites

- Node.js >= 22.12.0 (development verified on Windows with Node 24).
- Claude Code, for the plugin and `claude mcp` routes.
- git, when the marketplace comes from GitHub.
- Network access for the plugin route: Claude Code installs the plugin's Node.js dependencies from the repository's `package-lock.json` automatically.

Installing anything here starts no browser and publishes nothing. Authentication is a separate, explicit CLI step (`linkedin auth login`, below). The MCP server itself also starts no browser; only experimental browser *tool calls*, once enabled, open a dedicated Chromium profile.

## 1. Claude Code plugin (recommended)

The marketplace ships one self-contained plugin, `linkedin`, whose root is the repository itself.

From inside a Claude Code session:

```text
/plugin marketplace add FiredMosquito831/linkedin-api-mcp
/plugin install linkedin@linkedin-api-mcp
```

From your shell (same effect, scriptable):

```sh
claude plugin marketplace add FiredMosquito831/linkedin-api-mcp --scope user
claude plugin install linkedin@linkedin-api-mcp --scope user
```

From a local clone instead of GitHub (works today, before any push):

```sh
claude plugin marketplace add D:\path\to\linkedin-api-mcp
claude plugin install linkedin@linkedin-api-mcp --scope user
```

After adding, restart Claude Code or run `/reload-plugins`. Then check:

```sh
claude plugin list        # shows linkedin@linkedin-api-mcp
claude mcp list           # shows the linkedin server (plugin:linkedin:linkedin) as Connected
```

In-session, `/mcp` shows the server and its tools, and `/plugin` manages it.

### Experimental option

The server is **capability-only by default**: it lists no LinkedIn operations at all — neither reads nor writes. The plugin option `experimental` turns on the operation listing; there is no "default reads" mode. It reaches the server as the `LINKEDIN_EXPERIMENTAL` environment variable: the boolean option is substituted as the string `true` or `false`, and the gate accepts `true` or `1` — every other value (including the unresolved placeholder in a plain project `.mcp.json`) keeps it off.

```sh
claude plugin configure linkedin@linkedin-api-mcp            # toggle experimental
claude plugin install linkedin@linkedin-api-mcp --config experimental=true
```

Manual equivalent for a server started outside the plugin: `LINKEDIN_EXPERIMENTAL=1 node bin/linkedin.js mcp --transport stdio` (or the `--experimental` flag on the `mcp` subcommand).

### Uninstall

```sh
claude plugin uninstall linkedin@linkedin-api-mcp
claude plugin marketplace remove linkedin-api-mcp
```

## 2. Project MCP server (no plugin)

The `.mcp.json` at the repository root declares the server with a `${CLAUDE_PLUGIN_ROOT}` path. That variable only resolves when the file is loaded as the **installed plugin's** config; do not assume it works outside the plugin checkout. For `claude mcp` registration (project or user scope), point at the script with a **path to the node script**, ideally absolute, so it survives the working directory:

```sh
# from a repository checkout (works while the current directory is the checkout)
claude mcp add linkedin -- node bin/linkedin.js mcp --transport stdio

# robust form for project scope: absolute path, independent of the working directory
claude mcp add linkedin -s project -- node D:\path\to\linkedin-api-mcp\bin\linkedin.js mcp --transport stdio

# user scope: every project you start in
claude mcp add linkedin -s user -- node D:\path\to\linkedin-api-mcp\bin\linkedin.js mcp --transport stdio
```

Project-scope servers need per-server approval in `/mcp` the first time. Check with `claude mcp list` / `claude mcp get linkedin`, and remove with `claude mcp remove linkedin`.

The optional streamable-HTTP transport is loopback-only and requires a bearer token through the `LINKEDIN_MCP_TOKEN` environment variable (the CLI does not take the token on the command line, so it never lands in shell history):

```powershell
# Load LINKEDIN_MCP_TOKEN into this process environment using your secret manager.
# Do not type the token into a command line or include it in a URL.
node bin/linkedin.js mcp --transport streamable-http --port 8765
```

## 3. npm (after publication)

The package ships two bins: `linkedin` (the CLI; the `mcp` subcommand starts the server) and `linkedin-api-mcp` (starts the MCP server directly — it **auto-prefixes** the `mcp` subcommand, so pass only its options, for example `--transport stdio`; never add a second `mcp` argument).

```sh
npm install -g @firedmosquito831/linkedin-api-mcp
linkedin --help                        # CLI
linkedin-api-mcp --transport stdio     # MCP server entry (auto mcp)

npx @firedmosquito831/linkedin-api-mcp --help       # runs the MCP entry (name-matching bin)
npx -p @firedmosquito831/linkedin-api-mcp@0.2.0 linkedin me   # pinned version
```

Register the installed binary as a user-scope MCP server:

```sh
claude mcp add linkedin -s user -- linkedin-api-mcp --transport stdio
```

Why the plugin does not use `npx` or a global bin: when the plugin's own `bin/linkedin.js` is bundled (started as `node ${CLAUDE_PLUGIN_ROOT}/bin/linkedin.js mcp --transport stdio`), no global install or unpinned `npx` fetch is needed, and the exact source the user approved is the source that runs. The `npx`/global-bin routes above are the user-level alternative, matched to the `ase-moodle-mcp` reference; see [packaging-recommendations.md](packaging-recommendations.md) for the tradeoff.

## 4. Authenticate (explicit, one-time per token)

```sh
linkedin auth login        # token via LINKEDIN_ACCESS_TOKEN, or piped on stdin
linkedin auth status
linkedin auth logout
```

Tokens live in the OS credential store (`@napi-rs/keyring`); on unsupported platforms import fails. Never put tokens on command lines or in shell history. The MCP server never prompts on stdin and starts no browser; authentication is always done in the separate CLI. When experimental browser operations are enabled, their tool calls open a dedicated, headed Chromium profile — the browser belongs to those calls, not to startup.

Writes additionally need the operator approval flow: `linkedin <operation> ... --experimental` prepares, the operator runs `linkedin approvals approve <approvalId> --digest <digest>` in a separate CLI session, then `linkedin approvals execute <approvalId> --experimental` (or the MCP tool `linkedin_execute_approved`) executes. Multiple accounts: `linkedin accounts add|use|rename|list`, select with `LINKEDIN_ACCOUNT`.

## Where state lives

- OAuth tokens: OS credential store.
- Experimental browser profile and job queue: `~/.linkedin-api-mcp/` (override with absolute `LINKEDIN_STATE_DIR`). Keep that directory private; it contains session credentials.
- Nothing in this install flow writes to the repository, starts a browser, or contacts LinkedIn.
