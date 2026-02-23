const KEY = "fittrack_smoke_test_v1";
function $(id){ return document.getElementById(id); }
function setStatus(msg){ const el = $("status"); if (el) el.textContent = msg; }
function safeJsonParse(s){ try { return JSON.parse(s); } catch { return null; } }

document.addEventListener("DOMContentLoaded", () => {
  setStatus("JS loaded ✅");

  const input = $("testInput");
  const out = $("out");

  $("saveBtn").addEventListener("click", () => {
    const v = (input.value || "").trim();
    if (!v) { setStatus("Type something first"); return; }

    const payload = { value: v, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(payload));
    setStatus("Saved ✅");
    out.textContent = JSON.stringify(payload, null, 2);
  });

  $("loadBtn").addEventListener("click", () => {
    const raw = localStorage.getItem(KEY);
    const payload = raw ? safeJsonParse(raw) : null;
    if (!payload) { setStatus("Nothing saved yet"); out.textContent = ""; return; }
    setStatus("Loaded ✅");
    out.textContent = JSON.stringify(payload, null, 2);
  });

  $("clearBtn").addEventListener("click", () => {
    localStorage.removeItem(KEY);
    setStatus("Cleared ✅");
    out.textContent = "";
    input.value = "";
  });
});