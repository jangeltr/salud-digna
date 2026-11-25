require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, verify } = require('node:crypto');
const { afterEach, beforeEach, describe, test } = require('node:test');
const { PatientAssertionChannelGuard } = require('../dist/auth/patient-assertions.controller');
const { PatientAssertionsService } = require('../dist/auth/patient-assertions.service');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const webKey = Buffer.alloc(32, 1);
const callCenterKey = Buffer.alloc(32, 2);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const env = {
  PATIENT_ASSERTION_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  PATIENT_ASSERTION_CHANNELS: JSON.stringify({
    'demo-web': { role: 'PATIENT', secretDigest: digest(webKey) },
    'demo-callcenter': { role: 'ADVISOR', secretDigest: digest(callCenterKey) },
  }),
};
const patient = { id: '00000000-0000-4000-8000-000000000001', patientId: '00000000-0000-4000-8000-000000000002', role: 'PATIENT' };
const advisor = { id: '00000000-0000-4000-8000-000000000003', patientId: null, role: 'ADVISOR' };
const activeUntil = () => Math.floor(Date.now() / 1000) + 120;
const hasStatus = (status) => (error) => error.getStatus?.() === status;

function fixture(patientIsActive = true) {
  return new PatientAssertionsService({ client: { user: { async findUnique({ where }) {
    if (where.id === advisor.id && where.isActive && where.role === 'ADVISOR') return { id: advisor.id };
    if (where.patientId === patient.patientId && where.isActive && where.role === 'PATIENT' && patientIsActive) {
      return { patientId: patient.patientId };
    }
    return null;
  } } } });
}

function claimsOf(assertion) {
  const [header, payload, signature] = assertion.split('.');
  assert.equal(Buffer.from(header, 'base64url').toString(), '{"alg":"EdDSA","typ":"sd-patient+jwt"}');
  assert.ok(verify(null, Buffer.from(header + '.' + payload), publicKey, Buffer.from(signature, 'base64url')));
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.deepEqual(Object.keys(claims), ['iss', 'aud', 'channel', 'scope', 'customerId', 'sub', 'jti', 'iat', 'exp']);
  assert.equal(claims.iss, 'https://api.salud-digna.app');
  assert.equal(claims.aud, 'https://orchestrator.salud-digna.app');
  assert.equal(claims.scope, 'journeys:patient');
  assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 300);
  return claims;
}

describe('institutional assertion issuance', () => {
  let previous;
  beforeEach(() => {
    previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('authenticates the backend separately and derives the patient UUID and lifetime from the verified session', async () => {
    const service = fixture();
    const guard = new PatientAssertionChannelGuard(service);
    const request = { headers: { 'x-patient-assertion-channel-key': webKey.toString('base64url') } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    assert.equal(guard.canActivate(context), true);
    const deadline = activeUntil();
    const { assertion } = await service.issue(patient, request.assertionChannel, deadline);
    const claims = claimsOf(assertion);
    assert.equal(claims.customerId, patient.patientId);
    assert.equal(claims.sub, patient.id);
    assert.equal(claims.channel, 'demo-web');
    assert.equal(claims.exp, deadline);
    request.headers.origin = 'https://browser.example.test';
    assert.throws(() => guard.canActivate(context), hasStatus(403));
    assert.throws(() => service.authenticate(Buffer.alloc(32, 3).toString('base64url')), hasStatus(401));
    await assert.rejects(service.issue(patient, request.assertionChannel, deadline, patient.patientId), hasStatus(400));
  });

  test('accepts only consent from that patient for the exact advisor and destination channel', async () => {
    const service = fixture();
    const web = service.authenticate(webKey.toString('base64url'));
    const callCenter = service.authenticate(callCenterKey.toString('base64url'));
    const deadline = activeUntil();
    const { consent } = await service.consent(patient, web, deadline, advisor.id, callCenter.code);
    const { assertion } = await service.issue(advisor, callCenter, deadline + 30, consent);
    const claims = claimsOf(assertion);
    assert.equal(claims.customerId, patient.patientId);
    assert.equal(claims.sub, advisor.id);
    assert.equal(claims.channel, callCenter.code);
    assert.equal(claims.exp, deadline);
    for (const token of [undefined, patient.patientId, consent.replace(/\.[^.]+$/, '.' + Buffer.alloc(64).toString('base64url'))]) {
      await assert.rejects(service.issue(advisor, callCenter, deadline, token), hasStatus(403));
    }
    await assert.rejects(service.issue(advisor, web, deadline, consent), hasStatus(403));
    await assert.rejects(service.issue({ ...advisor, id: patient.id }, callCenter, deadline, consent), hasStatus(403));
    await assert.rejects(service.issue(advisor, { ...callCenter, code: 'another-channel' }, deadline, consent), hasStatus(403));
    await assert.rejects(fixture(false).issue(advisor, callCenter, deadline, consent), hasStatus(403));
  });
});
