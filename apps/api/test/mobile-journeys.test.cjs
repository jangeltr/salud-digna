require('reflect-metadata');
const assert = require('node:assert/strict');
const { beforeEach, afterEach, describe, test } = require('node:test');
const { ValidationPipe } = require('@nestjs/common');
const { MobileJourneysService } = require('../dist/mobile-journeys/mobile-journeys.service');
const { PublishMobileEventDto } = require('../dist/mobile-journeys/mobile-journeys.dto');

const journeyId = '00000000-0000-4000-8000-000000000001';
const studyId = '00000000-0000-4000-8000-000000000002';
const receiptId = '00000000-0000-4000-8000-000000000003';
const timestamp = '2026-11-24T06:31:00.000Z';
const token = Buffer.alloc(32, 7).toString('base64url');
const key = `${receiptId}.${token}`;
const session = { user: { id: 'synthetic-account', patientId: 'synthetic-patient', role: 'PATIENT' }, expiresAt: 9999999999 };
const body = {
  externalEventId: 'synthetic-study-1', type: 'JOURNEY_CONTEXT_UPDATED', schemaVersion: 1,
  occurredAt: timestamp, payload: { expectedVersion: 1, studyId },
};
const hasStatus = (status) => (error) => error.getStatus?.() === status;

function fixture(t, replies) {
  const calls = [];
  const service = new MobileJourneysService({ async issue(user, channel, expiresAt) {
    assert.equal(user.role, 'PATIENT');
    assert.deepEqual(channel, { code: 'demo-mobile', role: 'PATIENT' });
    assert.equal(expiresAt, session.expiresAt);
    return { assertion: 'synthetic-assertion' };
  } });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://orchestrator.example.test');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    calls.push({ path: url.pathname + url.search, ...options });
    const [status, json] = replies.shift();
    return Response.json(json, { status });
  });
  return { service, calls };
}

describe('mobile journeys integration', () => {
  const env = {
    MOBILE_ORCHESTRATOR_ORIGIN: 'https://orchestrator.example.test',
    MOBILE_ORCHESTRATOR_API_KEY: key,
  };
  let previous;
  beforeEach(() => {
    previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
    Object.assign(process.env, env);
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('lists active journeys and projects context after a channel-bound grant', async (t) => {
    const summary = { id: journeyId, type: 'APPOINTMENT', status: 'IN_PROGRESS', createdAt: timestamp, updatedAt: timestamp };
    const context = { journeyId, currentStep: 'SELECT_CLINIC', version: 2, updatedAt: timestamp };
    const { service, calls } = fixture(t, [
      [200, { items: [{ ...summary, assertion: 'private' }] }],
      [201, { journeyId, grant: token }],
      [200, { ...context, externalRefs: { studyId, patientId: receiptId }, grant: token }],
      [201, { journeyId, grant: token }],
      [200, { items: [{
        id: receiptId, type: 'JOURNEY_CREATED', producerCode: 'demo-web',
        occurredAt: timestamp, receivedAt: timestamp, schemaVersion: 1, data: { version: 1, secret: token },
      }] }],
    ]);
    assert.deepEqual(await service.list(session), { items: [summary] });
    assert.deepEqual(await service.context(session, journeyId), { ...context, externalRefs: { studyId } });
    assert.deepEqual((await service.history(session, journeyId, { limit: 2 })).items[0].data, { version: 1 });
    assert.deepEqual(calls.map(({ path }) => path), [
      '/api/v1/journeys?active=true', `/api/v1/journeys/${journeyId}/access-grants`, `/api/v1/journeys/${journeyId}/context`,
      `/api/v1/journeys/${journeyId}/access-grants`, `/api/v1/journeys/${journeyId}/history?limit=2`,
    ]);
    assert.equal(calls[1].headers['X-Patient-Assertion'], 'synthetic-assertion');
    assert.equal(calls[2].headers['X-Journey-Grant'], token);
    assert.equal(calls[2].headers['X-Patient-Assertion'], undefined);
  });

  test('scopes creation retries to the account and event retries to the journey', async (t) => {
    const create = [201, { id: journeyId, status: 'DRAFT', grant: token }];
    const permission = [201, { journeyId, grant: token }];
    const event = [201, { id: receiptId, journeyId, grant: token }];
    const { service, calls } = fixture(t, [create, create, create, permission, event, permission, event]);
    const result = await service.create(session, token, { type: 'APPOINTMENT' });
    assert.deepEqual(result, { id: journeyId, status: 'DRAFT' });
    await service.create(session, token, { type: 'APPOINTMENT' });
    await service.create({ ...session, user: { ...session.user, id: 'other-account' } }, token, { type: 'APPOINTMENT' });
    assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
    assert.notEqual(calls[0].headers['Idempotency-Key'], calls[2].headers['Idempotency-Key']);
    assert.deepEqual(await service.publish(session, journeyId, body), { id: receiptId, journeyId });
    await service.publish(session, journeyId, body);
    assert.deepEqual(JSON.parse(calls[4].body), JSON.parse(calls[6].body));
    assert.equal(JSON.parse(calls[4].body).journeyId, journeyId);
    assert.match(JSON.parse(calls[4].body).externalEventId, /^mobile:[\w-]{43}$/);
  });

  test('rejects extra event fields and stops before publication when authorization fails', async (t) => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await assert.rejects(pipe.transform({ ...body, payload: { ...body.payload, notes: 'not permitted' } }, {
      type: 'body', metatype: PublishMobileEventDto,
    }), hasStatus(400));
    const { service, calls } = fixture(t, [[404, { details: 'not public' }]]);
    await assert.rejects(service.publish(session, journeyId, body), (error) => hasStatus(404)(error) &&
      !JSON.stringify(error.getResponse()).includes('not public'));
    assert.equal(calls.length, 1);
  });
});
