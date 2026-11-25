require('reflect-metadata');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash, randomInt } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { Reflector } = require('@nestjs/core');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaService: ApiPrisma } = require('../../api/dist/persistence/prisma.service');
const { PrismaService: OrchestratorPrisma } = require('../dist/persistence/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { JourneyAccessGuard, RequireJourneyAccess } = require('../dist/journey-access/journey-access.guard');

const apiFixture = `
  CREATE TABLE "Patient" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "firstName" text NOT NULL, "lastName" text NOT NULL, "email" text, "phone" text,
    "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamptz(3) NOT NULL
  );
`;
const journeyId = '00000000-0000-4000-8000-000000000001';
const channelId = '00000000-0000-4000-8000-000000000002';
const orchestratorFixture = `
  CREATE TYPE "JourneyGrantOperation" AS ENUM ('PUBLISH_EVENT', 'READ_JOURNEY');
  CREATE TABLE "Journey" ("id" uuid PRIMARY KEY);
  CREATE TABLE "Channel" ("id" uuid PRIMARY KEY);
  INSERT INTO "Journey" VALUES ('${journeyId}');
  INSERT INTO "Channel" VALUES ('${channelId}');
  CREATE TABLE "JourneyAccessGrant" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "journeyId" uuid NOT NULL REFERENCES "Journey"("id"),
    "channelId" uuid NOT NULL REFERENCES "Channel"("id"),
    "digest" bytea NOT NULL UNIQUE CHECK (octet_length("digest") = 32),
    "actorRef" varchar(128) NOT NULL CHECK ("actorRef" ~ '[^[:space:]]'),
    "operations" "JourneyGrantOperation"[] NOT NULL DEFAULT '{}',
    "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" timestamptz(3) NOT NULL,
    "revokedAt" timestamptz(3),
    CONSTRAINT "journey_access_grant_dates_check" CHECK (
      "expiresAt" > "createdAt" AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    )
  );
`;

function startPostgres(t) {
  const directory = mkdtempSync(join(tmpdir(), 'salud-prisma-utc-'));
  const data = join(directory, 'data');
  const log = join(directory, 'postgres.log');
  const port = randomInt(49152, 65536);
  const binaries = process.env.UTC_TEST_POSTGRES_BIN ?? '/usr/lib/postgresql/17/bin';
  const run = (name, args, input) => execFileSync(join(binaries, name), args, { input, encoding: 'utf8' });
  let started = false;
  t.after(() => {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  });
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'utc_fixture', '--no-locale']);
  try {
    run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '10', '-o',
      `-h 127.0.0.1 -p ${port} -k ${directory} -c timezone=America/Mexico_City`, 'start']);
    started = true;
  } catch (error) {
    throw new Error('No se pudo iniciar PostgreSQL aislado.\n' + readFileSync(log, 'utf8'), { cause: error });
  }

  const sql = (database, input) => run('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', String(port), '-U', 'utc_fixture', '-d', database,
  ], input);
  sql('postgres', `
    CREATE ROLE salud_digna_orchestrator_app LOGIN;
    CREATE DATABASE salud_digna_api_utc_test;
    CREATE DATABASE salud_digna_orchestrator OWNER salud_digna_orchestrator_app;
  `);
  sql('salud_digna_api_utc_test', apiFixture);
  sql('salud_digna_orchestrator', 'SET ROLE salud_digna_orchestrator_app;\n' + orchestratorFixture);
  return {
    port,
    apiUrl: `postgresql://utc_fixture@127.0.0.1:${port}/salud_digna_api_utc_test`,
    orchestratorUrl: `postgresql://salud_digna_orchestrator_app:fixture-only@127.0.0.1:${port}/salud_digna_orchestrator`,
  };
}

const milliseconds = (epoch) => Math.round(Number(epoch) * 1000);

async function parameterEpoch(client, date) {
  const [row] = await client.$queryRaw`SELECT extract(epoch FROM ${date}::timestamptz)::text AS epoch`;
  return milliseconds(row.epoch);
}

async function defaultClock(client) {
  const [row] = await client.$queryRaw`SELECT extract(epoch FROM now()::timestamptz(3))::text AS epoch`;
  return milliseconds(row.epoch);
}

function authorizeGrant(service, secret) {
  class Controller { read() {} }
  RequireJourneyAccess('READ_JOURNEY')(
    Controller.prototype, 'read', Object.getOwnPropertyDescriptor(Controller.prototype, 'read'),
  );
  const request = {
    headers: { 'x-journey-grant': secret.toString('base64url') },
    params: { journeyId }, authenticatedChannel: { id: channelId },
  };
  return new JourneyAccessGuard(service, new Reflector()).canActivate({
    getHandler: () => Controller.prototype.read,
    switchToHttp: () => ({ getRequest: () => request }),
  });
}

