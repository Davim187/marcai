-- Gestão de acessos: o administrador do sistema pode desativar uma conta.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
