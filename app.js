// -------------------- Storage Keys --------------------
const KEY_WEIGHT = "glenTrack.weights.v1";
const KEY_MACROS = "glenTrack.macros.v1";     // object keyed by date
const KEY_WORKOUTS = "glenTrack.workouts.v1"; // array

// -------------------- Helpers --------------------
const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0, 10);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setStatus(text, ok = true) {
  const pill = $("statusPill");
  pill.textContent = text;
  pill.style.color = ok ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.92)";
  pill.style.background = ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.14)";
  pill.style.borderColor = ok ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.22)";
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => {
    pill.textContent = "Ready";
    pill.style.color = "rgba(255,255,255,0.60)";
    pill.style.background = "rgba(255,255,255,0.06)";
    pill.style.borderColor = "rgba(255,255,255,0.08)";
  }, 1200);
}

function fmtWeight(w) {
  if (w === null || w === undefined || Number.isNaN(w)) return "—";
  return `${Number(w).toFixed(1)} lbs`;
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0, 10);
}

// -------------------- Bottom Nav / Screens --------------------
const screens = ["dashboard", "weight", "macros", "workouts"];

function showScreen(name) {
  screens.forEach((s) => {
    const el = $(`screen-${s}`);
    el.classList.toggle("active", s === name);
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.go === name);
  });

  $("subTitle").textContent = name.charAt(0).toUpperCase() + name.slice(1);

  // refresh visible screen data
  if (name === "dashboard") renderDashboard();
  if (name === "weight") renderWeights();
  if (name === "macros") renderMacrosPreview();
  if (name === "workouts") renderWorkouts();
}

// -------------------- Weight --------------------
function getWeights() {
  return loadJSON(KEY_WEIGHT, []);
}

function setWeights(arr) {
  // sort by date asc
  arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  saveJSON(KEY_WEIGHT, arr);
}

function addWeight(date, value) {
  const weights = getWeights();
  // If date exists, replace it
  const idx = weights.findIndex((x) => x.date === date);
  const entry = { date, value: Number(value) };
  if (idx >= 0) weights[idx] = entry;
  else weights.push(entry);
  setWeights(weights);
}

function deleteWeight(date) {
  const weights = getWeights().filter((x) => x.date !== date);
  setWeights(weights);
}

function clearWeights() {
  saveJSON(KEY_WEIGHT, []);
}

