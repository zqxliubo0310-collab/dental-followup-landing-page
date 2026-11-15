const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/pilot-application');

async function submit(body, ip) {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } };
  let response;
  const res = {
    setHeader() {},
    end(text) { response = { status: this.statusCode, body: JSON.parse(text) }; }
  };
  await handler(req, res);
  return response;
}

test('pilot form reports success only after notification and sends practice fields only', async () => {
  const previous = Object.fromEntries(['RESEND_API_KEY', 'PRAXORA_FROM_EMAIL', 'PRAXORA_NOTIFICATION_EMAIL'].map(k => [k, process.env[k]]));
  const originalFetch = global.fetch;
  const originalError = console.error;
  const body = {
    name: 'Alex', email: 'alex@example.com', practice_name: 'Example Dental',
    role: 'office_manager', workflow: 'unscheduled_treatment', locations: '1',
    country: 'united_kingdom', pms: 'dentally', language: 'english', channel: 'whatsapp',
    source_page: 'maxassist-alternatives', campaign: 'pilot-fit',
    utm_source: 'newsletter', utm_campaign: 'ads',
    consent: true, patient_details: 'should not be sent', patient_file: 'patients.csv'
  };
  try {
    console.error = () => {};
    process.env.RESEND_API_KEY = 'test-key';
    process.env.PRAXORA_FROM_EMAIL = 'hello@example.com';
    process.env.PRAXORA_NOTIFICATION_EMAIL = 'founder@example.com';
    let mail;
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      mail = JSON.parse(options.body);
      return { ok: true, text: async () => '{}' };
    };
    assert.equal((await submit(body, '198.51.100.41')).status, 200);
    assert.equal(mail.to, 'founder@example.com');
    assert.match(mail.text, /Example Dental/);
    assert.match(mail.text, /Country: United Kingdom/);
    assert.match(mail.text, /PMS: Dentally/);
    assert.match(mail.text, /Language: English/);
    assert.match(mail.text, /Contact channel: WhatsApp/);
    assert.match(mail.text, /Source page: maxassist-alternatives/);
    assert.match(mail.text, /Campaign: pilot-fit/);
    assert.match(mail.text, /UTM Campaign: ads/);
    assert.doesNotMatch(mail.text, /patient_details|should not be sent|patients\.csv/);

    global.fetch = async () => ({ ok: false, status: 503, text: async () => '{}' });
    const unavailable = await submit(body, '198.51.100.42');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.success, false);
    assert.equal((await submit({ ...body, workflow: 'unknown' }, '198.51.100.43')).status, 400);
    assert.equal((await submit({ ...body, consent: false }, '198.51.100.44')).status, 400);
    assert.equal((await submit({ ...body, country: '' }, '198.51.100.45')).status, 400);
    assert.equal((await submit({ ...body, pms: 'certified_badge' }, '198.51.100.46')).status, 400);
    assert.equal((await submit({ ...body, language: 'patient-note' }, '198.51.100.47')).status, 400);
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      mail = JSON.parse(options.body);
      return { ok: true, text: async () => '{}' };
    };
    const noPms = await submit({ ...body, pms: 'none', language: '', channel: '', source_page: '', campaign: '' }, '198.51.100.48');
    assert.equal(noPms.status, 200);
    assert.match(mail.text, /PMS: No PMS/);
    assert.match(mail.text, /Source page: \n/);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
