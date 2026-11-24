require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { ChannelAuthGuard } = require('../dist/channel-auth/channel-auth.guard');
const { JourneyAccessGuard } = require('../dist/journey-access/journey-access.guard');
const { JourneyQueriesController } = require('../dist/journeys/journey-queries.controller');
const { JourneyQueriesService } = require('../dist/journeys/journey-queries.service');

const journeyId = '00000000-0000-4000-8000-000000000003';
const channelId = '00000000-0000-4000-8000-000000000004';
const clinicId = 'abcdef00-0000-4000-8000-000000000005';
const createdAt = new Date('2026-11-24T06:30:00Z');
const updatedAt = new Date('2026-11-24T06:45:00Z');
const journey = { id: journeyId, type: 'APPOINTMENT', status: 'IN_PROGRESS', createdAt, updatedAt };
const request = {
  authenticatedChannel: { id: channelId },
  journeyAccess: { journeyId, actorRef: 'verified-demo-session', operation: 'READ_JOURNEY' },
  params: { journeyId: 'untrusted' },
  body: { channelId: 'untrusted', actorRef: 'untrusted' },
};

function fixture({
  summary = { ...journey, patientSubjectId: 'private' },
  context = {
    journeyId, currentStep: 'SELECT_STUDY', version: 2, updatedAt, journey: { type: 'APPOINTMENT' },
    externalRefs: {
      clinicId: clinicId.toUpperCase(), studyId: { token: 'private' }, appointmentId: 'not-a-uuid',
      patientId: clinicId, notes: 'private', secret: 'private',
    },
  },
} = {}) {
  const audits = [];
  const controller = new JourneyQueriesController(new JourneyQueriesService({
    client: { async $transaction(run) {
      return run({
        journey: { async findUnique({ where }) {
          assert.deepEqual(where, { id: journeyId });
          return summary;
        } },
        journeyContext: { async findUnique({ where }) {
          assert.deepEqual(where, { journeyId });
          return context;
        } },
        accessAudit: { async create({ data }) { audits.push(data); } },
      });
    } },
  }));
  return { controller, audits };
}

test('returns only the allowed summary and context fields and audits the authenticated actor', async () => {
  const { controller, audits } = fixture();
  assert.deepEqual(await controller.getJourney(request), journey);
  assert.deepEqual(await controller.getContext(request), {
    journeyId, currentStep: 'SELECT_STUDY', version: 2, updatedAt, externalRefs: { clinicId },
  });
  assert.deepEqual(audits, ['JOURNEY_SUMMARY', 'JOURNEY_CONTEXT'].map((reasonCode) => ({
    channelId, journeyId, actorRef: 'verified-demo-session', action: 'READ_CONTEXT', outcome: 'ALLOWED', reasonCode,
  })));
});

test('omits references for journey types without an allowlist', async () => {
  const { controller } = fixture({ context: {
    journeyId, journey: { type: 'UNKNOWN' }, externalRefs: { clinicId },
  } });
  assert.deepEqual((await controller.getContext(request)).externalRefs, {});
});

test('both routes use both guards and return uniform 404s without successful audit for missing resources', async () => {
  const { controller, audits } = fixture({ summary: null, context: null });
  for (const handler of ['getJourney', 'getContext']) {
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller[handler]), [ChannelAuthGuard, JourneyAccessGuard]);
    assert.throws(() => controller[handler]({}), (error) => error.getStatus() === 404);
    await assert.rejects(controller[handler](request), (error) => error.getStatus() === 404);
  }
  assert.deepEqual(audits, []);
});
