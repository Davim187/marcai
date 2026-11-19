-- Central de ajuda: preferências de orientação e progresso de tours/tutoriais por usuário.
-- CreateTable
CREATE TABLE "HelpPreference" (
    "userId" TEXT NOT NULL,
    "beginnerMode" BOOLEAN NOT NULL DEFAULT false,
    "introSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "HelpProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "timesCompleted" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpProgress_userId_itemId_key" ON "HelpProgress"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "HelpPreference" ADD CONSTRAINT "HelpPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpProgress" ADD CONSTRAINT "HelpProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

