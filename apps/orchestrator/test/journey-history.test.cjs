require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { ChannelAuthGuard } = require('../dist/channel-auth/channel-auth.guard');
const { JourneyAccessGuard } = require('../dist/journey-access/journey-access.guard');
const { createHistoryCursor, projectEventData } = require('../dist/journeys/journey-history');
const { JourneyQueriesController } = require('../dist/journeys/journey-queries.controller');
const { JourneyQueriesService } = require('../dist/journeys/journey-queries.service');

const journeyId = '00000000-0000-4000-8000-000000000001';
const otherJourney = '00000000-0000-4000-8000-000000000002';
const occurredAt = new Date('2026-11-24T06:30:00Z');
const first = {
  id: '00000000-0000-4000-8000-000000000003',
  type: 'JOURNEY_STATUS_CHANGED', occurredAt, receivedAt: new Date('2026-11-24T06:45:00Z'),
  schemaVersion: 1, producer: { code: 'test-web' },
  payload: { from: 'DRAFT', to: 'IN_PROGRESS', version: 2, curp: 'private', secret: 'private' },
  externalEventId: 'internal', patientSubjectId: 'private',
};
const second = {
  ...first, id: '00000000-0000-4000-8000-000000000004',
  receivedAt: new Date('2026-11-24T06:40:00Z'), producer: { code: 'test-mobile' },
};
const request = {
  authenticatedChannel: { id: 'test-reader' },
  journeyAccess: { journeyId, actorRef: 'verified-test-session', operation: 'READ_JOURNEY' },
  params: { journeyId: otherJourney },
};
const hasStatus = (status) => (error) => error.getStatus?.() === status;

function fixture(pages = [], exists = true) {
  const audits = [];
  const queries = [];
  const controller = new JourneyQueriesController(new JourneyQueriesService({
    client: { async $transaction(run) {
      return run({
        journey: { async findUnique({ where }) {
          assert.deepEqual(where, { id: journeyId });
          return exists ? { id: journeyId } : null;
        } },
        journeyEvent: { async findMany(query) {
          queries.push(query);
          return pages.shift();
        } },
        accessAudit: { async create({ data }) { audits.push(data); } },
      });
    } },
  }));
  return { controller, audits, queries };
}

test('paginates by occurrence and ID with one extra row and audits each authorized page', async () => {
  const { controller, audits, queries } = fixture([[first, second], [second]]);
  const initial = await controller.getHistory(request, '1', undefined);
  assert.deepEqual(initial.items, [{
    id: first.id, type: first.type, producerCode: 'test-web', occurredAt, receivedAt: first.receivedAt,
    schemaVersion: 1, data: { from: 'DRAFT', to: 'IN_PROGRESS', version: 2 },
  }]);
  assert.equal(typeof initial.nextCursor, 'string');
  const following = await controller.getHistory(request, '1', initial.nextCursor);
  assert.equal(following.items[0].id, second.id);
  assert.equal(following.items[0].producerCode, 'test-mobile');
  assert.equal(Object.hasOwn(following, 'nextCursor'), false);
  assert.deepEqual(queries.map(({ orderBy, take }) => ({ orderBy, take })), [
    { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 2 },
    { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 2 },
  ]);
  assert.deepEqual(queries[0].where, { journeyId });
  assert.deepEqual(queries[1].where, {
    journeyId, occurredAt: { gte: occurredAt },
    OR: [{ occurredAt: { gt: occurredAt } }, { occurredAt, id: { gt: first.id } }],
  });
  assert.deepEqual(audits, Array(2).fill({
    journeyId, channelId: 'test-reader', actorRef: 'verified-test-session',
    action: 'READ_TIMELINE', outcome: 'ALLOWED', reasonCode: 'JOURNEY_HISTORY',
  }));
});

test('rejects malformed, oversized or foreign cursors and invalid limits before reading', () => {
  const { controller, audits, queries } = fixture();
  for (const cursor of [
    'invalid!', 'a'.repeat(201), ['duplicate'], createHistoryCursor(otherJourney, first),
    Buffer.from(JSON.stringify([journeyId, 'not-a-date', first.id])).toString('base64url'),
  ]) {
    assert.throws(() => controller.getHistory(request, undefined, cursor), hasStatus(400));
  }
  for (const limit of ['0', '101', '1.5', '1\n', ['1', '2']]) {
    assert.throws(() => controller.getHistory(request, limit, undefined), hasStatus(400));
  }
  assert.deepEqual(queries, []);
  assert.deepEqual(audits, []);
});

test('applies both guards, returns 404 for a missing journey and audits an empty authorized page', async () => {
  const missing = fixture([], false);
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, missing.controller.getHistory), [ChannelAuthGuard, JourneyAccessGuard]);
  assert.throws(() => missing.controller.getHistory({}), hasStatus(404));
  await assert.rejects(missing.controller.getHistory(request), hasStatus(404));
  assert.deepEqual(missing.audits, []);
  assert.deepEqual(missing.queries, []);

  const empty = fixture([[]]);
  assert.deepEqual(await empty.controller.getHistory(request), { items: [] });
  assert.equal(empty.queries[0].take, 21);
  assert.equal(empty.audits[0].action, 'READ_TIMELINE');
});

test('allows only recognized data for the event type and version', () => {
  assert.deepEqual(projectEventData('JOURNEY_STATUS_CHANGED', 1, { to: 'private', version: -1 }), {});
  assert.deepEqual(projectEventData('JOURNEY_CONTEXT_UPDATED', 1, {
    currentStep: 'REVIEW', version: 3, notes: 'private', patientId: 'private',
  }), { currentStep: 'REVIEW', version: 3 });
  assert.deepEqual(projectEventData('JOURNEY_CONTEXT_UPDATED', 1, { currentStep: 'private' }), {});
  assert.deepEqual(projectEventData('JOURNEY_CREATED', 2, { version: 2 }), {});
  assert.deepEqual(projectEventData('UNKNOWN', 1, { version: 2 }), {});
});
