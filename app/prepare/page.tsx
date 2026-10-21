"use client";
import { useState } from "react";
import type { Workspace } from "@/lib/preparation/contracts";
export default function Prepare() {
    const [token, T] = useState(""), [state, S] = useState<Workspace>(), [error, E] = useState(""), [values, V] = useState<Record<string, string>>({}), [guidance, G] = useState<Record<string, string>>({});
    async function request(body?: unknown) { const r = await fetch("/api/preparation", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json(); if (!r.ok)
        throw new Error(data.error); return data; }
    async function refresh() { try {
        S(await request());
        E("");
    }
    catch (e) {
        E(String(e));
    } }
    async function action(action: string, id: string) { try {
        const data = await request({ action, id, revision: state?.revision, ...(action === "draft" ? { value: values[id] ?? state?.answers.filter(a => a.id === id).at(-1)?.value ?? "" } : {}) });
        if (action === "coach")
            G({ ...guidance, [id]: data.guidance });
        await refresh();
    }
    catch (e) {
        E(String(e));
    } }
    return <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}><h1>Application preparation · local demo</h1><p>Current step only. Unseen steps remain. Approval permits filling, never submission.</p><p>This isolated workspace uses fixture data and a local development key, not your Supabase account.</p><input aria-label="Local development key" type="password" value={token} onChange={e => T(e.target.value)} placeholder="Local development key"/><button onClick={refresh}>Connect / refresh</button><p role="alert">{error}</p>{state?.capture && <><h2>{state.capture.jobId}</h2><p>Revision {state.revision} · {state.capture.fields.length} captured controls · {state.capture.fields.filter(f => f.required && !state.answers.some(a => a.id === f.id && a.schema === state.schema && a.state === "approved" && a === state.answers.filter(x => x.id === f.id).at(-1))).length} required unresolved</p>{state.capture.fields.map(f => { const a = state.answers.filter(a => a.id === f.id).at(-1); return <section key={f.id} style={{ border: "1px solid #bbb", padding: 18, margin: "16px 0" }}><h3>{f.label} {f.required ? "(required)" : "(optional)"}</h3><p>{f.section} · {f.type} · {f.help}</p><p>{f.maxLength >= 0 ? `Maximum ${f.maxLength} characters` : ""}</p>{f.options.length > 0 && <p>Exact option values: {f.options.map(o => `${o.label}: ${o.value}`).join("; ")}</p>}<textarea aria-label={`Answer: ${f.label}`} value={values[f.id] ?? a?.value ?? ""} onChange={e => V({ ...values, [f.id]: e.target.value })}/><p>{a?.state || "Unanswered"}{a && a.schema !== state.schema ? " · recapture requires new review" : ""}</p><button onClick={() => action("coach", f.id)}>Coach outline</button> <button onClick={() => action("draft", f.id)}>Save new draft</button> <button onClick={() => action("approve", f.id)}>Approve exact answer</button><p>{guidance[f.id]}</p></section>; })}<h2>Verified result events</h2><pre>{JSON.stringify(state.events, null, 2)}</pre></>}</main>;
}
