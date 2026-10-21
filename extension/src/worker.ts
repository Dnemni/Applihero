import { Capture, Result } from '../../lib/preparation/contracts';
import { safePageUrl } from '../../lib/preparation/semantics';
import type { Plan } from '../../lib/preparation/contracts';
declare const chrome: any;
const secureStorage = Promise.all([chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }), chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })]);
// Handle the toolbar gesture explicitly so Chrome grants activeTab before capture.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
chrome.action.onClicked.addListener((tab: any) => {
    if (tab.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});
const checkpointKey = (id: number) => `tab:${id}`;
async function api(body?: unknown, id?: string) {
    const { token } = await chrome.storage.session.get('token');
    if (!token)
        throw Error('Connect with your local development key first.');
    const r = await fetch(`http://localhost:3000/api/preparation${id ? `?application=${encodeURIComponent(id)}` : ''}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (!r.ok)
        throw Error(data.error || 'Unable to sync');
    return data;
}
async function captureTab(tab: any) {
    if (!tab.url) throw Error("Click the AppliHero toolbar icon on this form to grant current-tab access, then capture again.");
    const url = safePageUrl(tab.url);
    if (url.startsWith('http://localhost:3000/') && !url.includes('/preparation-fixtures/'))
        throw Error('Open an application form, not the answer workspace.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const capture = Capture.parse(await chrome.tabs.sendMessage(tab.id, { action: 'capture' }));
    if (capture.url !== url)
        throw Error('Page navigated. Capture the current form again.');
    return capture;
}
async function sync(tab: any) { const capture = await captureTab(tab); const state = await api({ action: 'capture', capture }); await chrome.storage.local.set({ [checkpointKey(tab.id)]: { url: capture.url, applicationId: state.applicationId, revision: state.revision } }); return state; }
chrome.runtime.onMessage.addListener((m: any, sender: any, reply: any) => {
    if (sender.id !== chrome.runtime.id)
        return;
    if (m.action === 'schema_changed') {
        if (!sender.tab?.id || sender.frameId !== 0)
            return;
        (async () => { await secureStorage; const key = checkpointKey(sender.tab.id); const saved = (await chrome.storage.local.get(key))[key]; if (!saved || safePageUrl(sender.url) !== saved.url)
            return; await sync(sender.tab); })().catch(() => { });
        return;
    }
    if (sender.url !== chrome.runtime.getURL('panel.html') || !['connect', 'capture', 'preview', 'fill', 'signout', 'status'].includes(m.action))
        return;
    (async () => {
        await secureStorage;
        if (m.action === 'signout') {
            await chrome.storage.session.clear();
            await chrome.storage.local.clear();
            return { message: 'Disconnected. Local answers remain in your workspace.' };
        }
        if (m.action === 'connect') {
            if (typeof m.token !== 'string' || m.token.length < 32 || m.token.length > 256)
                throw Error('Enter the development key printed by the local server.');
            await chrome.storage.session.set({ token: m.token });
            try {
                await api();
            }
            catch (e) {
                await chrome.storage.session.clear();
                throw e;
            }
            return { message: 'Connected to your local workspace.' };
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id)
            throw Error('Open an application tab first.');
        const key = checkpointKey(tab.id), saved = (await chrome.storage.local.get(key))[key];
        if (m.action === 'status') {
            return { connected: Boolean((await chrome.storage.session.get('token')).token), applicationId: saved?.applicationId, message: saved ? 'This tab is linked. Form changes sync after capture.' : 'Capture to link this tab to AppliHero.' };
        }
        if (m.action === 'capture')
            return sync(tab);
        if (!saved || safePageUrl(tab.url) !== saved.url)
            throw Error('Capture this form before previewing answers.');
        if (m.action === 'preview') {
            const state = await sync(tab);
            const plan = await api({ action: 'plan', revision: state.revision }, saved.applicationId);
            await chrome.storage.session.set({ preview: { id: plan.id, tabId: tab.id, applicationId: saved.applicationId } });
            return { plan, applicationId: saved.applicationId, unresolved: state.capture.fields.filter((f: any) => f.required && f.actionable && !plan.fields.some((x: any) => x.field.id === f.id)).length };
        }
        const { preview } = await chrome.storage.session.get('preview');
        if (preview?.tabId !== tab.id || preview.applicationId !== saved.applicationId)
            throw Error('Preview the answers for this tab first.');
        const state = await api(undefined, saved.applicationId);
        const plan: Plan = state.plans.find((p: Plan) => p.id === preview.id);
        if (!plan || plan.expires < Date.now() || plan.revision !== state.revision)
            throw Error('Answers or form changed. Preview again.');
        // The content script receives only approved fields for this page.
        const results = Result.array().parse(await chrome.tabs.sendMessage(tab.id, { action: 'fill', plan }));
        try {
            await api({ action: 'results', planId: plan.id, results }, saved.applicationId);
        }
        catch {
            await chrome.storage.session.remove('preview');
            return { results, message: 'Results shown below. The page changed during filling; capture and review before continuing. Results could not be saved.' };
        }
        await chrome.storage.session.remove('preview');
        return { results, applicationId: saved.applicationId };
    })().then(data => reply({ data })).catch(e => reply({ error: e.message }));
    return true;
});
chrome.tabs.onRemoved.addListener((id: number) => chrome.storage.local.remove(checkpointKey(id)));
