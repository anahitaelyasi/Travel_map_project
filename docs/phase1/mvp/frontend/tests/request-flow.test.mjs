import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Exercise the actual migrated click-handler with a fake API and fake DOM.
// The real React layout is intentionally not replaced or modified.
const source = readFileSync(new URL('../src/legacy/controller.js', import.meta.url), 'utf8');
const start = source.indexOf('        async function sendRideRequest() {');
const end = source.indexOf('\n        function cancelOrNevermind() {', start);
assert.ok(start >= 0 && end > start, 'Expected handler in legacy controller');
const handler = source.slice(start, end).trim();
const createHandler = new Function(
  'currentSelectedTraveler', 'currentUser', 'activeOutboundRequests', '$', 'showToast',
  'apiFetch', 'API_BASE', 'setInterval', 'clearInterval', 'backToTravelersList',
  'openPermGroupsPanel', 'switchHTab', 'loadAcceptedRequests', 'loadChatMessages', 'console',
  `return ${handler}`,
);

function mockElement() {
  const states = new Set();
  const attrs = new Map();
  return {
    classList: {
      add: (s) => states.add(s),
      remove: (s) => states.delete(s),
      contains: (s) => states.has(s),
    },
    innerHTML: '', className: '',
    setAttribute: (key, value) => attrs.set(key, String(value)),
    getAttribute: (key) => attrs.get(key) || null,
    removeAttribute: (key) => attrs.delete(key),
  };
}

function setup(response) {
  const requests = [];
  const toasts = [];
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, mockElement()); return elements.get(id); };
  const activeOutboundRequests = {};
  const group = { id: 1000007, members: [{ id: 2, name: 'Ana' }], member_count: 1 };
  const user = { id: 1, name: 'Sara', avatar: '' };
  const fn = createHandler(group, user, activeOutboundRequests, $, (message) => toasts.push(message),
    async (url, options) => { requests.push({ url, options }); return response; }, '/api',
    () => 123, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, console);
  return { fn, requests, toasts, elements, activeOutboundRequests, $ };
}

test('ride request uses members[].id, not synthetic trip group ID, and only marks it sent after success', async () => {
  const ctx = setup({ ok: true, json: async () => ({ success: true, request_id: 42 }) });
  await ctx.fn();
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.requests[0].url, '/api/requests');
  const body = JSON.parse(ctx.requests[0].options.body);
  assert.equal(body.sender_id, 1);
  assert.equal(body.receiver_id, 2);
  assert.notEqual(body.receiver_id, 1000007);
  assert.equal(ctx.activeOutboundRequests[2].reqId, 42);
  assert.equal(ctx.$('btn-cancel-req').getAttribute('data-target-id'), '2');
  assert.match(ctx.$('request-status-box').innerHTML, /درخواست ارسال شد/);
});

test('rejected API request does not create false pending status and allows retry', async () => {
  const ctx = setup({ ok: false, json: async () => ({ error: 'همسفر موردنظر دیگر در دسترس نیست.' }) });
  await ctx.fn();
  assert.deepEqual(Object.keys(ctx.activeOutboundRequests), []);
  assert.equal(ctx.$('request-status-box').classList.contains('hidden'), true);
  assert.equal(ctx.$('btn-send-req').classList.contains('hidden'), false);
  assert.equal(ctx.$('btn-cancel-req').getAttribute('data-target-id'), null);
  assert.match(ctx.toasts[0], /در دسترس نیست/);
});

test('incoming requests are polled even when the Hamsafar panel is closed', () => {
  const polling = source.slice(source.indexOf('function startTravelerPolling()'), source.indexOf('function stopTravelerPolling()'));
  assert.ok(polling.indexOf('await pollIncomingRequests();') > 0);
  assert.ok(polling.indexOf('await pollIncomingRequests();') < polling.indexOf('if (hamsafarOpen) {'));
});

test('request to converted group includes permanent group ID', async () => {
  const requests = [];
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, mockElement()); return elements.get(id); };
  const group = { id: 2000042, perm_group_id: 42, members: [{ id: 7, name: 'Ana' }, { id: 8, name: 'Sara' }], member_count: 2 };
  const fn = createHandler(group, { id: 9, name: 'Mahan', avatar: '' }, {}, $, () => {},
    async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({success:true, request_id:100}) }; },
    '/api', () => 123, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, console);
  await fn();
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.perm_group_id, 42);
  assert.equal(body.receiver_id, 7);
  assert.notEqual(body.receiver_id, group.id);
});

test('incoming permanent join requests have their own poll and permanent chat rendering', () => {
  assert.match(source, /requests\/incoming-permanent/);
  assert.match(source, /perm_groups\/\$\{activePermGroupId\}\/requests/);
  assert.match(source, /if \(globalPermanentPendingRequests\.length > 0\)/);
  assert.match(source, /openPermGroupsPanel\(globalPermanentPendingRequests\[0\]\.perm_group_id\)/);
  assert.match(source, /html \+= pending\.map\(req =>/);
});

test('logout waits for backend, and the old temporary group is not published again', () => {
  const logout = source.slice(source.indexOf('function confirmLogout()'), source.indexOf('queueMicrotask(() => {', source.indexOf('function confirmLogout()')));
  assert.match(logout, /await apiFetch\(`\$\{API_BASE\}\/logout`/);
  assert.ok(logout.indexOf('await apiFetch') < logout.indexOf('currentUser = null'));
  assert.match(logout, /stopTravelerPolling\(\)/);
  assert.match(logout, /window\.myGroupMemberCount = 1/);
});
