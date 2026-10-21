export {};
declare const chrome: any;
const feedback = document.querySelector<HTMLElement>('#feedback')!, preview = document.querySelector('#preview')!, results = document.querySelector('#results')!, fill = document.querySelector<HTMLButtonElement>('[data-action="fill"]')!;
function el(tag: string, value: string, cls = '') { const e = document.createElement(tag); e.textContent = value; e.className = cls; return e; }
function workspace(id?: string) { if (id)
    (document.querySelector('#workspace') as HTMLAnchorElement).href = `http://localhost:3000/prepare?application=${encodeURIComponent(id)}`; }
const labels: Record<string, string> = { filled_verified: 'Filled and verified', skipped_user_value: 'Kept your existing value', stale_schema: 'Question changed — review again', unsupported: 'Manual entry needed', manual_upload_required: 'Upload document manually', validation_error: 'Employer validation needs attention', ambiguous_locator: 'Multiple matching controls — fill manually', option_missing: 'Matching option unavailable', approval_needed: 'Approval needed' };
for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-action]')))
    button.addEventListener('click', async () => {
        const action = button.dataset.action!;
        feedback.className = 'note';
        feedback.textContent = 'Working…';
        button.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({ action, ...(action === 'connect' ? { token: (document.querySelector('#key') as HTMLInputElement).value } : {}) });
            if (response?.error)
                throw Error(response.error);
            const data = response.data;
            workspace(data.applicationId);
            feedback.textContent = data.message || 'Done.';
            if (action === 'connect') {
                (document.querySelector('#key') as HTMLInputElement).value = '';
                document.querySelector<HTMLElement>('#connection')!.hidden = true;
            }
            if (action === 'capture') {
                fill.disabled = true;
                preview.replaceChildren();
                feedback.textContent = `Captured ${data.capture.fields.length} controls from ${data.capture.title || 'this page'}. Open the answer workspace to review.`;
                for (const warning of data.capture.warnings || [])
                    feedback.append(el('p', warning, 'helper'));
            }
            if (action === 'preview') {
                preview.replaceChildren();
                for (const item of data.plan.fields) {
                    const row = el('div', '', 'row');
                    row.append(el('strong', item.field.label), el('p', item.answer.value, 'value'));
                    preview.append(row);
                }
                fill.disabled = !data.plan.fields.length;
                feedback.textContent = `${data.plan.fields.length} approved answers ready. ${data.unresolved} actionable required questions still need review.`;
            }
            if (action === 'fill') {
                fill.disabled = true;
                results.replaceChildren(el('h2', 'Fill results'));
                for (const r of data.results) {
                    const row = el('div', '', 'card');
                    row.append(el('strong', r.id), el('p', labels[r.code] || r.code));
                    results.append(row);
                }
                feedback.textContent = data.message || 'Finished checking the form. Review the results below.';
            }
            if (action === 'signout') {
                preview.replaceChildren();
                results.replaceChildren();
                fill.disabled = true;
                document.querySelector<HTMLElement>('#connection')!.hidden = false;
            }
        }
        catch (e) {
            feedback.className = 'error';
            feedback.textContent = e instanceof Error ? e.message : 'Unable to connect';
            fill.disabled = true;
        }
        finally {
            if (action !== 'fill')
                button.disabled = false;
        }
    });
chrome.runtime.sendMessage({ action: 'status' }).then((r: any) => { if (r?.data?.connected)
    document.querySelector<HTMLElement>('#connection')!.hidden = true; if (r?.data) {
    workspace(r.data.applicationId);
    feedback.textContent = r.data.message;
} }).catch(() => { });
