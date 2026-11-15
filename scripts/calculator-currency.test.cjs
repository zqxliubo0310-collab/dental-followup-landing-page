const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatMoney, normalizeCurrency, computeOpportunities, labelCurrencyNodes } = require('../dental-revenue-leak-calculator/calculator');
const { formatCurrency } = require('../api/_utils');
const leadHandler = require('../api/lead');

const illustrative = {
  dailyCalls: 40,
  missedCallRate: 0.10,
  missedCallFollowupRate: 0.50,
  averageNewPatientValue: 500,
  knowsUnscheduledValue: 'yes',
  unscheduledTreatmentValue: 250000,
  unscheduledFollowupFactor: 0.40,
  unscheduledFollowupProcess: 'staff_time',
  overdueRecallCount: 300,
  averageRecallValue: 180,
  recallWorkflowFactor: 0.30,
  recallWorkflowStatus: 'partial',
  missedCallRateKey: 'unknown',
  missedCallFollowupKey: 'unknown'
};

test('currency selection renames amounts and keeps the original numbers, including zero', () => {
  const gbp = computeOpportunities({ ...illustrative, currency: 'GBP' });
  const eur = computeOpportunities({ ...illustrative, currency: 'EUR' });
  assert.equal(gbp.missedCallOpportunity, 5500);
  assert.equal(gbp.unscheduledTreatmentOpportunity, 100000);
  assert.equal(gbp.recallOpportunity, 16200);
  assert.deepEqual(
    [gbp.missedCallOpportunity, gbp.unscheduledTreatmentOpportunity, gbp.recallOpportunity, gbp.missedCallScore, gbp.recallScore],
    [eur.missedCallOpportunity, eur.unscheduledTreatmentOpportunity, eur.recallOpportunity, eur.missedCallScore, eur.recallScore]
  );

  const zero = computeOpportunities({
    ...illustrative,
    averageNewPatientValue: 0,
    unscheduledTreatmentValue: 0,
    averageRecallValue: 0
  });
  assert.equal(zero.missedCallOpportunity, 0);
  assert.equal(zero.unscheduledTreatmentOpportunity, 0);
  assert.equal(zero.recallOpportunity, 0);
  assert.equal(formatMoney(0, 'USD'), 'USD 0');
  assert.equal(formatMoney(0, 'GBP'), '£0');
  assert.equal(formatMoney(0, 'EUR'), '€0');
  assert.equal(formatMoney(0, 'AUD'), 'AUD 0');
  assert.equal(formatMoney(0, 'SGD'), 'SGD 0');
  assert.equal(formatMoney(0.4, 'EUR'), '€0');
  assert.equal(formatCurrency(0, 'SGD'), 'SGD 0');
  assert.equal(formatMoney(5500, 'JPY'), 'USD 5,500');
  assert.equal(normalizeCurrency('eur'), 'EUR');
  assert.equal(formatCurrency(5500, 'GBP'), '£5,500');
  assert.equal(formatCurrency(100000, 'AUD'), 'AUD 100,000');
  assert.notEqual(formatCurrency(49.5, 'EUR'), '€49.50');
});

test('label updates do not rewrite the typed amount', () => {
  const code = { textContent: 'USD' };
  const amount = { textContent: 'USD 5,500', getAttribute: () => '5500' };
  const zero = { textContent: 'USD 0', getAttribute: () => '0' };
  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-currency-code]') return [code];
      if (selector === '[data-money-amount]') return [amount, zero];
      return [];
    }
  };
  assert.equal(labelCurrencyNodes(root, 'EUR'), 'EUR');
  assert.equal(code.textContent, 'EUR');
  assert.equal(amount.textContent, '€5,500');
  assert.equal(amount.getAttribute('data-money-amount'), '5500');
  assert.equal(zero.textContent, '€0');
  labelCurrencyNodes(root, 'SGD');
  assert.equal(amount.textContent, 'SGD 5,500');
  assert.equal(zero.textContent, 'SGD 0');
});

test('calculator page keeps USD introductory price outside convertible amounts', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dental-revenue-leak-calculator/index.html'), 'utf8');
  for (const code of ['GBP', 'EUR', 'USD', 'AUD', 'SGD']) assert.match(html, new RegExp(`value="${code}"`));
  assert.match(html, /USD 49\.50 per month/);
  assert.equal(html.includes('data-money-amount="49.5"'), false);
  assert.equal(html.includes('data-money-amount="49.50"'), false);
  assert.match(html, /does not convert them/);
  const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(home, /USD 49\.50 per month for the first 6 months/);
  assert.equal(home.includes('type="file"'), false);
});

function leadRequest(body, ip) {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } };
  let response;
  const res = { setHeader() {}, end(text) { response = { status: this.statusCode, body: JSON.parse(text) }; } };
  return leadHandler(req, res).then(() => response);
}

test('lead email uses the selected currency without converting the estimate or the USD price', async () => {
  const previous = Object.fromEntries(['RESEND_API_KEY', 'PRAXORA_FROM_EMAIL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const originalError = console.error;
  const payload = {
    first_name: 'Ada', email: 'ada@example.com', practice_name: 'Example Dental',
    daily_calls: 40, missed_call_rate: 'unknown', missed_call_followup_rate: 'unknown',
    average_new_patient_value: 500, knows_unscheduled_value: 'yes', unscheduled_treatment_value: 250000,
    unscheduled_followup_process: 'staff_time', overdue_recall_count: 300, average_recall_value: 180,
    recall_workflow_status: 'partial'
  };
  try {
    console.error = () => {};
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.RESEND_API_KEY = 'test-key';
    process.env.PRAXORA_FROM_EMAIL = 'hello@example.com';
    const messages = [];
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      messages.push(JSON.parse(options.body));
      return { ok: true, text: async () => '{}' };
    };
    const gbp = await leadRequest({ ...payload, display_currency: 'GBP' }, '198.51.100.61');
    const usd = await leadRequest({ ...payload, display_currency: 'usd' }, '198.51.100.62');
    const zero = await leadRequest({
      ...payload,
      display_currency: 'EUR',
      daily_calls: 1,
      missed_call_rate: 'less_than_5',
      missed_call_followup_rate: 'almost_all',
      average_new_patient_value: 1,
      unscheduled_treatment_value: 1,
      unscheduled_followup_process: 'consistent',
      overdue_recall_count: 1,
      average_recall_value: 1,
      recall_workflow_status: 'consistent'
    }, '198.51.100.63');
    assert.equal(gbp.status, 200);
    assert.deepEqual(gbp.body.results, usd.body.results);
    assert.equal(gbp.body.results.missed_call_opportunity, 5500);
    assert.equal(gbp.body.results.unscheduled_treatment_opportunity, 100000);
    assert.equal(gbp.body.results.recall_opportunity, 16200);
    assert.match(messages[0].text, /£5,500/);
    assert.match(messages[0].text, /£100,000/);
    assert.match(messages[0].text, /£16,200/);
    assert.match(messages[0].text, /USD 49\.50 per month/);
    assert.match(messages[0].text, /were not converted/);
    assert.doesNotMatch(messages[0].text, /£49|€49/);
    assert.match(messages[1].text, /USD 5,500/);
    assert.equal(zero.body.results.missed_call_opportunity, 0);
    assert.equal(zero.body.results.unscheduled_treatment_opportunity, 0);
    assert.equal(zero.body.results.recall_opportunity, 0);
    assert.match(messages[2].text, /€0/);
    assert.match(messages[2].text, /USD 49\.50 per month/);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
