const text = { type: 'string', minLength: 1, maxLength: 10000 };
const url = { type: 'string', format: 'uri', minLength: 1, maxLength: 2048 };
const reads = [
  ['profile.get', 'Read a structured profile', false], ['profile.skills', 'Read profile skills', false],
  ['profile.contact', 'Read permitted profile contact details', false], ['posts.list', 'List profile posts', false],
  ['posts.get', 'Read one post', true], ['comments.list', 'Read comments on a post', true],
  ['reactions.list', 'Read reactions on a post', true], ['inbox.list', 'List own inbox conversations', false],
  ['inbox.thread', 'Read one conversation; opening it may mark it seen', true],
  ['inbox.search', 'Search own conversations', false, true], ['connections.list', 'List own connections', false],
  ['invitations.received', 'List received invitations', false], ['invitations.sent', 'List sent invitations', false],
  ['connections.status', 'Read relationship to one profile', true], ['feed.list', 'Read a bounded feed page', false],
  ['search.people', 'Search people', false, true], ['search.companies', 'Search companies', false, true],
  ['search.posts', 'Search posts', false, true], ['search.jobs', 'Search jobs', false, true],
  ['companies.get', 'Read a company profile', true], ['companies.posts', 'Read company posts', true],
  ['jobs.search', 'Search jobs', false, true], ['jobs.saved', 'Read saved jobs', false],
  ['jobs.get', 'Read one job', true], ['jobs.apply-url', 'Read a job application link without applying', true],
  ['analytics.profile-views', 'Read profile-view analytics when available', false],
  ['analytics.post', 'Read one own post analytics page', true], ['analytics.ssi', 'Read available SSI metrics', false],
  ['sales.profile', 'Read a Sales Navigator profile when entitled', true],
  ['sales.search-people', 'Search Sales Navigator people when entitled', false, true],
  ['sales.search-companies', 'Search Sales Navigator companies when entitled', false, true],
  ['sales.inbox', 'Read Sales Navigator conversations when entitled', false],
  ['sales.thread', 'Read a Sales Navigator conversation; it may be marked seen', true],
];
const writes = [
  ['posts.create', 'Create a single post (text, image, or both; at least one required)', false, false], ['posts.edit', 'Edit one own post', true, true],
  ['posts.delete', 'Delete one own post', true], ['posts.share', 'Share one post', true],
  ['reactions.add', 'React to one post', true], ['reactions.remove', 'Remove one reaction', true],
  ['comments.create', 'Comment on one post', true, true], ['comments.reply', 'Reply to one comment', true, true],
  ['messages.send', 'Send one message to one selected recipient', true, true],
  ['messages.reply', 'Reply to one selected conversation', true, true],
  ['messages.mark-read', 'Mark one conversation as read', true],
  ['invitations.send', 'Send one connection invitation', true], ['invitations.accept', 'Accept one invitation', true],
  ['invitations.reject', 'Reject one invitation', true], ['invitations.withdraw', 'Withdraw one invitation', true],
  ['connections.remove', 'Remove one connection', true], ['companies.follow', 'Follow one company', true],
  ['companies.unfollow', 'Unfollow one company', true], ['profile.update', 'Update own headline or about', false],
  ['sales.messages.send', 'Send one Sales Navigator message when entitled', true, true],
  ['sales.messages.reply', 'Reply to one Sales Navigator conversation when entitled', true, true],
];

