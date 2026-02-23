// ---------- Storage Keys ----------
const KEY_WEIGHT = "fittrack.weights.v1";
const KEY_MACROS = "fittrack.macros.v1";
const KEY_WORKOUTS = "fittrack.workouts.v1";

// ---------- Helpers ----------
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

function setStatus(text) {
  const pill = $("statusPill");
  pill.textContent = text;
}

// ---------- Tabs ----------
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");

      const target = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`tab-${target}`).classList.add("active");
    });
  });
}

// ---------- WEIGHT ----------
let weightChart;

function getWeights() {
  return loadJSON(KEY_WEIGHT, []);
}

function setWeights(arr) {
  saveJSON(KEY_WEIGHT, arr);
}

function renderWeights() {
  const list = $("weightList");
  const weights = getWeights().slice().sort((a,b) => a.date.localeCompare(b.date));

  list.innerHTML = "";
  if (weights.length === 0) {
    list.innerHTML = `<div class="item"><div><div class="itemTitle">No entries yet</div><div class="itemSub">Add your first weigh-in.</div></div></div>`;
  } else {
    weights.forEach((w, idx) => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="itemTitle">${w.date}</div>
          <div class="itemSub">${w.weight} lbs</div>
        </div>
        <button data-del="${w.id}">Delete</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        const next = getWeights().filter(x => x.id !== w.id);
        setWeights(next);
        renderWeights();
        renderDashboard();
        setStatus("Deleted ✅");
      });
      list.appendChild(row);
    });
  }

  // Chart
  const labels = weights.map(w => w.date);
  const data = weights.map(w => w.weight);

  const ctx = $("weightChart").getContext("2d");
  if (weightChart) weightChart.destroy();

  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Weight (lbs)", data, tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: false } }
    }
  });
}

function setupWeight() {
  $("weightDate").value = todayISO();

  $("addWeight").addEventListener("click", () => {
    const date = $("weightDate").value || todayISO();
    const weight = parseFloat($("weightValue").value);
    if (!Number.isFinite(weight)) {
      setStatus("Enter a weight");
      return;
    }

    const arr = getWeights();
    arr.push({ id: crypto.randomUUID(), date, weight });
    setWeights(arr);
    $("weightValue").value = "";
    renderWeights();
    renderDashboard();
    setStatus("Saved ✅");
  });

  $("clearWeights").addEventListener("click", () => {
    setWeights([]);
    renderWeights();
    renderDashboard();
    setStatus("Cleared ✅");
  });
}

// ---------- MACROS ----------
let macroChart;

function getMacros() {
  return loadJSON(KEY_MACROS, []);
}

function setMacros(arr) {
  saveJSON(KEY_MACROS, arr);
}

function renderMacros() {
  const list = $("macroList");
  const macros = getMacros().slice().sort((a,b) => a.date.localeCompare(b.date));

  list.innerHTML = "";
  if (macros.length === 0) {
    list.innerHTML = `<div class="item"><div><div class="itemTitle">No macro entries yet</div><div class="itemSub">Save calories + macros for a day.</div></div></div>`;
  } else {
    macros.forEach(m => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="itemTitle">${m.date}</div>
          <div class="itemSub">${m.calories} cal • P ${m.protein} • C ${m.carbs} • F ${m.fat}</div>
        </div>
        <button data-del="${m.id}">Delete</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        const next = getMacros().filter(x => x.id !== m.id);
        setMacros(next);
        renderMacros();
        renderDashboard();
        setStatus("Deleted ✅");
      });
      list.appendChild(row);
    });
  }

  // Macro chart (Calories line)
  const labels = macros.map(m => m.date);
  const data = macros.map(m => m.calories);

  const ctx = $("macroChart").getContext("2d");
  if (macroChart) macroChart.destroy();

  macroChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Calories", data, tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function setupMacros() {
  $("macroDate").value = todayISO();

  $("saveMacros").addEventListener("click", () => {
    const date = $("macroDate").value || todayISO();
    const calories = parseInt($("calories").value, 10);
    const protein = parseInt($("protein").value, 10);
    const carbs = parseInt($("carbs").value, 10);
    const fat = parseInt($("fat").value, 10);

    if (![calories, protein, carbs, fat].every(Number.isFinite)) {
      setStatus("Fill all macro fields");
      return;
    }

    const arr = getMacros();
    arr.push({ id: crypto.randomUUID(), date, calories, protein, carbs, fat });
    setMacros(arr);

    $("calories").value = "";
    $("protein").value = "";
    $("carbs").value = "";
    $("fat").value = "";

    renderMacros();
    renderDashboard();
    setStatus("Saved ✅");
  });
}

