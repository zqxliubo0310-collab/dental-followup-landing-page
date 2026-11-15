const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = {
  home: fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  comparison: fs.readFileSync(path.join(root, 'resources/comparison.html'), 'utf8'),
  alternatives: fs.readFileSync(path.join(root, 'resources/maxassist-alternatives-dental-follow-up/index.html'), 'utf8'),
  llms: fs.readFileSync(path.join(root, 'llms.txt'), 'utf8')
};

test('pilot pages keep canonicals and separate available, proposed, and excluded scope', () => {
  function canonical(html) {
    const match = html.match(/<link[^>]*rel="canonical"[^>]*>/);
    return match[0].match(/href="([^"]+)"/)[1];
  }
  assert.equal(canonical(pages.home), 'https://www.getpraxora.com/');
  assert.equal(canonical(pages.comparison), 'https://www.getpraxora.com/resources/comparison.html');
  assert.equal(canonical(pages.alternatives), 'https://www.getpraxora.com/resources/maxassist-alternatives-dental-follow-up/');
  assert.match(pages.home, /<h1>Recover unscheduled treatment<br>before it goes cold\.<\/h1>/);
  assert.match(pages.comparison, /<h1>Praxora vs\. Legacy Dental Patient Engagement Platforms<\/h1>/);
  assert.match(pages.alternatives, /<h1>MaxAssist Alternatives for Dental Follow-Up: What Practices Should Compare<\/h1>/);
  for (const html of [pages.home, pages.comparison, pages.alternatives]) {
    assert.match(html, /Available now/);
    assert.match(html, /Proposed pilot|Proposed\./);
    assert.match(html, /Not provided/);
    assert.match(html, /Dentally/);
    assert.match(html, /Software of Excellence EXACT/);
    assert.match(html, /USD 49\.50/);
    assert.equal(html.includes('type="file"'), false);
  }
  for (const phrase of ['GDPR-compliant', 'GDPR compliant', 'GDPR-friendly', 'GDPR friendly', 'HIPAA', 'doubled conversion']) {
    for (const html of Object.values(pages)) assert.equal(html.includes(phrase), false, phrase);
  }
  assert.match(pages.alternatives, /not unique/);
  assert.match(pages.alternatives, /task history/);
  assert.match(pages.llms, /not live/);
  assert.match(pages.llms, /does not convert/);
});
