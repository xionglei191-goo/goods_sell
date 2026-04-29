"use server";

import { createHash, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ImageMaterialLicenseStatus, ImageMaterialReviewStatus, ImageMaterialStorageProvider } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { logAction } from "@/features/logs/audit";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: { code: string; message: string } };

export type ImageMaterialCsvPreviewRow = {
  rowNumber: number;
  sku: string;
  productId: string | null;
  productName: string | null;
  imageUrl: string;
  sourcePage: string;
  sourceName: string;
  licenseStatus: ImageMaterialLicenseStatus | null;
  approved: boolean;
  authAttachmentUrl: string;
  notes: string;
  duplicateHint: string | null;
  errors: string[];
  warnings: string[];
};

export type ImageMaterialCsvPreviewResult =
  | {
      success: true;
      rows: ImageMaterialCsvPreviewRow[];
      summary: { total: number; importable: number; errors: number; warnings: number };
    }
  | { success: false; error: { code: string; message: string } };

export type ImageMaterialCsvImportResult =
  | { success: true; created: number; skipped: number; errors: string[] }
  | { success: false; error: { code: string; message: string } };

type StoredImage = {
  publicUrl: string;
  storageProvider: ImageMaterialStorageProvider;
  contentType: string | null;
  fileSize: number;
  width: number | null;
  height: number | null;
  imageHash: string;
  duplicateOfMaterialId: string | null;
};

type ProductForImage = { id?: string; sku: string; name?: string };

const PUBLIC_IMAGE_DIR = "public/images/products";
const PUBLIC_IMAGE_URL_PREFIX = "/images/products";
const STORAGE_OBJECT_PREFIX = "products";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const approvableLicenseStatuses = new Set<ImageMaterialLicenseStatus>([
  ImageMaterialLicenseStatus.AUTHORIZED,
  ImageMaterialLicenseStatus.BRAND_PROVIDED,
  ImageMaterialLicenseStatus.SUPPLIER_PROVIDED,
  ImageMaterialLicenseStatus.OWNED,
  ImageMaterialLicenseStatus.PUBLIC_DOMAIN,
  ImageMaterialLicenseStatus.CC,
  ImageMaterialLicenseStatus.INTERNAL_DEMO_APPROVED,
]);