function schema(name, access, requiredUrl, requiredText, requiredQuery) {
  const properties = {};
  const required = [];
  if (access === 'read') {
    Object.assign(properties, { url, query: { ...text, maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }, cursor: { type: 'integer', minimum: 0, maximum: 10000, default: 0 } });
    if (requiredQuery) required.push('query');
  } else {
    if (!['posts.create', 'profile.update'].includes(name)) properties.url = url;
    if (requiredText || ['posts.create', 'posts.share', 'invitations.send'].includes(name)) properties.text = { ...text, maxLength: name.startsWith('messages.') || name.startsWith('sales.messages.') ? 1900 : name.startsWith('comments.') ? 1000 : name === 'invitations.send' ? 200 : 3000 };
    if (requiredText) required.push('text');
    if (name === 'posts.create') {
      properties.imagePath = { type: 'string', minLength: 1, maxLength: 4096 };
    }
    if (name === 'reactions.add' || name === 'reactions.remove') {
      properties.reaction = { type: 'string', enum: ['LIKE', 'CELEBRATE', 'LOVE', 'INSIGHTFUL', 'FUNNY', 'SUPPORT'] };
      required.push('reaction');
    }
    if (name === 'profile.update') {
      properties.fields = { type: 'object', additionalProperties: false, minProperties: 1, properties: { headline: { ...text, maxLength: 220 }, about: { ...text, maxLength: 2600 } } };
      required.push('fields');
    }
  }
  if (requiredUrl) required.push('url');
  return { type: 'object', additionalProperties: false, properties, required };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreeze(entry);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

export const OPERATIONS = deepFreeze([
  ...reads.map(([name, description, requiredUrl, requiredQuery]) => Object.freeze({ name, description, access: 'read', experimental: true, verification: 'unverified', inputSchema: schema(name, 'read', requiredUrl, false, requiredQuery) })),
  ...writes.map(([name, description, requiredUrl, requiredText]) => Object.freeze({ name, description, access: 'write', experimental: true, verification: 'unverified', inputSchema: schema(name, 'write', requiredUrl, requiredText, false) })),
]);

export function operation(name) {
  const entry = OPERATIONS.find((entry) => entry.name === name);
  if (!entry) throw Object.assign(new Error(`Unknown operation: ${name}`), { code: 'VALIDATION_ERROR' });
  return entry;
}

export function validateInput(name, input = {}) {
  const entry = operation(name);
  validate(entry.inputSchema, input, 'input');
  if (name === 'posts.create' && input.text === undefined && input.imagePath === undefined) {
    throw invalid('posts.create requires text or an image');
  }
  const result = structuredClone(input);
  if (entry.access === 'read') {
    result.limit ??= 10;
    result.cursor ??= 0;
  }
  if (result.url !== undefined) {
    if (result.url.trim() !== result.url || /[\u0000-\u001f\u007f]/.test(result.url)) throw invalid('input.url must not contain whitespace or control characters');
    let target;
    try { target = new URL(result.url); } catch { throw invalid('input.url must be a LinkedIn URL'); }
    if (target.origin !== 'https://www.linkedin.com' || target.username || target.password || result.url.includes('\\')) throw invalid('input.url must be a LinkedIn HTTPS www.linkedin.com URL without credentials');
  }
  return result;
}

function invalid(message) { return Object.assign(new Error(message), { code: 'VALIDATION_ERROR' }); }
function validate(spec, value, label) {
  if (spec.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${label} must be an object`);
    const keys = Object.keys(value);
    if (spec.minProperties && keys.length < spec.minProperties) throw invalid(`${label} requires at least one field`);
    for (const key of keys) {
      if (!Object.hasOwn(spec.properties, key)) throw invalid(`${label} has unexpected field ${key}`);
      validate(spec.properties[key], value[key], `${label}.${key}`);
    }
    for (const key of spec.required ?? []) if (!Object.hasOwn(value, key)) throw invalid(`${label}.${key} is required`);
  } else if (spec.type === 'string') {
    if (typeof value !== 'string' || value.trim().length < (spec.minLength ?? 0) || value.length > (spec.maxLength ?? Infinity)) throw invalid(`${label} must be a nonempty string within its length limit`);
    if (spec.enum && !spec.enum.includes(value)) throw invalid(`${label} must be one of ${spec.enum.join(', ')}`);
  } else if (spec.type === 'integer') {
    if (!Number.isInteger(value) || value < spec.minimum || value > spec.maximum) throw invalid(`${label} is outside its integer bounds`);
  }
}
