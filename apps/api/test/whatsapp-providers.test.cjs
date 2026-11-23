require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const { loadWhatsAppConfig, selectedWhatsAppProvider } = require('../dist/whatsapp/whatsapp.config');
const { WhatsAppModule } = require('../dist/whatsapp/whatsapp.module');
const { WhatsAppService } = require('../dist/whatsapp/whatsapp.service');
const { WhatsAppMessageProcessor } = require('../dist/whatsapp/whatsapp-message-processor');
const { WhatsAppCloudApiClient } = require('../dist/whatsapp/whatsapp-cloud-api.client');
const { TwilioMessagingClient } = require('../dist/whatsapp/twilio-messaging.client');
const { WHATSAPP_SENDER, WhatsAppDeliveryError } = require('../dist/whatsapp/whatsapp-sender');
const { normalizeTwilio, verifyTwilioForm } = require('../dist/whatsapp/twilio-webhook');

const twilio = {
  provider: 'TWILIO', accountSid: 'AC' + '1'.repeat(32), authToken: 'synthetic-auth',
  from: 'whatsapp:+12025550100',
  webhookUrl: 'https://example.test/api/v1/webhooks/twilio/whatsapp',
};
twilio.recipientKey = twilio.accountSid + ':' + twilio.from;
const sid = 'SM' + '2'.repeat(32);

function env(t, values) {
  const keys = [...new Set([...Object.keys(values), ...Object.keys(process.env).filter((k) => /^(WHATSAPP_|TWILIO_)/.test(k))])];
  const previous = keys.map((k) => [k, process.env[k]]);
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('selección heredada, desactivación y enrutamiento al cliente del proveedor seleccionado', (t) => {
  env(t, { WHATSAPP_ENABLED: 'false' });
  assert.equal(selectedWhatsAppProvider(), 'meta');
  assert.equal(WhatsAppModule.register({}).controllers, undefined);
  process.env.WHATSAPP_PROVIDER = 'unknown';
  assert.throws(selectedWhatsAppProvider, /WHATSAPP_PROVIDER/);

  process.env.WHATSAPP_ENABLED = 'true';
  delete process.env.WHATSAPP_PROVIDER;
  assert.equal(WhatsAppModule.register({}).providers.find((p) => p.provide === WHATSAPP_SENDER).useExisting, WhatsAppCloudApiClient);
  process.env.WHATSAPP_PROVIDER = 'twilio';
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: twilio.accountSid, TWILIO_AUTH_TOKEN: twilio.authToken,
    TWILIO_WHATSAPP_FROM: twilio.from, TWILIO_WEBHOOK_URL: twilio.webhookUrl,
  });
  assert.deepEqual(loadWhatsAppConfig(), twilio);
  assert.equal(WhatsAppModule.register({}).providers.find((p) => p.provide === WHATSAPP_SENDER).useExisting, TwilioMessagingClient);
});

test('firma Twilio oficial, URL pública, parámetros repetidos y rechazo de alteraciones', () => {
  const config = { ...twilio, authToken: '12345', webhookUrl: 'https://example.com/myapp.php?foo=1&bar=2' };
  const form = Buffer.from('Digits=1234&To=%2B18005551212&From=%2B14158675310&Caller=%2B14158675310&CallSid=CA1234567890ABCDE');
  const signature = 'L/OH5YylLD5NRKLltdqwSvS0BnU=';
  assert.equal(verifyTwilioForm(form, signature, '/myapp.php?foo=1&bar=2', config).get('Digits'), '1234');
  assert.throws(() => verifyTwilioForm(form, signature, '/myapp.php?bar=2&foo=1', config), /Firma inválida/);
  assert.throws(() => verifyTwilioForm(Buffer.concat([form, Buffer.from('&Other=1')]), signature, '/myapp.php?foo=1&bar=2', config), /Firma inválida/);
  assert.throws(() => verifyTwilioForm(form, undefined, '/myapp.php?foo=1&bar=2', config), /Firma inválida/);
  const repeated = createHmac('sha1', twilio.authToken).update(twilio.webhookUrl + 'XaXb').digest('base64');
  assert.deepEqual(verifyTwilioForm(Buffer.from('X=b&X=a&X=a'), repeated, '/api/v1/webhooks/twilio/whatsapp', twilio).getAll('X'), ['b', 'a', 'a']);
});