function exportWeights() {
  const weights = getWeights();
  const csv = ["date,weight_lbs"]
    .concat(weights.map((w) => `${w.date},${w.value}`))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "glen-track-weights.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -------------------- Macros --------------------
function getMacrosAll() {
  return loadJSON(KEY_MACROS, {});
}

function setMacrosAll(obj) {
  saveJSON(KEY_MACROS, obj);
}

function saveMacros(date, data) {
  const all = getMacrosAll();
  all[date] = data;
  setMacrosAll(all);
}

function deleteMacros(date) {
  const all = getMacrosAll();
  delete all[date];
  setMacrosAll(all);
}

// -------------------- Workouts --------------------
function getWorkouts() {
  return loadJSON(KEY_WORKOUTS, []);
}

function setWorkouts(arr) {
  // latest first
  arr.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  saveJSON(KEY_WORKOUTS, arr);
}

function saveWorkout(date, text, template) {
  const workouts = getWorkouts();

  const idx = workouts.findIndex((w) => w.date === date);
  const entry = {
    date,
    template,
    text,
    savedAt: new Date().toISOString(),
  };

  if (idx >= 0) workouts[idx] = entry;
  else workouts.push(entry);

  setWorkouts(workouts);
}

function deleteWorkout(date) {
  setWorkouts(getWorkouts().filter((w) => w.date !== date));
}

const TEMPLATES = {
  push: `PUSH (Chest / Shoulders / Triceps)
1) Bench Press — 3x5–8
2) Incline DB Press — 3x8–12
3) Overhead Press — 3x6–10
4) Lateral Raises — 3x12–20
5) Triceps Pushdown — 3x10–15
6) Optional: Dips — 2xAMRAP`,
  pull: `PULL (Back / Biceps)
1) Pull-Ups or Lat Pulldown — 3x6–12
2) Barbell or DB Row — 3x6–10
3) Seated Cable Row — 3x8–12
4) Face Pulls — 3x12–20
5) Bicep Curls — 3x10–15
6) Optional: Hammer Curls — 2x10–15`,
  legs: `LEGS (Quads / Hamstrings / Glutes / Calves)
1) Squat or Leg Press — 3x5–10
2) Romanian Deadlift — 3x6–10
3) Walking Lunges — 3x10–12 (each)
4) Leg Curl — 3x10–15
5) Calf Raises — 4x10–20
6) Optional: Core — 3 sets`,
};

// -------------------- Chart --------------------
let weightChart;

function rebuildWeightChart() {
  const weights = getWeights();
  const labels = weights.map((w) => w.date);
  const data = weights.map((w) => w.value);

  const ctx = $("weightChart").getContext("2d");

  if (weightChart) {
    weightChart.destroy();
  }

  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight (lbs)",
          data,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "rgba(255,255,255,0.70)" },
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.55)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          ticks: { color: "rgba(255,255,255,0.55)" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

// -------------------- Renderers --------------------
function renderWeights() {
  const list = $("weightsList");
  const weights = getWeights();

  list.innerHTML = "";

  if (weights.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `<div><div class="itemTitle">No weight entries yet</div><div class="itemSub">Add your first weight above.</div></div>`;
    list.appendChild(empty);
    return;
  }

  // newest first in list view
  [...weights].sort((a,b)=> (a.date > b.date ? -1 : 1)).forEach((w) => {
    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="itemTitle">${w.date}</div>
      <div class="itemSub">${fmtWeight(w.value)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "itemActions";

    const del = document.createElement("button");
    del.className = "btnMini danger";
    del.textContent = "Delete";
    del.onclick = () => {
      deleteWeight(w.date);
      setStatus("Deleted", true);
      renderWeights();
      renderDashboard();
    };

    actions.appendChild(del);
    row.appendChild(left);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function renderMacrosPreview() {
  const date = $("macroDate").value || todayISO();
  const all = getMacrosAll();
  const obj = all[date] || {};
  $("macrosPreview").textContent = JSON.stringify(obj, null, 2);
}

function renderWorkouts() {
  const list = $("workoutsList");
  const workouts = getWorkouts();
  list.innerHTML = "";

  if (workouts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `<div><div class="itemTitle">No workouts yet</div><div class="itemSub">Pick a template and save your first session.</div></div>`;
    list.appendChild(empty);
    return;
  }

  workouts.forEach((w) => {
    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="itemTitle">${w.date} • ${w.template ? w.template.toUpperCase() : "CUSTOM"}</div>
      <div class="itemSub">${w.text || ""}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "itemActions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "btnMini";
    loadBtn.textContent = "Load";
    loadBtn.onclick = () => {
      $("workoutDate").value = w.date;
      $("workoutText").value = w.text || "";
      setStatus("Loaded", true);
    };

    const del = document.createElement("button");
    del.className = "btnMini danger";
    del.textContent = "Delete";
    del.onclick = () => {
      deleteWorkout(w.date);
      setStatus("Deleted", true);
      renderWorkouts();
      renderDashboard();
    };

    actions.appendChild(loadBtn);
    actions.appendChild(del);

    row.appendChild(left);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function renderDashboard() {
  const weights = getWeights();
  const workouts = getWorkouts();
  const macrosAll = getMacrosAll();

  // Latest weight
  if (weights.length === 0) {
    $("dashLatestWeight").textContent = "—";
    $("dashLatestWeightHint").textContent = "No entries yet";
  } else {
    const latest = [...weights].sort((a,b)=> (a.date > b.date ? -1 : 1))[0];
    $("dashLatestWeight").textContent = fmtWeight(latest.value);
    $("dashLatestWeightHint").textContent = latest.date;
  }

  // Macros today
  const today = todayISO();
  const m = macrosAll[today];
  if (!m) {
    $("dashMacros").textContent = "—";
    $("dashMacrosHint").textContent = "No macros saved for today";
  } else {
    const cals = m.calories ?? "—";
    const p = m.protein ?? "—";
    const c = m.carbs ?? "—";
    const f = m.fat ?? "—";
    $("dashMacros").textContent = `${cals}`;
    $("dashMacrosHint").textContent = `P ${p} • C ${c} • F ${f}`;
  }

  // Workouts last 7 days
  const cutoff = daysAgoISO(6); // inclusive range: today + 6 days back = 7 days
  const w7 = workouts.filter((w) => w.date >= cutoff && w.date <= today);
  $("dashWorkoutsWeek").textContent = `${w7.length}`;

  // 7-day weight average
  const wts7 = weights.filter((w) => w.date >= cutoff && w.date <= today).map((w) => w.value);
  if (wts7.length === 0) {
    $("dashWeightAvg7").textContent = "—";
  } else {
    const avg = wts7.reduce((a,b)=>a+b,0) / wts7.length;
    $("dashWeightAvg7").textContent = `${avg.toFixed(1)} lbs`;
  }

  // Chart
  rebuildWeightChart();
}

// -------------------- Init / Events --------------------
function init() {
  // Default dates
  $("weightDate").value = todayISO();
  $("macroDate").value = todayISO();
  $("workoutDate").value = todayISO();

  // Tabs
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.go));
  });

  // Weight events
  $("btnAddWeight").addEventListener("click", () => {
    const date = $("weightDate").value || todayISO();
    const val = parseNum($("weightValue").value);

    if (val === null) {
      setStatus("Enter a weight", false);
      return;
    }
    addWeight(date, val);
    $("weightValue").value = "";
    setStatus("Saved ✓", true);
    renderWeights();
    renderDashboard();
  });

  $("btnClearWeights").addEventListener("click", () => {
    if (!confirm("Clear all weight entries?")) return;
    clearWeights();
    setStatus("Cleared", true);
    renderWeights();
    renderDashboard();
  });

  $("btnExportWeights").addEventListener("click", () => {
    exportWeights();
    setStatus("Exported", true);
  });

  // Macros events
  $("btnSaveMacros").addEventListener("click", () => {
    const date = $("macroDate").value || todayISO();
    const data = {
      calories: parseNum($("calories").value),
      protein: parseNum($("protein").value),
      carbs: parseNum($("carbs").value),
      fat: parseNum($("fat").value),
      savedAt: new Date().toISOString(),
    };

    // If user left everything blank, treat as invalid
    const hasAny = ["calories","protein","carbs","fat"].some((k) => data[k] !== null);
    if (!hasAny) {
      setStatus("Enter macros", false);
      return;
    }

    saveMacros(date, data);
    setStatus("Saved ✓", true);
    renderMacrosPreview();
    renderDashboard();
  });

  $("btnClearMacros").addEventListener("click", () => {
    const date = $("macroDate").value || todayISO();
    if (!confirm(`Clear macros for ${date}?`)) return;
    deleteMacros(date);
    $("calories").value = "";
    $("protein").value = "";
    $("carbs").value = "";
    $("fat").value = "";
    setStatus("Cleared", true);
    renderMacrosPreview();
    renderDashboard();
  });

  $("macroDate").addEventListener("change", () => {
    // load macros into inputs
    const date = $("macroDate").value || todayISO();
    const all = getMacrosAll();
    const m = all[date] || {};
    $("calories").value = m.calories ?? "";
    $("protein").value = m.protein ?? "";
    $("carbs").value = m.carbs ?? "";
    $("fat").value = m.fat ?? "";
    renderMacrosPreview();
  });

  // Workouts templates
  document.querySelectorAll("[data-template]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.template;
      $("workoutText").value = TEMPLATES[t] || "";
      setStatus(`${t.toUpperCase()} loaded`, true);
      // remember last template choice on save only
      $("workoutText").focus();
    });
  });

  $("btnSaveWorkout").addEventListener("click", () => {
    const date = $("workoutDate").value || todayISO();
    const text = ($("workoutText").value || "").trim();
    if (!text) {
      setStatus("Enter workout", false);
      return;
    }

    // detect which template it resembles (simple heuristic)
    let template = "custom";
    if (text.startsWith("PUSH")) template = "push";
    if (text.startsWith("PULL")) template = "pull";
    if (text.startsWith("LEGS")) template = "legs";

    saveWorkout(date, text, template);
    setStatus("Saved ✓", true);
    renderWorkouts();
    renderDashboard();
  });

  $("btnClearWorkout").addEventListener("click", () => {
    $("workoutText").value = "";
    setStatus("Cleared", true);
  });

  // Initial render
  renderWeights();
  renderMacrosPreview();
  renderWorkouts();
  renderDashboard();

  // Start on dashboard
  showScreen("dashboard");
}

document.addEventListener("DOMContentLoaded", init);