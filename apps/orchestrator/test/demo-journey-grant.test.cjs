const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { DemoGrantError, parseDemoGrantOptions, issueDemoJourneyGrant } = require('../dist/journey-access/demo-journey-grant');

const journeyId = '00000000-0000-4000-8000-000000000003';
const channelId = '00000000-0000-4000-8000-000000000004';
const args = [
  '--channel', 'demo-test', '--journey', journeyId,
  '--actor', 'demo-session', '--operation', 'READ_JOURNEY',
];

function prismaFixture({ active = true, hasJourney = true } = {}) {
  const writes = [];
  const client = {
    channel: { async findUnique({ where, select }) {
      assert.deepEqual(where, { code: 'demo-test', isActive: true });
      assert.deepEqual(select, { id: true });
      return active ? { id: channelId } : null;
    } },
    journey: { async findUnique({ where, select }) {
      assert.deepEqual(where, { id: journeyId });
      assert.deepEqual(select, { id: true });
      return hasJourney ? { id: journeyId } : null;
    } },
    journeyAccessGrant: { async create({ data }) { writes.push(data); } },
  };
  return { client, writes };
}

test('requires explicit channel, a valid UUID, a nonblank actor and known operations', () => {
  for (let index = 0; index < args.length; index += 2) {
    assert.throws(() => parseDemoGrantOptions(args.filter((_arg, position) =>
      position !== index && position !== index + 1)), DemoGrantError);
  }
  for (const [index, invalid] of [[1, ' '], [3, 'not-a-uuid'], [5, '  '], [7, 'UNKNOWN']]) {
    const input = [...args];
    input[index] = invalid;
    assert.throws(() => parseDemoGrantOptions(input), DemoGrantError);
  }
});

test('limits validity with the default, configured maximum and hard ceiling', () => {
  assert.equal(parseDemoGrantOptions(args).durationSeconds, 300);
  assert.equal(parseDemoGrantOptions(args, '120').durationSeconds, 120);
  assert.equal(parseDemoGrantOptions([...args, '--duration-seconds', '1800'], '3600').durationSeconds, 1800);
  for (const duration of ['0', '1.5', '901']) {
    assert.throws(() => parseDemoGrantOptions([...args, '--duration-seconds', duration]), DemoGrantError);
  }
  assert.throws(() => parseDemoGrantOptions(args, '3601'), DemoGrantError);
});

test('refuses issuance without an active channel and an existing journey', async () => {
  for (const input of [{ active: false }, { hasJourney: false }]) {
    const { client, writes } = prismaFixture(input);
    await assert.rejects(issueDemoJourneyGrant(client, parseDemoGrantOptions(args)), DemoGrantError);
    assert.deepEqual(writes, []);
  }
});

test('returns a canonical 32-byte token and persists only its digest with the requested binding', async () => {
  const { client, writes } = prismaFixture();
  const options = parseDemoGrantOptions([
    ...args, '--operation', 'PUBLISH_EVENT', '--operation', 'READ_JOURNEY', '--duration-seconds', '60',
  ]);
  const token = await issueDemoJourneyGrant(client, options);
  assert.match(token, /^[\w-]{43}$/);
  const decoded = Buffer.from(token, 'base64url');
  assert.equal(decoded.length, 32);
  assert.equal(decoded.toString('base64url'), token);
  assert.equal(writes.length, 1);
  const { createdAt, expiresAt, ...binding } = writes[0];
  assert.equal(expiresAt.getTime() - createdAt.getTime(), 60_000);
  assert.deepEqual(binding, {
    channelId,
    journeyId,
    actorRef: 'demo-session',
    operations: ['READ_JOURNEY', 'PUBLISH_EVENT'],
    digest: Uint8Array.from(createHash('sha256').update(decoded).digest()),
  });
});
