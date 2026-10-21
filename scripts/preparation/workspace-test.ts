import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
async function main() {
    const token = process.env.PREPARATION_DEMO_TOKEN;
    if (!token)
        throw Error('Set PREPARATION_DEMO_TOKEN to the running local demo server key');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        const url = 'http://localhost:3000/api/preparation';
        const unauthorized = await page.request.get(url);
        assert.equal(unauthorized.status(), 401);
        const headers = { Authorization: `Bearer ${token}` };
        let applicationId = createHash('sha256').update('http://localhost:3000/preparation-fixtures/workspace-test.html').digest('hex');
        async function post(data: any) { const r = await page.request.post(url + (applicationId ? '?application=' + applicationId : ''), { headers, data }); const body = await r.json(); assert(r.ok(), JSON.stringify(body)); return body; }
        await post({ action: 'reset' });
        const captured = await post({ action: 'capture', capture: { jobId: 'fixture-demo', url: 'http://localhost:3000/preparation-fixtures/workspace-test.html', fields: [{ id: 'id:why', label: 'Describe your contribution', help: 'Use a truthful example', type: 'textarea', required: true, actionable: true, section: 'Application', options: [], maxLength: 300, pattern: '' }] } });
        applicationId = captured.applicationId;
        await page.goto('http://localhost:3000/prepare?application=' + applicationId);
        await page.getByLabel('Local development key').fill(token);
        await page.getByRole('button', { name: 'Connect / refresh' }).click();
        await page.getByRole('button', { name: 'Coach outline' }).click();
        await page.getByText(/Answer the exact question using one truthful example/).waitFor();
        await page.getByLabel('Answer: Describe your contribution').fill('I implemented an endpoint and verified its search results.');
        await page.getByRole('button', { name: 'Save new draft' }).click();
        await page.getByText('Review draft', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Approve exact answer' }).click();
        await page.getByText('Approved', { exact: true }).waitFor();
        const state = await (await page.request.get(url + '?application=' + applicationId, { headers })).json();
        const plan = await post({ action: 'plan', revision: state.revision });
        assert.equal(plan.fields.length, 1);
        await post({ action: 'results', planId: plan.id, results: [{ id: 'id:why', code: 'filled_verified' }] });
        await page.reload();
        await page.getByLabel('Local development key').fill(token);
        await page.getByRole('button', { name: 'Connect / refresh' }).click();
        await page.getByText(/filled verified/).first().waitFor();
        console.log('PASS: unauthorized request denied; capture → coach outline → draft → approve → plan → results; refresh persistence');
    }
    finally {
        await browser.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
