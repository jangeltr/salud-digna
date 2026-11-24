require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { ChannelAuthGuard } = require('../dist/channel-auth/channel-auth.guard');
const { JourneyAccessGuard } = require('../dist/journey-access/journey-access.guard');
const { JourneyWritesController } = require('../dist/journeys/journey-writes.controller');
const { JourneyWritesService } = require('../dist/journeys/journey-writes.service');

const journeyId = '00000000-0000-4000-8000-000000000001';
const studyId = '00000000-0000-4000-8000-000000000002';
const channelId = '00000000-0000-4000-8000-000000000003';
const key = Buffer.alloc(32, 7).toString('base64url');
const request = {
  headers: { 'idempotency-key': key },
  authenticatedChannel: { id: channelId },
  journeyAccess: { journeyId, actorRef: 'demo-session' },
};
const body = {
  journeyId, externalEventId: 'test-001', occurredAt: '2026-11-24T06:30:00.000Z', schemaVersion: 1,
  type: 'JOURNEY_CONTEXT_UPDATED', payload: { expectedVersion: 1, studyId },
};
const hasStatus = (status) => (error) => error.getStatus?.() === status;

function fixture({ existing, contextStatus = 'DRAFT', changed = 1 } = {}) {
  const writes = [];
  const write = (entity, result) => async (input) => { writes.push([entity, input]); return result; };
  const tx = {
    journey: { create: write('journey', { id: journeyId, status: 'DRAFT' }), update: write('state') },
    journeyAccessGrant: { create: write('grant', { id: 'initial-grant' }) },
    journeyCreationRequest: { findUnique: async () => null, createMany: write('operation', { count: 1 }) },
    accessAudit: { create: write('audit') },
    journeyContext: {
      findUnique: async () => ({ version: 1, currentStep: 'SELECT_STUDY', externalRefs: {}, journey: {
        type: 'APPOINTMENT', status: contextStatus,
      } }),
      updateMany: write('context', { count: changed }),
    },
    journeyEvent: {
      create: write('initial'),
      createMany: write('insert', { count: existing ? 0 : 1 }),
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { producerId_externalEventId: { producerId: channelId, externalEventId: body.externalEventId } });
        return existing;
      },
      update: write('event'),
    },
  };
  return {
    writes,
    controller: new JourneyWritesController(new JourneyWritesService({
      client: { $transaction: async (work) => work(tx) },
    })),
  };
}

test('creates an isolated subject, initial event and expiring grant scoped to the new journey', async () => {
  const { controller, writes } = fixture();
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller.create), [ChannelAuthGuard]);
  assert.throws(() => controller.create({}, { type: 'APPOINTMENT' }), hasStatus(401));
  assert.throws(() => controller.create({ ...request, headers: {} }, { type: 'APPOINTMENT' }), hasStatus(400));
  await assert.rejects(controller.create(request, { type: 'APPOINTMENT', patientId: journeyId }), hasStatus(400));
  const result = await controller.create(request, { type: 'APPOINTMENT' });
  assert.equal(result.status, 'DRAFT');
  assert.equal(result.id, journeyId);
  assert.deepEqual(writes.map(([entity]) => entity), ['journey', 'grant', 'operation', 'initial', 'audit']);
  assert.deepEqual(writes[0][1].data.patientSubject, { create: {} });
  assert.equal(writes[3][1].data.type, 'JOURNEY_CREATED');
  const grant = writes[1][1].data;
  assert.deepEqual(writes[2][1].data.keyDigest, Uint8Array.from(createHash('sha256').update(Buffer.from(key, 'base64url')).digest()));
  assert.equal(writes[2][1].data.initialGrantId, 'initial-grant');
  assert.equal(grant.channelId, channelId);
  assert.equal(grant.journeyId, journeyId);
  assert.equal(grant.expiresAt - grant.createdAt, 300_000);
  assert.deepEqual(grant.operations, ['READ_JOURNEY', 'PUBLISH_EVENT']);
  assert.deepEqual(grant.digest, Uint8Array.from(createHash('sha256').update(Buffer.from(result.grant, 'base64url')).digest()));
});

test('applies a validated event to the versioned context and derives its producer from the channel', async () => {
  const { controller, writes } = fixture();
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller.publish), [ChannelAuthGuard, JourneyAccessGuard]);
  assert.throws(() => controller.publish({}, body), hasStatus(404));
  assert.throws(() => controller.publish(request, { ...body, payload: { ...body.payload, notes: 'not allowed' } }), hasStatus(400));
  const result = await controller.publish(request, body);
  assert.deepEqual(writes.map(([entity]) => entity), ['insert', 'context', 'state', 'event', 'audit']);
  assert.equal(writes[0][1].data.producerId, channelId);
  assert.equal(writes[0][1].data.id, result.id);
  assert.deepEqual(writes[1][1], {
    where: { journeyId, version: 1 }, data: { version: 2, currentStep: 'SELECT_CLINIC', externalRefs: { studyId } },
  });
  assert.equal(writes[2][1].data.status, 'IN_PROGRESS');
});

test('replays identical events without effects and rejects conflicting duplicates', async () => {
  const existing = {
    ...body, id: 'stored-event', occurredAt: new Date(body.occurredAt),
    payload: { ...body.payload, version: 2, currentStep: 'SELECT_CLINIC' },
  };
  const { controller, writes } = fixture({ existing });
  assert.deepEqual(await controller.publish(request, body), { id: 'stored-event', journeyId });
  await assert.rejects(controller.publish(request, { ...body, payload: { ...body.payload, expectedVersion: 2 } }), hasStatus(409));
  assert.deepEqual(writes.map(([entity]) => entity), ['insert', 'insert']);
});

test('rejects invalid transitions and concurrent version changes before writing the new state', async () => {
  const terminal = fixture({ contextStatus: 'CANCELLED' });
  await assert.rejects(terminal.controller.publish(request, body), hasStatus(409));
  assert.deepEqual(terminal.writes.map(([entity]) => entity), ['insert']);
  const concurrent = fixture({ changed: 0 });
  await assert.rejects(concurrent.controller.publish(request, body), hasStatus(409));
  assert.deepEqual(concurrent.writes.map(([entity]) => entity), ['insert', 'context']);
});
