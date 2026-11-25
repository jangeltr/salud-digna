require('reflect-metadata');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { afterEach, beforeEach, describe, test } = require('node:test');
const { PatientIdentityService, digestCustomerId } = require('../dist/journeys/patient-identity');
const { JourneyQueriesController } = require('../dist/journeys/journey-queries.controller');
const { JourneyQueriesService } = require('../dist/journeys/journey-queries.service');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const env = {
  ORCHESTRATOR_CENTRAL_ASSERTION_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }),
  ORCHESTRATOR_PATIENT_IDENTITY_KEY: Buffer.alloc(32, 4).toString('base64url'),
};
const journeyId = '00000000-0000-4000-8000-000000000001';
const subjectId = '00000000-0000-4000-8000-000000000002';
const has404 = (error) => error.getStatus?.() === 404;
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
function request({ code = 'callcenter', scopes = ['JOURNEYS_READ'], claims = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://api.salud-digna.app', aud: 'https://orchestrator.salud-digna.app',
    channel: code, scope: 'journeys:patient', customerId: 'SD-TEST-001', sub: 'verified-session',
    jti: 'central-proof-001', iat: now, exp: now + 90, ...claims,
  };
  const input = b64({ alg: 'EdDSA', typ: 'sd-patient+jwt' }) + '.' + b64(payload);
  const signature = sign(null, Buffer.from(input), privateKey).toString('base64url');
  return { authenticatedChannel: { id: code + '-id', code, scopes }, headers: { 'x-patient-assertion': input + '.' + signature } };
}

function fixture({ ownsJourney = true, known = true } = {}) {
  const grants = [];
  const active = ['DRAFT', 'IN_PROGRESS', 'PENDING_CONFIRMATION'];
  const prisma = { client: {
    patientIdentifier: { async findUnique({ where }) {
      const key = where.type_namespace_verifiedLookupDigest;
      assert.equal(key.namespace, 'salud-digna:central-customer:v1');
      assert.deepEqual(key.verifiedLookupDigest, digestCustomerId(Buffer.alloc(32, 4), 'SD-TEST-001', key.namespace));
      return known ? { patientSubjectId: subjectId, status: 'VERIFIED', validUntil: null, revokedAt: null } : null;
    } },
    async $transaction(work) {
      return work({
        journey: {
          async findMany({ where }) {
            assert.deepEqual(where, { patientSubjectId: subjectId, status: { in: active } });
            return [{ id: journeyId, status: 'DRAFT' }];
          },
          async findUnique({ where }) {
            assert.deepEqual(where, { id: journeyId, patientSubjectId: subjectId, status: { in: active } });
            return ownsJourney ? { id: journeyId } : null;
          },
        },
        journeyAccessGrant: { async create({ data }) { grants.push(data); } },
        accessAudit: { async create() {} },
      });
    },
  } };
  return { controller: new JourneyQueriesController(new JourneyQueriesService(prisma), new PatientIdentityService(prisma)), grants };
}

describe('institutional recovery', () => {
  let original;
  beforeEach(() => {
    original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('Web and Call Center can discover the same active journey with independent central assertions', async () => {
    const { controller } = fixture();
    const web = await controller.listPatientJourneys(request({ code: 'web' }), 'true');
    assert.deepEqual(await controller.listPatientJourneys(request(), 'true'), web);
    assert.equal(web.items[0].id, journeyId);
  });

  test('issues a journey-specific grant scoped to the authenticated channel and its privileges', async () => {
    const { controller, grants } = fixture();
    const read = await controller.issuePatientGrant(request(), journeyId);
    const write = await controller.issuePatientGrant(request({ scopes: ['JOURNEYS_READ', 'EVENTS_PUBLISH'] }), journeyId);
    assert.equal(read.journeyId, journeyId);
    assert.match(write.grant, /^[\w-]{43}$/);
    assert.deepEqual(grants.map(({ operations }) => operations), [['READ_JOURNEY'], ['READ_JOURNEY', 'PUBLISH_EVENT']]);
    assert.equal(grants[1].channelId, 'callcenter-id');
    assert.equal(grants[1].actorRef, 'verified-session');
    assert.ok(write.grantExpiresAt - grants[1].createdAt <= 90_000);
  });

  test('rejects legacy, wrong-channel, invalid, expired and unknown proofs and foreign journeys', async () => {
    const { controller, grants } = fixture({ ownsJourney: false });
    const invalidRequests = [
      { ...request(), headers: { 'x-patient-assertion': 'demo.signature' } },
      request({ claims: { channel: 'web' } }),
      request({ claims: { aud: 'other-service' } }),
      request({ claims: { exp: 1 } }),
    ];
    const forged = request();
    forged.headers['x-patient-assertion'] = forged.headers['x-patient-assertion'].replace(/\.[^.]+$/, '.' + Buffer.alloc(64).toString('base64url'));
    for (const invalid of [...invalidRequests, forged, request()]) {
      await assert.rejects(controller.issuePatientGrant(invalid, journeyId), has404);
    }
    await assert.rejects(fixture({ known: false }).controller.listPatientJourneys(request(), 'true'), has404);
    assert.deepEqual(grants, []);
  });

  test('a first identified creation can register the central mapping without persisting the customerId', async () => {
    let linked;
    const service = new PatientIdentityService({ client: {
      patientIdentifier: { async findUnique() { return null; } },
      async $transaction(work) {
        return work({
          patientIdentifier: {
            async findFirst() { return null; },
            async createMany({ data, skipDuplicates }) {
              assert.equal(skipDuplicates, true);
              linked = data;
              return { count: 1 };
            },
          },
          patientSubject: { async create() { return { id: subjectId }; } },
          accessAudit: { async create() {} },
        });
      },
    } });
    assert.equal((await service.resolve(request({ code: 'web' }), 'web-id', true)).patientSubjectId, subjectId);
    assert.equal(linked.verificationMethod, 'CENTRAL_SIGNED');
    assert.equal(linked.lookupDigest.length, 32);
    assert.deepEqual(linked.lookupDigest, linked.verifiedLookupDigest);
    assert.equal(Object.values(linked).includes('SD-TEST-001'), false);
  });
});
