import type { Question, Answer, Captured } from './contracts';
/** Exact metadata binding. Never use similarity to approve a different question. */
export function fieldSignature(field: Question) { return JSON.stringify(field); }
export function contextKey(capture: Captured) { return JSON.stringify([capture.url, capture.jobId, capture.title || '']); }
export function isApproved(answer: Answer | undefined, field: Question, capture?: Captured) { return answer?.state === 'approved' && answer.schema === fieldSignature(field) && (!capture || answer.context === contextKey(capture)); }
export const profileLabels = { full_name: 'Full name', first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Phone', linkedin: 'LinkedIn URL', website: 'Portfolio / website', city: 'City' };
export type ProfileKey = keyof typeof profileLabels;
export type LocalProfile = Partial<Record<ProfileKey, string>>;
export function profileSuggestion(field: Question, profile: LocalProfile): string | undefined {
    if (!['text', 'email', 'tel', 'url'].includes(field.type))
        return;
    const label = field.label.toLowerCase().replace(/[\s*]+/g, ' ').trim();
    const exact: Record<string, ProfileKey> = { 'full name': 'full_name', 'first name': 'first_name', 'given name': 'first_name', 'last name': 'last_name', 'family name': 'last_name', 'email': 'email', 'email address': 'email', 'phone': 'phone', 'phone number': 'phone', 'linkedin': 'linkedin', 'linkedin url': 'linkedin', 'linkedin profile': 'linkedin', 'website': 'website', 'portfolio': 'website', 'city': 'city' };
    return exact[label] ? profile[exact[label]] : undefined;
}
export function safePageUrl(raw: string) {
    const u = new URL(raw);
    if (u.username || u.password || !(u.protocol === 'https:' || (u.origin === 'http://localhost:3000')))
        throw new Error('403: Use an HTTPS form or the local fixture');
    // Preserve known requisition identifiers, never auth tokens or arbitrary query PII.
    const keep = ['gh_jid', 'jobId', 'job_id', 'requisitionId', 'reqId', 'jid'];
    for (const key of Array.from(u.searchParams.keys()))
        if (!keep.includes(key))
            u.searchParams.delete(key);
    u.searchParams.sort();
    u.hash = '';
    return u.toString();
}
