import assert from 'node:assert/strict';
import test from 'node:test';
import { empty, transition } from './engine';
import type { Captured } from './contracts';
const capture: Captured = { url: 'http://localhost:3000/preparation-fixtures/generic.html', jobId: 'demo', fields: [{ id: 'why', label: 'Why this job?', help: '', type: 'textarea', required: true, actionable: true, section: '', options: [], maxLength: 10, pattern: '' }] };
const captured = () => transition(empty(), { action: 'capture', capture }).state;
test('capture replay is idempotent and stores no current values', () => { const s = captured(); assert.equal(transition(s, { action: 'capture', capture }).state.revision, s.revision); assert.throws(() => transition(s, { action: 'capture', capture: { ...capture, jobId: '', values: 'secret' } })); });
test('answer approval requires exact current revision and constraints', () => { let s = captured(); assert.throws(() => transition(s, { action: 'approve', id: 'why', revision: 0 }), /409/); s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'too long answer' }).state; assert.throws(() => transition(s, { action: 'approve', id: 'why', revision: s.revision }), /limit/); });
test('editing approved answers creates a draft and invalidates active plans', () => { let s = captured(); s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'My work' }).state; s = transition(s, { action: 'approve', id: 'why', revision: s.revision }).state; s = transition(s, { action: 'plan', revision: s.revision }).state; assert.equal(s.plans[0].fields.length, 1); const plan = s.plans[0]; s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'New work' }).state; assert.equal(s.answers[0].value, 'My work'); assert.equal(s.answers[0].state, 'approved'); assert.equal(s.answers[1].state, 'draft'); assert.throws(() => transition(s, { action: 'results', planId: plan.id, results: [] }), /409/); assert.equal(transition(s, { action: 'plan', revision: s.revision }).state.plans[0].fields.length, 0); });
test('country, polarity and option changes require a fresh approval', () => {
    for (const label of ['US sponsorship now?', 'US sponsorship in the future?', 'US citizenship?', 'Canadian work authorization?']) {
        let s = captured();
        s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'Yes' }).state;
        s = transition(s, { action: 'approve', id: 'why', revision: s.revision }).state;
        s = transition(s, { action: 'capture', capture: { ...capture, fields: [{ ...capture.fields[0], label }] } }).state;
        assert.equal(transition(s, { action: 'plan', revision: s.revision }).state.plans[0].fields.length, 0);
    }
});
test('duplicate identities, unsafe origins and arbitrary status updates are rejected', () => { assert.throws(() => transition(empty(), { action: 'capture', capture: { ...capture, fields: [capture.fields[0], capture.fields[0]] } }), /Duplicate/); assert.throws(() => transition(empty(), { action: 'capture', capture: { ...capture, url: 'http://employer.test/apply' } }), /403/); assert.throws(() => transition(captured(), { action: 'submitted_confirmed' })); });
test('result events are idempotent and cannot refer to other fields', () => { let s = captured(); s = transition(s, { action: 'plan', revision: s.revision }).state; const command = { action: 'results', planId: s.plans[0].id, results: [] }; s = transition(s, command).state; s = transition(s, command).state; assert.equal(s.events.length, 1); assert.throws(() => transition(s, { ...command, results: [{ id: 'other', code: 'filled_verified' }] }), /Unknown/); });
test('HTTPS form capture is accepted and page changes preserve exact unaffected answers', () => {
    let s = transition(empty(), { action: 'capture', capture: { ...capture, url: 'https://employer.test/apply' } }).state;
    s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'Example' }).state;
    s = transition(s, { action: 'approve', id: 'why', revision: s.revision }).state;
    s = transition(s, { action: 'capture', capture: { ...s.capture!, fields: [...s.capture!.fields, { ...capture.fields[0], id: 'new', label: 'New question' }] } }).state;
    const plan = transition(s, { action: 'plan', revision: s.revision }).state.plans[0];
    assert.equal(plan.fields.length, 1);
    assert.equal(plan.fields[0].field.id, 'why');
});
test('changed options invalidate only that question and inactive fields are never planned', () => {
    let s = captured();
    s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'Example' }).state;
    s = transition(s, { action: 'approve', id: 'why', revision: s.revision }).state;
    s = transition(s, { action: 'capture', capture: { ...capture, fields: [{ ...capture.fields[0], options: [{ label: 'No', value: 'no' }] }] } }).state;
    assert.equal(transition(s, { action: 'plan', revision: s.revision }).state.plans[0].fields.length, 0);
});
test('same URL with changed job title cannot reuse an approval', () => {
    let s = captured();
    s = transition(s, { action: 'draft', id: 'why', revision: s.revision, value: 'Example' }).state;
    s = transition(s, { action: 'approve', id: 'why', revision: s.revision }).state;
    s = transition(s, { action: 'capture', capture: { ...capture, title: 'Different requisition' } }).state;
    assert.equal(transition(s, { action: 'plan', revision: s.revision }).state.plans[0].fields.length, 0);
});
