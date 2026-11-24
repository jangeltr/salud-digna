BEGIN;

SET LOCAL search_path = "public";

-- CreateEnum
CREATE TYPE "ChannelScope" AS ENUM ('EVENTS_PUBLISH', 'JOURNEYS_READ');

-- CreateEnum
CREATE TYPE "JourneyGrantOperation" AS ENUM ('PUBLISH_EVENT', 'READ_JOURNEY');

-- CreateTable
CREATE TABLE "ChannelCredential" (
    "keyId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channelId" UUID NOT NULL,
    "secretDigest" BYTEA NOT NULL,
    "scopes" "ChannelScope"[] NOT NULL DEFAULT ARRAY[]::"ChannelScope"[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChannelCredential_pkey" PRIMARY KEY ("keyId")
);

-- CreateTable
CREATE TABLE "JourneyAccessGrant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journeyId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "digest" BYTEA NOT NULL,
    "actorRef" VARCHAR(128) NOT NULL,
    "operations" "JourneyGrantOperation"[] NOT NULL DEFAULT ARRAY[]::"JourneyGrantOperation"[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "JourneyAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelCredential_channelId_idx" ON "ChannelCredential"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyAccessGrant_digest_key" ON "JourneyAccessGrant"("digest");

-- CreateIndex
CREATE INDEX "JourneyAccessGrant_channelId_journeyId_expiresAt_idx" ON "JourneyAccessGrant"("channelId", "journeyId", "expiresAt");

-- CreateIndex
CREATE INDEX "JourneyAccessGrant_journeyId_idx" ON "JourneyAccessGrant"("journeyId");

-- AddForeignKey
ALTER TABLE "ChannelCredential" ADD CONSTRAINT "ChannelCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyAccessGrant" ADD CONSTRAINT "JourneyAccessGrant_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyAccessGrant" ADD CONSTRAINT "JourneyAccessGrant_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add row integrity checks for channel credentials and journey grants.
ALTER TABLE "ChannelCredential"
  ADD CONSTRAINT "channel_credential_digest_length_check"
  CHECK (octet_length("secretDigest") = 32),
  ADD CONSTRAINT "channel_credential_dates_check"
  CHECK (
    ("expiresAt" IS NULL OR "expiresAt" > "createdAt")
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
  );

ALTER TABLE "JourneyAccessGrant"
  ADD CONSTRAINT "journey_access_grant_digest_length_check"
  CHECK (octet_length("digest") = 32),
  ADD CONSTRAINT "journey_access_grant_actor_ref_check"
  CHECK ("actorRef" ~ '[^[:space:]]'),
  ADD CONSTRAINT "journey_access_grant_dates_check"
  CHECK (
    "expiresAt" > "createdAt"
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
  );

COMMIT;