const licenseAliases: Record<string, ImageMaterialLicenseStatus> = {
  pending: ImageMaterialLicenseStatus.PENDING,
  authorized: ImageMaterialLicenseStatus.AUTHORIZED,
  "brand-provided": ImageMaterialLicenseStatus.BRAND_PROVIDED,
  brand_provided: ImageMaterialLicenseStatus.BRAND_PROVIDED,
  "supplier-provided": ImageMaterialLicenseStatus.SUPPLIER_PROVIDED,
  supplier_provided: ImageMaterialLicenseStatus.SUPPLIER_PROVIDED,
  owned: ImageMaterialLicenseStatus.OWNED,
  "public-domain": ImageMaterialLicenseStatus.PUBLIC_DOMAIN,
  public_domain: ImageMaterialLicenseStatus.PUBLIC_DOMAIN,
  cc: ImageMaterialLicenseStatus.CC,
  "internal-demo-approved": ImageMaterialLicenseStatus.INTERNAL_DEMO_APPROVED,
  internal_demo_approved: ImageMaterialLicenseStatus.INTERNAL_DEMO_APPROVED,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function getFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isUsableImageUrl(value: string) {
  return isHttpUrl(value) || value.startsWith(`${PUBLIC_IMAGE_URL_PREFIX}/`);
}

function isUsableAttachmentUrl(value: string) {
  return value === "" || isHttpUrl(value) || value.startsWith("/");
}

function extensionFromContentType(contentType: string | null) {
  if (!contentType) return null;
  const type = contentType.split(";")[0]?.trim().toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return null;
}

function contentTypeFromExtension(value: string) {
  const ext = extensionFromPath(value);
  if (ext === ".jpg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return null;
}

function extensionFromPath(value: string) {
  const ext = path.extname(value.split("?")[0] ?? "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return null;
}

function safeSku(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function normalizeLicenseStatus(value: string) {
  const key = value.trim().toLowerCase();
  return licenseAliases[key] ?? (Object.values(ImageMaterialLicenseStatus).includes(value as ImageMaterialLicenseStatus) ? (value as ImageMaterialLicenseStatus) : null);
}

function isApproved(value: string) {
  return ["true", "yes", "1", "y", "已授权", "通过"].includes(value.trim().toLowerCase());
}

function makeImageFilename(sku: string, source: string, contentType: string | null, fallbackPath?: string) {
  const ext = extensionFromContentType(contentType) ?? extensionFromPath(fallbackPath ?? source) ?? ".jpg";
  const digest = createHash("sha1").update(source).digest("hex").slice(0, 10);
  return `${safeSku(sku)}-material-${digest}${ext}`;
}

function detectImageSize(buffer: Buffer, contentType: string | null) {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();

  if ((type === "image/png" || buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if ((type === "image/gif" || buffer.subarray(0, 3).toString("ascii") === "GIF") && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  if (type === "image/jpeg" || buffer[0] === 0xff) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }

  if ((type === "image/webp" || buffer.subarray(0, 4).toString("ascii") === "RIFF") && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return { width: null, height: null };
}

function storageProviderFromEnv() {
  const provider = (process.env.IMAGE_MATERIAL_STORAGE_PROVIDER ?? "LOCAL").toUpperCase();
  if (provider === "CLOUDFLARE_R2") return ImageMaterialStorageProvider.CLOUDFLARE_R2;
  if (provider === "ALIYUN_OSS") return ImageMaterialStorageProvider.ALIYUN_OSS;
  return ImageMaterialStorageProvider.LOCAL;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少存储配置：${name}`);
  return value;
}

function encodeObjectKey(value: string) {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

async function putLocalObject(key: string, buffer: Buffer) {
  const filename = path.basename(key);
  const targetDir = path.join(process.cwd(), PUBLIC_IMAGE_DIR);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, filename), buffer);
  return `${PUBLIC_IMAGE_URL_PREFIX}/${filename}`;
}

async function putCloudflareR2Object(key: string, buffer: Buffer, contentType: string) {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET");
  const publicBaseUrl = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const encodedKey = encodeObjectKey(key);
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(buffer).digest("hex");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: new Uint8Array(buffer),
  });
  if (!response.ok) throw new Error(`Cloudflare R2 上传失败：HTTP ${response.status}`);
  return `${publicBaseUrl}/${encodedKey}`;
}

async function putAliyunOssObject(key: string, buffer: Buffer, contentType: string) {
  const accessKeyId = requireEnv("OSS_ACCESS_KEY_ID");
  const accessKeySecret = requireEnv("OSS_ACCESS_KEY_SECRET");
  const bucket = requireEnv("OSS_BUCKET");
  const region = requireEnv("OSS_REGION");
  const publicBaseUrl = requireEnv("OSS_PUBLIC_BASE_URL").replace(/\/$/, "");
  const date = new Date().toUTCString();
  const encodedKey = encodeObjectKey(key);
  const resource = `/${bucket}/${key}`;
  const canonicalOssHeaders = "x-oss-object-acl:public-read\n";
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${canonicalOssHeaders}${resource}`;
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
  const response = await fetch(`https://${bucket}.${region}.aliyuncs.com/${encodedKey}`, {
    method: "PUT",
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      "Content-Type": contentType,
      Date: date,
      "x-oss-object-acl": "public-read",
    },
    body: new Uint8Array(buffer),
  });
  if (!response.ok) throw new Error(`阿里云 OSS 上传失败：HTTP ${response.status}`);
  return `${publicBaseUrl}/${encodedKey}`;
}

async function findDuplicateByHash(imageHash: string, exceptId?: string) {
  const duplicate = await prisma.productImageMaterial.findFirst({
    where: {
      imageHash,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return duplicate?.id ?? null;
}

async function storeImage(product: ProductForImage, buffer: Buffer, contentType: string | null, source: string, exceptMaterialId?: string): Promise<StoredImage> {
  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase() || contentTypeFromExtension(source) || "image/jpeg";
  const filename = makeImageFilename(product.sku, `${source}:${buffer.byteLength}:${createHash("sha1").update(buffer).digest("hex").slice(0, 8)}`, normalizedContentType, source);
  const objectKey = `${STORAGE_OBJECT_PREFIX}/${filename}`;
  const imageHash = createHash("sha256").update(buffer).digest("hex");
  const duplicateOfMaterialId = await findDuplicateByHash(imageHash, exceptMaterialId);
  const size = detectImageSize(buffer, normalizedContentType);
  const provider = storageProviderFromEnv();
  const publicUrl =
    provider === ImageMaterialStorageProvider.CLOUDFLARE_R2
      ? await putCloudflareR2Object(objectKey, buffer, normalizedContentType)
      : provider === ImageMaterialStorageProvider.ALIYUN_OSS
        ? await putAliyunOssObject(objectKey, buffer, normalizedContentType)
        : await putLocalObject(objectKey, buffer);

  return {
    publicUrl,
    storageProvider: provider,
    contentType: normalizedContentType,
    fileSize: buffer.byteLength,
    width: size.width,
    height: size.height,
    imageHash,
    duplicateOfMaterialId,
  };
}

function revalidateImageMaterialPaths(productId?: string) {
  revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
  revalidatePath("/shop");
  revalidatePath("/shop/catalog");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/materials");
  if (productId) {
    revalidatePath(`/dashboard/products/${productId}`);
  }
}

async function saveUploadedImage(product: ProductForImage, file: File) {
  if (!extensionFromContentType(file.type) && !extensionFromPath(file.name)) {
    throw new Error("仅支持 jpg、png、webp、gif 图片");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 8MB");
  }

  return storeImage(product, Buffer.from(await file.arrayBuffer()), file.type, file.name);
}

async function downloadAndStoreMaterialImage(material: { id: string; imageUrl: string }, product: ProductForImage) {
  if (material.imageUrl.startsWith(PUBLIC_IMAGE_URL_PREFIX)) {
    return {
      publicUrl: material.imageUrl,
      storageProvider: ImageMaterialStorageProvider.LOCAL,
      contentType: contentTypeFromExtension(material.imageUrl),
      fileSize: 0,
      width: null,
      height: null,
      imageHash: "",
      duplicateOfMaterialId: null,
    } satisfies StoredImage;
  }

  const response = await fetch(material.imageUrl, {
    headers: {
      "User-Agent": "HuaQi image material manager/1.0",
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  const ext = extensionFromContentType(contentType) ?? extensionFromPath(material.imageUrl);
  if (!ext) {
    throw new Error(`不支持的图片类型：${contentType ?? "unknown"}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 8MB");
  }

  return storeImage(product, Buffer.from(arrayBuffer), contentType, material.imageUrl, material.id);
}

export async function createImageMaterial(formData: FormData): Promise<ActionResult> {
  const productId = getFormString(formData, "productId");
  const imageUrl = getFormString(formData, "imageUrl");
  const sourcePage = getFormString(formData, "sourcePage");
  const sourceName = getFormString(formData, "sourceName");
  const notes = getFormString(formData, "notes");
  const authAttachmentUrl = getFormString(formData, "authAttachmentUrl");
  const licenseStatus = getFormString(formData, "licenseStatus") as ImageMaterialLicenseStatus;
  const uploadedFile = formData.get("imageFile");

  if (!productId) return { success: false, error: { code: "PRODUCT_REQUIRED", message: "请选择商品" } };
  if (!Object.values(ImageMaterialLicenseStatus).includes(licenseStatus)) {
    return { success: false, error: { code: "LICENSE_INVALID", message: "请选择有效的授权状态" } };
  }
  if (!imageUrl && !isUpload(uploadedFile)) {
    return { success: false, error: { code: "IMAGE_REQUIRED", message: "请上传图片或填写图片 URL" } };
  }
  if (imageUrl && !isUsableImageUrl(imageUrl)) {
    return { success: false, error: { code: "IMAGE_URL_INVALID", message: "图片 URL 需为 http(s) 或 /images/products 路径" } };
  }
  if (!isUsableAttachmentUrl(authAttachmentUrl)) {
    return { success: false, error: { code: "ATTACHMENT_INVALID", message: "授权附件需为 http(s) 或站内路径" } };
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, name: true },
    });

    if (!product) return { success: false, error: { code: "PRODUCT_NOT_FOUND", message: "商品不存在" } };

    const stored = isUpload(uploadedFile) ? await saveUploadedImage(product, uploadedFile) : null;
    const duplicateByUrl = imageUrl
      ? await prisma.productImageMaterial.findFirst({
          where: { imageUrl },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      : null;

    const material = await prisma.productImageMaterial.create({
      data: {
        productId,
        imageUrl: stored?.publicUrl ?? imageUrl,
        localUrl: stored?.publicUrl ?? null,
        productImageId: null,
        sourcePage: sourcePage || null,
        sourceName: sourceName || null,
        licenseStatus,
        reviewStatus: ImageMaterialReviewStatus.PENDING,
        storageProvider: stored?.storageProvider ?? ImageMaterialStorageProvider.REMOTE_URL,
        contentType: stored?.contentType ?? contentTypeFromExtension(imageUrl),
        fileSize: stored?.fileSize ?? null,
        width: stored?.width ?? null,
        height: stored?.height ?? null,
        imageHash: stored?.imageHash || null,
        duplicateOfMaterialId: stored?.duplicateOfMaterialId ?? duplicateByUrl?.id ?? null,
        authAttachmentUrl: authAttachmentUrl || null,
        notes: notes || null,
      },
      select: {
        id: true,
        imageUrl: true,
        localUrl: true,
        sourceName: true,
        licenseStatus: true,
        reviewStatus: true,
        storageProvider: true,
        imageHash: true,
        duplicateOfMaterialId: true,
      },
    });

    await logAction({
      module: "商品",
      action: "新增图片素材",
      targetType: "ProductImageMaterial",
      targetId: material.id,
      targetName: product.name,
      after: material,
      summary: `为 ${product.name} 新增图片素材`,
    });
    revalidateImageMaterialPaths(product.id);
    return { success: true, message: material.duplicateOfMaterialId ? "图片素材已登记，检测到重复素材" : "图片素材已登记" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_IMAGE_MATERIAL_FAILED", message: getErrorMessage(error) } };
  }
}

async function approveImageMaterialCore(id: string): Promise<ActionResult> {
  const material = await prisma.productImageMaterial.findUnique({
    where: { id },
    include: { product: { select: { id: true, sku: true, name: true } } },
  });

  if (!material) return { success: false, error: { code: "MATERIAL_NOT_FOUND", message: "图片素材不存在" } };
  if (!approvableLicenseStatuses.has(material.licenseStatus)) {
    return { success: false, error: { code: "LICENSE_PENDING", message: "授权状态未确认，不能设为主图" } };
  }

  const stored = material.localUrl
    ? ({
        publicUrl: material.localUrl,
        storageProvider: material.storageProvider,
        contentType: material.contentType,
        fileSize: material.fileSize ?? 0,
        width: material.width,
        height: material.height,
        imageHash: material.imageHash ?? "",
        duplicateOfMaterialId: material.duplicateOfMaterialId,
      } satisfies StoredImage)
    : await downloadAndStoreMaterialImage(material, material.product);
  const before = {
    id: material.id,
    reviewStatus: material.reviewStatus,
    localUrl: material.localUrl,
    productImageId: material.productImageId,
  };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.productImage.updateMany({
      where: { productId: material.productId },
      data: { isPrimary: false },
    });

    const existingImage = material.productImageId
      ? await tx.productImage.findUnique({ where: { id: material.productImageId }, select: { id: true } })
      : null;
    const image = existingImage
      ? await tx.productImage.update({
          where: { id: existingImage.id },
          data: { url: stored.publicUrl, alt: material.product.name, sortOrder: 0, isPrimary: true },
          select: { id: true, url: true, isPrimary: true },
        })
      : await tx.productImage.create({
          data: {
            productId: material.productId,
            url: stored.publicUrl,
            alt: material.product.name,
            sortOrder: 0,
            isPrimary: true,
          },
          select: { id: true, url: true, isPrimary: true },
        });

    return tx.productImageMaterial.update({
      where: { id },
      data: {
        localUrl: stored.publicUrl,
        productImageId: image.id,
        reviewStatus: ImageMaterialReviewStatus.APPROVED,
        storageProvider: stored.storageProvider,
        contentType: stored.contentType,
        fileSize: stored.fileSize || material.fileSize,
        width: stored.width,
        height: stored.height,
        imageHash: stored.imageHash || material.imageHash,
        duplicateOfMaterialId: stored.duplicateOfMaterialId ?? material.duplicateOfMaterialId,
        approvedAt: new Date(),
      },
      select: {
        id: true,
        localUrl: true,
        productImageId: true,
        reviewStatus: true,
        approvedAt: true,
        storageProvider: true,
        width: true,
        height: true,
        imageHash: true,
        duplicateOfMaterialId: true,
      },
    });
  });

  await logAction({
    module: "商品",
    action: "审核图片素材",
    targetType: "ProductImageMaterial",
    targetId: material.id,
    targetName: material.product.name,
    before,
    after: updated,
    summary: `通过 ${material.product.name} 图片素材并设为主图`,
  });
  revalidateImageMaterialPaths(material.productId);
  return { success: true, message: updated.duplicateOfMaterialId ? "已设为主图，检测到重复素材" : "已设为商品主图" };
}

export async function approveImageMaterial(id: string): Promise<ActionResult> {
  try {
    return await approveImageMaterialCore(id);
  } catch (error) {
    return { success: false, error: { code: "APPROVE_IMAGE_MATERIAL_FAILED", message: getErrorMessage(error) } };
  }
}

export async function rejectImageMaterial(id: string): Promise<ActionResult> {
  try {
    const before = await prisma.productImageMaterial.findUnique({
      where: { id },
      include: { product: { select: { id: true, name: true } } },
    });

    if (!before) return { success: false, error: { code: "MATERIAL_NOT_FOUND", message: "图片素材不存在" } };

    const material = await prisma.productImageMaterial.update({
      where: { id },
      data: { reviewStatus: ImageMaterialReviewStatus.REJECTED },
      select: { id: true, reviewStatus: true },
    });

    await logAction({
      module: "商品",
      action: "拒绝图片素材",
      targetType: "ProductImageMaterial",
      targetId: id,
      targetName: before.product.name,
      before,
      after: material,
      summary: `拒绝 ${before.product.name} 图片素材`,
    });
    revalidateImageMaterialPaths(before.productId);
    return { success: true, message: "图片素材已拒绝" };
  } catch (error) {
    return { success: false, error: { code: "REJECT_IMAGE_MATERIAL_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteImageMaterial(id: string): Promise<ActionResult> {
  try {
    const material = await prisma.productImageMaterial.findUnique({
      where: { id },
      include: { product: { select: { id: true, name: true } } },
    });

    if (!material) return { success: false, error: { code: "MATERIAL_NOT_FOUND", message: "图片素材不存在" } };

    await prisma.productImageMaterial.delete({ where: { id } });
    await logAction({
      module: "商品",
      action: "删除图片素材",
      targetType: "ProductImageMaterial",
      targetId: id,
      targetName: material.product.name,
      before: material,
      summary: `删除 ${material.product.name} 图片素材记录`,
    });
    revalidateImageMaterialPaths(material.productId);
    return { success: true, message: "图片素材记录已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_IMAGE_MATERIAL_FAILED", message: getErrorMessage(error) } };
  }
}

export async function batchProcessImageMaterials(ids: string[], operation: "approve" | "reject" | "delete"): Promise<ActionResult> {
  if (ids.length === 0) return { success: false, error: { code: "EMPTY_SELECTION", message: "请选择素材" } };
  const uniqueIds = Array.from(new Set(ids));
  let successCount = 0;
  const errors: string[] = [];

  for (const id of uniqueIds) {
    const result =
      operation === "approve"
        ? await approveImageMaterial(id)
        : operation === "reject"
          ? await rejectImageMaterial(id)
          : await deleteImageMaterial(id);
    if (result.success) {
      successCount += 1;
    } else {
      errors.push(result.error.message);
    }
  }

  if (successCount === 0) {
    return { success: false, error: { code: "BATCH_FAILED", message: errors[0] ?? "批量操作失败" } };
  }

  revalidateImageMaterialPaths();
  const operationLabel = operation === "approve" ? "通过并设主图" : operation === "reject" ? "拒绝" : "删除";
  return { success: true, message: `${operationLabel} ${successCount} 条素材${errors.length ? `，${errors.length} 条失败` : ""}` };
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const [headers, ...dataRows] = rows;
  if (!headers) return [];
  const normalizedHeaders = headers.map((header) => header.trim());
  return dataRows.map((values, index) => {
    const entry: Record<string, string> = {};
    normalizedHeaders.forEach((header, headerIndex) => {
      entry[header] = values[headerIndex]?.trim() ?? "";
    });
    return { rowNumber: index + 2, entry };
  });
}

export async function previewImageMaterialCsv(csvText: string): Promise<ImageMaterialCsvPreviewResult> {
  if (!csvText.trim()) {
    return { success: false, error: { code: "CSV_EMPTY", message: "请先粘贴或上传 CSV 内容" } };
  }

  try {
    const parsedRows = parseCsv(csvText);
    const products = await prisma.product.findMany({
      select: { id: true, sku: true, name: true },
    });
    const productBySku = new Map(products.map((product) => [product.sku, product]));
    const existingUrls = await prisma.productImageMaterial.findMany({
      where: { imageUrl: { in: parsedRows.map(({ entry }) => entry.candidateImageUrl || entry.imageUrl).filter(Boolean) } },
      select: { imageUrl: true, id: true },
    });
    const existingUrlMap = new Map(existingUrls.map((item) => [item.imageUrl, item.id]));
    const seenUrls = new Map<string, number>();

    const rows = parsedRows.map(({ rowNumber, entry }) => {
      const sku = entry.sku ?? "";
      const imageUrl = entry.candidateImageUrl || entry.imageUrl || "";
      const sourcePage = entry.sourcePage ?? "";
      const sourceName = entry.sourceName ?? "";
      const licenseStatus = normalizeLicenseStatus(entry.licenseStatus ?? "");
      const approved = isApproved(entry.approved ?? "");
      const authAttachmentUrl = entry.authAttachmentUrl ?? "";
      const notes = entry.notes ?? "";
      const product = productBySku.get(sku) ?? null;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!sku) errors.push("缺少 sku");
      if (!product) errors.push("SKU 不存在");
      if (!imageUrl) errors.push("缺少 candidateImageUrl/imageUrl");
      if (imageUrl && !isUsableImageUrl(imageUrl)) errors.push("图片 URL 必须为 http(s) 或 /images/products 路径");
      if (!licenseStatus) errors.push("licenseStatus 无效");
      if (licenseStatus === ImageMaterialLicenseStatus.PENDING) warnings.push("授权状态待确认，导入后不能直接设为主图");
      if (!approved) warnings.push("approved 不是 TRUE，本次应用时会跳过");
      if (!isUsableAttachmentUrl(authAttachmentUrl)) errors.push("授权附件需为 http(s) 或站内路径");

      const firstSeenRow = seenUrls.get(imageUrl);
      if (imageUrl && firstSeenRow) warnings.push(`与第 ${firstSeenRow} 行图片 URL 重复`);
      if (imageUrl && !firstSeenRow) seenUrls.set(imageUrl, rowNumber);
      const duplicateId = existingUrlMap.get(imageUrl);

      return {
        rowNumber,
        sku,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        imageUrl,
        sourcePage,
        sourceName,
        licenseStatus,
        approved,
        authAttachmentUrl,
        notes,
        duplicateHint: duplicateId ? `已存在素材 ${duplicateId.slice(0, 8)}` : null,
        errors,
        warnings,
      };
    });

    return {
      success: true,
      rows,
      summary: {
        total: rows.length,
        importable: rows.filter((row) => row.approved && row.errors.length === 0).length,
        errors: rows.filter((row) => row.errors.length > 0).length,
        warnings: rows.filter((row) => row.warnings.length > 0 || row.duplicateHint).length,
      },
    };
  } catch (error) {
    return { success: false, error: { code: "CSV_PREVIEW_FAILED", message: getErrorMessage(error) } };
  }
}

export async function importImageMaterialCsv(rows: ImageMaterialCsvPreviewRow[]): Promise<ImageMaterialCsvImportResult> {
  try {
    const importableRows = rows.filter((row) => row.approved && row.productId && row.licenseStatus && row.errors.length === 0);
    if (importableRows.length === 0) {
      return { success: false, error: { code: "NO_IMPORTABLE_ROWS", message: "没有可导入的行" } };
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of importableRows) {
      try {
        if (!row.productId || !row.licenseStatus) {
          skipped += 1;
          continue;
        }

        const product = await prisma.product.findUnique({ where: { id: row.productId }, select: { id: true, name: true } });
        if (!product) {
          skipped += 1;
          errors.push(`第 ${row.rowNumber} 行：商品不存在`);
          continue;
        }

        const duplicate = await prisma.productImageMaterial.findFirst({
          where: { imageUrl: row.imageUrl },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });

        const material = await prisma.productImageMaterial.create({
          data: {
            productId: row.productId,
            imageUrl: row.imageUrl,
            sourcePage: row.sourcePage || null,
            sourceName: row.sourceName || null,
            licenseStatus: row.licenseStatus,
            reviewStatus: ImageMaterialReviewStatus.PENDING,
            storageProvider: ImageMaterialStorageProvider.REMOTE_URL,
            contentType: contentTypeFromExtension(row.imageUrl),
            duplicateOfMaterialId: duplicate?.id ?? null,
            authAttachmentUrl: row.authAttachmentUrl || null,
            notes: row.notes || null,
          },
          select: { id: true, imageUrl: true, duplicateOfMaterialId: true },
        });

        await logAction({
          module: "商品",
          action: "批量导入图片素材",
          targetType: "ProductImageMaterial",
          targetId: material.id,
          targetName: product.name,
          after: material,
          summary: `批量导入 ${product.name} 图片素材`,
        });
        created += 1;
      } catch (error) {
        errors.push(`第 ${row.rowNumber} 行：${getErrorMessage(error)}`);
      }
    }

    revalidateImageMaterialPaths();
    return { success: true, created, skipped, errors };
  } catch (error) {
    return { success: false, error: { code: "CSV_IMPORT_FAILED", message: getErrorMessage(error) } };
  }
}
