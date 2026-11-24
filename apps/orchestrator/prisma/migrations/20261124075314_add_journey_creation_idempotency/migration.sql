BEGIN;

SET LOCAL search_path = "public";

-- CreateTable
CREATE TABLE "JourneyCreationRequest" (
    "channelId" UUID NOT NULL,
    "keyDigest" BYTEA NOT NULL,
    "requestDigest" BYTEA NOT NULL,
    "initialGrantId" UUID NOT NULL,
    "initialStatus" "JourneyStatus" NOT NULL,

    CONSTRAINT "JourneyCreationRequest_pkey" PRIMARY KEY ("channelId","keyDigest")
);

-- CreateIndex
CREATE UNIQUE INDEX "JourneyCreationRequest_initialGrantId_key" ON "JourneyCreationRequest"("initialGrantId");

-- AddForeignKey
ALTER TABLE "JourneyCreationRequest" ADD CONSTRAINT "JourneyCreationRequest_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyCreationRequest" ADD CONSTRAINT "JourneyCreationRequest_initialGrantId_fkey" FOREIGN KEY ("initialGrantId") REFERENCES "JourneyAccessGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JourneyCreationRequest"
  ADD CONSTRAINT "journey_creation_request_digest_lengths_check"
  CHECK (octet_length("keyDigest") = 32 AND octet_length("requestDigest") = 32);

COMMIT;
