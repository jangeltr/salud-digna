require('reflect-metadata');
const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { ChannelAuthGuard } = require('../dist/channel-auth/channel-auth.guard');
const { JourneyQueriesController } = require('../dist/journeys/journey-queries.controller');
const { JourneyQueriesService } = require('../dist/journeys/journey-queries.service');
const { JourneyWritesController } = require('../dist/journeys/journey-writes.controller');
const { JourneyWritesService } = require('../dist/journeys/journey-writes.service');
const { customerNamespace, digestCustomerId, PatientIdentityService, signPatientAssertion } = require('../dist/journeys/patient-identity');

const key = Buffer.alloc(32, 17);
const previous = process.env.ORCHESTRATOR_PATIENT_IDENTITY_KEY;
process.env.ORCHESTRATOR_PATIENT_IDENTITY_KEY = key.toString('base64url');
after(() => {
  if (previous === undefined) delete process.env.ORCHESTRATOR_PATIENT_IDENTITY_KEY;
  else process.env.ORCHESTRATOR_PATIENT_IDENTITY_KEY = previous;
});

const web = '00000000-0000-4000-8000-000000000001';
const callCenter = '00000000-0000-4000-8000-000000000002';
const identifierId = '00000000-0000-4000-8000-000000000003';
const patientSubjectId = '00000000-0000-4000-8000-000000000004';
const actorRef = 'verified-demo-session';
const signedRequest = (channelId) => ({
  authenticatedChannel: { id: channelId },
  headers: { 'x-patient-assertion': signPatientAssertion(key, { channelId, identifierId, actorRef }) },
});
const hasStatus = (status) => (error) => error.getStatus?.() === status;

function identities(result) {
  return new PatientIdentityService({ client: { patientIdentifier: { async findUnique({ where }) {
    assert.deepEqual({ ...where, OR: undefined }, {
      id: identifierId, namespace: customerNamespace, type: 'CUSTOMER_ID', status: 'VERIFIED',
      verifiedLookupDigest: { not: null }, revokedAt: null, OR: undefined,
    });
    assert.equal(where.OR[0].validUntil, null);
    assert.ok(where.OR[1].validUntil.gt instanceof Date);
    return result;
  } } } });
}

test('two authorized channels resolve one verified subject through separate assertions', async () => {
  const service = identities({ patientSubjectId });
  assert.deepEqual(await service.resolve(signedRequest(web), web), { patientSubjectId, actorRef });
  assert.deepEqual(await service.resolve(signedRequest(callCenter), callCenter), { patientSubjectId, actorRef });
  assert.equal(digestCustomerId(key, 'CUSTOMER-DEMO-001').length, 32);
});

test('rejects missing, altered or other-channel assertions and unknown identities', async () => {
  const service = new PatientIdentityService({});
  await assert.rejects(service.resolve({ headers: {} }, web), hasStatus(404));
  await assert.rejects(service.resolve(signedRequest(web), callCenter), hasStatus(404));
  const forged = signedRequest(web);
  forged.headers['x-patient-assertion'] = forged.headers['x-patient-assertion'].replace(/^./, 'x');
  await assert.rejects(service.resolve(forged, web), hasStatus(404));
  await assert.rejects(identities(null).resolve(signedRequest(web), web), hasStatus(404));
});

test('lists multiple journeys with the minimum fields only after channel and patient authorization', async () => {
  const items = [1, 2].map((id) => ({
    id, type: 'APPOINTMENT', status: 'DRAFT', createdAt: new Date(0), updatedAt: new Date(0),
  }));
  const audits = [];
  const queries = new JourneyQueriesService({ client: { async $transaction(run) {
    return run({
      journey: { async findMany(query) {
        assert.deepEqual(query.where, { patientSubjectId });
        assert.deepEqual(Object.keys(query.select), ['id', 'type', 'status', 'createdAt', 'updatedAt']);
        return items;
      } },
      accessAudit: { async create({ data }) { audits.push(data); } },
    });
  } } });
  const controller = new JourneyQueriesController(queries, identities({ patientSubjectId }));
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller.listPatientJourneys), [ChannelAuthGuard]);
  await assert.rejects(controller.listPatientJourneys({ headers: {} }), hasStatus(401));
  await assert.rejects(controller.listPatientJourneys({ ...signedRequest(web), headers: {} }), hasStatus(404));
  assert.deepEqual(await controller.listPatientJourneys(signedRequest(web)), { items });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorRef, actorRef);
});

test('identified creation connects the subject and uses the verified actor in the journey grant', async () => {
  const writes = new JourneyWritesService({ client: { async $transaction(run) {
    return run({
      journeyCreationRequest: { findUnique: async () => null, createMany: async () => ({ count: 1 }) },
      journey: { async create({ data }) {
        assert.deepEqual(data.patientSubject, { connect: { id: patientSubjectId } });
        return { id: 'journey', status: 'DRAFT' };
      } },
      journeyAccessGrant: { async create({ data }) {
        assert.equal(data.actorRef, actorRef);
        assert.equal(data.channelId, web);
        return { id: 'grant' };
      } },
      journeyEvent: { create: async () => ({}) },
      accessAudit: { create: async () => ({}) },
    });
  } } });
  const request = signedRequest(web);
  request.headers['idempotency-key'] = Buffer.alloc(32, 2).toString('base64url');
  const controller = new JourneyWritesController(writes, identities({ patientSubjectId }));
  assert.equal((await controller.create(request, { type: 'APPOINTMENT' })).id, 'journey');
});
