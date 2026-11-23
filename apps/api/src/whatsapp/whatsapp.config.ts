export const WHATSAPP_CONFIG = Symbol('WHATSAPP_CONFIG');
export const WHATSAPP_WEBHOOK_PATH = '/api/v1/webhooks/whatsapp';

export function whatsappEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === 'true';
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configura ${name} para habilitar WhatsApp.`);
  return value;
}

export function selectedWhatsAppProvider(): 'meta' | 'twilio' {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'meta';
  if (provider !== 'meta' && provider !== 'twilio') throw new Error('WHATSAPP_PROVIDER debe ser meta o twilio.');
  return provider;
}

export const TWILIO_WEBHOOK_PATH = '/api/v1/webhooks/twilio/whatsapp';

function loadMetaConfig() {
  const verifyToken = required('WHATSAPP_VERIFY_TOKEN');
  const appSecret = required('WHATSAPP_APP_SECRET');
  const accessToken = required('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = required('WHATSAPP_PHONE_NUMBER_ID');
  const version = required('WHATSAPP_GRAPH_API_VERSION');
  if (!/^\d{1,32}$/.test(phoneNumberId)) throw new Error('WHATSAPP_PHONE_NUMBER_ID debe ser numérico.');
  if (!/^v[1-9]\d?\.0$/.test(version)) throw new Error('WHATSAPP_GRAPH_API_VERSION debe usar el formato vNN.0.');
  return { provider: 'META' as const, recipientKey: phoneNumberId, verifyToken, appSecret, accessToken, phoneNumberId, version };
}

function loadTwilioConfig() {
  const accountSid = required('TWILIO_ACCOUNT_SID');
  const authToken = required('TWILIO_AUTH_TOKEN');
  const from = required('TWILIO_WHATSAPP_FROM');
  const webhookUrl = required('TWILIO_WEBHOOK_URL');
  const url = URL.parse(webhookUrl);
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) throw new Error('TWILIO_ACCOUNT_SID inválido.');
  if (!/^whatsapp:\+[1-9]\d{1,14}$/.test(from)) throw new Error('TWILIO_WHATSAPP_FROM debe usar whatsapp:+ seguido del número.');
  if (!url || url.protocol !== 'https:' || url.username || url.password || webhookUrl.includes('#') ||
      url.pathname !== TWILIO_WEBHOOK_PATH) throw new Error('TWILIO_WEBHOOK_URL debe ser la URL HTTPS pública del webhook Twilio.');
  return { provider: 'TWILIO' as const, recipientKey: accountSid + ':' + from, accountSid, authToken, from, webhookUrl };
}

export function loadWhatsAppConfig() {
  return selectedWhatsAppProvider() === 'meta' ? loadMetaConfig() : loadTwilioConfig();
}

export type MetaConfig = ReturnType<typeof loadMetaConfig>;
export type TwilioConfig = ReturnType<typeof loadTwilioConfig>;
export type WhatsAppConfig = ReturnType<typeof loadWhatsAppConfig>;
