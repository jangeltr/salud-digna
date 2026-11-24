require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { Reflector } = require('@nestjs/core');
const { ChannelAuthGuard, RequireChannelScopes } = require('../dist/channel-auth/channel-auth.guard');
const { ChannelScope } = require('../dist/generated/prisma/enums');

const keyId = '00000000-0000-4000-8000-000000000001';
const channelId = '00000000-0000-4000-8000-000000000002';
const secret = Buffer.alloc(32, 5);
const authorization = `Bearer ${keyId}.${secret.toString('base64url')}`;
const publish = ChannelScope.EVENTS_PUBLISH;
const read = ChannelScope.JOURNEYS_READ;

function fixture(header = authorization, changes = {}, routeScopes = [], controllerScopes = []) {
  class Controller {
    handle() {}
  }
  RequireChannelScopes(...controllerScopes)(Controller);
  RequireChannelScopes(...routeScopes)(
    Controller.prototype, 'handle', Object.getOwnPropertyDescriptor(Controller.prototype, 'handle'),
  );
  const request = { headers: { authorization: header }, body: { producerId: 'untrusted' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => Controller.prototype.handle,
    getClass: () => Controller,
  };
  const queries = [];
  const guard = new ChannelAuthGuard({
    client: {
      channelCredential: {
        async findUnique(query) {
          queries.push(query.where);
          return changes === null ? null : {
            secretDigest: createHash('sha256').update(secret).digest(),
            channel: { id: channelId, code: 'demo-test', isActive: true },
            scopes: [publish],
            expiresAt: null,
            revokedAt: null,
            ...changes,
          };
        },
      },
    },
  }, new Reflector());
  return { request, queries, authorize: () => guard.canActivate(context) };
}

const hasStatus = (status) => (error) => error.getStatus?.() === status;

test('authenticates using the stored channel identity and scopes only', async () => {
  const attempt = fixture(authorization, { scopes: [publish, read] }, [publish], [read]);
  assert.equal(await attempt.authorize(), true);
  assert.deepEqual(attempt.queries, [{ keyId }]);
  assert.deepEqual(attempt.request.authenticatedChannel, {
    id: channelId, code: 'demo-test', scopes: [publish, read],
  });
});

test('rejects absent, malformed, noncanonical and duplicate authorization before querying', async () => {
  for (const header of [null, 'Bearer invalid', `${authorization}=`, authorization.slice(0, -1) + 'R']) {
    const attempt = fixture(header ?? '');
    await assert.rejects(attempt.authorize, hasStatus(401));
    assert.deepEqual(attempt.queries, []);
  }
  const attempt = fixture();
  attempt.request.headersDistinct = { authorization: [authorization, authorization] };
  await assert.rejects(attempt.authorize, hasStatus(401));
  assert.deepEqual(attempt.queries, []);
});

test('rejects unknown keys, wrong secrets, revoked or expired keys and inactive channels', async () => {
  const wrongSecret = Buffer.alloc(32, 9).toString('base64url');
  await assert.rejects(fixture(`Bearer ${keyId}.${wrongSecret}`).authorize, hasStatus(401));
  for (const credential of [
    null,
    { secretDigest: Buffer.alloc(31) },
    { revokedAt: new Date(0) },
    { expiresAt: new Date(0) },
    { channel: { id: channelId, isActive: false } },
  ]) {
    const attempt = fixture(authorization, credential);
    await assert.rejects(attempt.authorize, hasStatus(401));
    assert.equal(attempt.request.authenticatedChannel, undefined);
  }
});

test('requires all declared scopes without granting route access to an empty scope list', async () => {
  for (const attempt of [
    fixture(authorization, {}, [publish], [read]),
    fixture(authorization, { scopes: [] }, [publish]),
  ]) {
    await assert.rejects(attempt.authorize, hasStatus(403));
    assert.equal(attempt.request.authenticatedChannel, undefined);
  }
});
