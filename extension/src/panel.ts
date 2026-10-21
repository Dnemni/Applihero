export {};
declare const chrome: any;
const output = document.querySelector("pre")!;
for (const button of Array.from(document.querySelectorAll("button"))) {
    button.addEventListener("click", async () => { const action = button.dataset.action; const response = await chrome.runtime.sendMessage({ action, ...(action === "connect" ? { token: (document.querySelector("input") as HTMLInputElement).value } : {}) }); output.textContent = JSON.stringify(response, null, 2); if (action === "connect")
        (document.querySelector("input") as HTMLInputElement).value = ""; });
}