test('Meta y Twilio normalizan al mismo formato y validan el destino', async () => {
  const now = new Date();
  const form = new URLSearchParams({
    MessageSid: sid, AccountSid: twilio.accountSid, From: 'whatsapp:+12025550101',
    To: twilio.from, Body: ' Hola ', NumMedia: '0', SmsStatus: 'received',
  });
  const twilioRow = normalizeTwilio(form, twilio, now);
  assert.equal(twilioRow.sender, '12025550101');
  assert.equal(twilioRow.provider, 'TWILIO');
  assert.equal(twilioRow.receivedAt, now);
  form.set('To', 'whatsapp:+12025550102');
  assert.equal(normalizeTwilio(form, twilio), undefined);

  const service = new WhatsAppService({ client: { whatsAppInbox: { createMany: async ({ data }) => {
    assert.equal(data.length, 1);
    assert.equal(data[0].provider, 'META');
    assert.equal(data[0].sender, twilioRow.sender);
    assert.deepEqual(data[0].input, twilioRow.input);
  } } } });
  await service.accept(Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [{
    changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '123' },
      messages: [{ type: 'text', id: 'wamid.fixture', from: '12025550101', timestamp: String(Math.floor(now / 1000)), text: { body: 'Hola' } }],
    } }],
  }] })), '123');
});

test('la cola usa inserción idempotente y el trabajador limita todas las escrituras a su proveedor y número', async () => {
  const data = ['META', 'TWILIO'].map((provider) => ({ provider, providerMessageId: sid, recipientKey: 'scope' }));
  const prisma = { client: { whatsAppInbox: {
    createMany: async (query) => assert.deepEqual(query, { data, skipDuplicates: true }),
    findFirst: async ({ where }) => {
      assert.equal(where.provider, 'TWILIO');
      assert.equal(where.recipientKey, twilio.recipientKey);
      return { providerMessageId: sid, status: 'READY', nextAttemptAt: new Date(), receivedAt: new Date(), attempts: 0, sender: '12025550101', reply: 'Hola' };
    },
    updateMany: async ({ where, data: update }) => {
      assert.equal(where.provider, 'TWILIO');
      assert.equal(where.recipientKey, twilio.recipientKey);
      if (update.status === 'SENT') assert.equal(update.outboundMessageId, sid);
      return { count: 1 };
    },
  } } };
  await new WhatsAppService(prisma).enqueue(data);
  let sent = 0;
  await new WhatsAppMessageProcessor(twilio, prisma, {}, {}, {
    sendText: async (...args) => { sent++; assert.deepEqual(args, ['12025550101', 'Hola']); return sid; },
  }).processNext();
  assert.equal(sent, 1);
});

test('Programmable Messaging usa el remitente de Twilio y solo reintenta rechazos 429', async (t) => {
  const client = new TwilioMessagingClient(twilio);
  const stub = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.twilio.com/2010-04-01/Accounts/' + twilio.accountSid + '/Messages.json');
    assert.equal(options.body.get('From'), twilio.from);
    assert.equal(options.body.get('To'), 'whatsapp:+12025550101');
    return Response.json({ sid, status: 'queued' }, { status: 201 });
  });
  assert.equal(await client.sendText('12025550101', 'Hola'), sid);
  stub.mock.mockImplementation(async () => new Response(null, { status: 429, headers: { 'Retry-After': '9' } }));
  await assert.rejects(client.sendText('12025550101', 'Hola'), (e) => e instanceof WhatsAppDeliveryError && e.retryable && e.retryAfterMs === 9000);
  stub.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(client.sendText('12025550101', 'Hola'), (e) => e instanceof WhatsAppDeliveryError && !e.retryable);
});
