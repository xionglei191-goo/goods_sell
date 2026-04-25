-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('H5', 'MINI_PROGRAM', 'MANUAL');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "wechatBoundAt" TIMESTAMP(3),
ADD COLUMN     "wechatMiniOpenId" TEXT,
ADD COLUMN     "wechatOfficialOpenId" TEXT,
ADD COLUMN     "wechatSessionKey" TEXT,
ADD COLUMN     "wechatUnionId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'H5';

-- CreateTable
CREATE TABLE "IntegrationCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatMessageLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "orderId" TEXT,
    "openId" TEXT,
    "scene" TEXT NOT NULL,
    "templateId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatShareEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "openId" TEXT,
    "scene" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WechatShareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCache_key_key" ON "IntegrationCache"("key");

-- CreateIndex
CREATE INDEX "IntegrationCache_expiresAt_idx" ON "IntegrationCache"("expiresAt");

-- CreateIndex
CREATE INDEX "WechatMessageLog_customerId_idx" ON "WechatMessageLog"("customerId");

-- CreateIndex
CREATE INDEX "WechatMessageLog_orderId_idx" ON "WechatMessageLog"("orderId");

-- CreateIndex
CREATE INDEX "WechatMessageLog_scene_idx" ON "WechatMessageLog"("scene");

-- CreateIndex
CREATE INDEX "WechatMessageLog_status_idx" ON "WechatMessageLog"("status");

-- CreateIndex
CREATE INDEX "WechatMessageLog_createdAt_idx" ON "WechatMessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "WechatShareEvent_customerId_idx" ON "WechatShareEvent"("customerId");

-- CreateIndex
CREATE INDEX "WechatShareEvent_scene_idx" ON "WechatShareEvent"("scene");

-- CreateIndex
CREATE INDEX "WechatShareEvent_createdAt_idx" ON "WechatShareEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_wechatMiniOpenId_key" ON "Customer"("wechatMiniOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_wechatOfficialOpenId_key" ON "Customer"("wechatOfficialOpenId");

-- CreateIndex
CREATE INDEX "Customer_wechatUnionId_idx" ON "Customer"("wechatUnionId");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex
CREATE INDEX "Order_source_idx" ON "Order"("source");

-- CreateIndex
CREATE INDEX "Order_customerId_status_createdAt_idx" ON "Order"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_customerId_status_createdAt_idx" ON "Payment"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Product_status_salesCount_idx" ON "Product"("status", "salesCount");

-- CreateIndex
CREATE INDEX "Product_status_createdAt_idx" ON "Product"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "WechatMessageLog" ADD CONSTRAINT "WechatMessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WechatMessageLog" ADD CONSTRAINT "WechatMessageLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WechatShareEvent" ADD CONSTRAINT "WechatShareEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