test('Prisma uses UTC and preserves timestamps through PostgreSQL 17', async (t) => {
  const { apiUrl, orchestratorUrl, port } = startPostgres(t);
  const previous = { DATABASE_URL: process.env.DATABASE_URL, ORCHESTRATOR_DB_HOST: process.env.ORCHESTRATOR_DB_HOST,
    ORCHESTRATOR_DB_PORT: process.env.ORCHESTRATOR_DB_PORT };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // A URL option also used to override explicit pg pool options.
  const apiConfig = new URL(apiUrl);
  apiConfig.searchParams.set('options', '-c timezone=America/Mexico_City -c application_name=utc_fixture');
  process.env.DATABASE_URL = apiConfig.href;
  const api = new ApiPrisma().client;
  process.env.DATABASE_URL = orchestratorUrl;
  process.env.ORCHESTRATOR_DB_HOST = '127.0.0.1';
  process.env.ORCHESTRATOR_DB_PORT = String(port);
  const orchestrator = new OrchestratorPrisma();
  const control = new PrismaClient({ adapter: new PrismaPg({
    connectionString: orchestratorUrl, options: '-c timezone=America/Mexico_City',
  }) });

  try {
    const instant = new Date('2026-11-25T12:30:45.123Z');
    const [baseline] = await control.$queryRaw`SELECT current_setting('TimeZone') AS zone`;
    assert.equal(baseline.zone, 'America/Mexico_City');
    assert.equal(await parameterEpoch(control, instant) - instant.getTime(), 21_600_000);

    for (const client of [api, orchestrator.client]) {
      const [setting] = await client.$queryRaw`SELECT current_setting('TimeZone') AS zone`;
      assert.equal(setting.zone, 'UTC');
      assert.equal(await parameterEpoch(client, instant), instant.getTime());
    }
    const [apiSetting] = await api.$queryRaw`SELECT current_setting('application_name') AS name`;
    assert.equal(apiSetting.name, 'utc_fixture');

    const beforePatient = await defaultClock(api);
    const written = await api.patient.create({
      data: { firstName: 'Synthetic', lastName: 'UTC', updatedAt: instant },
      select: { id: true },
    });
    const patient = await api.patient.findUniqueOrThrow({
      where: { id: written.id }, select: { createdAt: true, updatedAt: true },
    });
    assert.equal(patient.updatedAt.getTime(), instant.getTime());
    assert.ok(patient.createdAt.getTime() >= beforePatient && patient.createdAt.getTime() <= await defaultClock(api));

    const db = orchestrator.client;
    const activeSecret = Buffer.alloc(32, 1);
    const expiredSecret = Buffer.alloc(32, 2);
    const setupGrant = (secret, data) => db.journeyAccessGrant.create({
      data: {
        journeyId, channelId, actorRef: 'test-session', operations: ['READ_JOURNEY'],
        digest: Uint8Array.from(createHash('sha256').update(secret).digest()), ...data,
      },
    });
    const createdAt = new Date(Date.now() - 1000);
    const expiresAt = new Date(createdAt.getTime() + 300_000);
    const grant = await setupGrant(activeSecret, { createdAt, expiresAt });
    const persisted = await db.journeyAccessGrant.findUniqueOrThrow({ where: { id: grant.id } });
    assert.equal(persisted.createdAt.getTime(), createdAt.getTime());
    assert.equal(persisted.expiresAt.getTime(), expiresAt.getTime());
    const [epoch] = await db.$queryRaw`
      SELECT extract(epoch FROM "expiresAt")::text AS expiry,
             extract(epoch FROM ("expiresAt" - "createdAt"))::text AS duration
      FROM "JourneyAccessGrant" WHERE "id" = ${grant.id}::uuid
    `;
    assert.equal(milliseconds(epoch.expiry), expiresAt.getTime());
    assert.equal(Number(epoch.duration), 300);
    assert.equal(await authorizeGrant(orchestrator, activeSecret), true);

    const expiredAt = new Date(Date.now() - 1000);
    await setupGrant(expiredSecret, { createdAt: new Date(expiredAt.getTime() - 300_000), expiresAt: expiredAt });
    await assert.rejects(authorizeGrant(orchestrator, expiredSecret), (error) => error.getStatus?.() === 404);
    await assert.rejects(db.journeyAccessGrant.update({
      where: { id: grant.id }, data: { revokedAt: new Date(createdAt.getTime() - 1) },
    }), /journey_access_grant_dates_check/);
    const revokedAt = new Date();
    const revoked = await db.journeyAccessGrant.update({ where: { id: grant.id }, data: { revokedAt } });
    assert.equal(revoked.revokedAt.getTime(), revokedAt.getTime());
    await assert.rejects(authorizeGrant(orchestrator, activeSecret), (error) => error.getStatus?.() === 404);

    const beforeGrant = await defaultClock(db);
    const withDefaultDate = await setupGrant(Buffer.alloc(32, 3), { expiresAt: new Date(Date.now() + 300_000) });
    assert.ok(withDefaultDate.createdAt.getTime() >= beforeGrant && withDefaultDate.createdAt.getTime() <= await defaultClock(db));
  } finally {
    await Promise.all([api.$disconnect(), orchestrator.onApplicationShutdown(), control.$disconnect()]);
  }
});
