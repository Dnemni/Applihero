"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '@/lib/preparation/contracts';
import { isApproved, profileLabels, profileSuggestion, type LocalProfile, type ProfileKey } from '@/lib/preparation/semantics';
import './preparation.css';
type AppItem = {
    id: string;
    title: string;
    url: string;
    count: number;
};
export default function Prepare() {
    const [token, T] = useState(''), [connected, C] = useState(false), [state, S] = useState<Workspace>(), [apps, A] = useState<AppItem[]>([]), [selected, Select] = useState(''), [error, E] = useState(''), [busy, B] = useState(false), [values, V] = useState<Record<string, string>>({}), [guidance, G] = useState<Record<string, string>>({}), [profile, P] = useState<LocalProfile>({}), [profileDraft, PD] = useState<LocalProfile>({}), [profileRevision, PR] = useState(0), [filter, F] = useState('all');
    const request = useCallback(async (body?: unknown, id?: string) => { const r = await fetch(`/api/preparation${id ? `?application=${encodeURIComponent(id)}` : ''}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json(); if (!r.ok)
        throw Error(data.error); return data; }, [token]);
    const refresh = useCallback(async (id = selected) => { const index = await request(); A(index.applications); P(index.profile); let current = id; if (!current) {
        const desired = new URLSearchParams(window.location.search).get('application');
        current = index.applications.find((a: AppItem) => a.id === desired)?.id || index.applications[0]?.id || '';
        if (current)
            Select(current);
    } if (current)
        S(await request(undefined, current)); }, [request, selected]);
    async function connect() { B(true); try {
        await refresh();
        const index = await request();
        PD(index.profile);
        PR(index.profileRevision);
        C(true);
        E('');
    }
    catch (e) {
        E(String(e));
    }
    finally {
        B(false);
    } }
    useEffect(() => { if (!connected)
        return; const timer = setInterval(() => { if (!document.hidden && !busy)
        refresh().catch(e => E(String(e))); }, 4000); return () => clearInterval(timer); }, [connected, busy, refresh]);
    async function action(action: string, id: string) { B(true); try {
        const data = await request({ action, id, revision: state?.revision, ...(action === 'draft' ? { value: values[id] ?? state?.answers.filter(a => a.id === id).at(-1)?.value ?? '' } : {}) }, selected);
        if (action === 'coach')
            G(prev => ({ ...prev, [id]: data.guidance }));
        if (action === 'draft')
            V(prev => { const next = { ...prev }; delete next[id]; return next; });
        await refresh();
        E('');
    }
    catch (e) {
        E(String(e));
        await refresh().catch(() => { });
    }
    finally {
        B(false);
    } }
    async function saveProfile() { B(true); try {
        const data = await request({ action: 'profile', revision: profileRevision, profile: profileDraft });
        P(data.profile);
        PR(data.profileRevision);
        E('');
    }
    catch (e) {
        E(String(e));
    }
    finally {
        B(false);
    } }
    const fields = state?.capture?.fields || [];
    const latest = (id: string) => state?.answers.filter(a => a.id === id).at(-1);
    const approved = fields.filter(f => isApproved(latest(f.id), f, state?.capture));
    const unresolved = fields.filter(f => f.actionable && f.required && !isApproved(latest(f.id), f, state?.capture));
    const visible = fields.filter(f => filter === 'all' || filter === 'required' && f.required && !isApproved(latest(f.id), f, state?.capture) || filter === 'manual' && (f.type === 'file' || f.type === 'unsupported' || !f.actionable));
    return <div className="prep"><main className="shell"><header className="topbar"><div className="brand"><span className="brand-mark">A</span>AppliHero</div><span className="badge">Local workspace · private to this computer</span></header><h1>Great answers. Less repetition.</h1><p className="muted">Capture a form in Chrome, prepare your answers here, then preview and fill with the extension.</p>
 {!connected ? <section className="card connection"><h2>Connect your workspace</h2><p className="muted">Supabase is not required. Use the development key printed by your local server.</p><label htmlFor="key">Local development key</label><input id="key" type="password" value={token} onChange={e => T(e.target.value)}/><div className="actions"><button className="primary" disabled={busy} onClick={connect}>Connect / refresh</button></div></section> : <div className="actions"><button disabled={busy} onClick={() => refresh().catch(e => E(String(e)))}>Refresh questions</button><button onClick={() => { C(false); T(''); S(undefined); P({}); PD({}); V({}); }}>Disconnect</button><span className="badge success">Connected · questions sync every 4 seconds</span></div>}
 {error && <p className="error" role="alert">{error}</p>}
 {connected && <div className="layout"><aside><section className="card"><h2>Applications</h2><label htmlFor="application">Captured form</label><select id="application" value={selected} onChange={async (e) => { const id = e.target.value; Select(id); V({}); G({}); await refresh(id).catch(e => E(String(e))); }}>{!apps.length && <option>No forms captured yet</option>}{apps.map(a => <option key={a.id} value={a.id}>{a.title || a.url}</option>)}</select><p className="helper">Each page has separate answers and approvals. Verify the employer and requisition on the original site.</p></section><section className="card"><h2>Your reusable details</h2><p className="helper">Confirm only accurate contact details. Suggestions still need approval for each form.</p><details><summary>Edit local profile</summary>{Object.entries(profileLabels).map(([key, label]) => <label key={key}>{label}<input value={profileDraft[key as ProfileKey] || ''} onChange={e => PD({ ...profileDraft, [key]: e.target.value })}/></label>)}<button className="primary" disabled={busy} onClick={saveProfile}>Confirm and save profile</button><button disabled={busy} onClick={async () => { try {
            const index = await request();
            PD(index.profile);
            PR(index.profileRevision);
        }
        catch (e) {
            E(String(e));
        } }}>Reload saved profile</button></details></section><div className="note">Current page captured. Other steps and embedded forms may remain. You handle sign-in, uploads, navigation and final submission.</div></aside><div>
 {!state?.capture ? <section className="card empty"><h2>Start with an application form</h2><p className="muted">Open a form in Chrome, open AppliHero’s side panel and choose Capture this form.</p></section> : <><section className="card"><span className="eyebrow">Answer inbox</span><h2>{state.capture.title || state.capture.jobId}</h2><p className="origin muted">{state.capture.url}</p><p className="helper">Revision {state.revision} · exact question approvals · no automatic submission</p>{state.capture.warnings?.map(w => <p className="helper" key={w}>{w}</p>)}</section><div className="stats"><div className="stat"><strong>{fields.length}</strong>Captured controls</div><div className="stat"><strong>{approved.length}</strong>Approved answers</div><div className="stat"><strong>{unresolved.length}</strong>Required to review</div></div><div className="actions" style={{ marginBottom: 16 }}>{[['all', 'All questions'], ['required', 'Required to review'], ['manual', 'Manual / inactive']].map(([id, label]) => <button key={id} className={filter === id ? 'primary' : ''} onClick={() => F(id)}>{label}</button>)}</div>
 {visible.map(f => { const answer = latest(f.id), ok = isApproved(answer, f, state?.capture), value = values[f.id] ?? answer?.value ?? '', suggestion = profileSuggestion(f, profile), manual = f.type === 'unsupported' || f.type === 'file'; return <section className="card" key={f.id}><div className="question-head"><div><span className="eyebrow">{f.section || 'Application question'}</span><h3>{f.label || 'Unlabelled control'}</h3></div><span className={`badge ${ok ? 'success' : ''}`}>{ok ? 'Approved' : manual ? 'Manual' : !f.actionable ? 'Not active' : answer ? 'Review draft' : 'Unanswered'}</span></div><p className="helper">{f.required ? 'Required' : 'Optional'} · {f.type}{f.maxLength >= 0 ? ` · ${f.maxLength} character limit` : ''}</p>{f.help && <p>{f.help}</p>}{manual ? <div className="note">{f.manualReason || 'For résumé PDFs, use Preview résumé upload in the extension. Other documents need manual upload.'}</div> : <>{suggestion && !value && <div className="note">Suggested from your confirmed profile: <strong>{suggestion}</strong><div className="actions"><button onClick={() => V({ ...values, [f.id]: suggestion })}>Use suggestion</button></div></div>}<label htmlFor={`answer-${f.id}`}>Your answer</label>{f.options.length || f.type === 'checkbox' ? <select id={`answer-${f.id}`} aria-label={`Answer: ${f.label}`} value={value} onChange={e => V({ ...values, [f.id]: e.target.value })}><option value="">Choose explicitly</option>{(f.type === 'checkbox' ? [{ label: 'Yes — check this box', value: 'true' }, { label: 'No — leave unchecked', value: 'false' }] : f.options.filter(o => o.value !== '')).map((o, i) => <option key={i} value={o.value}>{o.label}</option>)}</select> : <textarea id={`answer-${f.id}`} aria-label={`Answer: ${f.label}`} value={value} onChange={e => V({ ...values, [f.id]: e.target.value })}/>}<p className="helper">{value.length} characters{f.maxLength >= 0 ? ` / ${f.maxLength}` : ''}{answer && !ok ? ' · Changes need explicit approval.' : ''}</p><div className="actions"><button disabled={busy} onClick={() => action('coach', f.id)}>Coach outline</button><button disabled={busy || f.maxLength >= 0 && value.length > f.maxLength} onClick={() => action('draft', f.id)}>Save new draft</button><button className="primary" disabled={busy || answer?.state !== 'draft' || value !== answer.value} onClick={() => action('approve', f.id)}>Approve exact answer</button></div>{guidance[f.id] && <div className="note">{guidance[f.id]}</div>}</>}</section>; })}
 <section className="card"><h2>Fill activity</h2><p className="helper">Results contain field identifiers and outcomes, not answer values.</p>{!state.events.length ? <p className="muted">Your verified fill results will appear here.</p> : state.events.slice(-5).reverse().map(event => <div key={event.id}>{event.results.map(r => <div className="row" key={r.id}><strong>{fields.find(f => f.id === r.id)?.label || r.id}</strong><span className="badge" style={{ marginLeft: 8 }}>{r.code.replaceAll('_', ' ')}</span></div>)}</div>)}</section></>}
 </div></div>}</main></div>;
}
