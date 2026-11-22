-- CreateEnum
CREATE TYPE "WhatsAppInboxStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsAppInbox" (
    "providerMessageId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "sender" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "input" JSONB,
    "reply" TEXT,
    "status" "WhatsAppInboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outboundMessageId" TEXT,
    "lastError" TEXT,

    CONSTRAINT "WhatsAppInbox_pkey" PRIMARY KEY ("providerMessageId")
);

-- CreateIndex
CREATE INDEX "WhatsAppInbox_phoneNumberId_status_nextAttemptAt_idx" ON "WhatsAppInbox"("phoneNumberId", "status", "nextAttemptAt");
