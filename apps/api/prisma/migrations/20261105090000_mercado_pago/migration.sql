-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "checkoutId" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ALTER COLUMN "providerPaymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "providerCheckoutUrl" TEXT,
ALTER COLUMN "provider" SET DEFAULT 'mercadopago';

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_subscriptionId_dueDate_key" ON "Invoice"("subscriptionId", "dueDate");

