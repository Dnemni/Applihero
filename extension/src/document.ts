import { z } from 'zod';
import { Field } from '../../lib/preparation/contracts';
export const DocumentMetadata = z.object({ name: z.string().min(1).max(200).regex(/^[^/\\]+\.pdf$/i), size: z.number().int().positive().max(5 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const UploadPlan = z.object({ id: z.string(), tabId: z.number().int(), applicationId: z.string(), revision: z.number().int(), url: z.string().url(), expires: z.number(), field: Field, document: DocumentMetadata }).strict();
export async function digest(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))).map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function decodeDocument(base64: unknown, metadata: z.infer<typeof DocumentMetadata>) {
    DocumentMetadata.parse(metadata);
    if (typeof base64 !== 'string' || base64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw Error('Invalid PDF data');
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (bytes.length !== metadata.size || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-' || await digest(bytes) !== metadata.sha256) throw Error('PDF changed; choose and preview it again');
    return bytes;
}
