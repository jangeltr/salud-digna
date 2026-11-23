BEGIN;

-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('META', 'TWILIO');

-- DropIndex
DROP INDEX "WhatsAppInbox_phoneNumberId_status_nextAttemptAt_idx";

-- AlterTable
ALTER TABLE "WhatsAppInbox" DROP CONSTRAINT "WhatsAppInbox_pkey",
ADD COLUMN     "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META',
ADD CONSTRAINT "WhatsAppInbox_pkey" PRIMARY KEY ("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppInbox_provider_recipient_status_next_idx" ON "WhatsAppInbox"("provider", "phoneNumberId", "status", "nextAttemptAt");

COMMIT;
