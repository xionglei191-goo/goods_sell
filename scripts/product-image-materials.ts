import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TEMPLATE = "image-materials/product-image-candidates.csv";
const DEFAULT_LOG = "image-materials/import-log.jsonl";
const PUBLIC_IMAGE_DIR = "public/images/products";
const PUBLIC_IMAGE_URL_PREFIX = "/images/products";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type ProductRow = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  currentImageUrl: string;
  candidateImageUrl: string;
  sourcePage: string;
  sourceName: string;
  licenseStatus: string;
  approved: string;
  notes: string;
};

type CliOptions = {
  command: string;
  file: string;
  out: string;
  apply: boolean;
  overwriteFiles: boolean;
  log: string;
};

const allowedLicenseStatuses = new Set([
  "authorized",
  "brand-provided",
  "supplier-provided",
  "owned",
  "public-domain",
  "cc",
  "internal-demo-approved",
]);

let prismaClient: Awaited<ReturnType<typeof getPrismaModule>>["prisma"] | null = null;

async function getPrismaModule() {
  return import("../src/lib/prisma");
}

async function getPrisma() {
  if (!prismaClient) {
    const mod = await getPrismaModule();
    prismaClient = mod.prisma;
  }
  return prismaClient;
}

function parseArgs(argv: string[]): CliOptions {
  const [command = "help", ...rest] = argv;
  const options: CliOptions = {
    command: command === "--help" || command === "-h" ? "help" : command,
    file: DEFAULT_TEMPLATE,
    out: DEFAULT_TEMPLATE,
    apply: false,
    overwriteFiles: false,
    log: DEFAULT_LOG,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];

    if (arg === "--file" && next) {
      options.file = next;
      index += 1;
    } else if (arg === "--out" && next) {
      options.out = next;
      index += 1;
    } else if (arg === "--log" && next) {
      options.log = next;
      index += 1;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--overwrite-files") {
      options.overwriteFiles = true;
    } else if (arg === "--help" || arg === "-h") {
      options.command = "help";
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Product image material helper

Usage:
  npm run images:template
  npm run images:import -- --file image-materials/product-image-candidates.csv
  npm run images:import -- --file image-materials/product-image-candidates.csv --apply
  npm run images:materials -- report

CSV columns:
  sku,name,brand,category,currentImageUrl,candidateImageUrl,sourcePage,sourceName,licenseStatus,approved,notes

Import rules:
  - Only rows with approved=TRUE are processed.
  - licenseStatus must be one of: ${Array.from(allowedLicenseStatuses).join(", ")}
  - Import is dry-run by default. Add --apply to download and update ProductImage.
  - This helper does not crawl product pages. Paste image URLs only after you have permission to use them.
`);
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: Array<string | number | null | undefined>) {
  return values.map(csvEscape).join(",");
}

function parseCsv(content: string): ProductRow[] {
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

  return dataRows.map((values) => {
    const entry: Record<string, string> = {};
    normalizedHeaders.forEach((header, index) => {
      entry[header] = values[index]?.trim() ?? "";
    });
    return entry as ProductRow;
  });
}

function isApproved(value: string) {
  return ["true", "yes", "1", "y"].includes(value.trim().toLowerCase());
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

function extensionFromUrl(value: string) {
  try {
    const ext = path.extname(new URL(value).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : null;
  } catch {
    return null;
  }
}

function safeSku(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function makeImageFilename(row: ProductRow, imageUrl: string, contentType: string | null) {
  const ext = extensionFromContentType(contentType) ?? extensionFromUrl(imageUrl) ?? ".jpg";
  const digest = createHash("sha1").update(imageUrl).digest("hex").slice(0, 8);
  return `${safeSku(row.sku)}-material-${digest}${ext}`;
}

async function exportTemplate(out: string) {
  const prisma = await getPrisma();
  const products = await prisma.product.findMany({
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { url: true },
        take: 1,
      },
    },
    orderBy: { sku: "asc" },
  });

  await mkdir(path.dirname(out), { recursive: true });
  const header = [
    "sku",
    "name",
    "brand",
    "category",
    "currentImageUrl",
    "candidateImageUrl",
    "sourcePage",
    "sourceName",
    "licenseStatus",
    "approved",
    "notes",
  ];
  const lines = [
    csvRow(header),
    ...products.map((product) =>
      csvRow([
        product.sku,
        product.name,
        product.brand.name,
        product.category.name,
        product.images[0]?.url ?? "",
        "",
        "",
        "",
        "pending",
        "FALSE",
        "",
      ]),
    ),
  ];

  await writeFile(out, `${lines.join("\n")}\n`, "utf8");
  console.log(`Template written: ${out}`);
  console.log(`Products: ${products.length}`);
}

async function report() {
  const prisma = await getPrisma();
  const [total, withImages, withoutImages] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { images: { some: { isPrimary: true } } } }),
    prisma.product.findMany({
      where: { images: { none: { isPrimary: true } } },
      select: { sku: true, name: true },
      orderBy: { sku: "asc" },
    }),
  ]);

  console.log(`Products: ${total}`);
  console.log(`Products with primary image: ${withImages}`);
  console.log(`Products missing primary image: ${withoutImages.length}`);
  withoutImages.forEach((product) => console.log(`- ${product.sku} ${product.name}`));
}

async function downloadImage(row: ProductRow) {
  const response = await fetch(row.candidateImageUrl, {
    headers: {
      "User-Agent": "HuaQi image material helper/1.0",
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  const ext = extensionFromContentType(contentType) ?? extensionFromUrl(row.candidateImageUrl);
  if (!ext) {
    throw new Error(`Unsupported content-type: ${contentType ?? "unknown"}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large: ${arrayBuffer.byteLength} bytes`);
  }

  const filename = makeImageFilename(row, row.candidateImageUrl, contentType);
  const localPath = path.join(PUBLIC_IMAGE_DIR, filename);
  const publicUrl = `${PUBLIC_IMAGE_URL_PREFIX}/${filename}`;

  return {
    buffer: Buffer.from(arrayBuffer),
    localPath,
    publicUrl,
    contentType,
    bytes: arrayBuffer.byteLength,
  };
}

async function appendLog(logPath: string, entry: Record<string, unknown>) {
  await mkdir(path.dirname(logPath), { recursive: true });
  const previous = existsSync(logPath) ? await readFile(logPath, "utf8") : "";
  await writeFile(logPath, `${previous}${JSON.stringify(entry)}\n`, "utf8");
}

async function importImages(options: CliOptions) {
  const prisma = await getPrisma();
  const content = await readFile(options.file, "utf8");
  const rows = parseCsv(content).filter((row) => isApproved(row.approved));
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`${options.apply ? "Apply" : "Dry-run"} import from ${options.file}`);
  console.log(`Approved rows: ${rows.length}`);

  await mkdir(PUBLIC_IMAGE_DIR, { recursive: true });

  for (const row of rows) {
    const prefix = `${row.sku} ${row.name}`;

    try {
      if (!row.sku || !row.candidateImageUrl) {
        skipped += 1;
        console.log(`SKIP ${prefix}: missing sku or candidateImageUrl`);
        continue;
      }

      if (!allowedLicenseStatuses.has(row.licenseStatus)) {
        skipped += 1;
        console.log(`SKIP ${prefix}: licenseStatus must be approved, got "${row.licenseStatus || "empty"}"`);
        continue;
      }

      if (!isHttpUrl(row.candidateImageUrl)) {
        skipped += 1;
        console.log(`SKIP ${prefix}: candidateImageUrl must be http(s)`);
        continue;
      }

      const product = await prisma.product.findUnique({
        where: { sku: row.sku },
        select: { id: true, name: true },
      });
      if (!product) {
        skipped += 1;
        console.log(`SKIP ${prefix}: product not found`);
        continue;
      }

      const image = await downloadImage(row);
      if (existsSync(image.localPath) && !options.overwriteFiles) {
        skipped += 1;
        console.log(`SKIP ${prefix}: file exists ${image.localPath}`);
        continue;
      }

      if (!options.apply) {
        imported += 1;
        console.log(`DRY ${prefix}: ${image.publicUrl} (${image.bytes} bytes, ${image.contentType})`);
        continue;
      }

      await writeFile(image.localPath, image.buffer);
      await prisma.$transaction(async (tx) => {
        await tx.productImage.updateMany({
          where: { productId: product.id },
          data: { isPrimary: false },
        });
        await tx.productImage.create({
          data: {
            productId: product.id,
            url: image.publicUrl,
            alt: product.name,
            sortOrder: 0,
            isPrimary: true,
          },
        });
      });

      await appendLog(options.log, {
        at: new Date().toISOString(),
        sku: row.sku,
        productName: product.name,
        publicUrl: image.publicUrl,
        candidateImageUrl: row.candidateImageUrl,
        sourcePage: row.sourcePage,
        sourceName: row.sourceName,
        licenseStatus: row.licenseStatus,
        notes: row.notes,
        bytes: image.bytes,
        contentType: image.contentType,
      });

      imported += 1;
      console.log(`OK ${prefix}: ${image.publicUrl}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${prefix}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. imported=${imported} skipped=${skipped} failed=${failed}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "help") {
    printHelp();
    return;
  }

  if (options.command === "export") {
    await exportTemplate(options.out);
  } else if (options.command === "import") {
    await importImages(options);
  } else if (options.command === "report") {
    await report();
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaClient) {
      await prismaClient.$disconnect();
    }
  });
