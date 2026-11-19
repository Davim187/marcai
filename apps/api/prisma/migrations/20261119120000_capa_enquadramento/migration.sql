-- Enquadramento da foto de capa: ponto focal (X/Y em %) e zoom (100 = sem zoom).
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "coverPositionX" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "coverPositionY" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "coverZoom" INTEGER NOT NULL DEFAULT 100;
