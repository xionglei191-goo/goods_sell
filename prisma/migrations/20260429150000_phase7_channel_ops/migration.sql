-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('SHOP', 'WECHAT_MINI', 'WECHAT_OFFICIAL', 'SALESPERSON_CODE', 'DEALER_CODE', 'AI_INTERACTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "LeadScene" AS ENUM ('BANQUET', 'GROUP_BUY', 'RESTOCK', 'GIFT', 'NEW_PRODUCT_TRIAL', 'RETAIL', 'DEALER_JOIN', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ASSIGNED', 'FOLLOWING', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'ASSIGNED', 'QUOTED', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "PromoterOwnerType" AS ENUM ('SALESPERSON', 'DEALER', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "DealerPriceLevel" AS ENUM ('RETAIL', 'WHOLESALE', 'VIP');

-- CreateEnum
CREATE TYPE "ProductPushStatus" AS ENUM ('DRAFT', 'SENT', 'OPENED', 'CLICKED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChannelConflictType" AS ENUM ('CROSS_ZONE', 'PRICE_ANOMALY', 'REJECTION', 'COMPLAINT', 'STOCK_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ChannelConflictStatus" AS ENUM ('OPEN', 'PROCESSING', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "PromoterCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerType" "PromoterOwnerType" NOT NULL,
    "label" TEXT NOT NULL,
    "scene" "LeadScene",
    "salespersonId" TEXT,
    "dealerId" TEXT,
    "campaignId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoterCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "scene" "LeadScene" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "name" TEXT,
    "phone" TEXT,
    "customerId" TEXT,
    "salespersonId" TEXT,
    "dealerId" TEXT,
    "promoterCodeId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "inquiryNo" TEXT NOT NULL,
    "scene" "LeadScene" NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "leadId" TEXT,
    "customerId" TEXT,
    "salespersonId" TEXT,
    "dealerId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "budget" DECIMAL(12,2),
    "expectedDate" TIMESTAMP(3),
    "deliveryAddress" TEXT,
    "needsInvoice" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNo" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "inquiryId" TEXT NOT NULL,
    "customerId" TEXT,
    "createdById" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "content" JSONB NOT NULL,
    "convertedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerPolicy" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "minOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxOrderAmount" DECIMAL(12,2),
    "priceLevel" "DealerPriceLevel" NOT NULL DEFAULT 'RETAIL',
    "allowCrossZone" BOOLEAN NOT NULL DEFAULT false,
    "allowReject" BOOLEAN NOT NULL DEFAULT true,
    "rejectLimitPerDay" INTEGER NOT NULL DEFAULT 5,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "brandIds" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPush" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "campaignId" TEXT,
    "customerId" TEXT,
    "targetTag" TEXT,
    "status" "ProductPushStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" JSONB,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConflict" (
    "id" TEXT NOT NULL,
    "type" "ChannelConflictType" NOT NULL,
    "status" "ChannelConflictStatus" NOT NULL DEFAULT 'OPEN',
    "orderId" TEXT,
    "dealerId" TEXT,
    "customerId" TEXT,
    "ownerId" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoterCode_code_key" ON "PromoterCode"("code");

-- CreateIndex
CREATE INDEX "PromoterCode_ownerType_idx" ON "PromoterCode"("ownerType");

-- CreateIndex
CREATE INDEX "PromoterCode_scene_idx" ON "PromoterCode"("scene");

-- CreateIndex
CREATE INDEX "PromoterCode_salespersonId_idx" ON "PromoterCode"("salespersonId");

-- CreateIndex
CREATE INDEX "PromoterCode_dealerId_idx" ON "PromoterCode"("dealerId");

-- CreateIndex
CREATE INDEX "PromoterCode_campaignId_idx" ON "PromoterCode"("campaignId");

-- CreateIndex
CREATE INDEX "PromoterCode_isActive_idx" ON "PromoterCode"("isActive");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_scene_idx" ON "Lead"("scene");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_customerId_idx" ON "Lead"("customerId");

-- CreateIndex
CREATE INDEX "Lead_salespersonId_idx" ON "Lead"("salespersonId");

-- CreateIndex
CREATE INDEX "Lead_dealerId_idx" ON "Lead"("dealerId");

-- CreateIndex
CREATE INDEX "Lead_promoterCodeId_idx" ON "Lead"("promoterCodeId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_inquiryNo_key" ON "Inquiry"("inquiryNo");

-- CreateIndex
CREATE INDEX "Inquiry_scene_idx" ON "Inquiry"("scene");

-- CreateIndex
CREATE INDEX "Inquiry_status_idx" ON "Inquiry"("status");

-- CreateIndex
CREATE INDEX "Inquiry_leadId_idx" ON "Inquiry"("leadId");

-- CreateIndex
CREATE INDEX "Inquiry_customerId_idx" ON "Inquiry"("customerId");

-- CreateIndex
CREATE INDEX "Inquiry_salespersonId_idx" ON "Inquiry"("salespersonId");

-- CreateIndex
CREATE INDEX "Inquiry_dealerId_idx" ON "Inquiry"("dealerId");

-- CreateIndex
CREATE INDEX "Inquiry_contactPhone_idx" ON "Inquiry"("contactPhone");

-- CreateIndex
CREATE INDEX "Inquiry_createdAt_idx" ON "Inquiry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNo_key" ON "Quote"("quoteNo");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_inquiryId_idx" ON "Quote"("inquiryId");

-- CreateIndex
CREATE INDEX "Quote_customerId_idx" ON "Quote"("customerId");

-- CreateIndex
CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealerPolicy_dealerId_key" ON "DealerPolicy"("dealerId");

-- CreateIndex
CREATE INDEX "DealerPolicy_priceLevel_idx" ON "DealerPolicy"("priceLevel");

-- CreateIndex
CREATE INDEX "DealerPolicy_allowCrossZone_idx" ON "DealerPolicy"("allowCrossZone");

-- CreateIndex
CREATE INDEX "DealerPolicy_priority_idx" ON "DealerPolicy"("priority");

-- CreateIndex
CREATE INDEX "ProductPush_productId_idx" ON "ProductPush"("productId");

-- CreateIndex
CREATE INDEX "ProductPush_campaignId_idx" ON "ProductPush"("campaignId");

-- CreateIndex
CREATE INDEX "ProductPush_customerId_idx" ON "ProductPush"("customerId");

-- CreateIndex
CREATE INDEX "ProductPush_targetTag_idx" ON "ProductPush"("targetTag");

-- CreateIndex
CREATE INDEX "ProductPush_status_idx" ON "ProductPush"("status");

-- CreateIndex
CREATE INDEX "ProductPush_createdAt_idx" ON "ProductPush"("createdAt");

-- CreateIndex
CREATE INDEX "ChannelConflict_type_idx" ON "ChannelConflict"("type");

-- CreateIndex
CREATE INDEX "ChannelConflict_status_idx" ON "ChannelConflict"("status");

-- CreateIndex
CREATE INDEX "ChannelConflict_orderId_idx" ON "ChannelConflict"("orderId");

-- CreateIndex
CREATE INDEX "ChannelConflict_dealerId_idx" ON "ChannelConflict"("dealerId");

-- CreateIndex
CREATE INDEX "ChannelConflict_customerId_idx" ON "ChannelConflict"("customerId");

-- CreateIndex
CREATE INDEX "ChannelConflict_ownerId_idx" ON "ChannelConflict"("ownerId");

-- CreateIndex
CREATE INDEX "ChannelConflict_createdAt_idx" ON "ChannelConflict"("createdAt");

-- AddForeignKey
ALTER TABLE "PromoterCode" ADD CONSTRAINT "PromoterCode_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterCode" ADD CONSTRAINT "PromoterCode_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoterCode" ADD CONSTRAINT "PromoterCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_promoterCodeId_fkey" FOREIGN KEY ("promoterCodeId") REFERENCES "PromoterCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPolicy" ADD CONSTRAINT "DealerPolicy_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPush" ADD CONSTRAINT "ProductPush_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPush" ADD CONSTRAINT "ProductPush_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPush" ADD CONSTRAINT "ProductPush_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConflict" ADD CONSTRAINT "ChannelConflict_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConflict" ADD CONSTRAINT "ChannelConflict_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConflict" ADD CONSTRAINT "ChannelConflict_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
