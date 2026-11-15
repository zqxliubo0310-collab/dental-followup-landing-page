const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptSource = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const pilotSource = fs.readFileSync(path.join(__dirname, '../assets/pilot-application.js'), 'utf8');

function loadScript({ search, blockedStorage = false, sourceNode = null } = {}) {
  const values = new Map();
  const context = vm.createContext({
    URLSearchParams,
    console: { info() {} },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: (selector) => (selector === '[data-source-page]' && sourceNode ? [sourceNode] : []),
      createElement: () => ({}),
      head: { appendChild() {} },
      body: { dataset: {} }
    },
    sessionStorage: {
      setItem(key, value) { if (blockedStorage) throw new Error('SecurityError'); values.set(key, value); },
      getItem(key) { if (blockedStorage) throw new Error('SecurityError'); return values.get(key) || null; }
    },
    fetch: () => Promise.resolve({ ok: false, json: async () => ({}) })
  });
  context.window = context;
  context.location = { hostname: 'localhost', search };
  vm.runInContext(scriptSource, context);
  return context;
}

test('CTA source stays out of the analytics UTM object and reaches form attribution', () => {
  const node = {
    getAttribute(name) {
      return { 'data-source-page': 'home', 'data-campaign': 'discuss-pilot' }[name] || '';
    },
    addEventListener(type, fn) { this.listeners = { ...this.listeners, [type]: fn }; }
  };
  const context = loadScript({ search: '?utm_source=newsletter&utm_campaign=ads', sourceNode: node });
  assert.deepEqual(Object.keys(context.PraxoraUtm.get()).sort(), ['utm_campaign', 'utm_content', 'utm_medium', 'utm_source']);
  assert.equal(context.PraxoraUtm.get().utm_campaign, 'ads');
  assert.equal(context.PraxoraUtm.getAttribution().source_page, '');
  node.listeners.click();
  const attribution = context.PraxoraUtm.getAttribution();
  assert.equal(attribution.source_page, 'home');
  assert.equal(attribution.campaign, 'discuss-pilot');
  assert.equal(attribution.utm_source, 'newsletter');
  assert.equal(Object.hasOwn(context.PraxoraUtm.get(), 'source_page'), false);
});

test('query-string source and campaign survive blocked storage', () => {
  const context = loadScript({
    search: '?source_page=maxassist-alternatives&campaign=pilot-fit&utm_campaign=ads',
    blockedStorage: true
  });
  const attribution = context.PraxoraUtm.getAttribution();
  assert.equal(attribution.source_page, 'maxassist-alternatives');
  assert.equal(attribution.campaign, 'pilot-fit');
  assert.equal(attribution.utm_campaign, 'ads');
});

test('pilot form posts country, PMS, and source without patient fields or analytics', async () => {
  const requests = [];
  const events = [];
  const status = { classList: { remove() {}, add() {} }, textContent: '' };
  const button = { disabled: false };
  const consent = { checked: true };
  const form = {
    reportValidity: () => true,
    reset() { this.reset = true; },
    querySelector(selector) {
      if (selector === '[data-pilot-status]') return status;
      if (selector === 'button[type="submit"]') return button;
      if (selector === '[name="consent"]') return consent;
      return null;
    },
    addEventListener(type, fn) { this.listeners = { ...this.listeners, [type]: fn }; }
  };
  const context = vm.createContext({
    URLSearchParams,
    console: { info() {} },
    FormData: function FormData() {
      return {
        entries() {
          return [
            ['name', 'Alex'],
            ['email', 'alex@example.com'],
            ['practice_name', 'Example Dental'],
            ['role', 'owner'],
            ['workflow', 'missed_calls'],
            ['locations', '2-5'],
            ['country', 'singapore'],
            ['pms', 'exact'],
            ['language', ''],
            ['channel', 'email'],
            ['patient_file', 'patients.csv'],
            ['patient_details', 'should not be sent']
          ];
        }
      };
    },
    document: { querySelector: (selector) => (selector === '[data-pilot-form]' ? form : null) },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ success: true }) };
    }
  });
  context.window = context;
  context.location = { search: '' };
  context.PraxoraUtm = { getAttribution: () => ({ utm_source: '', utm_medium: '', utm_campaign: 'ads', utm_content: '', source_page: 'home', campaign: 'discuss-pilot' }) };
  context.trackEvent = (...args) => events.push(args);
  vm.runInContext(pilotSource, context);
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/pilot-application');
  assert.equal(requests[0].body.country, 'singapore');
  assert.equal(requests[0].body.pms, 'exact');
  assert.equal(requests[0].body.channel, 'email');
  assert.equal(requests[0].body.source_page, 'home');
  assert.equal(requests[0].body.campaign, 'discuss-pilot');
  assert.equal(requests[0].body.utm_campaign, 'ads');
  assert.equal(requests[0].body.consent, true);
  assert.equal(Object.hasOwn(requests[0].body, 'patient_file'), false);
  assert.equal(Object.hasOwn(requests[0].body, 'patient_details'), false);
  assert.equal(events.length, 0);
});
