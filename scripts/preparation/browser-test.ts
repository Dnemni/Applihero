import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { empty, transition } from '../../lib/preparation/engine';
async function main() {
    const browser = await chromium.launch({ headless: true, channel: "chrome" });
    let verified = 0, attempted = 0;
    try {
        const page = await browser.newPage();
        await page.addInitScript("globalThis.__name = (fn) => fn");
        for (const fixture of ['generic', 'greenhouse']) {
            await page.route('http://localhost:3000/**', route => route.fulfill({ contentType: 'text/html', path: `public/preparation-fixtures/${fixture}.html` }));
            await page.goto(`http://localhost:3000/preparation-fixtures/${fixture}.html`);
            await page.evaluate(() => { (window as any).chrome = { runtime: { id: 'test', onMessage: { addListener: (listener: any) => (window as any).listener = listener } } }; });
            await page.addScriptTag({ content: await readFile('extension/dist/content.js', 'utf8') });
            async function message(message: any) { return page.evaluate(message => new Promise(resolve => (window as any).listener(message, { id: 'test' }, resolve)), message) as Promise<any>; }
            const capture = await message({ action: 'capture' });
            assert.equal(capture.fields.find((f: any) => f.id === 'id:why').help, 'Describe your own contribution. Maximum 300 characters.');
            assert.equal(capture.fields.find((f: any) => f.id === 'id:future').actionable, false);
            assert.equal(new Set(capture.fields.map((f: any) => f.id)).size, capture.fields.length);
            let state = transition(empty(), { action: 'capture', capture }).state;
            for (const [id, value] of [['id:name', 'Fixture Candidate'], ['id:email', 'replacement@example.test'], ['id:why', 'I implemented a search endpoint and checked its results.'], ['id:country', 'US'], ['name:employer:Employment entry 1', 'Example one'], ['name:employer:Employment entry 2', 'Example two'], ['id:resume', 'manual'], ['id:custom', 'manual']]) {
                state = transition(state, { action: 'draft', id, value, revision: state.revision }).state;
                state = transition(state, { action: 'approve', id, revision: state.revision }).state;
            }
            // Simulate a framework replacing an input after its input event.
            await page.evaluate(() => { document.getElementById('name')!.addEventListener('input', e => { const old = e.target as HTMLInputElement; const replacement = old.cloneNode() as HTMLInputElement; replacement.value = old.value; old.replaceWith(replacement); }, { once: true }); });
            state = transition(state, { action: 'plan', revision: state.revision }).state;
            const plan = state.plans[0];
            const results = await message({ action: 'fill', plan, capture });
            assert.equal(results.find((r: any) => r.id === 'id:email').code, 'skipped_user_value');
            assert.equal(results.find((r: any) => r.id === 'id:resume').code, 'manual_upload_required');
            assert.equal(results.find((r: any) => r.id === 'id:custom').code, 'unsupported');
            for (const id of ['id:name', 'id:why', 'id:country', 'name:employer:Employment entry 1', 'name:employer:Employment entry 2']) {
                attempted++;
                assert.equal(results.find((r: any) => r.id === id).code, 'filled_verified');
                verified++;
            }
            assert.equal(await page.locator('#email').inputValue(), 'existing@example.test');
            await page.getByRole('button', { name: 'Next (manual)' }).click();
            const next = await message({ action: 'capture' });
            assert.equal(next.fields.find((f: any) => f.id === 'id:future').actionable, true);
            const stale = await message({ action: 'fill', plan, capture });
            assert(stale.every((r: any) => r.code === 'stale_schema'));
            // An ambiguous locator is never written, even when a plan is supplied for that inventory.
            await page.evaluate(() => { document.querySelector('form')!.append(document.getElementById('name')!.cloneNode()); });
            const ambiguous = await message({ action: 'capture' });
            const result = await message({ action: 'fill', plan: { ...plan, fields: plan.fields.filter(f => f.field.id === 'id:name') }, capture: ambiguous });
            assert.equal(result[0].code, 'ambiguous_locator');
        }
        console.log(JSON.stringify({ verified, attempted, ratio: verified / attempted, fixtures: 2, limitations: 'Fixture adapter only; no live ATS or Chrome side panel tested' }));
    }
    finally {
        await browser.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
