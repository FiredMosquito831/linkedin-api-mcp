/**
 * Named, single-target LinkedIn WRITE operations.
 *
 * `createWriteAdapter(session)` returns `{ execute(name, input) }`.
 *
 * Safety rules implemented here:
 * - `execute` is only called by the controller after a separate
 *   payload-bound approval. It requires `input.confirmed === true` and
 *   throws `APPROVAL_REQUIRED` before any navigation or click.
 * - Every flow targets exactly one recipient/post/thread/profile: no
 *   loops, no bulk, no loops over recipients, no stealth.
 * - Controls are resolved by exact role/label or known semantic fields,
 *   scoped to dialogs/cards/panes to stay unambiguous. A missing or
 *   ambiguous control throws `LAYOUT_UNSUPPORTED` BEFORE dispatch —
 *   there is no blind click fallback.
 * - A click is never "verified". Results are
 *   `{ outcome: 'verified' | 'unknown', url, evidence }`. When the
 *   post-dispatch state cannot be confirmed, the outcome is `unknown`
 *   and nothing is retried.
 * - Checkpoint (HumanInterventionError) and 429 errors raised at or
 *   after dispatch propagate with `completionUnknown = true`.
 * - Plan-gated surfaces (for example Sales Navigator) throw
 *   `ACCESS_RESTRICTED` when a paywall/restriction page is detected.
 *
 * Session contract (controller-owned `src/operations/session.js`):
 * `{ page, context, navigate(url), check(), close() }` where navigate
 * only permits HTTPS www.linkedin.com and stops on checkpoints/401/403/429.
 */

import { stat } from 'node:fs/promises';

const ORIGIN = 'https://www.linkedin.com';
const FEED_URL = `${ORIGIN}/feed/`;
const ACTIVITY_URL = `${ORIGIN}/in/me/recent-activity/all/`;
const INBOX_URL = `${ORIGIN}/messaging/`;
const SETTINGS_URL = `${ORIGIN}/me/settings`;
const PROFILE_VIEW_URL = `${ORIGIN}/profile/view`;

const POST_FAMILIES = ['/feed/update/', '/feed/urn:li:activity:', '/posts/urn:li:activity:'];
const COMMENT_URL_FAMILIES = ['/posts/comment/', '/feed/comment/', '/feed/update/', '/posts/'];
const PROFILE_FAMILIES = ['/in/'];
const THREAD_FAMILIES = ['/messaging/thread/'];
const COMPANY_FAMILIES = ['/company/'];
const SALES_PROFILE_FAMILIES = ['/sales/lead/', '/sales/profile/'];
const SALES_THREAD_FAMILIES = ['/sales/threads/'];

const REACTIONS = ['LIKE', 'CELEBRATE', 'LOVE', 'INSIGHTFUL', 'FUNNY', 'SUPPORT'];
const REACTION_LABELS = {
  LIKE: 'Like',
  CELEBRATE: 'Celebrate',
  LOVE: 'Love',
  INSIGHTFUL: 'Insightful',
  FUNNY: 'Funny',
  SUPPORT: 'Support',
};

/** Typed operation error. Public codes map to CLI exit codes by the service. */
export class OperationError extends Error {
  constructor(message, code, { status = undefined, retryAfter = undefined, completionUnknown = undefined } = {}) {
    super(message);
    this.name = 'OperationError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
    if (completionUnknown !== undefined) this.completionUnknown = completionUnknown;
  }
}

function fail(code, message, extra = {}) {
  return new OperationError(message, code, extra);
}

const invalid = (message) => fail('INVALID_INPUT', message);
const layout = (message) => fail('LAYOUT_UNSUPPORTED', message);
const restricted = (message) => fail('ACCESS_RESTRICTED', message);

export const WRITE_OPERATIONS = [
  'posts.create', 'posts.edit', 'posts.delete',
  'reactions.add', 'reactions.remove',
  'comments.create', 'comments.reply',
  'posts.share',
  'messages.send', 'messages.reply', 'messages.mark-read',
  'invitations.send', 'invitations.accept', 'invitations.reject', 'invitations.withdraw',
  'connections.remove',
  'companies.follow', 'companies.unfollow',
  'profile.update',
  'sales.messages.send', 'sales.messages.reply',
];

// ---------------------------------------------------------------------------
// Control resolution
// ---------------------------------------------------------------------------

const C = {
  /** Exact accessible name on a stable ARIA role, e.g. button "Post". */
  role(role, name, note = '') { return { kind: 'role', role, name, note }; },
  /** Exact aria-label on a known semantic field (input/textarea/contenteditable). */
  label(name, note = '') { return { kind: 'label', name, note }; },
  /** Narrow structural selector scoped to one element only. */
  css(selector, note = '') { return { kind: 'css', selector, note }; },
  /** XPath scoped to a section/card. */
  xpath(selector, note = '') { return { kind: 'xpath', selector, note }; },
};

function locatorFor(base, candidate) {
  if (candidate.kind === 'role') return base.getByRole(candidate.role, { name: candidate.name, exact: true });
  if (candidate.kind === 'label') return base.getByLabel(candidate.name, { exact: true });
  return base.locator(candidate.selector);
}

function describeCandidate(candidate) {
  if (candidate.kind === 'role') return `role=${candidate.role} name="${candidate.name}"`;
  if (candidate.kind === 'label') return `label="${candidate.name}"`;
  return `selector="${candidate.selector}"`;
}

/**
 * Resolve a control: candidates are tried in order (most specific first).
 * A candidate matching more than one element is ambiguous and fails closed.
 * The first candidate matching exactly one VISIBLE element wins.
 * @throws {OperationError} LAYOUT_UNSUPPORTED on ambiguity/absence.
 */
