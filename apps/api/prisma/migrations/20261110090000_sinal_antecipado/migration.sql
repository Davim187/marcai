-- Sinal antecipado: a cliente paga 50% ou 100% (Mercado Pago do estabelecimento ou PIX com comprovante)
-- antes de o horário ser confirmado.
-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('awaiting_payment', 'under_review', 'paid', 'rejected', 'expired', 'refunded');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "mpAccessTokenEnc" TEXT,
ADD COLUMN     "mpAccountLabel" TEXT,
ADD COLUMN     "mpConnectedAt" TIMESTAMP(3),
ADD COLUMN     "pixKey" TEXT,
ADD COLUMN     "pixKeyHolder" TEXT,
ADD COLUMN     "prepaymentHoldMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "prepaymentMethod" TEXT NOT NULL DEFAULT 'pix_manual',
ADD COLUMN     "prepaymentPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "requirePrepayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BookingPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" "BookingPaymentStatus" NOT NULL DEFAULT 'awaiting_payment',
    "percent" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "checkoutId" TEXT,
    "checkoutUrl" TEXT,
    "providerPaymentId" TEXT,
    "proofUrl" TEXT,
    "proofUploadedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_bookingId_key" ON "BookingPayment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_providerPaymentId_key" ON "BookingPayment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "BookingPayment_status_expiresAt_idx" ON "BookingPayment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BookingPayment_tenantId_status_idx" ON "BookingPayment"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

