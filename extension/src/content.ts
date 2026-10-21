import { UploadPlan, decodeDocument } from './document';
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
function ashbyEntry(e: Element) { return e.closest('[data-field-entry-id]'); }
function ashbyTitle(e: Element) { return ashbyEntry(e)?.querySelector<HTMLElement>('.ashby-application-form-question-title'); }
function yesNo(e: Control) { return e instanceof HTMLInputElement && e.type === 'checkbox' ? e.closest('.ashby-application-form-input-yesno') : null; }
function yesNoButtons(e: Control) { return Array.from(yesNo(e)?.querySelectorAll<HTMLButtonElement>('button[data-option][aria-pressed]') || []); }
function optionValue(e: Control) { return e.getAttribute('value') !== null ? e.value : e.id || e.value; }
function label(e: Control) { if (e instanceof HTMLInputElement && e.name === 'communicationConsent' && e.type === 'radio') return 'Text message updates consent'; const root = e.getRootNode() as Document | ShadowRoot; return text(e.getAttribute('aria-labelledby')?.split(/\s+/).map(id => root.getElementById(id)?.textContent).join(' ') || e.getAttribute('aria-label') || e.labels?.[0]?.textContent || ashbyTitle(e)?.textContent || e.getAttribute('placeholder') || e.name || e.id).slice(0, 2000); }
function section(e: Control) {
    const fs = e.closest('fieldset');
    const legend = text(fs?.querySelector('legend')?.textContent || ashbyTitle(e)?.textContent);
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
    if (/grammarly/i.test(scope(e))) return true;
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
        const buttons = yesNoButtons(e);
        if (buttons.length === 2 && buttons.every(b => ['yes', 'no'].includes(b.dataset.option!))) type = 'select';
        if (e.getAttribute('role') === 'combobox' && e.tagName !== 'SELECT' || e instanceof HTMLSelectElement && e.multiple) {
            type = 'unsupported';
            manualReason = 'Custom or multiple-choice widget: enter the approved answer manually.';
        }
        if (e.matches('.ashby-application-form-input-autocomplete[role=combobox]')) { type = 'combobox'; manualReason = undefined; }
        if (!radio && elements.length > 1) {
            manualReason = 'Multiple controls share this identity. Fill manually.';
            type = 'unsupported';
        }
        if (radio && elements.some(r => r.form !== e.form)) {
            manualReason = 'Radio name appears in multiple forms. Fill manually.';
            type = 'unsupported';
        }
        if (/signature|certif|attest|agree.*(terms|privacy)|accept.*terms|consent/i.test(label(e)) && !(radio && e.name === 'communicationConsent')) {
            type = 'unsupported';
            manualReason = 'Review and complete attestations, signatures and consent on the employer site.';
        }
        const root = e.getRootNode() as Document | ShadowRoot;
        fields.push({ id: id.slice(0, 1000), label: radio ? e.name === 'communicationConsent' ? 'Text message updates consent' : text(e.closest('fieldset')?.querySelector('legend')?.textContent || ashbyTitle(e)?.textContent) || e.name : label(e), help: text(e.getAttribute('aria-describedby')?.split(/\s+/).map(id => root.getElementById(id)?.textContent).join(' ')).slice(0, 2000), type, required: elements.some(e => Boolean(e.required || e.getAttribute('aria-required') === 'true' || Array.from(ashbyTitle(e)?.classList || []).some(c => c.startsWith('_required_')))), actionable: buttons.length ? buttons.some(b => !b.disabled && b.getClientRects().length > 0) : elements.some(actionable), section: section(e), options: buttons.length ? buttons.map(b => ({ label: text(b.textContent), value: b.dataset.option! })) : radio ? elements.map(r => ({ label: text(r.closest('label')?.textContent) || label(r), value: optionValue(r) })) : e instanceof HTMLSelectElement ? Array.from(e.options).map(o => ({ label: o.label, value: o.value })) : [], maxLength: input.maxLength ?? -1, pattern: input.pattern || '', min: input.min || '', max: input.max || '', step: input.step || '', ...(manualReason ? { manualReason } : {}) });
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
        if (f.type === 'combobox') {
            if (e.value) { results.push({ id: f.id, code: 'skipped_user_value' }); continue; }
            e.focus();
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, desired);
            e.dispatchEvent(new Event('input', { bubbles: true }));
            let chosen: HTMLElement | undefined;
            for (let attempt = 0; attempt < 20; attempt++) {
                await new Promise(r => setTimeout(r, 150));
                const listId = e.getAttribute('aria-controls');
                const list = listId ? (e.getRootNode() as Document).getElementById(listId) : null;
                const options = Array.from(list?.querySelectorAll<HTMLElement>('[role=option]') || []).filter(o => text(o.textContent) === desired && o.getClientRects().length && o.getAttribute('aria-disabled') !== 'true');
                if (options.length === 1) { chosen = options[0]; break; }
                if (options.length > 1) break;
            }
            if (!chosen || plan.expires < Date.now() || safePageUrl(location.href) !== plan.url) {
                if (e.value === desired) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); }
                results.push({ id: f.id, code: 'option_missing' }); continue;
            }
            chosen.click();
            await new Promise(r => setTimeout(r, 250));
            const fresh = groups().get(f.id) || [];
            results.push({ id: f.id, code: fresh.length === 1 && fresh[0].value === desired && fresh[0].getAttribute('aria-expanded') === 'false' && fresh[0].getAttribute('aria-invalid') !== 'true' ? 'filled_verified' : 'validation_error' });
            continue;
        }
        const buttons = yesNoButtons(e);
        if (buttons.length) {
            if (buttons.some(b => b.getAttribute('aria-pressed') === 'true')) {
                results.push({ id: f.id, code: 'skipped_user_value' }); continue;
            }
            const matches = buttons.filter(b => b.dataset.option === desired && !b.disabled && b.getClientRects().length > 0);
            if (matches.length !== 1) { results.push({ id: f.id, code: 'option_missing' }); continue; }
            // Only adapter-recognized choice buttons; never navigation or submit.
            if (matches[0].type === 'submit' && matches[0].form) { results.push({ id: f.id, code: 'unsupported' }); continue; }
            matches[0].click();
            await new Promise(r => setTimeout(r, 250));
            const freshElements = groups().get(f.id) || [];
            const selected = freshElements.length === 1 ? yesNoButtons(freshElements[0]).filter(b => b.getAttribute('aria-pressed') === 'true') : [];
            results.push({ id: f.id, code: !currentField(f.id) || fieldSignature(currentField(f.id)!) !== fieldSignature(f) ? 'stale_schema' : selected.length === 1 && selected[0].dataset.option === desired ? 'filled_verified' : 'validation_error' });
            continue;
        }
        if (f.type === 'radio') {
            if (elements.some(e => (e as HTMLInputElement).checked)) {
                results.push({ id: f.id, code: 'skipped_user_value' });
                continue;
            }
            const options = elements.filter(e => optionValue(e) === desired && actionable(e));
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
        const actual = f.type === 'radio' ? reread.filter(e => (e as HTMLInputElement).checked).map(optionValue)[0] : reread.length === 1 ? value(reread[0]) : undefined;
        const code = !fresh || fieldSignature(fresh) !== fieldSignature(f) ? 'stale_schema' : actual !== desired || reread.some(e => !e.checkValidity() || e.getAttribute('aria-invalid') === 'true') ? 'validation_error' : 'filled_verified';
        results.push({ id: f.id, code });
    }
    return results;
}
async function uploadDocument(raw: unknown, base64: unknown) {
    const plan = UploadPlan.parse(raw);
    const bytes = await decodeDocument(base64, plan.document);
    const current = currentField(plan.field.id);
    if (plan.expires < Date.now() || safePageUrl(location.href) !== plan.url || !current || fieldSignature(current) !== fieldSignature(plan.field)) throw Error('Form changed; preview the upload again.');
    const matches = groups().get(plan.field.id) || [];
    if (matches.length !== 1 || !(matches[0] instanceof HTMLInputElement) || matches[0].type !== 'file' || !actionable(matches[0])) throw Error('Upload target unavailable; use the employer upload button.');
    const input = matches[0];
    if (input.files?.length) throw Error('An existing document is selected. Replace it manually on the employer site.');
    if (input.accept && !input.accept.split(',').some(v => ['.pdf', 'application/pdf', 'application/*', '*/*'].includes(v.trim().toLowerCase()))) throw Error('This field does not accept PDF files.');
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes as Uint8Array<ArrayBuffer>], plan.document.name, { type: 'application/pdf' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    const fresh = groups().get(plan.field.id) || [];
    const file = fresh.length === 1 ? (fresh[0] as HTMLInputElement).files?.[0] : undefined;
    return { message: file?.name === plan.document.name && file.size === plan.document.size ? 'PDF assigned and filename verified. Check the employer’s upload acceptance, then recapture; parsing may reveal or change questions. No submission performed.' : 'Upload dispatched, but the employer replaced the control. Check its filename and acceptance on the page; do not retry blindly.' };
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
        if (message.action === 'upload') {
            uploadDocument(message.plan, message.base64).then(reply).catch(e => reply({ error: e.message })); return true;
        }
        if (message.action === 'fill') {
            fill(message.plan).then(reply).catch(() => reply({ error: 'Page changed while filling. Recapture and review.' }));
            return true;
        }
    });
}
