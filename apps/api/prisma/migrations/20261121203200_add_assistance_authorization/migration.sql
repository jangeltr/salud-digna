-- CreateTable
CREATE TABLE "AssistanceAuthorization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "codeExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "claimedAt" TIMESTAMPTZ(3),
    "advisorId" UUID,
    "accessExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "AssistanceAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceAuthorization_codeHash_key" ON "AssistanceAuthorization"("codeHash");

-- CreateIndex
CREATE INDEX "AssistanceAuthorization_requestId_advisorId_accessExpiresAt_idx" ON "AssistanceAuthorization"("requestId", "advisorId", "accessExpiresAt");

-- AddForeignKey
ALTER TABLE "AssistanceAuthorization" ADD CONSTRAINT "AssistanceAuthorization_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceAuthorization" ADD CONSTRAINT "AssistanceAuthorization_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
