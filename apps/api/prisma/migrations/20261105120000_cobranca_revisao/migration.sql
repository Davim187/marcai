-- Revisão da cobrança: validade do link de pagamento e pagamento em análise
ALTER TABLE "Invoice" ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3),
ADD COLUMN "processingSince" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "billingDay" INTEGER;
