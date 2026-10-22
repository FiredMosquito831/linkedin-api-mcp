# Installation

Ways to use the LinkedIn CLI, library, and MCP server. The npm package is **not published yet** — every `npm`/`npx` command below works once `linkedin-api-mcp` is published. The GitHub repository is public; marketplace installation uses the files pushed to GitHub and merged into its default branch. The local-clone route works without npm publication.

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

### What the marketplace install provides, and what it does not

The plugin is one self-contained directory. Installing it from the marketplace gives Claude Code the plugin manifest, the `.mcp.json` that launches the bundled server, `skills/linkedin/SKILL.md`, and the plugin's npm dependencies.

**Chromium is not included.** Playwright 1.64.1 ships no install script, so the browser is a separate one-time download of roughly 150 MB:

```sh
linkedin browser install
```

Nothing breaks without it. The MCP server starts, the official tools work, and `linkedin doctor` reports the missing browser as a warning. Only the experimental browser operations need Chromium.

The npm package likewise does not download a browser on install, and it never runs an install script: it is plain JavaScript with no build step, so `npm install -g linkedin-api-mcp` is enough.

## 1b. Installing into other agent harnesses

`linkedin install` registers the MCP server with the harnesses you use, the same way `ase-moodle-mcp` does it:

```sh
linkedin install                                   # every harness, global scope
linkedin install claude codex --scope project      # only these two, in this folder
linkedin uninstall --scope project
linkedin doctor                                   # what is installed and what is missing
```

| Harness | Global scope | Project scope |
|---|---|---|
| Claude Code | `claude plugin marketplace add` and `claude plugin install` | the same, plus `extraKnownMarketplaces` and `enabledPlugins` in `.claude/settings.json` |
| Codex | `codex plugin marketplace add` and `codex plugin add` | an `[mcp_servers.linkedin]` table in `.codex/config.toml` |
| opencode | an `mcp.linkedin` entry in `~/.config/opencode/opencode.json`, plus the skill file | an `mcp.linkedin` entry in `opencode.json` in the project folder |
| Antigravity | `agy mcp add linkedin -- <command> <args>` | refused: Antigravity has no project scope |

Rules the commands follow:

- A harness whose CLI is not on PATH is reported as `skipped`, never as a failure.
- Uninstall reverses only what the install added, and never removes a shared marketplace.
- JSON and TOML files that already exist keep their unrelated keys and tables.
- Every file write is atomic: a temporary file in the same directory, then a rename.
- No step output ever contains a token.

From a clone of this repository, `bash scripts/bootstrap.sh` (or `scripts\bootstrap.ps1` on Windows) runs the whole sequence: install the package, download Chromium, register every harness, and print the doctor report. It never contacts LinkedIn.

## 1c. Official browser login

```sh
export LINKEDIN_CLIENT_ID=your_application_client_id
export LINKEDIN_CLIENT_SECRET=your_client_secret   # only if your app has one
linkedin auth login-oauth
```

This is LinkedIn's documented three-legged Authorization Code flow. The CLI opens LinkedIn's authorization page, receives the code on a local loopback redirect, exchanges it for an access token, and stores that token in the OS credential store. Access tokens last 60 days; a refresh token, when issued, lasts a year, and `linkedin auth refresh` uses it.

Register the redirect URL in your LinkedIn application first. The default is a loopback URL on `127.0.0.1` with an ephemeral port; set `LINKEDIN_REDIRECT_URI` to a registered URL and use `--manual` to paste the redirected URL back instead. When no client secret is set, the flow uses PKCE. The `state` value is always verified.

The client secret is read from the environment only: never a command-line argument, never a file in this repository, never a log line.

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
npm install -g linkedin-api-mcp
linkedin --help                        # CLI
linkedin-api-mcp --transport stdio     # MCP server entry (auto mcp)

npx linkedin-api-mcp --help       # runs the MCP entry (name-matching bin)
npx -p linkedin-api-mcp@0.2.0 linkedin me   # pinned version
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
