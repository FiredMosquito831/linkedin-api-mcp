// Official OAuth 2.0 login for the LinkedIn API.
//
// The flow is the documented three-legged Authorization Code flow: open
// LinkedIn's authorization page, receive the code on a loopback redirect, and
// exchange it for an access token. The client secret is read from the
// environment or the credential store, never from a file in the repository and
// never from a command-line argument.

import { spawn } from 'node:child_process';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  generatePkce,
  parseRedirect,
  refreshAccessToken,
  startCallbackServer,
} from './oauth.js';
import { createOAuthStore } from './oauth-store.js';

const DEFAULT_SCOPE = 'openid profile email';

function openInBrowser(url, deps) {
  if (deps.openBrowser) {
    deps.openBrowser(url);
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } catch {
    // The URL is printed as well, so a failed launcher is not fatal.
  }
}

export function registerOAuthCommands(program, deps, setExitCode) {
  // The CLI already owns an `auth` group; add to it rather than creating a second.
  const auth = program.commands.find((command) => command.name() === 'auth') ?? program.command('auth');
  const store = deps.oauthStore ?? createOAuthStore({ account: deps.account ?? 'default' });

  auth
    .command('login-oauth')
    .description('Sign in with the official LinkedIn OAuth flow in your browser.')
    .option('--client-id <id>', 'LinkedIn application client id; defaults to LINKEDIN_CLIENT_ID')
    .option('--scope <scope>', 'space-delimited scopes', DEFAULT_SCOPE)
    .option('--manual', 'paste the redirected URL instead of using a local callback server')
    .option('--no-pkce', 'skip PKCE and use a client secret')
    .option('--extended-login', 'enable Google, Apple and passkey sign-in on LinkedIn')
    .action(async (options) => setExitCode(await loginWithOAuth(options, deps, store)));

  auth
    .command('refresh')
    .description('Refresh the official access token with the stored refresh token.')
    .option('--client-id <id>', 'LinkedIn application client id; defaults to LINKEDIN_CLIENT_ID')
    .action(async (options) => setExitCode(await refreshTokens(options, deps, store)));
}

async function loginWithOAuth(options, deps, store) {
  const clientId = options.clientId || deps.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    deps.stderr.write('Set LINKEDIN_CLIENT_ID or pass --client-id.\n');
    return 1;
  }
  const clientSecret = deps.env.LINKEDIN_CLIENT_SECRET || null;
  const usePkce = options.pkce !== false && !clientSecret;

  let server = null;
  let redirectUri;
  let codeVerifier;
  let state;
  if (options.manual) {
    // No listener: the member copies the redirected URL back.
    redirectUri = deps.env.LINKEDIN_REDIRECT_URI;
    if (!redirectUri) {
      deps.stderr.write('Manual mode needs LINKEDIN_REDIRECT_URI set to a redirect URL registered in your LinkedIn app.\n');
      return 1;
    }
    state = generatePkce().state;
  } else {
    server = await startCallbackServer({});
    redirectUri = server.url;
    state = generatePkce().state;
  }

  const pkce = usePkce ? generatePkce() : null;
  codeVerifier = pkce?.codeVerifier;
  const authorizationUrl = buildAuthorizationUrl({
    clientId,
    redirectUri,
    scope: options.scope,
    state,
    codeChallenge: pkce?.codeChallenge,
    enableExtendedLogin: options.extendedLogin === true,
  });

  deps.stdout.write('Open this URL to authorize the application:\n');
  deps.stdout.write(`${authorizationUrl}\n`);
  if (!options.manual) deps.stdout.write('Waiting for the redirect...\n');
  openInBrowser(authorizationUrl, deps);

  let code;
  try {
    if (options.manual) {
      const pasted = await deps.readLine?.('Paste the URL you were redirected to: ');
      if (!pasted) {
        deps.stderr.write('No redirect URL given.\n');
        return 1;
      }
      const parsed = parseRedirect(pasted);
      if (parsed.error) {
        deps.stderr.write(`LinkedIn returned an error: ${parsed.errorDescription ?? parsed.error}\n`);
        return 1;
      }
      if (parsed.state !== state) {
        deps.stderr.write('The state value did not match. Start again.\n');
        return 1;
      }
      code = parsed.code;
    } else {
      const result = await server.waitForCode();
      if (result.state !== state) {
        deps.stderr.write('The state value did not match. Start again.\n');
        return 1;
      }
      code = result.code;
    }
  } catch (error) {
    deps.stderr.write(`${error.message}\n`);
    return 1;
  } finally {
    await server?.close();
  }

  try {
    const tokens = await exchangeCodeForToken({ code, clientId, clientSecret, redirectUri, codeVerifier });
    store.saveTokens(tokens);
    deps.stdout.write('Authorization complete. The access token is stored in the credential store.\n');
    return 0;
  } catch (error) {
    deps.stderr.write(`${error.message}\n`);
    return 1;
  }
}

async function refreshTokens(options, deps, store) {
  const refreshToken = store.loadRefreshToken();
  if (!refreshToken) {
    deps.stderr.write('No refresh token is stored. Run linkedin auth login-oauth first.\n');
    return 1;
  }
  const clientId = options.clientId || deps.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    deps.stderr.write('Set LINKEDIN_CLIENT_ID or pass --client-id.\n');
    return 1;
  }
  try {
    const tokens = await refreshAccessToken({ refreshToken, clientId, clientSecret: deps.env.LINKEDIN_CLIENT_SECRET || null });
    store.saveTokens(tokens);
    deps.stdout.write('Access token refreshed.\n');
    return 0;
  } catch (error) {
    deps.stderr.write(`${error.message}\n`);
    return 1;
  }
}
