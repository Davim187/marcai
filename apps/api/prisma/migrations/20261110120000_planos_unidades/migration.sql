-- Três planos (Básico, Profissional, Premium) e unidades: um estabelecimento pode ter
-- unidades extras que usam a assinatura da unidade principal.
-- AlterEnum
ALTER TYPE "PlanId" ADD VALUE 'premium';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "parentTenantId" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_parentTenantId_idx" ON "Tenant"("parentTenantId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_parentTenantId_fkey" FOREIGN KEY ("parentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

