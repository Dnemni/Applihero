import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('separate applications, concurrent draft CAS and profile revisions persist locally', async () => {
    const old = process.cwd(), dir = await mkdtemp(join(tmpdir(), 'applihero-store-test-'));
    process.chdir(dir);
    try {
        const { execute, read } = await import('./local-store');
        const field = { id: 'name', label: 'Full name', help: '', type: 'text', required: true, actionable: true, section: '', options: [], maxLength: -1, pattern: '' };
        const a = await execute({ action: 'capture', capture: { url: 'https://one.test/apply', jobId: 'one', fields: [field] } }) as any;
        const b = await execute({ action: 'capture', capture: { url: 'https://two.test/apply', jobId: 'two', fields: [field] } }) as any;
        assert.notEqual(a.applicationId, b.applicationId);
        const commands = await Promise.allSettled(['First', 'Second'].map(value => execute({ action: 'draft', id: 'name', value, revision: 1 }, a.applicationId)));
        assert.equal(commands.filter(r => r.status === 'fulfilled').length, 1);
        const stateA = await read(a.applicationId) as any, stateB = await read(b.applicationId) as any;
        assert.equal(stateA.answers.length, 1);
        assert.equal(stateB.answers.length, 0);
        await assert.rejects(() => execute({ action: 'capture', capture: { url: 'https://two.test/apply', jobId: 'two', fields: [field] } }, a.applicationId), /identity/);
        await execute({ action: 'profile', revision: 0, profile: { email: 'demo@example.test' } });
        await assert.rejects(() => execute({ action: 'profile', revision: 0, profile: { email: 'stale@example.test' } }), /409/);
        assert.equal((await read() as any).profile.email, 'demo@example.test');
    }
    finally {
        process.chdir(old);
        await rm(dir, { recursive: true, force: true });
    }
});