// LinkedIn renders asynchronously, so a control can be absent for a moment
// after navigation. Wait for any candidate to appear before deciding it is
// missing; an ambiguous match still fails closed immediately.
async function waitForAnyCandidate(base, candidates, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const candidate of candidates) {
      const count = await locatorFor(base, candidate).count().catch(() => 0);
      if (count > 0) return;
    }
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// Count a control by its aria label first, then by role. The live marketplace
// and company controls carry aria labels but are excluded from the a11y tree,
// so a role-only count reports zero for a control that is present.
async function controlCount(page, name) {
  const byLabel = await page.getByLabel(name, { exact: true }).count().catch(() => 0);
  if (byLabel > 0) return byLabel;
  return page.getByRole('button', { name, exact: true }).count().catch(() => 0);
}

async function uniqueControl(base, candidates, what, timeout = 8000) {
  await waitForAnyCandidate(base, candidates, timeout);
  for (const candidate of candidates) {
    const locator = locatorFor(base, candidate);
    const count = await locator.count();
    if (count > 1) {
      throw layout(`${what}: ambiguous control — ${describeCandidate(candidate)} matched ${count} elements; refusing to guess.`);
    }
    if (count === 1) {
      try {
        await locator.waitFor({ state: 'visible', timeout });
        return locator;
      } catch {
        throw layout(`${what}: ${describeCandidate(candidate)} exists but is not visible.`);
      }
    }
  }
  throw layout(`${what}: no unique visible control found (tried ${candidates.map(describeCandidate).join(' | ')}).`);
}

/**
 * Resolve a container element (dialog scope, card, comment scope) from a
 * list of narrow selectors. Fails closed when nothing or several match.
 */
async function uniqueScope(base, selectors, what, timeout = 8000) {
  for (const selector of selectors) {
    const locator = base.locator(selector);
    const count = await locator.count();
    if (count > 1) {
      throw layout(`${what}: ambiguous container — "${selector}" matched ${count} elements; refusing to guess.`);
    }
    if (count === 1) {
      try {
        await locator.waitFor({ state: 'visible', timeout });
        return locator;
      } catch {
        throw layout(`${what}: container "${selector}" exists but is not visible.`);
      }
    }
  }
  throw layout(`${what}: container not found (tried ${selectors.join(' | ')}).`);
}

