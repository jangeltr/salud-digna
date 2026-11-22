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

export function loadWhatsAppConfig() {
  const verifyToken = required('WHATSAPP_VERIFY_TOKEN');
  const appSecret = required('WHATSAPP_APP_SECRET');
  const accessToken = required('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = required('WHATSAPP_PHONE_NUMBER_ID');
  const version = required('WHATSAPP_GRAPH_API_VERSION');
  if (!/^\d{1,32}$/.test(phoneNumberId)) throw new Error('WHATSAPP_PHONE_NUMBER_ID debe ser numérico.');
  if (!/^v[1-9]\d?\.0$/.test(version)) throw new Error('WHATSAPP_GRAPH_API_VERSION debe usar el formato vNN.0.');
  return { verifyToken, appSecret, accessToken, phoneNumberId, version };
}

export type WhatsAppConfig = ReturnType<typeof loadWhatsAppConfig>;
