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
        const url = new URL(cmd.capture.url);
        if (url.origin !== "http://localhost:3000" || !url.pathname.startsWith("/preparation-fixtures/"))
            throw new Error("403: Offline demo only accepts local fixtures");
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
            s.answers.push({ id: cmd.id, value: cmd.value, state: "draft", version: (prior?.version || 0) + 1, schema: s.schema! });
        else {
            if (!prior || prior.state !== "draft" || prior.schema !== s.schema)
                throw new Error("409: Create a draft for the current question first");
            if (field.required && !prior.value.trim())
                throw new Error("400: Required answer is empty");
            if (field.maxLength >= 0 && prior.value.length > field.maxLength)
                throw new Error("400: Character limit exceeded");
            if (field.options.length && !field.options.some(o => o.value === prior.value))
                throw new Error("400: Exact option required");
            if (field.type === "checkbox" && !["true", "false"].includes(prior.value))
                throw new Error("400: Choose true or false explicitly");
            prior.state = "approved";
        }
        s.revision++;
        s.plans = [];
    }
    else if (cmd.action === "plan") {
        if (!s.capture)
            throw new Error("400: Capture first");
        const fields = s.capture.fields.flatMap(field => { const answer = s.answers.filter(a => a.id === field.id).at(-1); return answer?.state === "approved" && answer.schema === s.schema ? [{ field, answer }] : []; });
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