/** Detect plan-gated / restricted surfaces and fail closed. */
async function assertNotAccessRestricted(page, surface) {
  const text = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
  if (/\baccess restricted\b|\brestricted access\b|\brestricted content\b|requires a paid\b/i.test(text)) {
    throw restricted(`${surface} appears to be access-restricted or plan-gated; stopping without acting.`);
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function requireText(input, field) {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '' || value.length > 10000) {
    throw invalid(`"${field}" must be a nonempty string of at most 10000 characters.`);
  }
  return value;
}

function optionalText(input, field) {
  const value = input[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.length > 10000) {
    throw invalid(`"${field}" must be a nonempty string of at most 10000 characters when provided.`);
  }
  return value;
}

function urlInFamilies(input, families, what) {
  let url;
  try {
    url = new URL(input.url);
  } catch {
    throw invalid(`"${what}" requires an "url" input.`);
  }
  if (url.origin !== ORIGIN) throw invalid(`"${what}" must target ${ORIGIN}.`);
  if (url.username || url.password) throw invalid(`"${what}" URLs must not embed credentials.`);
  if (!families.some((family) => url.pathname.startsWith(family))) {
    throw invalid(`"url" for ${what} must be within route families: ${families.join(', ')}.`);
  }
  return url.href;
}

function requireReaction(input) {
  const value = input.reaction;
  if (typeof value !== 'string' || !REACTIONS.includes(value.toUpperCase())) {
    throw invalid(`"reaction" must be one of: ${REACTIONS.join(', ')}.`);
  }
  return value.toUpperCase();
}

function commentUrnFrom(urlString) {
  try {
    const url = new URL(urlString);
    const tracked = url.searchParams.get('trkCommentId');
    if (tracked?.startsWith('urn:li:comment-urn:')) return tracked;
    const match = urlString.match(/urn:li:comment-urn:[A-Za-z0-9:_-]+/);
    return match?.[0];
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function safeUrl(ctx) {
  try {
    return ctx.session.page.url();
  } catch {
    return '';
  }
}

function isCheckpointOrRate(error) {
  return (
    error?.status === 429
    || error?.name === 'HumanInterventionError'
    || error?.code === 'HUMAN_INTERVENTION_REQUIRED'
  );
}

function verified(ctx, evidence) {
  return { outcome: 'verified', url: safeUrl(ctx), evidence };
}

function unknown(ctx, reason, extraEvidence = {}) {
  return {
    outcome: 'unknown',
    url: safeUrl(ctx),
    evidence: { completionUnknown: true, reason, ...extraEvidence },
  };
}

export function createWriteAdapter(session) {
  if (!session || typeof session.navigate !== 'function' || !session.page) {
    throw new TypeError('createWriteAdapter requires a surface session ({ page, navigate, check, close }).');
  }
  const ops = buildOperations(session);
  return {
    async execute(name, input = {}) {
      const op = ops[name];
      if (!op) throw fail('UNSUPPORTED_OPERATION', `No write operation named "${name}". Supported: ${WRITE_OPERATIONS.join(', ')}.`);
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw invalid('input must be an object.');
      }
      // The approval gate runs before any navigation or click.
      if (input.confirmed !== true) {
        throw fail('APPROVAL_REQUIRED', 'Write operations require a separate payload-bound approval: input.confirmed must be exactly true.');
      }
      op.validate(input);
      const ctx = { session, dispatched: false };
      try {
        return await op.run(ctx, input);
      } catch (error) {
        if (!ctx.dispatched) throw error;
        // At or after dispatch, checkpoint/rate errors propagate (no retry).
        if (isCheckpointOrRate(error)) {
          error.completionUnknown = true;
          if (error.status === 429 && error.retryAfter === undefined) error.retryAfter = null;
          throw error;
        }
        // Any other post-dispatch ambiguity: report unknown, never retry.
        return unknown(ctx, `Dispatched action outcome could not be confirmed: ${error?.message ?? error}`, { phase: 'after-dispatch' });
      }
    },
  };
}

function buildOperations(session) {
  const page = session.page;

  const nav = async (url) => {
    await session.navigate(url);
    if (typeof session.check === 'function') await session.check();
  };
  const check = async () => {
    if (typeof session.check === 'function') await session.check();
  };

  const permalinkSelector = 'article a[href*="/feed/update/"]';
  const permalinkAnchorSelector = 'a[href*="/feed/update/"]';

  async function collectBaseline(pageInstance) {
    const articles = pageInstance.locator('article');
    const count = Math.min(await articles.count(), 30);
    const names = new Set();
    for (let i = 0; i < count; i += 1) {
      const name = await articles.nth(i).getAttribute('data-view-name');
      if (name) names.add(name);
    }
    if (names.size === 0) {
      for (let i = 0; i < count; i += 1) {
        const href = await articles.nth(i).locator(permalinkAnchorSelector).first().getAttribute('href').catch(() => null);
        if (href) names.add(href);
      }
    }
    return { names, articleCount: count };
  }

  /** New article matching predicate; returns permalink href or null. */
  async function findNewPost(pageInstance, baselineNames, predicate) {
    const articles = pageInstance.locator('article');
    const count = Math.min(await articles.count(), 30);
    for (let i = 0; i < count; i += 1) {
      const article = articles.nth(i);
      const name = await article.getAttribute('data-view-name');
      const key = name ?? (await article.locator(permalinkAnchorSelector).first().getAttribute('href').catch(() => null));
      if (key && baselineNames.has(key)) continue;
      const text = await article.innerText().catch(() => '');
      if (await predicate(text, article)) {
        const href = await article.locator(permalinkAnchorSelector).first().getAttribute('href').catch(() => null);
        return { key, href: href ?? '', textPreview: text.slice(0, 200) };
      }
    }
    return null;
  }

  /**
   * Count of VISIBLE, NON-editable elements in `scope` matching `text`.
   * Hidden and composer/editable copies do not count. Used to require a NEW
   * visible record after dispatch instead of matching preexisting content.
   */
  async function visibleTextCount(scope, text) {
    const matches = scope.getByText(text, { exact: false });
    const total = Math.min(await matches.count(), 20);
    let visible = 0;
    for (let i = 0; i < total; i += 1) {
      const match = matches.nth(i);
      if (!(await match.isVisible().catch(() => false))) continue;
      const info = await match.evaluate((el) => [el.tagName.toLowerCase(), el.isContentEditable]).catch(() => null);
      if (!info) continue;
      if (info[0] === 'input' || info[0] === 'textarea' || info[1]) continue;
      visible += 1;
    }
    return visible;
  }

  async function openMenu(pageInstance, menuButtonName, items) {
    const seen = new Set();
    const candidates = [C.role('button', 'More options'), C.role('button', menuButtonName), C.role('button', 'More')]
      .filter((candidate) => {
        if (seen.has(candidate.name)) return false;
        seen.add(candidate.name);
        return true;
      });
    const menuButton = await uniqueControl(pageInstance, candidates, 'post/page options menu button');
    await menuButton.click();
    const itemNames = [...new Set(items.filter(Boolean))];
    if (itemNames.length === 0) throw layout('No menu item names supplied.');
    const item = await uniqueControl(
      pageInstance,
      itemNames.map((name) => C.role('menuitem', name)),
      'options menu item',
    );
    await item.click();
  }

  return {
    'posts.create': {
      validate(input) {
        optionalText(input, 'text');
        const imagePath = input.imagePath;
        if (imagePath !== undefined && imagePath !== null && typeof imagePath !== 'string') {
          throw invalid('"imagePath" must be a string.');
        }
        // imageData is an internal payload-bound field injected by the
        // service at execute time ({ name, mimeType, buffer }); it is not
        // part of the public input schema.
        const imageData = input.imageData;
        if (imageData !== undefined && imageData !== null) {
          const shapeOk =
            typeof imageData === 'object' && !Array.isArray(imageData)
            && typeof imageData.name === 'string' && imageData.name.length > 0
            && typeof imageData.mimeType === 'string' && imageData.mimeType.length > 0
            && Buffer.isBuffer(imageData.buffer) && imageData.buffer.length > 0;
          if (!shapeOk) {
            throw invalid('"imageData" must be { name, mimeType, buffer: Buffer } with nonempty values.');
          }
        }
        if ((imagePath === undefined || imagePath === null) && imageData === undefined) {
          if (input.text === undefined || input.text === null || String(input.text).trim() === '') {
            throw invalid('posts.create requires "text" or "imagePath" (or the internal "imageData").');
          }
        }
      },
      async run(ctx, input) {
        const text = optionalText(input, 'text');
        const imagePath = input.imagePath;
        const imageData = input.imageData;
        if (imagePath) {
          const info = await stat(imagePath).catch(() => null);
          if (!info?.isFile()) throw invalid('"imagePath" must point to an existing image file.');
        }
        // Baseline snapshot BEFORE publishing so a preexisting post with the
        // same text cannot be mistaken for the new one.
        await nav(ACTIVITY_URL);
        const baseline = await collectBaseline(page);
        await nav(FEED_URL);
        const trigger = await uniqueControl(page, [C.role('button', 'Start a post')], 'composer trigger');
        await trigger.click();
        const dialog = await uniqueControl(page, [C.role('dialog', 'Start a post')], 'post composer dialog');
        if (text) {
          const editor = await uniqueControl(
            dialog,
            [C.label('What do you want to talk about?'), C.css('div[contenteditable="true"]')],
            'composer text field',
          );
          await editor.fill(text);
        }
        if (imageData || imagePath) {
          const fileInput = await uniqueControl(dialog, [C.css('input[type="file"]')], 'composer media input');
          // Prefer the payload-bound bytes captured at prepare time; fall
          // back to a path read at execute time.
          if (imageData) {
            await fileInput.setInputFiles({ name: imageData.name, mimeType: imageData.mimeType, buffer: imageData.buffer });
          } else {
            await fileInput.setInputFiles([imagePath]);
          }
        }
        const publish = await uniqueControl(dialog, [C.role('button', 'Post')], 'composer publish button');
        // Mark before the mutation: a click that errors after reaching the
        // server must be treated as dispatched (no retry).
        ctx.dispatched = true;
        await publish.click();
        await check();
        await nav(ACTIVITY_URL);
        const found = await findNewPost(page, baseline.names, async (articleText, article) => {
          if (text) return articleText.includes(text);
          return (await article.locator('img').count()) > 0;
        });
        if (found && found.href) {
          const imageName = imageData?.name ?? (imagePath ? imagePath.split(/[\\/]/).at(-1) : null);
          return verified(ctx, {
            textLength: text?.length ?? 0,
            imageName,
            imageSource: imageData ? 'payload-bound imageData' : 'imagePath',
            permalink: found.href,
            baselinePosts: baseline.articleCount,
          });
        }
        return unknown(ctx, 'New post was not observed on recent activity after publishing.', {
          baselinePosts: baseline.articleCount,
          textLength: text?.length ?? 0,
        });
      },
    },

    'posts.edit': {
      validate(input) {
        urlInFamilies(input, POST_FAMILIES, 'posts.edit');
        requireText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, POST_FAMILIES, 'posts.edit');
        const text = requireText(input, 'text');
        await nav(url);
        await openMenu(page, 'More options', ['Edit post', 'Edit']);
        const dialog = await uniqueControl(page, [C.role('dialog', 'Edit post')], 'post edit dialog');
        const editor = await uniqueControl(
          dialog,
          [C.label('Edit post'), C.label('What do you want to talk about?'), C.css('div[contenteditable="true"]')],
          'post edit field',
        );
        await editor.fill(text);
        const save = await uniqueControl(dialog, [C.role('button', 'Save')], 'post save button');
        const beforeCount = await visibleTextCount(page, text);
        ctx.dispatched = true;
        await save.click();
        await check();
        const applied = (await visibleTextCount(page, text)) > beforeCount;
        if (applied) return verified(ctx, { permalink: url, textLength: text.length });
        return unknown(ctx, 'Edited text was not confirmed as a new post record (it may be unchanged or preexisting).', { permalink: url });
      },
    },

    'posts.delete': {
      validate(input) {
        urlInFamilies(input, POST_FAMILIES, 'posts.delete');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, POST_FAMILIES, 'posts.delete');
        await nav(url);
        await openMenu(page, 'More options', ['Delete post', 'Delete']);
        const dialog = await uniqueControl(page, [C.role('dialog', 'Delete post')], 'post delete confirmation');
        const confirm = await uniqueControl(dialog, [C.role('button', 'Delete post'), C.role('button', 'Delete')], 'post delete confirm button');
        ctx.dispatched = true;
        await confirm.click();
        await check();
        const gone = await page.getByText(/no longer available|deleted|not found/i).first().isVisible().catch(() => false);
        if (gone) return verified(ctx, { permalink: url });
        return unknown(ctx, 'Deletion state could not be confirmed on the post page.', { permalink: url });
      },
    },

    'reactions.add': {
      validate(input) {
        urlInFamilies(input, POST_FAMILIES, 'reactions.add');
        requireReaction(input);
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, POST_FAMILIES, 'reactions.add');
        const reaction = requireReaction(input);
        const label = REACTION_LABELS[reaction];
        await nav(url);
        // Opening the picker: either the active reaction button or the
        // neutral "Like" control.
        const trigger = await uniqueControl(
          page,
          [C.role('button', label), C.role('button', 'Like')],
          'reaction picker trigger',
        );
        await trigger.click();
        const picker = await uniqueControl(page, [C.role('dialog', 'Reaction picker')], 'reaction picker');
        const item = await uniqueControl(picker, [C.role('button', label)], `${label} reaction item`);
        ctx.dispatched = true;
        await item.click();
        await check();
        // A pressed reaction button only proves SOME reaction is active;
        // confirm the SELECTED type by label.
        const state = await page.getByRole('button', { name: label, exact: true }).first()
          .getAttribute('aria-pressed').catch(() => null);
        if (state === 'true') {
          return verified(ctx, { permalink: url, reaction, confirmedBy: `aria-pressed on the ${label} post reaction button` });
        }
        return unknown(ctx, `Selected reaction ${reaction} was not confirmed on the post page.`, { permalink: url });
      },
    },

    'reactions.remove': {
      validate(input) {
        urlInFamilies(input, POST_FAMILIES, 'reactions.remove');
        requireReaction(input);
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, POST_FAMILIES, 'reactions.remove');
        const reaction = requireReaction(input);
        const label = REACTION_LABELS[reaction];
        await nav(url);
        const active = page.getByRole('button', { name: label, exact: true }).first();
        const activeCount = await active.count();
        if (activeCount === 0) {
          return verified(ctx, { permalink: url, reaction, noop: true, note: 'No active reaction to remove found.' });
        }
        if (activeCount > 1) throw layout(`reactions.remove: multiple "${label}" reaction buttons; refusing to guess.`);
        await active.click();
        const picker = await uniqueControl(page, [C.role('dialog', 'Reaction picker')], 'reaction picker');
        const item = await uniqueControl(picker, [C.role('button', label)], `${label} reaction item`);
        ctx.dispatched = true;
        await item.click();
        await check();
        if (reaction === 'LIKE') {
          // Neutral state: the "Like" control must no longer be pressed.
          const neutral = await page.getByRole('button', { name: 'Like', exact: true }).first()
            .getAttribute('aria-pressed').catch(() => null);
          if (neutral !== 'true') return verified(ctx, { permalink: url, reaction });
          return unknown(ctx, 'Reaction removal was not confirmed (button still shows the active state).', { permalink: url });
        }
        // Label-specific: the removed reaction's button must be gone.
        const remaining = await page.getByRole('button', { name: label, exact: true }).count();
        if (remaining === 0) return verified(ctx, { permalink: url, reaction });
        return unknown(ctx, 'Reaction removal was not confirmed on the post page.', { permalink: url });
      },
    },

    'comments.create': {
      validate(input) {
        urlInFamilies(input, POST_FAMILIES, 'comments.create');
        requireText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, POST_FAMILIES, 'comments.create');
        const text = requireText(input, 'text');
        await nav(url);
        const trigger = await uniqueControl(
          page,
          [C.role('button', 'Write a comment'), C.role('textbox', 'Write a comment')],
          'comment composer trigger',
        );
        await trigger.click();
        const dialog = await uniqueControl(page, [C.role('dialog', 'Write a comment')], 'comment dialog');
        const editor = await uniqueControl(
          dialog,
          [C.label('Write a comment'), C.css('div[contenteditable="true"]')],
          'comment field',
        );
        await editor.fill(text);
        const post = await uniqueControl(dialog, [C.role('button', 'Post')], 'comment publish button');
        // Preexisting identical comment text must not count as the new one.
        const beforeCount = await visibleTextCount(page, text);
        ctx.dispatched = true;
        await post.click();
        await check();
        const afterCount = await visibleTextCount(page, text);
        if (afterCount > beforeCount) {
          return verified(ctx, { permalink: url, textLength: text.length, newRecord: true });
        }
        return unknown(ctx, 'No new comment record was confirmed (preexisting text or no-op send).', { permalink: url });
      },
    },

    'comments.reply': {
      validate(input) {
        urlInFamilies(input, COMMENT_URL_FAMILIES, 'comments.reply');
        requireText(input, 'text');
        if (!commentUrnFrom(input.url)) throw invalid('comments.reply "url" must identify a specific comment (comment-urn or trkCommentId).');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, COMMENT_URL_FAMILIES, 'comments.reply');
        const text = requireText(input, 'text');
        const urn = commentUrnFrom(url);
        await nav(url);
        // Scope strictly to the comment identified by the URL; never click a
        // global "Reply" of another comment.
        const scope = await uniqueScope(
          page,
          [`[data-view-name*="${urn}"]`, `[data-id*="${urn}"]`, `[data-entity-urn*="${urn}"]`],
          `comment card for ${urn}`,
        );
        const reply = await uniqueControl(scope, [C.role('button', 'Reply')], 'reply trigger');
        await reply.click();
        const dialog = await uniqueControl(page, [C.role('dialog', 'Write a comment')], 'reply dialog');
        const editor = await uniqueControl(
          dialog,
          [C.label('Write a comment'), C.css('div[contenteditable="true"]')],
          'reply field',
        );
        await editor.fill(text);
        const post = await uniqueControl(dialog, [C.role('button', 'Post')], 'reply publish button');
        // Count within the target comment scope so a preexisting identical
        // reply cannot be mistaken for the new one.
        const beforeCount = await visibleTextCount(scope, text);
        ctx.dispatched = true;
        await post.click();
        await check();
        const afterCount = await visibleTextCount(scope, text);
        if (afterCount > beforeCount) {
          return verified(ctx, { commentUrn: urn, textLength: text.length, newRecord: true });
        }
        return unknown(ctx, 'No new reply record was confirmed under the target comment (preexisting text or no-op send).', { commentUrn: urn });
      },
    },

    'posts.share': {
      validate(input) {
        urlInFamilies(input, POST_FAMILIES, 'posts.share');
        optionalText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, POST_FAMILIES, 'posts.share');
        const caption = optionalText(input, 'text');
        await nav(ACTIVITY_URL);
        const baseline = await collectBaseline(page);
        await nav(url);
        const shareTrigger = await uniqueControl(page, [C.role('button', 'Share')], 'share trigger');
        await shareTrigger.click();
        const dialog = await uniqueControl(page, [C.role('dialog', 'Share post')], 'share dialog');
        if (caption) {
          const editor = await uniqueControl(
            dialog,
            [C.label('Add a caption...'), C.label('Write a comment'), C.css('div[contenteditable="true"]')],
            'share caption field',
          );
          await editor.fill(caption);
        }
        const share = await uniqueControl(dialog, [C.role('button', 'Share'), C.role('button', 'Post')], 'share dialog action');
        ctx.dispatched = true;
        await share.click();
        await check();
        await nav(ACTIVITY_URL);
        // Verification: the new recent-activity item must link back to the
        // shared post (permalink identity) and, when a caption was posted,
        // must contain it. An arbitrary new item alone is not proof.
        const originalUrn = url.match(/urn:li:activity:[A-Za-z0-9:_.-]+/)?.[0] ?? null;
        const found = await findNewPost(page, baseline.names, async (articleText, article) => {
          if (originalUrn) {
            const linksTarget = (await article.locator(`a[href*="${originalUrn}"]`).count()) > 0;
            if (!linksTarget) return false;
          }
          if (caption) return articleText.includes(caption);
          return true;
        });
        if (found) {
          return verified(ctx, {
            permalink: url,
            permalinkIdentity: originalUrn,
            captionLength: caption?.length ?? 0,
            captionMatched: Boolean(caption),
            newFeedItem: found.key,
          });
        }
        return unknown(ctx, 'No recent-activity item matching the shared target permalink/caption was observed.', {
          permalink: url,
          permalinkIdentity: originalUrn,
          captionLength: caption?.length ?? 0,
        });
      },
    },

    'messages.send': {
      validate(input) {
        urlInFamilies(input, PROFILE_FAMILIES, 'messages.send');
        requireText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, PROFILE_FAMILIES, 'messages.send');
        const text = requireText(input, 'text');
        await nav(url);
        // Capture the target's display name from the profile page so the
        // messenger pane can be matched to the target before sending.
        const nameScope = await uniqueScope(page, ['main h2'], 'profile name heading');
        const targetName = (await nameScope.innerText()).trim();
        const trigger = await uniqueControl(page, [C.role('button', 'Message')], 'message trigger');
        await trigger.click();
        const pane = await uniqueControl(page, [C.role('region', 'Messenger'), C.role('region', 'Sales chat')], 'messenger pane');
        const paneHeader = pane.locator('h2, h3, h4').first();
        await paneHeader.waitFor({ state: 'visible', timeout: 8000 })
          .catch(() => { throw layout('messenger pane header not found; cannot confirm the recipient.'); });
        const headerText = (await paneHeader.innerText()).trim();
        if (!headerText.includes(targetName)) {
          throw layout(`Messenger pane header "${headerText}" does not match target profile "${targetName}"; refusing to send.`);
        }
        const composer = await uniqueControl(
          pane,
          [C.label('Write a message, or search.'), C.label('Write a message')],
          'message composer',
        );
        await composer.fill(text);
        // Scoped to the pane: never the global "Send invitation" control.
        const send = await uniqueControl(pane, [C.role('button', 'Send')], 'message send button');
        const beforeCount = await visibleTextCount(pane, text);
        ctx.dispatched = true;
        await send.click();
        await check();
        const enteredThread = /\/messaging\/thread\//.test(safeUrl(ctx));
        const afterCount = await visibleTextCount(pane, text);
        if (afterCount > beforeCount) {
          return verified(ctx, {
            targetProfile: url,
            targetName,
            enteredThread,
            textLength: text.length,
            newRecord: true,
          });
        }
        return unknown(ctx, 'No new message record was confirmed in the conversation (preexisting text or no-op send).', {
          targetProfile: url,
          enteredThread,
        });
      },
    },

    'messages.reply': {
      validate(input) {
        urlInFamilies(input, THREAD_FAMILIES, 'messages.reply');
        requireText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, THREAD_FAMILIES, 'messages.reply');
        const text = requireText(input, 'text');
        await nav(url);
        const headerText = (await page.locator('main h2, main h4').first().innerText().catch(() => '')).trim();
        const composer = await uniqueControl(
          page,
          [C.label('Write a message, or search.'), C.label('Write a message')],
          'message composer',
        );
        await composer.fill(text);
        const send = await uniqueControl(page, [C.role('button', 'Send')], 'message send button');
        const beforeCount = await visibleTextCount(page, text);
        ctx.dispatched = true;
        await send.click();
        await check();
        const afterCount = await visibleTextCount(page, text);
        if (afterCount > beforeCount) {
          return verified(ctx, { threadUrl: url, threadLabel: headerText || null, textLength: text.length, newRecord: true });
        }
        return unknown(ctx, 'No new message record was confirmed in the thread (preexisting text or no-op send).', { threadUrl: url });
      },
    },

    'messages.mark-read': {
      validate(input) {
        urlInFamilies(input, THREAD_FAMILIES, 'messages.mark-read');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, THREAD_FAMILIES, 'messages.mark-read');
        const threadId = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '';
        await nav(INBOX_URL);
        const rowSelectors = [`[data-thread-id="${threadId}"]`, `a[href*="/messaging/thread/${threadId}"]`];
        const readState = async (row) => {
          const label = await row.getAttribute('aria-label').catch(() => null);
          const bodyText = await row.innerText().catch(() => '');
          return /unread/i.test(`${label ?? ''} ${bodyText}`);
        };
        const row = await uniqueScope(page, rowSelectors, `inbox row for thread ${threadId}`);
        if (!(await readState(row))) {
          return verified(ctx, { threadUrl: url, alreadyRead: true, note: 'Thread was not unread; nothing to mark.' });
        }
        await nav(url);
        // Opening the thread is what marks it read on LinkedIn.
        await nav(INBOX_URL);
        const rowAfter = await uniqueScope(page, rowSelectors, `inbox row for thread ${threadId}`);
        if (!(await readState(rowAfter))) {
          return verified(ctx, { threadUrl: url, alreadyRead: false, markedRead: true });
        }
        return unknown(ctx, 'Thread still shows as unread after opening it.', { threadUrl: url });
      },
    },

    'invitations.send': {
      validate(input) {
        urlInFamilies(input, PROFILE_FAMILIES, 'invitations.send');
        optionalText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, PROFILE_FAMILIES, 'invitations.send');
        const note = optionalText(input, 'text');
        await nav(url);
        if (note) {
          await openMenu(page, 'More options', ['Send note']);
          const dialog = await uniqueControl(page, [C.role('dialog', 'Send a note')], 'connect note dialog');
          const editor = await uniqueControl(
            dialog,
            [C.label('Note'), C.label('Send a note'), C.css('textarea')],
            'connect note field',
          );
          await editor.fill(note);
          const send = await uniqueControl(dialog, [C.role('button', 'Send')], 'connect note send button');
          ctx.dispatched = true;
          await send.click();
        } else {
          const connect = await uniqueControl(page, [C.role('button', 'Connect')], 'connect control');
          ctx.dispatched = true;
          await connect.click();
        }
        await check();
        const pending =
          (await page.getByRole('button', { name: 'Withdraw invitation', exact: true }).count()) > 0
          || (await page.getByText('Pending', { exact: false }).first().isVisible().catch(() => false));
        if (pending) return verified(ctx, { targetProfile: url, note: Boolean(note) });
        return unknown(ctx, 'Pending-invitation state was not observed on the profile page.', { targetProfile: url });
      },
    },

    'invitations.accept': {
      validate(input) {
        urlInFamilies(input, PROFILE_FAMILIES, 'invitations.accept');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, PROFILE_FAMILIES, 'invitations.accept');
        await nav(url);
        const accept = await uniqueControl(page, [C.role('button', 'Accept invitation'), C.role('button', 'Accept')], 'invitation accept control');
        ctx.dispatched = true;
        await accept.click();
        await check();
        const connected = await page.getByText('Connected', { exact: false }).first().isVisible().catch(() => false);
        if (connected) return verified(ctx, { targetProfile: url });
        return unknown(ctx, 'Connected state was not observed on the profile page.', { targetProfile: url });
      },
    },

    'invitations.reject': {
      validate(input) {
        urlInFamilies(input, PROFILE_FAMILIES, 'invitations.reject');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, PROFILE_FAMILIES, 'invitations.reject');
        await nav(url);
        const ignore = await uniqueControl(page, [C.role('button', 'Ignore invitation'), C.role('button', 'Ignore')], 'invitation ignore control');
        ctx.dispatched = true;
        await ignore.click();
        await check();
        const connectable = await page.getByRole('button', { name: 'Connect', exact: true }).count();
        if (connectable === 1) return verified(ctx, { targetProfile: url });
        return unknown(ctx, 'Invitation rejection was not confirmed on the profile page.', { targetProfile: url });
      },
    },

    'invitations.withdraw': {
      validate(input) {
        urlInFamilies(input, PROFILE_FAMILIES, 'invitations.withdraw');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, PROFILE_FAMILIES, 'invitations.withdraw');
        await nav(url);
        const withdraw = await uniqueControl(page, [C.role('button', 'Withdraw invitation'), C.role('button', 'Withdraw')], 'invitation withdraw control');
        ctx.dispatched = true;
        await withdraw.click();
        await check();
        const connectable = await page.getByRole('button', { name: 'Connect', exact: true }).count();
        if (connectable === 1) return verified(ctx, { targetProfile: url });
        return unknown(ctx, 'Invitation withdrawal was not confirmed on the profile page.', { targetProfile: url });
      },
    },

    'connections.remove': {
      validate(input) {
        urlInFamilies(input, PROFILE_FAMILIES, 'connections.remove');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, PROFILE_FAMILIES, 'connections.remove');
        await nav(url);
        await openMenu(page, 'More options', ['Remove connection']);
        const dialog = await uniqueControl(page, [C.role('dialog', 'Remove connection')], 'remove connection confirmation');
        const confirm = await uniqueControl(dialog, [C.role('button', 'Remove connection'), C.role('button', 'Remove')], 'remove connection confirm button');
        ctx.dispatched = true;
        await confirm.click();
        await check();
        const restored = await page
          .getByRole('button', { name: 'Connect', exact: true })
          .or(page.getByRole('button', { name: 'Follow', exact: true }))
          .first()
          .isVisible()
          .catch(() => false);
        if (restored) return verified(ctx, { targetProfile: url });
        return unknown(ctx, 'Connection removal was not confirmed on the profile page.', { targetProfile: url });
      },
    },

    'companies.follow': {
      validate(input) {
        urlInFamilies(input, COMPANY_FAMILIES, 'companies.follow');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, COMPANY_FAMILIES, 'companies.follow');
        await nav(url);
        await assertNotAccessRestricted(page, 'company page');
        // The live control is a button with aria-label "Follow" that the
        // accessibility tree excludes, so the role query alone misses it.
        const follow = await uniqueControl(page, [
          C.role('button', 'Follow'),
          C.label('Follow'),
          C.css('button[aria-label="Follow"]'),
        ], 'company follow control');
        ctx.dispatched = true;
        await follow.click();
        await check();
        const following = await controlCount(page, 'Following');
        if (following === 1) return verified(ctx, { companyUrl: url });
        return unknown(ctx, 'Following state was not observed on the company page.', { companyUrl: url });
      },
    },

    'companies.unfollow': {
      validate(input) {
        urlInFamilies(input, COMPANY_FAMILIES, 'companies.unfollow');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, COMPANY_FAMILIES, 'companies.unfollow');
        await nav(url);
        await assertNotAccessRestricted(page, 'company page');
        const following = await uniqueControl(page, [
          C.role('button', 'Following'),
          C.label('Following'),
          C.css('button[aria-label="Following"]'),
        ], 'company following control');
        // The click may itself toggle the follow state (or reveal an
        // inline confirm), so mark dispatched before it.
        ctx.dispatched = true;
        await following.click();
        const confirm = page.locator('button[aria-label="Unfollow"], [role="button"][aria-label="Unfollow"]');
        if ((await confirm.count()) === 1) {
          await confirm.click();
        }
        await check();
        const restored = await controlCount(page, 'Follow');
        if (restored === 1) return verified(ctx, { companyUrl: url });
        return unknown(ctx, 'Unfollow was not confirmed on the company page.', { companyUrl: url });
      },
    },

    'profile.update': {
      validate(input) {
        const fields = input.fields;
        if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
          throw invalid('profile.update requires a "fields" object ({ headline?, about? }).');
        }
        const known = ['headline', 'about'];
        for (const key of Object.keys(fields)) {
          if (!known.includes(key)) throw invalid(`profile.update fields only support: ${known.join(', ')}.`);
        }
        for (const key of known) {
          if (fields[key] !== undefined && (typeof fields[key] !== 'string' || fields[key].trim() === '')) {
            throw invalid(`fields.${key} must be a nonempty string when provided.`);
          }
        }
        if (fields.headline === undefined && fields.about === undefined) {
          throw invalid('profile.update requires fields.headline and/or fields.about.');
        }
        // The editor targets the operator's OWN profile. A supplied url may
        // only be a self URL; arbitrary other targets are rejected.
        if (input.url !== undefined && input.url !== null) {
          let selfUrl;
          try {
            selfUrl = new URL(input.url);
          } catch {
            throw invalid('profile.update "url" must be a valid self URL (for example /in/me) when provided.');
          }
          if (selfUrl.origin !== ORIGIN || !(selfUrl.pathname === '/in/me' || selfUrl.pathname.startsWith('/in/me/'))) {
            throw invalid('profile.update only targets the operator\'s own profile (a /in/me self URL); other URLs are not accepted.');
          }
        }
      },
      async run(ctx, input) {
        const { headline, about } = input.fields;
        await nav(SETTINGS_URL);
        const editProfile = await uniqueControl(page, [
          C.role('button', 'Edit professional profile'),
          // Live markup: the entry point is a link carrying the aria label.
          C.css('a[aria-label="Edit profile"]'),
          C.label('Edit profile'),
        ], 'profile editor entry');
        await editProfile.click();
        await page.waitForURL((candidate) => String(candidate).includes('/profile/view'), { timeout: 15000 })
          .catch(() => {});
        if (!String(safeUrl(ctx)).includes('/profile/view')) {
          throw layout('Profile editor did not open at /profile/view.');
        }
        await check();
        // Snapshot BEFORE any edit: preexisting identical text must not
        // count as confirmation of the update.
        const headlineBefore = headline !== undefined ? await visibleTextCount(page, headline) : 0;
        const aboutBefore = about !== undefined ? await visibleTextCount(page, about) : 0;
        const card = await uniqueScope(
          page,
          ['xpath=//h2[normalize-space()=\'Basics\']/ancestor::section[1]', 'xpath=//h2[normalize-space()=\'Basics\']/ancestor::div[1]'],
          'Basics profile card',
        );
        const editButton = page.getByRole('button', { name: 'Edit', exact: true });
        if ((await editButton.count()) === 1 && await editButton.first().isVisible()) {
          await editButton.first().click();
        }
        if (headline !== undefined) {
          const field = await uniqueControl(card, [C.label('Headline')], 'headline field');
          await field.fill(headline);
        }
        if (about !== undefined) {
          const field = await uniqueControl(card, [C.label('About')], 'about field');
          await field.fill(about);
        }
        const done = await uniqueControl(card, [C.role('button', 'Done')], 'profile save control');
        ctx.dispatched = true;
        await done.click();
        await check();
        await nav(PROFILE_VIEW_URL);
        let confirmed = true;
        if (headline !== undefined) {
          confirmed = (await visibleTextCount(page, headline)) > headlineBefore;
        }
        if (confirmed && about !== undefined) {
          confirmed = (await visibleTextCount(page, about)) > aboutBefore;
        }
        if (confirmed) return verified(ctx, { updatedFields: [headline !== undefined ? 'headline' : null, about !== undefined ? 'about' : null].filter(Boolean) });
        return unknown(ctx, 'Updated profile values were not confirmed as new records at /profile/view.', { updatedFields: [headline !== undefined ? 'headline' : null, about !== undefined ? 'about' : null].filter(Boolean) });
      },
    },

    'sales.messages.send': {
      validate(input) {
        urlInFamilies(input, SALES_PROFILE_FAMILIES, 'sales.messages.send');
        requireText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, SALES_PROFILE_FAMILIES, 'sales.messages.send');
        const text = requireText(input, 'text');
        await nav(url);
        await assertNotAccessRestricted(page, 'Sales Navigator surface');
        const nameScope = await uniqueScope(page, ['main h2'], 'Sales lead name heading');
        const targetName = (await nameScope.innerText()).trim();
        const trigger = await uniqueControl(page, [C.role('button', 'Message')], 'Sales message trigger');
        await trigger.click();
        const pane = await uniqueControl(page, [C.role('region', 'Messenger'), C.role('region', 'Sales chat')], 'Sales chat pane');
        const paneHeader = pane.locator('h2, h3, h4').first();
        await paneHeader.waitFor({ state: 'visible', timeout: 8000 })
          .catch(() => { throw layout('Sales chat pane header not found; cannot confirm the recipient.'); });
        const headerText = (await paneHeader.innerText()).trim();
        if (!headerText.includes(targetName)) {
          throw layout(`Sales chat pane header "${headerText}" does not match target lead "${targetName}"; refusing to send.`);
        }
        const composer = await uniqueControl(
          pane,
          [C.label('Write a message, or search.'), C.label('Write a message')],
          'message composer',
        );
        await composer.fill(text);
        const send = await uniqueControl(pane, [C.role('button', 'Send')], 'message send button');
        const beforeCount = await visibleTextCount(pane, text);
        ctx.dispatched = true;
        await send.click();
        await check();
        const afterCount = await visibleTextCount(pane, text);
        if (afterCount > beforeCount) {
          return verified(ctx, { targetLead: url, targetName, textLength: text.length, newRecord: true });
        }
        return unknown(ctx, 'No new message record was confirmed in the Sales chat (preexisting text or no-op send).', { targetLead: url });
      },
    },

    'sales.messages.reply': {
      validate(input) {
        urlInFamilies(input, SALES_THREAD_FAMILIES, 'sales.messages.reply');
        requireText(input, 'text');
      },
      async run(ctx, input) {
        const url = urlInFamilies(input, SALES_THREAD_FAMILIES, 'sales.messages.reply');
        const text = requireText(input, 'text');
        await nav(url);
        await assertNotAccessRestricted(page, 'Sales Navigator surface');
        const composer = await uniqueControl(
          page,
          [C.label('Write a message, or search.'), C.label('Write a message')],
          'message composer',
        );
        await composer.fill(text);
        const send = await uniqueControl(page, [C.role('button', 'Send')], 'message send button');
        const beforeCount = await visibleTextCount(page, text);
        ctx.dispatched = true;
        await send.click();
        await check();
        const afterCount = await visibleTextCount(page, text);
        if (afterCount > beforeCount) {
          return verified(ctx, { threadUrl: url, textLength: text.length, newRecord: true });
        }
        return unknown(ctx, 'No new message record was confirmed in the Sales thread (preexisting text or no-op send).', { threadUrl: url });
      },
    },
  };
}
