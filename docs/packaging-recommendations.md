# Packaging recommendations

Status: package and plugin metadata are implemented; the npm package is **not published**. The GitHub repository is public. GitHub-based plugin routes use the files pushed to GitHub and merged into the default branch; the local-clone route is also available. The JSON block below records the packaging decision, not a second manifest to execute. See package.json for the current dependency pins. Nothing here publishes anything.

## 1. Reference-repo convention comparison

| Concern | `ase-moodle-mcp` | `google-services-mcps` | Chosen for `linkedin-api-mcp` |
|---|---|---|---|
| Marketplace file | `.claude-plugin/marketplace.json`, name = repo name + `-marketplace` (`ase-moodle-marketplace`), `metadata.version`, entries set `strict: false` | same file, name = repo name (`google-services-mcps`), top-level `description` | name = repo name `linkedin-api-mcp` (matches the npm package name; the google convention); entries keep `strict: false` as in the ase reference |
| Plugin layout | one plugin dir per product: `plugins/<id>/` with its own `.claude-plugin/plugin.json` and `.mcp.json` | same, 23 product dirs | one self-contained plugin at the repo root: entry `source: "./"` (the npm package, CLI, and plugin share one root; no duplication) |
| MCP launch | `"command": "ase-moodle-mcp"` — a global npm bin; needs `npm install -g` first | `"command": "node"`, `"args": ["${CLAUDE_PLUGIN_ROOT}/servers/<id>.mjs"]` — runs the bundled source, no global install | google form: `node ${CLAUDE_PLUGIN_ROOT}/bin/linkedin.js mcp --transport stdio` |
| Server options | — | `userConfig` in `plugin.json` (`allow_writes`, `confirmation`, `token_dir`), reaching the server via `${user_config.*}` env | `userConfig.experimental` (boolean, default `false`) → `LINKEDIN_EXPERIMENTAL` env |
| Skills | plugin-level `SKILL.md` for the agent adapter | per-product `skills/<id>/SKILL.md` | `skills/linkedin/SKILL.md` |
| npm package | nested `npm/package.json`: unscoped name, two bins, `files` whitelist, `publishConfig.access = public`, plus a `postinstall` that provisions Python (do not copy that) | repo root is itself the published package: two bins, `files` whitelist bundling `plugins/`, `pack:check` = `npm pack --dry-run`, `prepublishOnly` | repo root is the package: scoped name `@firedmosquito831/linkedin-api-mcp`, two bins, `files` whitelist, `pack:check`/`pack:smoke`, public npm access, and a test-only `prepublishOnly` guard; no postinstall/runtime bootstrap |

