-- Refresh token com rotação + retorno do modo suporte para a sessão do admin
ALTER TABLE "Session" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);
-- Sessões já abertas mantêm o token atual até o fim (sem refresh token: depois, novo login)
UPDATE "Session" SET "accessExpiresAt" = "expiresAt";
ALTER TABLE "Session" ALTER COLUMN "accessExpiresAt" SET NOT NULL;

ALTER TABLE "Session" ADD COLUMN "refreshTokenHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "previousRefreshHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "refreshedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "parentSessionId" TEXT;
ALTER TABLE "Session" ADD COLUMN "returnTokenHash" TEXT;

CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
CREATE UNIQUE INDEX "Session_previousRefreshHash_key" ON "Session"("previousRefreshHash");
