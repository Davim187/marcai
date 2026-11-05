ALTER TABLE "Booking" ADD COLUMN "customerName" TEXT;
-- Convite para conta existente precisa ser aceito (as atuais já contam como aceitas)
ALTER TABLE "TenantMember" ADD COLUMN "acceptedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- Links antigos reservados (troca de endereço da página)
CREATE TABLE "SlugHistory" (
    "slug" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlugHistory_pkey" PRIMARY KEY ("slug")
);
CREATE INDEX "SlugHistory_tenantId_idx" ON "SlugHistory"("tenantId");
ALTER TABLE "SlugHistory" ADD CONSTRAINT "SlugHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
