require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { Reflector } = require('@nestjs/core');
const { ChannelAuthGuard } = require('../dist/channel-auth/channel-auth.guard');
const { JourneyAccessGuard, RequireJourneyAccess } = require('../dist/journey-access/journey-access.guard');

const keyId = '00000000-0000-4000-8000-000000000001';
const channelId = '00000000-0000-4000-8000-000000000002';
const journeyId = '00000000-0000-4000-8000-000000000003';
const otherId = '00000000-0000-4000-8000-000000000004';
const channelSecret = Buffer.alloc(32, 5);
const grantSecret = Buffer.alloc(32, 13);
const hash = (bytes) => createHash('sha256').update(bytes).digest();
const hasStatus = (status) => (error) => error.getStatus?.() === status;

function fixture({ grant = {}, scopes = ['JOURNEYS_READ'], operation = 'READ_JOURNEY', source = 'params' } = {}) {
  class Controller {
    handle() {}
  }
  const handler = Controller.prototype.handle;
  RequireJourneyAccess(operation, source)(Controller.prototype, 'handle', Object.getOwnPropertyDescriptor(Controller.prototype, 'handle'));
  const request = {
    headers: {
      authorization: `Bearer ${keyId}.${channelSecret.toString('base64url')}`,
      'x-journey-grant': grantSecret.toString('base64url'),
    },
    params: { journeyId },
    body: { journeyId: otherId, channelId: otherId, actorRef: 'untrusted' },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
  };
  const lookups = [];
  const prisma = {
    client: {
      channelCredential: { async findUnique() {
        return {
          channel: { id: channelId, code: 'test-channel', isActive: true },
          secretDigest: hash(channelSecret),
          scopes,
          expiresAt: null,
          revokedAt: null,
        };
      } },
      journeyAccessGrant: { async findUnique({ where }) {
        lookups.push(where);
        return grant === null ? null : {
          channelId,
          digest: hash(grantSecret),
          actorRef: 'verified-session',
          operations: ['READ_JOURNEY'],
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          journey: { id: journeyId },
          ...grant,
        };
      } },
    },
  };
  const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
  assert.deepEqual(guards, [ChannelAuthGuard, JourneyAccessGuard]);
  return {
    request,
    lookups,
    async authorize() {
      for (const Guard of guards) {
        assert.equal(await new Guard(prisma, new Reflector()).canActivate(context), true);
      }
    },
  };
}

test('authorizes a matching grant and derives actor and journey from verified server data', async () => {
  const attempt = fixture();
  await attempt.authorize();
  assert.deepEqual(attempt.lookups, [{ digest: Uint8Array.from(hash(grantSecret)) }]);
  assert.deepEqual(attempt.request.journeyAccess, {
    journeyId, actorRef: 'verified-session', operation: 'READ_JOURNEY',
  });
});

test('requires API key authentication and the corresponding channel scope before grant lookup', async () => {
  const missingKey = fixture();
  delete missingKey.request.headers.authorization;
  await assert.rejects(missingKey.authorize, hasStatus(401));
  const missingScope = fixture({ operation: 'PUBLISH_EVENT' });
  await assert.rejects(missingScope.authorize, hasStatus(403));
  assert.deepEqual(missingKey.lookups, []);
  assert.deepEqual(missingScope.lookups, []);
  await fixture({ operation: 'PUBLISH_EVENT', scopes: ['EVENTS_PUBLISH'], grant: { operations: ['PUBLISH_EVENT'] } }).authorize();
});

test('returns the same 404 for missing journeys and invalid, expired, revoked or mismatched grants', async () => {
  for (const grant of [
    null, { journey: null }, { digest: hash(Buffer.alloc(32, 17)) },
    { expiresAt: new Date(0) }, { revokedAt: new Date(0) },
    { channelId: otherId }, { journey: { id: otherId } },
    { operations: ['PUBLISH_EVENT'] }, { actorRef: ' ' },
  ]) {
    const attempt = fixture({ grant });
    await assert.rejects(attempt.authorize, hasStatus(404));
    assert.equal(attempt.request.journeyAccess, undefined);
  }
});

test('rejects missing or malformed grants and malformed journey IDs before lookup', async () => {
  const missing = fixture();
  delete missing.request.headers['x-journey-grant'];
  const malformed = fixture();
  malformed.request.headers['x-journey-grant'] += '=';
  const duplicate = fixture();
  const header = duplicate.request.headers['x-journey-grant'];
  duplicate.request.headersDistinct = { 'x-journey-grant': [header, header] };
  const invalidJourney = fixture();
  invalidJourney.request.params.journeyId = 'invalid';
  for (const attempt of [missing, malformed, duplicate, invalidJourney]) {
    await assert.rejects(attempt.authorize, hasStatus(404));
    assert.deepEqual(attempt.lookups, []);
  }
});

test('binds publication to the body journey and rejects a mismatched grant', async () => {
  const attempt = fixture({ operation: 'PUBLISH_EVENT', scopes: ['EVENTS_PUBLISH'], source: 'body', grant: {
    operations: ['PUBLISH_EVENT'],
  } });
  await assert.rejects(attempt.authorize, hasStatus(404));
  attempt.request.body.journeyId = journeyId;
  await attempt.authorize();
  assert.equal(attempt.request.journeyAccess.journeyId, journeyId);
});
