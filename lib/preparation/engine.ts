import { fieldSignature, isApproved, safePageUrl, contextKey } from "./semantics";
import { createHash, randomUUID } from "node:crypto";
import { Command, type Workspace, type Captured } from "./contracts";
export const empty = (): Workspace => ({ revision: 0, answers: [], plans: [], events: [] });
export function schema(c: Captured) { return createHash("sha256").update(JSON.stringify(c)).digest("hex"); }
export function transition(state: Workspace, input: unknown) {
    const cmd = Command.parse(input);
    const s = structuredClone(state);
    if (cmd.action === "reset")
        return { state: empty(), output: {} };
    if ("revision" in cmd && cmd.revision !== s.revision)
        throw new Error("409: Workspace changed; refresh and review again");
    if (cmd.action === "capture") {
        if (safePageUrl(cmd.capture.url) !== cmd.capture.url)
            throw new Error("400: Capture URL must be sanitized");
        if (new Set(cmd.capture.fields.map(f => f.id)).size !== cmd.capture.fields.length)
            throw new Error("400: Duplicate field identity");
        const hash = schema(cmd.capture);
        if (hash !== s.schema) {
            s.capture = cmd.capture;
            s.schema = hash;
            s.revision++;
            s.plans = [];
        }
    }
    else if (cmd.action === "draft" || cmd.action === "approve" || cmd.action === "coach") {
        const field = s.capture?.fields.find(f => f.id === cmd.id);
        if (!field)
            throw new Error("404: Question not found");
        const prior = s.answers.filter(a => a.id === cmd.id).at(-1);
        if (cmd.action === "coach")
            return { state: s, output: { guidance: `Answer the exact question using one truthful example: situation, your action, and result. Include only evidence you can verify. ${field.maxLength >= 0 ? `Stay within ${field.maxLength} characters.` : "Keep it concise."} Legal, citizenship and sponsorship answers require your explicit choice.`, mode: "offline outline; no AI call" } };
        if (cmd.action === "draft")
            s.answers.push({ id: cmd.id, value: cmd.value, state: "draft", version: (prior?.version || 0) + 1, schema: fieldSignature(field), context: contextKey(s.capture!) });
        else {
            if (!prior || prior.state !== "draft" || prior.schema !== fieldSignature(field) || prior.context !== contextKey(s.capture!))
                throw new Error("409: Create a draft for the current question first");
            if (field.required && !prior.value.trim())
                throw new Error("400: Required answer is empty");
            if (field.maxLength >= 0 && prior.value.length > field.maxLength)
                throw new Error("400: Character limit exceeded");
            if (field.options.length && field.options.filter(o => o.value === prior.value).length !== 1)
                throw new Error("400: Exact option required");
            if (field.type === "checkbox" && !["true", "false"].includes(prior.value))
                throw new Error("400: Choose true or false explicitly");
            if (field.type === 'date' && prior.value && (!/^\d{4}-\d{2}-\d{2}$/.test(prior.value) || Number.isNaN(Date.parse(prior.value)) || (field.min && prior.value < field.min) || (field.max && prior.value > field.max)))
                throw new Error('400: Date must use YYYY-MM-DD and meet the stated range');
            if (field.type === 'number' && prior.value && (!Number.isFinite(Number(prior.value)) || (field.min && Number(prior.value) < Number(field.min)) || (field.max && Number(prior.value) > Number(field.max))))
                throw new Error('400: Number is outside the stated range');
            prior.state = "approved";
        }
        s.revision++;
        s.plans = [];
    }
    else if (cmd.action === "plan") {
        if (!s.capture)
            throw new Error("400: Capture first");
        const fields = s.capture.fields.filter(f => f.actionable).flatMap(field => { const answer = s.answers.filter(a => a.id === field.id).at(-1); return isApproved(answer, field, s.capture) && answer ? [{ field, answer }] : []; });
        const plan = { id: randomUUID(), schema: s.schema!, url: s.capture.url, revision: s.revision, expires: Date.now() + 120000, fields };
        s.plans = [plan];
        return { state: s, output: plan };
    }
    else if (cmd.action === "results") {
        const plan = s.plans.find(p => p.id === cmd.planId);
        if (!plan || plan.revision !== s.revision || plan.expires < Date.now())
            throw new Error("409: Plan expired or changed");
        if (cmd.results.some(r => !plan.fields.some(f => f.field.id === r.id)))
            throw new Error("400: Unknown result field");
        if (!s.events.some(e => e.id === plan.id))
            s.events.push({ id: plan.id, results: cmd.results });
    }
    return { state: s, output: s };
}
