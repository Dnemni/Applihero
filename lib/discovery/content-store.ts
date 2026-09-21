import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type DiscoveryContent = {
  description: string;
  description_html: string | null;
  raw_payload: unknown;
};

export type StoredDiscoveryContent = {
  storage: "r2";
  ref: string;
  bytes: number;
  storedAt: string;
};

type R2Configuration = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let client: S3Client | null = null;
let clientKey = "";

function configuration(): R2Configuration | null {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.CLOUDFLARE_R2_DISCOVERY_BUCKET?.trim();
  return accountId && accessKeyId && secretAccessKey && bucket
    ? { accountId, accessKeyId, secretAccessKey, bucket }
    : null;
}

export function isDiscoveryContentStoreConfigured() {
  return configuration() !== null;
}

export function discoveryContentStoreConfigurationError() {
  return configuration() ? null : "Cloudflare R2 discovery-content credentials are incomplete";
}

function r2(config: R2Configuration) {
  const key = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;
  if (!client || clientKey !== key) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    clientKey = key;
  }
  return client;
}

function objectKey(jobId: string, contentHash: string) {
  return `discovery-jobs/v1/${jobId}/${contentHash}.json`;
}

function serialise(content: DiscoveryContent) {
  return JSON.stringify({ version: 1, ...content });
}

/**
 * Writes a private, immutable content revision. R2 object keys include the
 * content hash, so retries are idempotent and a provider edit never mutates a
 * body being viewed by an existing application workspace.
 */
export async function storeDiscoveryJobContent(args: {
  jobId: string;
  contentHash: string;
  content: DiscoveryContent;
}): Promise<StoredDiscoveryContent | null> {
  const config = configuration();
  if (!config) return null;
  const body = serialise(args.content);
  const ref = objectKey(args.jobId, args.contentHash);
  await r2(config).send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: ref,
    Body: body,
    ContentType: "application/json; charset=utf-8",
    CacheControl: "private, no-store",
  }));
  return { storage: "r2", ref, bytes: Buffer.byteLength(body), storedAt: new Date().toISOString() };
}

/** Reads private content server-side. Browser clients only receive the detail API response. */
export async function loadDiscoveryJobContent(ref: string): Promise<DiscoveryContent | null> {
  const config = configuration();
  if (!config) return null;
  const response = await r2(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: ref }));
  const text = await response.Body?.transformToString();
  if (!text) return null;
  const parsed = JSON.parse(text) as Partial<DiscoveryContent>;
  return {
    description: typeof parsed.description === "string" ? parsed.description : "",
    description_html: typeof parsed.description_html === "string" ? parsed.description_html : null,
    raw_payload: parsed.raw_payload ?? {},
  };
}

/**
 * Verifies the credentials, bucket scope, and round-trip behaviour without
 * touching job content. The short-lived health object is always removed.
 */
export async function verifyDiscoveryContentStore() {
  const config = configuration();
  if (!config) throw new Error(discoveryContentStoreConfigurationError() || "Cloudflare R2 discovery-content credentials are incomplete");
  const key = `__healthcheck__/discovery-content-${crypto.randomUUID()}.json`;
  const body = JSON.stringify({ healthcheck: "applihero-discovery-content", version: 1 });
  try {
    await r2(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "private, no-store",
    }));
    const response = await r2(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const returned = await response.Body?.transformToString();
    if (returned !== body) throw new Error("Cloudflare R2 health check returned unexpected content");
    return { bucket: config.bucket, endpoint: `https://${config.accountId}.r2.cloudflarestorage.com` };
  } finally {
    // This key is generated exclusively for the check; deletion is safe even
    // when a read or write fails midway through the round trip.
    await r2(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })).catch(() => undefined);
  }
}