// ---------- WORKOUTS ----------
function getWorkouts() {
  return loadJSON(KEY_WORKOUTS, []);
}

function setWorkouts(arr) {
  saveJSON(KEY_WORKOUTS, arr);
}

function renderWorkouts() {
  const list = $("workoutList");
  const workouts = getWorkouts().slice().sort((a,b) => a.date.localeCompare(b.date));

  list.innerHTML = "";
  if (workouts.length === 0) {
    list.innerHTML = `<div class="item"><div><div class="itemTitle">No workouts yet</div><div class="itemSub">Add an exercise set.</div></div></div>`;
    return;
  }

  workouts.forEach(w => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div class="itemTitle">${w.date} — ${w.exercise}</div>
        <div class="itemSub">${w.sets} sets x ${w.reps} reps @ ${w.weight}</div>
      </div>
      <button>Delete</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      const next = getWorkouts().filter(x => x.id !== w.id);
      setWorkouts(next);
      renderWorkouts();
      renderDashboard();
      setStatus("Deleted ✅");
    });
    list.appendChild(row);
  });
}

function setupWorkouts() {
  $("workoutDate").value = todayISO();

  $("addExercise").addEventListener("click", () => {
    const date = $("workoutDate").value || todayISO();
    const exercise = ($("exerciseName").value || "").trim();
    const sets = parseInt($("sets").value, 10);
    const reps = parseInt($("reps").value, 10);
    const weight = parseFloat($("liftWeight").value);

    if (!exercise) { setStatus("Enter exercise name"); return; }
    if (![sets, reps].every(Number.isFinite) || !Number.isFinite(weight)) {
      setStatus("Enter sets/reps/weight");
      return;
    }

    const arr = getWorkouts();
    arr.push({ id: crypto.randomUUID(), date, exercise, sets, reps, weight });
    setWorkouts(arr);

    $("exerciseName").value = "";
    $("sets").value = "";
    $("reps").value = "";
    $("liftWeight").value = "";

    renderWorkouts();
    renderDashboard();
    setStatus("Saved ✅");
  });
}

// ---------- DASHBOARD ----------
function lastNDaysISO(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tzOff = d.getTimezoneOffset() * 60000;
    const iso = new Date(d - tzOff).toISOString().slice(0, 10);
    out.push(iso);
  }
  return out;
}

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a,b) => a+b, 0) / nums.length;
}

function renderDashboard() {
  const days = new Set(lastNDaysISO(7));

  const w = getWeights().filter(x => days.has(x.date)).map(x => x.weight);
  const m = getMacros().filter(x => days.has(x.date)).map(x => x.calories);
  const wk = getWorkouts().filter(x => days.has(x.date)).length;

  const avgW = avg(w);
  const avgM = avg(m);

  $("avgWeight").textContent = avgW == null ? "--" : avgW.toFixed(1);
  $("avgCalories").textContent = avgM == null ? "--" : Math.round(avgM).toString();
  $("wkCount").textContent = wk.toString();
}

// ---------- PWA Service Worker ----------
function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// ---------- Init ----------
function init() {
  setupTabs();

  setupWeight();
  setupMacros();
  setupWorkouts();

  renderWeights();
  renderMacros();
  renderWorkouts();
  renderDashboard();

  setupPWA();
  setStatus("Loaded ✅");
}

document.addEventListener("DOMContentLoaded", init);
