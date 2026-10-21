# npm release flow

This project uses **npm only**. The package contains the JavaScript server, CLI, library, and plugin files directly—no Python launcher, wheel, pip, or secondary runtime installer.

Once this workflow is merged and the one-time npm setup is complete, every push/merge to `main` is checked by CI. **Successful main-push CI automatically publishes the version in package.json only when it does not already exist on npm.** Published GitHub releases and manual existing-tag dispatches are also supported. Feature-branch pushes and PR checks never publish.

A version bump is required for changed content: npm cannot replace an existing version. Pushing without a bump runs checks but skips publication of that already-published version. Merging a new version to `main` therefore authorizes its automatic publication; do not merge a bump until its contents are ready to be public.

## One version

These versions must agree:

| Location | Value |
|---|---|
| `package.json` | `version` |
| `package-lock.json` | top-level `version` and `packages[""].version` |
| `.claude-plugin/plugin.json` | `version` |
| GitHub release tag | `v` followed by the same version |

The MCP runtime reads its version from the installed `package.json` through `src/version.js`; it has no separate version constant. `test/version-contract.test.js` checks the manifests, bump behavior, and release guards. Historical version examples in documentation do not need to be bumped.

```sh
npm run bump -- patch     # or minor, major, or an explicit newer X.Y.Z
npm run release:check -- vX.Y.Z
```

The bump script parses and checks all three manifests before writing any. It changes only those files, never tags or publishes. Commit the version bump with the code it releases. Never retag an existing release.

## One-time npm setup

### Bootstrap the package first

