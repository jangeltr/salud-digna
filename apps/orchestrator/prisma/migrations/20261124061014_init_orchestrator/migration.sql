BEGIN;

-- Use the existing schema of the orchestrator database.
SET LOCAL search_path = "public";

-- CreateEnum
CREATE TYPE "PatientIdentifierType" AS ENUM ('PATIENT_ID', 'CUSTOMER_ID', 'CURP', 'RFC', 'NSS', 'PHONE');

-- CreateEnum
CREATE TYPE "PatientIdentifierStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'PENDING_CONFIRMATION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessAuditAction" AS ENUM ('READ_CONTEXT', 'READ_TIMELINE', 'UPDATE_CONTEXT', 'CHANGE_JOURNEY_STATUS', 'LINK_IDENTIFIER', 'VERIFY_IDENTIFIER', 'REVOKE_IDENTIFIER');

-- CreateEnum
CREATE TYPE "AccessAuditOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateTable
CREATE TABLE "PatientSubject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientIdentifier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientSubjectId" UUID NOT NULL,
    "sourceChannelId" UUID NOT NULL,
    "type" "PatientIdentifierType" NOT NULL,
    "namespace" VARCHAR(100) NOT NULL,
    "lookupDigest" BYTEA NOT NULL,
    "verifiedLookupDigest" BYTEA,
    "status" "PatientIdentifierStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationMethod" VARCHAR(64),
    "verificationRef" VARCHAR(128),
    "verifiedAt" TIMESTAMPTZ(3),
    "validUntil" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PatientIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientSubjectId" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "status" "JourneyStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyContext" (
    "journeyId" UUID NOT NULL,
    "currentStep" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "externalRefs" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JourneyContext_pkey" PRIMARY KEY ("journeyId")
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journeyId" UUID NOT NULL,
    "producerId" UUID NOT NULL,
    "externalEventId" VARCHAR(128) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channelId" UUID,
    "patientSubjectId" UUID,
    "journeyId" UUID,
    "actorRef" VARCHAR(128),
    "action" "AccessAuditAction" NOT NULL,
    "outcome" "AccessAuditOutcome" NOT NULL,
    "reasonCode" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientIdentifier_sourceChannelId_idx" ON "PatientIdentifier"("sourceChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_identifier_subject_key" ON "PatientIdentifier"("patientSubjectId", "type", "namespace", "lookupDigest");

-- CreateIndex
CREATE UNIQUE INDEX "patient_identifier_verified_key" ON "PatientIdentifier"("type", "namespace", "verifiedLookupDigest");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_code_key" ON "Channel"("code");

-- CreateIndex
CREATE INDEX "Journey_patientSubjectId_updatedAt_id_idx" ON "Journey"("patientSubjectId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_occurredAt_id_idx" ON "JourneyEvent"("journeyId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEvent_producerId_externalEventId_key" ON "JourneyEvent"("producerId", "externalEventId");

-- CreateIndex
CREATE INDEX "AccessAudit_journeyId_createdAt_id_idx" ON "AccessAudit"("journeyId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AccessAudit_patientSubjectId_createdAt_id_idx" ON "AccessAudit"("patientSubjectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AccessAudit_channelId_createdAt_id_idx" ON "AccessAudit"("channelId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "PatientIdentifier" ADD CONSTRAINT "PatientIdentifier_patientSubjectId_fkey" FOREIGN KEY ("patientSubjectId") REFERENCES "PatientSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientIdentifier" ADD CONSTRAINT "PatientIdentifier_sourceChannelId_fkey" FOREIGN KEY ("sourceChannelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_patientSubjectId_fkey" FOREIGN KEY ("patientSubjectId") REFERENCES "PatientSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyContext" ADD CONSTRAINT "JourneyContext_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAudit" ADD CONSTRAINT "AccessAudit_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAudit" ADD CONSTRAINT "AccessAudit_patientSubjectId_fkey" FOREIGN KEY ("patientSubjectId") REFERENCES "PatientSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAudit" ADD CONSTRAINT "AccessAudit_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add row integrity checks documented in docs/data-model.md.
ALTER TABLE "PatientIdentifier"
  ADD CONSTRAINT "patient_identifier_digest_length_check"
  CHECK (
    octet_length("lookupDigest") = 32
    AND ("verifiedLookupDigest" IS NULL OR octet_length("verifiedLookupDigest") = 32)
  ),
  ADD CONSTRAINT "patient_identifier_status_check"
  CHECK (
    (
      "status" = 'PENDING'
      AND "verifiedLookupDigest" IS NULL
      AND "verificationMethod" IS NULL
      AND "verificationRef" IS NULL
      AND "verifiedAt" IS NULL
      AND "validUntil" IS NULL
      AND "revokedAt" IS NULL
    )
    OR (
      "status" IN ('VERIFIED', 'REVOKED')
      AND "verificationMethod" IS NOT NULL
      AND "verificationMethod" ~ '[^[:space:]]'
      AND "verificationRef" IS NOT NULL
      AND "verificationRef" ~ '[^[:space:]]'
      AND "verifiedAt" IS NOT NULL
      AND "verifiedAt" >= "createdAt"
      AND ("validUntil" IS NULL OR "validUntil" > "verifiedAt")
      AND (
        (
          "status" = 'VERIFIED'
          AND "verifiedLookupDigest" IS NOT NULL
          AND "verifiedLookupDigest" = "lookupDigest"
          AND "revokedAt" IS NULL
        )
        OR (
          "status" = 'REVOKED'
          AND "verifiedLookupDigest" IS NULL
          AND "revokedAt" IS NOT NULL
          AND "revokedAt" >= "verifiedAt"
        )
      )
    )
  );

ALTER TABLE "Journey"
  ADD CONSTRAINT "journey_status_closed_at_check"
  CHECK (
    ("status" IN ('DRAFT', 'IN_PROGRESS', 'PENDING_CONFIRMATION') AND "closedAt" IS NULL)
    OR (
      "status" IN ('COMPLETED', 'CANCELLED')
      AND "closedAt" IS NOT NULL
      AND "closedAt" >= "createdAt"
    )
  );

ALTER TABLE "JourneyContext"
  ADD CONSTRAINT "journey_context_positive_version_check" CHECK ("version" > 0);

ALTER TABLE "JourneyEvent"
  ADD CONSTRAINT "journey_event_positive_schema_version_check" CHECK ("schemaVersion" > 0);

COMMIT;
