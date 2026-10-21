import assert from 'node:assert/strict';
import test from 'node:test';
import { profileSuggestion, safePageUrl } from './semantics';
import { applicationId } from './local-store';
import { type Question } from './contracts';
const f: Question = { id: 'x', label: 'Email', help: '', type: 'text', required: true, actionable: true, section: '', options: [], maxLength: -1, pattern: '' };
test('profile reuse uses exact contact labels, never legal or country inference', () => {
    assert.equal(profileSuggestion(f, { email: 'demo@example.test' }), 'demo@example.test');
    for (const label of ['US citizenship?', 'Email me marketing', 'Will you need sponsorship?', 'Why this company?', 'Country of citizenship'])
        assert.equal(profileSuggestion({ ...f, label }, { email: 'demo@example.test', city: 'New York' }), undefined);
});
test('URL identity keeps known requisitions and strips authentication/query PII', () => {
    assert.equal(safePageUrl('https://company.test/apply?token=secret&email=private&gh_jid=123#section'), 'https://company.test/apply?gh_jid=123');
    assert.notEqual(applicationId('https://company.test/apply?gh_jid=123'), applicationId('https://company.test/apply?gh_jid=456'));
    for (const url of ['file:///tmp/form', 'http://public.test/apply', 'https://user:password@company.test/apply'])
        assert.throws(() => safePageUrl(url));
});
