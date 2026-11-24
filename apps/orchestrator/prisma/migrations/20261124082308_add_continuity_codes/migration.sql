BEGIN;

SET LOCAL search_path = "public";

-- AlterEnum
ALTER TYPE "AccessAuditAction" ADD VALUE 'ISSUE_CONTINUITY_CODE';
ALTER TYPE "AccessAuditAction" ADD VALUE 'REDEEM_CONTINUITY_CODE';

-- CreateTable
CREATE TABLE "ContinuityCode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "digest" BYTEA NOT NULL,
    "sourceGrantId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ContinuityCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContinuityCode_digest_key" ON "ContinuityCode"("digest");

-- CreateIndex
CREATE INDEX "ContinuityCode_sourceGrantId_idx" ON "ContinuityCode"("sourceGrantId");

-- AddForeignKey
ALTER TABLE "ContinuityCode" ADD CONSTRAINT "ContinuityCode_sourceGrantId_fkey" FOREIGN KEY ("sourceGrantId") REFERENCES "JourneyAccessGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContinuityCode"
  ADD CONSTRAINT "continuity_code_digest_length_check"
  CHECK (octet_length("digest") = 32),
  ADD CONSTRAINT "continuity_code_dates_check"
  CHECK (
    "expiresAt" > "createdAt"
    AND ("consumedAt" IS NULL OR ("consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt"))
  );

COMMIT;
