-- CreateEnum
CREATE TYPE "ImageMaterialLicenseStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'BRAND_PROVIDED', 'SUPPLIER_PROVIDED', 'OWNED', 'PUBLIC_DOMAIN', 'CC', 'INTERNAL_DEMO_APPROVED');

-- CreateEnum
CREATE TYPE "ImageMaterialReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImageMaterialStorageProvider" AS ENUM ('LOCAL', 'CLOUDFLARE_R2', 'ALIYUN_OSS', 'REMOTE_URL');

-- CreateTable
CREATE TABLE "ProductImageMaterial" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "localUrl" TEXT,
    "productImageId" TEXT,
    "sourcePage" TEXT,
    "sourceName" TEXT,
    "licenseStatus" "ImageMaterialLicenseStatus" NOT NULL DEFAULT 'PENDING',
    "reviewStatus" "ImageMaterialReviewStatus" NOT NULL DEFAULT 'PENDING',
    "storageProvider" "ImageMaterialStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "contentType" TEXT,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "imageHash" TEXT,
    "duplicateOfMaterialId" TEXT,
    "authAttachmentUrl" TEXT,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImageMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImageMaterial_productId_idx" ON "ProductImageMaterial"("productId");

-- CreateIndex
CREATE INDEX "ProductImageMaterial_licenseStatus_idx" ON "ProductImageMaterial"("licenseStatus");

-- CreateIndex
CREATE INDEX "ProductImageMaterial_reviewStatus_idx" ON "ProductImageMaterial"("reviewStatus");

-- CreateIndex
CREATE INDEX "ProductImageMaterial_storageProvider_idx" ON "ProductImageMaterial"("storageProvider");

-- CreateIndex
CREATE INDEX "ProductImageMaterial_imageHash_idx" ON "ProductImageMaterial"("imageHash");

-- CreateIndex
CREATE INDEX "ProductImageMaterial_createdAt_idx" ON "ProductImageMaterial"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductImageMaterial" ADD CONSTRAINT "ProductImageMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
