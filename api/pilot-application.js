const {
  sendJson, readJson, cleanString, normalizeEmail, isValidEmail,
  requireMethod, enforceRateLimit, readEnv, sendEmail, getUtmFields
} = require('./_utils');

const ROLES = new Set(['owner', 'office_manager', 'clinician', 'other']);
const WORKFLOWS = new Set(['unscheduled_treatment', 'missed_calls', 'overdue_recall']);
const LOCATIONS = new Set(['1', '2-5', '6+']);
const COUNTRIES = {
  united_kingdom: 'United Kingdom',
  ireland: 'Ireland',
  europe_other: 'Europe, outside the UK and Ireland',
  singapore: 'Singapore',
  malaysia: 'Malaysia',
  southeast_asia_other: 'Other Southeast Asia',
  australia: 'Australia',
  new_zealand: 'New Zealand',
  united_states: 'United States',
  canada: 'Canada',
  other: 'Other'
};
const PMS_SYSTEMS = {
  dentally: 'Dentally',
  exact: 'Software of Excellence EXACT',
  dentrix: 'Dentrix',
  open_dental: 'Open Dental',
  other: 'Other',
  none: 'No PMS'
};
const LANGUAGES = {
  english: 'English',
  malay: 'Malay',
  chinese: 'Chinese',
  tamil: 'Tamil',
  thai: 'Thai',
  vietnamese: 'Vietnamese',
  other: 'Another language'
};
const CHANNELS = {
  phone: 'Phone',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  unsure: 'Not sure yet'
};

function optionalLabel(map, value) {
  if (!value) return '';
  return map[value] || '';
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res)) return;
  try {
    const limit = await enforceRateLimit(req, 'pilot-application');
    if (!limit.allowed) return sendJson(res, 429, { success: false, error: 'Too many requests. Please try again later.' });
  } catch (error) {
    console.error('Pilot rate limit failed', error);
    return sendJson(res, 503, { success: false, error: 'Unable to submit right now. Please try again later.' });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return sendJson(res, 400, { success: false, error: 'Please check your application.' });
  }
  if (cleanString(payload.company_website, 200)) return sendJson(res, 200, { success: true });

  const name = cleanString(payload.name, 120);
  const email = normalizeEmail(payload.email);
  const practice = cleanString(payload.practice_name, 160);
  const role = cleanString(payload.role, 80);
  const workflow = cleanString(payload.workflow, 80);
  const locations = cleanString(payload.locations, 20);
  const country = cleanString(payload.country, 80);
  const pms = cleanString(payload.pms, 80);
  const language = cleanString(payload.language, 80);
  const channel = cleanString(payload.channel, 80);
  const sourcePage = cleanString(payload.source_page, 80);
  const campaign = cleanString(payload.campaign, 80);
  if (!name || !isValidEmail(email) || !practice || !ROLES.has(role) || !WORKFLOWS.has(workflow)
      || !LOCATIONS.has(locations) || !COUNTRIES[country] || !PMS_SYSTEMS[pms]
      || (language && !LANGUAGES[language]) || (channel && !CHANNELS[channel])
      || payload.consent !== true) {
    return sendJson(res, 400, { success: false, error: 'Complete the required practice fields and consent.' });
  }

  const recipient = readEnv('PRAXORA_NOTIFICATION_EMAIL');
  if (!recipient) return sendJson(res, 503, { success: false, error: 'Unable to submit right now. Please try again later.' });
  const utm = getUtmFields(payload);
  const lines = [
    `Name: ${name}`,
    `Work email: ${email}`,
    `Practice: ${practice}`,
    `Role: ${role}`,
    `Primary follow-up workflow: ${workflow}`,
    `Locations: ${locations}`,
    `Country: ${COUNTRIES[country]}`,
    `PMS: ${PMS_SYSTEMS[pms]}`,
    `Language: ${optionalLabel(LANGUAGES, language)}`,
    `Contact channel: ${optionalLabel(CHANNELS, channel)}`,
    'Consent: Requested contact about a possible pilot',
    `Source page: ${sourcePage}`,
    `Campaign: ${campaign}`,
    `UTM Source: ${utm.utm_source}`,
    `UTM Medium: ${utm.utm_medium}`,
    `UTM Campaign: ${utm.utm_campaign}`,
    `UTM Content: ${utm.utm_content}`
  ];
  try {
    await sendEmail({
      to: recipient,
      subject: 'New Praxora pilot application',
      text: lines.join('\n')
    });
  } catch (error) {
    console.error('Pilot application delivery failed', error);
    return sendJson(res, 503, { success: false, error: 'Unable to submit right now. Please try again later.' });
  }
  return sendJson(res, 200, { success: true });
};
