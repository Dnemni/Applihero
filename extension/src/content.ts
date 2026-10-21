import type { Captured, Plan, Question } from "../../lib/preparation/contracts";
declare const chrome: any;
const controls = () => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select,[role=combobox]"));
const excluded = (e: HTMLInputElement) => /password|hidden|submit|button|reset/.test(e.type) || /password|captcha|credit.card|ssn|social.security|bank|routing|login|verification.code|authentication/i.test([e.name, e.id, e.autocomplete, e.labels?.[0]?.textContent].join(" "));
const text = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();
function inventory(): Captured {
    const fields = controls().filter(e => !excluded(e as HTMLInputElement)).map((e, index) => {
        const input = e as HTMLInputElement;
        const section = text(e.closest("fieldset")?.querySelector("legend")?.textContent);
        const labelled = e.getAttribute("aria-labelledby")?.split(" ").map(id => document.getElementById(id)?.textContent).join(" ");
        const label = text(labelled || e.getAttribute("aria-label") || e.labels?.[0]?.textContent || e.name || e.id);
        const kind = e.tagName === "TEXTAREA" ? "textarea" : e.tagName === "SELECT" ? "select" : input.type;
        const supported = ["text", "textarea", "email", "tel", "url", "number", "date", "select", "checkbox", "file"].includes(kind);
        const type = e.getAttribute("role") === "combobox" ? "unsupported" : supported ? kind : "unsupported";
        return { id: e.id ? `id:${e.id}` : e.name ? `name:${e.name}:${section}` : `manual:${index}`, label, help: text(e.getAttribute("aria-describedby")?.split(" ").map(id => document.getElementById(id)?.textContent).join(" ")), type, required: Boolean(e.required || e.getAttribute("aria-required") === "true"), actionable: !e.disabled && e.getClientRects().length > 0 && Boolean(e.id || e.name), section, options: e instanceof HTMLSelectElement ? Array.from(e.options).map(o => ({ label: o.label, value: o.value })) : input.type === "radio" ? [{ label, value: input.value }] : [], maxLength: input.maxLength ?? -1, pattern: input.pattern || "" } as Question;
    });
    return { url: location.origin + location.pathname, jobId: new URL(location.href).pathname, fields };
}
function resolve(f: Question) { return controls().filter(e => f.id === (e.id ? `id:${e.id}` : e.name ? `name:${e.name}:${text(e.closest("fieldset")?.querySelector("legend")?.textContent)}` : "")); }
const value = (e: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => e instanceof HTMLInputElement && e.type === "checkbox" ? String(e.checked) : e.value;
export async function fill(plan: Plan, expected: Captured) {
    const results = [];
    for (const item of plan.fields) {
        const f = item.field;
        if (plan.expires < Date.now() || location.origin + location.pathname !== plan.url || JSON.stringify(inventory()) !== JSON.stringify(expected)) {
            results.push({ id: f.id, code: "stale_schema" });
            continue;
        }
        const matches = resolve(f);
        if (matches.length !== 1) {
            results.push({ id: f.id, code: "ambiguous_locator" });
            continue;
        }
        const e = matches[0];
        let code = "unsupported";
        if (f.type === "file")
            code = "manual_upload_required";
        else if (f.actionable && !e.disabled && e.getClientRects().length && !["unsupported", "radio"].includes(f.type)) {
            const desired = item.answer.value;
            if (value(e) !== "" && value(e) !== "false")
                code = "skipped_user_value";
            else if (e instanceof HTMLSelectElement && !Array.from(e.options).some(o => o.value === desired))
                code = "option_missing";
            else {
                const prop = f.type === "checkbox" ? "checked" : "value";
                const prototype = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, prop)!.set!.call(e, prop === "checked" ? desired === "true" : desired);
                for (const event of ["input", "change", "blur"])
                    e.dispatchEvent(new Event(event, { bubbles: true }));
                await new Promise(r => setTimeout(r, 150));
                const current = resolve(f);
                code = current.length !== 1 ? "ambiguous_locator" : JSON.stringify(inventory()) !== JSON.stringify(expected) ? "stale_schema" : value(current[0]) !== desired || !current[0].checkValidity() ? "validation_error" : "filled_verified";
            }
        }
        results.push({ id: f.id, code });
    }
    return results;
}
// No externally_connectable bridge: page scripts cannot send privileged requests.
if (!(globalThis as any).__appliheroCapture) {
    (globalThis as any).__appliheroCapture = true;
    chrome.runtime.onMessage.addListener((message: any, sender: any, reply: any) => {
        if (sender.id !== chrome.runtime.id)
            return;
        if (location.origin !== "http://localhost:3000" || !location.pathname.startsWith("/preparation-fixtures/"))
            return;
        if (message.action === "capture")
            reply(inventory());
        if (message.action === "fill") {
            fill(message.plan, message.capture).then(reply);
            return true;
        }
    });
}
