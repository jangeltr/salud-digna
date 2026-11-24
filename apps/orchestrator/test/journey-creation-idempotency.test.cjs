require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JourneyWritesController } = require('../dist/journeys/journey-writes.controller');
const { JourneyWritesService } = require('../dist/journeys/journey-writes.service');

const input = { type: 'APPOINTMENT' };
const key = Buffer.alloc(32, 1).toString('base64url');
const secondKey = Buffer.alloc(32, 2).toString('base64url');

function fixture() {
  const operations = new Map();
  const locks = new Map();
  const committed = [];
  let sequence = 0;
  let rolledBack = 0;
  const rowKey = ({ channelId, keyDigest }) => `${channelId}:${Buffer.from(keyDigest).toString('hex')}`;
  const prisma = { client: { async $transaction(work) {
    const writes = [];
    let operation;
    let release;
    const tx = {
      journey: { async create() {
        const id = `journey-${++sequence}`;
        writes.push(['journey', id]);
        return { id, status: 'DRAFT' };
      } },
      journeyAccessGrant: { async create({ data }) {
        const row = { ...data, id: `grant-${++sequence}`, revokedAt: null };
        writes.push(['grant', row]);
        return { id: row.id };
      } },
      journeyCreationRequest: {
        async findUnique({ where }) { return operations.get(rowKey(where.channelId_keyDigest)); },
        async createMany({ data, skipDuplicates }) {
          assert.equal(skipDuplicates, true);
          const key = rowKey(data);
          while (locks.has(key)) await locks.get(key);
          if (operations.has(key)) return { count: 0 };
          let unlock;
          locks.set(key, new Promise((resolve) => { unlock = resolve; }));
          release = () => { locks.delete(key); unlock(); };
          const initialGrant = writes.find(([entity]) => entity === 'grant')[1];
          assert.equal(initialGrant.id, data.initialGrantId);
          operation = [key, { ...data, initialGrant }];
          return { count: 1 };
        },
      },
      journeyEvent: { async create() { writes.push(['event']); } },
      accessAudit: { async create() { writes.push(['audit']); } },
    };
    try {
      const result = await work(tx);
      if (operation) operations.set(...operation);
      committed.push(...writes);
      return result;
    } catch (error) {
      if (writes.length) rolledBack++;
      throw error;
    } finally {
      release?.();
    }
  } } };
  const controller = new JourneyWritesController(new JourneyWritesService(prisma));
  return {
    committed, operations,
    get rolledBack() { return rolledBack; },
    create(channelId, idempotencyKey, body = input) {
      return controller.create({ authenticatedChannel: { id: channelId }, headers: { 'idempotency-key': idempotencyKey } }, body);
    },
  };
}

test('a concurrent duplicate rolls back its provisional writes and receives the same journey', async () => {
  const db = fixture();
  const [first, replay] = await Promise.all([db.create('web', key), db.create('web', key)]);
  assert.equal(first.id, replay.id);
  assert.equal(first.status, replay.status);
  assert.notEqual(first.grant, replay.grant);
  assert.deepEqual(first.grantExpiresAt, replay.grantExpiresAt);
  assert.equal(db.rolledBack, 1);
  assert.deepEqual(db.committed.map(([entity]) => entity), ['journey', 'grant', 'event', 'audit', 'grant']);
  const [initial, replacement] = db.committed.filter(([entity]) => entity === 'grant').map(([, grant]) => grant);
  assert.equal(replacement.actorRef, initial.actorRef);
  assert.equal(replacement.channelId, initial.channelId);
  assert.equal(replacement.journeyId, initial.journeyId);
});

test('isolates channels and new keys and rejects reuse with different content', async () => {
  const db = fixture();
  const original = await db.create('web', key);
  await assert.rejects(db.create('web', key, { type: 'OTHER' }), (error) => error.getStatus() === 409);
  assert.notEqual((await db.create('web', secondKey)).id, original.id);
  assert.notEqual((await db.create('mobile', key)).id, original.id);
  assert.equal(db.operations.size, 3);
});

test('returns the original result without minting a replacement after expiry or revocation', async () => {
  const db = fixture();
  const original = await db.create('web', key);
  const { initialGrant } = [...db.operations.values()][0];
  initialGrant.revokedAt = new Date();
  assert.deepEqual(await db.create('web', key), { id: original.id, status: 'DRAFT' });
  initialGrant.revokedAt = null;
  initialGrant.expiresAt = new Date(0);
  assert.deepEqual(await db.create('web', key), { id: original.id, status: 'DRAFT' });
  assert.equal(db.committed.filter(([entity]) => entity === 'grant').length, 1);
});
