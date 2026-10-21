export {};
declare const chrome: any;
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.runtime.onMessage.addListener((m: any, sender: any, reply: any) => {
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("panel.html"))
        return;
    if (!["connect", "capture", "preview", "fill", "signout"].includes(m.action))
        return;
    (async () => {
        if (m.action === "signout") {
            await chrome.storage.session.clear();
            await chrome.storage.local.clear();
            return { ok: true };
        }
        if (m.action === "connect") {
            if (typeof m.token !== "string" || m.token.length < 32)
                throw Error("Invalid local key");
            await chrome.storage.session.set({ token: m.token });
            return { ok: true };
        }
        const { token } = await chrome.storage.session.get("token");
        if (!token)
            throw Error("Connect with the local demo key first");
        async function api(body?: any) { const r = await fetch("http://localhost:3000/api/preparation", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json(); if (!r.ok)
            throw Error(data.error); return data; }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url?.startsWith("http://localhost:3000/preparation-fixtures/"))
            throw Error("Open a local preparation fixture tab");
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        const capture = await chrome.tabs.sendMessage(tab.id, { action: "capture" });
        if (m.action === "capture") {
            const state = await api({ action: "capture", capture });
            await chrome.storage.local.set({ checkpoint: { tabId: tab.id, revision: state.revision } });
            return state;
        }
        const state = await api();
        if (JSON.stringify(state.capture) !== JSON.stringify(capture))
            throw Error("Schema changed. Capture and review again.");
        if (m.action === "preview") {
            const plan = await api({ action: "plan", revision: state.revision });
            await chrome.storage.session.set({ preview: { id: plan.id, tabId: tab.id } });
            return plan;
        }
        const { preview } = await chrome.storage.session.get("preview");
        const plan = state.plans.find((p: any) => p.id === preview?.id);
        if (!plan || preview.tabId !== tab.id || plan.expires < Date.now() || plan.revision !== state.revision)
            throw Error("Preview expired or changed; preview again");
        const results = await chrome.tabs.sendMessage(tab.id, { action: "fill", plan, capture });
        await api({ action: "results", planId: plan.id, results });
        await chrome.storage.session.remove("preview");
        return results;
    })().then((data: any) => reply({ data })).catch((e: any) => reply({ error: e.message }));
    return true;
});
