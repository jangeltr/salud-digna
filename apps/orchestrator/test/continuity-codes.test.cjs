require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const { after, test } = require('node:test');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { ChannelAuthGuard } = require('../dist/channel-auth/channel-auth.guard');
const { JourneyAccessGuard } = require('../dist/journey-access/journey-access.guard');
const { ContinuityCodesController } = require('../dist/journey-access/continuity-codes.controller');
const { ContinuityCodesService } = require('../dist/journey-access/continuity-codes.service');

const key = Buffer.alloc(32, 9);
const previous = process.env.ORCHESTRATOR_CONTINUITY_HMAC_KEY;
process.env.ORCHESTRATOR_CONTINUITY_HMAC_KEY = key.toString('base64url');
after(() => {
  if (previous === undefined) delete process.env.ORCHESTRATOR_CONTINUITY_HMAC_KEY;
  else process.env.ORCHESTRATOR_CONTINUITY_HMAC_KEY = previous;
});

const hasStatus = (status) => (error) => error.getStatus?.() === status;
const origin = {
  authenticatedChannel: { id: 'web' },
  journeyAccess: { journeyId: 'journey', grantId: 'origin-grant' },
};
const recipient = { authenticatedChannel: { id: 'whatsapp' } };

function fixture() {
  let stored;
  const audits = [];
  const grants = [];
  const source = { actorRef: 'web-session', expiresAt: new Date(Date.now() + 60_000), revokedAt: null };
  const controller = new ContinuityCodesController(new ContinuityCodesService({
    client: { async $transaction(run) {
      return run({
        journeyAccessGrant: {
          async findUnique({ where }) {
            assert.deepEqual(where.operations.hasEvery, ['READ_JOURNEY', 'PUBLISH_EVENT']);
            assert.equal(where.channel.isActive, true);
            if (where.id === 'origin-grant' && where.channelId === 'web' && where.journeyId === 'journey' &&
                !source.revokedAt && source.expiresAt > where.expiresAt.gt) return source;
            return null;
          },
          async create({ data }) { grants.push(data); },
        },
        continuityCode: {
          async create({ data }) { stored = { ...data, consumedAt: null }; },
          async updateManyAndReturn({ where, data }) {
            assert.equal(where.consumedAt, null);
            assert.equal(where.sourceGrant.revokedAt, null);
            if (!stored || stored.consumedAt || stored.expiresAt <= where.expiresAt.gt ||
                source.revokedAt || source.expiresAt <= where.sourceGrant.expiresAt.gt ||
                where.sourceGrant.channelId.not === 'web' ||
                !Buffer.from(stored.digest).equals(where.digest)) return [];
            stored.consumedAt = data.consumedAt;
            return [{ id: 'link', sourceGrant: { journeyId: 'journey' } }];
          },
        },
        accessAudit: { async create({ data }) { audits.push(data); } },
      });
    } },
  }));
  return { controller, audits, grants, source, get stored() { return stored; } };
}

test('issues a protected code only with an active source grant and audits without the secret', async () => {
  const f = fixture();
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, f.controller.issue), [ChannelAuthGuard, JourneyAccessGuard]);
  assert.throws(() => f.controller.issue({}), hasStatus(404));
  await assert.rejects(f.controller.issue({ ...origin, journeyAccess: { ...origin.journeyAccess, grantId: 'wrong' } }), hasStatus(404));
  const { code, expiresAt } = await f.controller.issue(origin);
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
  assert.equal(expiresAt.getTime(), f.source.expiresAt.getTime());
  assert.deepEqual(f.stored.digest, Uint8Array.from(createHmac('sha256', key).update(code.replaceAll('-', '')).digest()));
  assert.equal(f.stored.code, undefined);
  assert.deepEqual(f.audits, [{
    journeyId: 'journey', channelId: 'web', actorRef: 'web-session', action: 'ISSUE_CONTINUITY_CODE', outcome: 'ALLOWED',
  }]);
});

test('a code can be exchanged only once and binds the grant to the actual receiving channel', async () => {
  const f = fixture();
  const { code } = await f.controller.issue(origin);
  const attempts = await Promise.allSettled([
    f.controller.redeem(recipient, { code: code.toLowerCase() }),
    f.controller.redeem({ authenticatedChannel: { id: 'callcenter' } }, { code }),
  ]);
  const [winner, loser] = attempts;
  assert.equal(winner.status, 'fulfilled');
  assert.equal(loser.reason.getStatus(), 404);
  assert.equal(winner.value.journeyId, 'journey');
  assert.equal(f.grants.length, 1);
  const [grant] = f.grants;
  assert.equal(grant.channelId, 'whatsapp');
  assert.deepEqual(grant.operations, ['READ_JOURNEY', 'PUBLISH_EVENT']);
  assert.equal(grant.expiresAt - grant.createdAt, 300_000);
  assert.deepEqual(grant.digest, Uint8Array.from(createHash('sha256').update(Buffer.from(winner.value.grant, 'base64url')).digest()));
  assert.equal(f.audits[1].action, 'REDEEM_CONTINUITY_CODE');
});

test('expiry, revoked source, and same-channel redemption fail without issuing a grant', async () => {
  const f = fixture();
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, f.controller.redeem), [ChannelAuthGuard]);
  assert.throws(() => f.controller.redeem({}, {}), hasStatus(401));
  const { code } = await f.controller.issue(origin);
  await assert.rejects(f.controller.redeem(origin, { code }), hasStatus(404));
  f.source.revokedAt = new Date();
  await assert.rejects(f.controller.redeem(recipient, { code }), hasStatus(404));
  f.source.revokedAt = null;
  f.stored.expiresAt = new Date(0);
  await assert.rejects(f.controller.redeem(recipient, { code }), hasStatus(404));
  assert.equal(f.grants.length, 0);
});

test('limits attempts per authenticated channel, including malformed input', () => {
  const { controller } = fixture();
  for (let i = 0; i < 10; i++) assert.throws(() => controller.redeem(recipient, { code: 'bad' }), hasStatus(400));
  assert.throws(() => controller.redeem(recipient, { code: 'bad' }), hasStatus(429));
  assert.throws(() => controller.redeem({ authenticatedChannel: { id: 'callcenter' } }, { code: 'bad' }), hasStatus(400));
});