Sources: [ase-moodle-mcp](https://github.com/FiredMosquito831/ase-moodle-mcp) (`ase-moodle` redirects to it; `.claude-plugin/marketplace.json`, `plugins/ase-moodle/.claude-plugin/plugin.json`, `plugins/ase-moodle/.mcp.json`, `npm/package.json`), [google-services-mcps](https://github.com/FiredMosquito831/google-services-mcps) (`.claude-plugin/marketplace.json`, `plugins/gcloud/.mcp.json`, `plugins/gcloud/.claude-plugin/plugin.json`, `plugins/gcloud/skills/gcloud/SKILL.md`, `package.json`, `README.md`), [Claude Code marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference), [plugin loading (Node.js dependencies)](https://code.claude.com/docs/en/plugins/loading), [npm package.json reference](https://docs.npmjs.com/files/package.json).

### Why the plugin launch differs from the ase reference

`ase-moodle`'s `.mcp.json` runs a bare global bin (`ase-moodle-mcp`), which works only after `npm install -g` and then tracks whatever global version exists — an unpinned, machine-global executable. Here the plugin bundles its own entry point, so the launch is `node ${CLAUDE_PLUGIN_ROOT}/bin/linkedin.js mcp --transport stdio` (the google pattern): no global state, no `npx` fetch, and the code the user approved installing is exactly the code that runs. `${CLAUDE_PLUGIN_ROOT}` only resolves when the `.mcp.json` is loaded as the **installed plugin's** config; anything registered with `claude mcp add` (project/user scope) must use an absolute path to the script instead, as documented in installation.md. The unpinned-`npx` form stays available at the user level (`npx @firedmosquito831/linkedin-api-mcp ...`, or pinned `npx -p ...@0.2.0 linkedin`) for installs without a plugin; pin the version in scripts and CI.

### Plugin mechanics worth knowing (official docs)

- The marketplace git-clone fetches the whole repo; the entry `source: "./"` makes the repo root the plugin root, so `.claude-plugin/plugin.json`, `.mcp.json`, `skills/linkedin/SKILL.md`, and `bin/` all live under one self-contained plugin.
- With `package.json` + `package-lock.json` (lockfileVersion 3) at the plugin root, Claude Code auto-installs dependencies into the cached plugin copy on install/update: npm, frozen lockfile versions, registry-only pins, `--ignore-scripts`, 60 s cap. All current dependencies are exact-pinned registry packages, so this works. Keep `package.json` deps in sync with the lockfile, or the install is skipped.
- `plugin.json` pins `"version": "0.2.0"`: users stay on the cached copy until the version string changes. Bump it with each npm release.
- Capability semantics: the plugin default is **capability-only** — the server lists no LinkedIn operations at all. The `experimental` `userConfig` boolean is substituted as the string `true`/`false` into `LINKEDIN_EXPERIMENTAL`; the server gate accepts `true` or `1`, everything else stays off. Writes stay prepare-only in every mode; approval happens in the separate CLI.
- A top-level `bin/` directory makes Claude Code put it on the Bash tool's PATH, and claude.ai/Cowork refuse to install such a plugin. Fine for the GitHub marketplace; it only matters if the plugin is ever submitted to Anthropic's directory or a claude.ai org.
- `claude plugin validate` accepts the manifests but warns about the root `CLAUDE.md` (project config, not loaded as plugin context) and the missing listing icon. The project now uses Apache-2.0, matching both reference repositories, with `LICENSE`, `NOTICE`, and license fields in npm/plugin metadata.
- If a marketplace entry ever switches to an `npm` source, the tarball cannot carry `package-lock.json`; ship `npm-shrinkwrap.json` instead so the dependency install still runs.

## 2. Recommended `package.json` (exact edits)

Replace/add the marked keys; everything else stays as is. The JSON block is the machine-readable target that `test/packaging.test.js` checks against the files whitelist rules.

```json
{
  "name": "@firedmosquito831/linkedin-api-mcp",
  "version": "0.2.0",
  "description": "CLI, library, and MCP server that automate your own LinkedIn account: official API tools, opt-in experimental own-account automation, and writes that are prepared, operator-approved in a separate CLI session, then executed.",
  "keywords": [
    "linkedin",
    "mcp",
    "model-context-protocol",
    "claude-code",
    "cli",
    "own-account-automation"
  ],
  "author": "FiredMosquito831 (https://github.com/FiredMosquito831)",
  "repository": { "type": "git", "url": "git+https://github.com/FiredMosquito831/linkedin-api-mcp.git" },
  "homepage": "https://github.com/FiredMosquito831/linkedin-api-mcp",
  "bugs": { "url": "https://github.com/FiredMosquito831/linkedin-api-mcp/issues" },
  "type": "module",
  "bin": {
    "linkedin": "bin/linkedin.js",
    "linkedin-api-mcp": "bin/linkedin-api-mcp.js"
  },
  "exports": { ".": "./src/index.js" },
  "engines": { "node": ">=22.12.0" },
  "files": [
    "bin/",
    "src/",
    "README.md",
    "LICENSE",
    "NOTICE",
    ".claude-plugin/",
    ".mcp.json",
    "skills/",
    "docs/installation.md",
    "docs/packaging-recommendations.md",
    "docs/release.md"
  ],
  "license": "Apache-2.0",
  "scripts": {
    "test": "node --test",
    "pack:check": "npm pack --dry-run",
    "pack:smoke": "node scripts/pack-smoke.mjs",
    "bump": "node scripts/bump.mjs",
    "release:check": "node scripts/check-release.mjs",
    "prepublishOnly": "npm test"
  },
  "publishConfig": { "access": "public" }
}
```

Edits, field by field:

| Key | Now | To | Note |
|---|---|---|---|
| `name` | `linkedin-cli` | `@firedmosquito831/linkedin-api-mcp` | scoped under the owner's account; the unscoped `linkedin-api-mcp` is also free on the registry, but the google reference deprecated its scoped name and the task pins the scoped one |
| `version` | `0.1.0` | `0.2.0` | matches `plugin.json` and the contract |
| `private` | `true` | remove (default `false`) | or set `false` explicitly; `publishConfig.access` keeps publication public |
| `bin` | `linkedin` only | add `linkedin-api-mcp` → `bin/linkedin-api-mcp.js` | second bin is a thin ESM entry (`#!/usr/bin/env node`) that **auto-prefixes the `mcp` subcommand**: run it as `linkedin-api-mcp --transport stdio`, never `linkedin-api-mcp mcp`. Plain `npx @firedmosquito831/linkedin-api-mcp` selects the package-name-matching `linkedin-api-mcp` MCP bin; select `linkedin` explicitly with `npx -p @firedmosquito831/linkedin-api-mcp@0.2.0 linkedin ...` for CLI use. The plugin itself launches `bin/linkedin.js mcp` |
| `files` | unset | the whitelist above | with `files`, npm includes only listed entries plus always-included files (`package.json`, `README`, `LICENSE`, `bin` targets) |
| `publishConfig` | unset | `{ "access": "public" }` | scoped packages default to restricted; this makes publication public |
| `description`, `keywords`, `author`, `repository`, `homepage`, `bugs` | unset | as in the block | registry/provenance metadata, matching both references |
| `scripts.pack:check` | unset | `npm pack --dry-run` | google reference convention |

Always-included npm facts (docs.npmjs.com): `package.json`, `README*`, `LICENSE*`, `main`, and every `bin` target ship regardless of `files`. Never included: `node_modules/`, lockfiles, `.git/`, `.npmrc`. The current `.gitignore` (`node_modules/`, `.remember/`, `.superpowers/`, `.worktrees/`, `.claude/worktrees/`, `.linkedin-api-mcp/`, `*.local.json`) already keeps runtime state and research material out of the repo.

## 3. What is intentionally excluded, and why

- `research_notes/`, `reports/`, `docs/superpowers/` — research and planning material, not part of the user-facing package.
- `test/` — useful in-repo, not needed by installers.
- `.remember/`, `.superpowers/`, `.worktrees/`, `.claude/worktrees/` — tooling state.
- `.linkedin-api-mcp/`, `*.local.json` — runtime state (browser profile, job queue, local overrides); would leak session credentials if ever committed.
- `node_modules/`, `package-lock.json` — cannot be in the tarball; the plugin's dependency install reconstructs `node_modules` from the lockfile in the git repo, and npm-source plugin installs would need `npm-shrinkwrap.json` (see §1).
- No secrets in any manifest: `.mcp.json` carries only the `node` launch, the `mcp --transport stdio` subcommand, and the `${user_config.experimental}` placeholder; tokens stay in the OS credential store and the experimental state directory. The streamable-HTTP transport takes its bearer token from the `LINKEDIN_MCP_TOKEN` environment variable only — never a command-line `--token` flag — so it cannot leak into shell history.

## 4. Verification checklist (read-only)

```sh
npm pack --dry-run                    # or: npm run pack:check — eyeball the tarball list against §3
claude plugin validate .              # manifest + .mcp.json checks (a CLAUDE.md warning is expected)
node --test test/packaging.test.js    # manifest paths, coherence, no-npx launch, no secrets
```

## 5. Publication (not authorized by this task)

Publication is a separate user-approved step, out of scope here:

Follow [the npm-only release guide](release.md): bootstrap the initial npm package interactively, configure the exact GitHub Actions trusted publisher, then publish later versions from approved GitHub releases. `.github/workflows/npm.yml` verifies versions/tests/tarball before OIDC publication and confirms the exact npm version afterward; merging does not publish.

The GitHub repository is public, so the release workflow can publish with npm provenance. It retains a private-repository fallback if visibility is changed later. `publishConfig.access: public` applies only to the npm package, not GitHub visibility.

Until publication, npm routes in [installation.md](installation.md) are unavailable. GitHub-based marketplace/plugin routes do not require npm publication but require this branch's files to be pushed and the installer to have repository access; the local-clone route is immediately available.
