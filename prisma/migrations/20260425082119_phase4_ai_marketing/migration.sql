-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "points" INTEGER NOT NULL,
    "streak" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiContentCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiContentCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckIn_customerId_idx" ON "CheckIn"("customerId");

-- CreateIndex
CREATE INDEX "CheckIn_date_idx" ON "CheckIn"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_customerId_date_key" ON "CheckIn"("customerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AiContentCache_key_key" ON "AiContentCache"("key");

-- CreateIndex
CREATE INDEX "AiContentCache_expiresAt_idx" ON "AiContentCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
