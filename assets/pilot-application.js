'use strict';

const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'source_page', 'campaign'];

function attribution() {
  if (window.PraxoraUtm && typeof window.PraxoraUtm.getAttribution === 'function') {
    return window.PraxoraUtm.getAttribution();
  }
  const params = new URLSearchParams(location.search);
  return ATTRIBUTION_KEYS.reduce((values, key) => {
    values[key] = params.get(key) || '';
    return values;
  }, {});
}

const pilotForm = document.querySelector('[data-pilot-form]');
if (pilotForm) {
  const status = pilotForm.querySelector('[data-pilot-status]');
  const submit = pilotForm.querySelector('button[type="submit"]');
  pilotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pilotForm.reportValidity()) return;
    status.classList.remove('error');
    status.textContent = 'Submitting your inquiry…';
    submit.disabled = true;
    const payload = Object.fromEntries(new FormData(pilotForm).entries());
    payload.consent = pilotForm.querySelector('[name="consent"]').checked;
    const source = attribution();
    ATTRIBUTION_KEYS.forEach((key) => {
      payload[key] = source[key] || '';
    });
    delete payload.patient_file;
    delete payload.patient_details;
    try {
      const response = await fetch('/api/pilot-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to submit right now.');
      pilotForm.reset();
      status.textContent = 'Inquiry received. We will contact you about pilot fit. This is not product access or billing.';
    } catch (error) {
      status.textContent = error.message || 'Unable to submit right now. Please try again later.';
      status.classList.add('error');
    } finally {
      submit.disabled = false;
    }
  });
}
