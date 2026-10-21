import { Capture } from '../../lib/preparation/contracts';
import type { Captured, Plan, Question } from '../../lib/preparation/contracts';
import { fieldSignature, safePageUrl } from '../../lib/preparation/semantics';
declare const chrome: any;
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const text = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
function roots(): Array<Document | ShadowRoot> { const result: Array<Document | ShadowRoot> = [document]; for (let i = 0; i < result.length; i++)
    for (const e of Array.from(result[i].querySelectorAll('*')))
        if (e.shadowRoot)
            result.push(e.shadowRoot); return result; }
function controls() { return roots().flatMap(root => Array.from(root.querySelectorAll<Control>('input,textarea,select,[role="combobox"],[role="checkbox"],[role="radio"],[contenteditable="true"]'))); }
function label(e: Control) { const root = e.getRootNode() as Document | ShadowRoot; return text(e.getAttribute('aria-labelledby')?.split(/\s+/).map(id => root.getElementById(id)?.textContent).join(' ') || e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.getAttribute('placeholder') || e.name || e.id).slice(0, 2000); }
function section(e: Control) {
    const fs = e.closest('fieldset');
    const legend = text(fs?.querySelector('legend')?.textContent);
    if (!fs)
        return text(e.closest('[role="group"]')?.getAttribute('aria-label')).slice(0, 500);
    const siblings = Array.from((e.getRootNode() as Document | ShadowRoot).querySelectorAll('fieldset')).filter(f => text(f.querySelector('legend')?.textContent) === legend);
    return (legend + (siblings.length > 1 ? ` · entry ${siblings.indexOf(fs) + 1}` : '')).slice(0, 500);
}
function scope(e: Control) { let root = e.getRootNode(), prefix = ''; while (root instanceof ShadowRoot) {
    const host = root.host;
    prefix = `shadow:${host.id || host.tagName.toLowerCase()} / ${prefix}`;
    root = host.getRootNode();
} return prefix; }
function excluded(e: Control) {
    const input = e as HTMLInputElement;
    if (['password', 'hidden', 'submit', 'button', 'reset', 'search', 'image'].includes(input.type))
        return true;
    if (e.closest('form')?.querySelector('input[type="password"]'))
        return true;
    return /password|captcha|credit.?card|card number|cardholder|security code|\bcvv\b|\biban\b|account number|api.?key|access.?token|\botp\b|\bssn\b|social.security|bank|routing|log.?in|sign.?in|verification.code|one.time|authentication|newsletter|site search|search jobs/i.test([label(e), e.name, e.id, e.autocomplete].join(' '));
}
function radioKey(e: Control) { return `${scope(e)}radio:${e.name}:${section(e)}:${e.form?.id || ''}`; }
function key(e: Control) { return scope(e) + (e instanceof HTMLInputElement && e.type === 'radio' && e.name ? radioKey(e) : e.id ? `id:${e.id}` : e.name ? `name:${e.name}:${section(e)}` : `label:${label(e)}:${section(e)}:${e.tagName.toLowerCase()}`); }
function actionable(e: Control) { const style = getComputedStyle(e); return !e.disabled && !(e as HTMLInputElement).readOnly && e.getAttribute('aria-disabled') !== 'true' && e.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !e.closest('[inert],[hidden]'); }
function groups() { const map = new Map<string, Control[]>(); for (const e of controls().filter(e => !excluded(e))) {
    const id = key(e);
    map.set(id, [...(map.get(id) || []), e]);
} return map; }
function inventory(): Captured {
    const fields: Question[] = [];
    for (const [id, elements] of Array.from(groups())) {
        const e = elements[0], input = e as HTMLInputElement, radio = input.type === 'radio' && Boolean(e.name);
        let type: Question['type'] = e.tagName === 'TEXTAREA' ? 'textarea' : e.tagName === 'SELECT' ? 'select' : ['text', 'email', 'tel', 'url', 'number', 'date', 'checkbox', 'file', 'radio'].includes(input.type) ? input.type as Question['type'] : 'unsupported';
        let manualReason: string | undefined;
        if (e.getAttribute('role') === 'combobox' && e.tagName !== 'SELECT' || e instanceof HTMLSelectElement && e.multiple) {
            type = 'unsupported';
            manualReason = 'Custom or multiple-choice widget: enter the approved answer manually.';
        }
        if (!radio && elements.length > 1) {
            manualReason = 'Multiple controls share this identity. Fill manually.';
            type = 'unsupported';
        }
        if (radio && elements.some(r => r.form !== e.form)) {
            manualReason = 'Radio name appears in multiple forms. Fill manually.';
            type = 'unsupported';
        }
        if (/signature|certif|attest|agree.*(terms|privacy)|accept.*terms|consent/i.test(label(e))) {
            type = 'unsupported';
            manualReason = 'Review and complete attestations, signatures and consent on the employer site.';
        }
        const root = e.getRootNode() as Document | ShadowRoot;
        fields.push({ id: id.slice(0, 1000), label: radio ? text(e.closest('fieldset')?.querySelector('legend')?.textContent) || e.name : label(e), help: text(e.getAttribute('aria-describedby')?.split(/\s+/).map(id => root.getElementById(id)?.textContent).join(' ')).slice(0, 2000), type, required: elements.some(e => Boolean(e.required || e.getAttribute('aria-required') === 'true')), actionable: elements.some(actionable), section: section(e), options: radio ? elements.map(r => ({ label: label(r), value: r.value })) : e instanceof HTMLSelectElement ? Array.from(e.options).map(o => ({ label: o.label, value: o.value })) : [], maxLength: input.maxLength ?? -1, pattern: input.pattern || '', min: input.min || '', max: input.max || '', step: input.step || '', ...(manualReason ? { manualReason } : {}) });
    }
    const warnings: string[] = [];
    if (document.querySelector('iframe,frame'))
        warnings.push('Embedded frames are not captured. Open the application frame in its own tab, or complete it manually.');
    warnings.push('Only this page and open shadow roots were inspected. Closed shadow roots and unseen steps may contain additional questions.');
    const url = safePageUrl(location.href);
    return Capture.parse({ url, jobId: url, title: document.title.slice(0, 300), fields, warnings });
}
const value = (e: Control) => e instanceof HTMLInputElement && e.type === 'checkbox' ? String(e.checked) : e.value;
function currentField(id: string) { return inventory().fields.find(f => f.id === id); }
export async function fill(plan: Plan) {
    const results = [];
    for (const { field: f, answer } of plan.fields) {
        if (plan.expires < Date.now() || safePageUrl(location.href) !== plan.url) {
            results.push({ id: f.id, code: 'stale_schema' });
            continue;
        }
        const current = currentField(f.id);
        if (!current || fieldSignature(current) !== fieldSignature(f)) {
            results.push({ id: f.id, code: 'stale_schema' });
            continue;
        }
        const elements = groups().get(f.id) || [];
        if (!elements.length || f.type !== 'radio' && elements.length !== 1) {
            results.push({ id: f.id, code: 'ambiguous_locator' });
            continue;
        }
        if (f.type === 'file') {
            results.push({ id: f.id, code: 'manual_upload_required' });
            continue;
        }
        if (f.type === 'unsupported' || !f.actionable) {
            results.push({ id: f.id, code: 'unsupported' });
            continue;
        }
        const desired = answer.value;
        let e = elements[0];
        if (f.type === 'radio') {
            if (elements.some(e => (e as HTMLInputElement).checked)) {
                results.push({ id: f.id, code: 'skipped_user_value' });
                continue;
            }
            const options = elements.filter(e => e.value === desired && actionable(e));
            if (options.length !== 1) {
                results.push({ id: f.id, code: 'option_missing' });
                continue;
            }
            e = options[0];
        }
        else if (value(e) !== '' && !(f.type === 'checkbox' && value(e) === 'false')) {
            results.push({ id: f.id, code: 'skipped_user_value' });
            continue;
        }
        if (!actionable(e)) {
            results.push({ id: f.id, code: 'unsupported' });
            continue;
        }
        if (e instanceof HTMLSelectElement && !Array.from(e.options).some(o => o.value === desired && !o.disabled)) {
            results.push({ id: f.id, code: 'option_missing' });
            continue;
        }
        if (f.type === 'radio' || f.type === 'checkbox') {
            const checked = f.type === 'radio' || desired === 'true';
            if ((e as HTMLInputElement).checked !== checked)
                e.click();
        }
        else {
            const prototype = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(e, desired);
        }
        for (const event of ['input', 'change', 'blur'])
            e.dispatchEvent(new Event(event, { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        const reread = groups().get(f.id) || [];
        const fresh = currentField(f.id);
        const actual = f.type === 'radio' ? reread.find(e => (e as HTMLInputElement).checked)?.value : reread.length === 1 ? value(reread[0]) : undefined;
        const code = !fresh || fieldSignature(fresh) !== fieldSignature(f) ? 'stale_schema' : actual !== desired || reread.some(e => !e.checkValidity() || e.getAttribute('aria-invalid') === 'true') ? 'validation_error' : 'filled_verified';
        results.push({ id: f.id, code });
    }
    return results;
}
if (!(globalThis as any).__appliheroCapture) {
    (globalThis as any).__appliheroCapture = true;
    let observing = false, last = '', timer: ReturnType<typeof setTimeout>;
    function observe() {
        if (observing)
            return;
        observing = true;
        last = JSON.stringify(inventory());
        const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => { try {
            const next = JSON.stringify(inventory());
            if (next !== last) {
                last = next;
                chrome.runtime.sendMessage({ action: 'schema_changed' }).catch(() => { });
            }
        }
        catch { } }, 700); });
        for (const root of roots())
            observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['required', 'disabled', 'readonly', 'hidden', 'style', 'class', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-required', 'aria-disabled', 'min', 'max', 'maxlength', 'pattern', 'value'] });
    }
    chrome.runtime.onMessage.addListener((message: any, sender: any, reply: any) => {
        if (sender.id !== chrome.runtime.id)
            return;
        try {
            safePageUrl(location.href);
        }
        catch {
            return;
        }
        if (message.action === 'capture') {
            try {
                const captured = inventory();
                observe();
                reply(captured);
            }
            catch {
                reply({ error: 'Cannot safely capture this page; try a smaller form or use manual entry.' });
            }
        }
        if (message.action === 'fill') {
            fill(message.plan).then(reply).catch(() => reply({ error: 'Page changed while filling. Recapture and review.' }));
            return true;
        }
    });
}