npm requires the package to exist before configuring its trusted publisher. For the first publication, the owner must authenticate interactively and publish the real, reviewed initial version. Do not publish an empty placeholder. Publishing consumes that version permanently; later automation uses a new version.

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run pack:smoke
npm login
npm publish --access public
npm view linkedin-api-mcp version dist.tarball dist.integrity
```

The interactive login/publish may require 2FA. Keep credentials out of chat, source files, and shell-history literals. The project has no `NPM_TOKEN` workflow fallback.

### Configure trusted publishing

On npmjs.com: package → Settings → Trusted Publisher → GitHub Actions:

| Field | Exact value |
|---|---|
| Organization/user | `FiredMosquito831` |
| Repository | `linkedin-api-mcp` |
| Workflow filename | `npm.yml` (not the full path) |
| Environment | leave empty |

Grant the trusted publisher permission for direct `npm publish`. Fields are case-sensitive; npm does not validate the match when saving. A newly configured publisher must complete its first successful publish within **two days**, or the configuration expires and needs to be recreated.

Trusted publication requires **npm >=11.5.1 and Node >=22.14.0** on a GitHub-hosted runner. The workflow uses Node 24 and upgrades npm. The separately available `npm trust` configuration command has its own newer npm requirement; the version floor for that command is not the floor for publishing.

References: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/) and [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust).

### Repository visibility and provenance

The GitHub repository is **public**, following the owner's explicit request. That is independent of the npm package's `publishConfig.access: public`; npm publication still needs separate authorization.

- The release workflow publishes with provenance while the repository is public.
- npm does not generate provenance from a private repository. The workflow retains an explicit no-provenance path if visibility is changed later.
- The workflow never changes repository visibility.
- GitHub marketplace users can access this public repository without a private-repository grant.

## Pull-request checks

`.github/workflows/ci.yml` runs on PRs and pushes to `main`:

- Windows, Linux, and macOS.
- Declared minimum Node 22.12.0 and Node 24.
- `npm ci`, local Chromium installation, the complete test suite, package dry-run, and isolated installed-tarball smoke test.

Tests use fixtures and local MCP transports. No LinkedIn credentials or live account actions are used. Adding CI does not mean those hosted jobs have already run; verify them after the branch is pushed.

## Every release

1. **Bump with the source change**, then run the tests and package checks.
2. **Open a PR** and inspect every check on the final head. Keep one concern per release.
3. **Squash-merge with a head guard**:
   ```sh
   gh pr merge PR_NUMBER --squash --delete-branch --match-head-commit REVIEWED_HEAD_SHA
   ```
4. **Wait for main-push CI and the automatic npm workflow.** It verifies and publishes that exact checked commit if the version is new. An optional approved GitHub release can select the same version for release notes:
   ```sh
   gh release create vX.Y.Z --target main --notes-file release-notes.md
   ```
   A published release also starts the npm workflow, which skips the version if the CI-triggered publication already completed. Drafts do not fire `release: published`. The tag must select the reviewed merged revision; do not reuse or move an old tag. No tag or release is created automatically by a main push.
5. **Inspect the workflow conclusion and the registry**, not just the green badge:
   ```sh
   gh api repos/FiredMosquito831/linkedin-api-mcp/git/ref/tags/vX.Y.Z --jq .object.sha
   npm view linkedin-api-mcp@X.Y.Z version dist.tarball dist.integrity
   npm view linkedin-api-mcp dist-tags.latest
   ```
   For annotated tags, peel the tag object to its commit before comparing with the merge SHA. The workflow verifies the checked-out commit is the tag's commit and belongs to `main` history. Check the published release's notes and tag as well.

No wheel or release asset is required: this npm package ships JavaScript directly. Release notes are the release changelog; describe the change, verification, limitations, and any required user action.

## What `npm.yml` enforces

**Verification job, without OIDC permission:**

- For automatic publication, accepts only a successful `ci` run whose original event was a push to `main` in this same repository. PR/fork runs cannot trigger publication.
- Checks out the exact successful CI `head_sha`; release/manual runs instead check out `refs/tags/<tag>`.
- Requires matching package/lock/plugin versions, repository metadata, public npm access, and license declarations. Release/manual runs also require a matching `vX.Y.Z` tag.
- Confirms the chosen commit is in `origin/main` history and carries that exact source SHA into the publish job.
- Installs dependencies and Chromium, runs all tests, and installs/smoke-tests the actual tarball outside the checkout.
- Checks the exact version on npm. Existing version → skip. Only HTTP 404 → absent. Network/auth/server errors fail rather than being mistaken for absence.

**Publish job, with `id-token: write`:**

- Runs only after verification succeeds and the exact version is absent.
- Checks out the exact verified source SHA and rechecks the version contract.
- Publishes JavaScript source without installing project dependencies or running package lifecycle scripts in the OIDC-capable job (`--ignore-scripts`). Verification already ran separately.
- Uses provenance for a public repository, or explicitly disables it for a private one.
- Queries npm for the exact expected version after publishing, with bounded retries; missing publication is a hard failure.

Push/release/manual publication runs share a single concurrency group and are never cancelled while publishing, preventing cross-trigger publication races. An already-published version is a successful no-op. Authentication refusals remain red rather than silently masking a missing release. `prepublishOnly: npm test` also protects manual source-checkout publication; the workflow intentionally bypasses that hook only after its separate verification job.

## Re-run and failure handling

```sh
gh workflow run npm.yml -f tag=vX.Y.Z
```

Use only an existing, approved tag. If the version already exists it is skipped; a failed first attempt can be rerun without replacing published content.

| Problem | Resolution |
|---|---|
| Tag/package/plugin mismatch | Correct the source and create a new valid release; never move an existing release tag. |
| First package does not exist / trusted publisher cannot be configured | Owner performs the reviewed interactive initial publish, then configures OIDC. |
| OIDC rejected | Check owner/repository/filename/environment and publisher permissions/expiry. Do not paste a token into the repository. |
| `EOTP` during manual publishing | Complete interactive npm authentication/2FA in your terminal. |
| npm reports an existing version | Use a new version; the workflow will not overwrite it. |
| Provenance fails for private source | Keep provenance disabled until the owner explicitly makes the source public. |
| Workflow green but wrong/missing npm version | Read the skip message and query the exact version and `latest` directly. |
| Plugin remains cached at an older version | Bump package, lockfile, and plugin together; restart/update the plugin. |

Deleting a GitHub release does not unpublish npm. npm versions are immutable; normally fix a release with a new version, and deprecate the bad version if necessary. No PyPI release path or Python tooling is part of this project.
