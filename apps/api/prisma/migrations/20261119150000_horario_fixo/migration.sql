-- Horário fixo semanal: série de sessões no mesmo dia e horário, renovada sozinha.
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "recurringEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringWeeks" INTEGER NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "BookingSeries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "nextStartsAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingSeries_endedAt_nextStartsAt_idx" ON "BookingSeries"("endedAt", "nextStartsAt");

-- CreateIndex
CREATE INDEX "BookingSeries_tenantId_customerId_idx" ON "BookingSeries"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Booking_seriesId_startsAt_idx" ON "Booking"("seriesId", "startsAt");

-- AddForeignKey
ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "BookingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

