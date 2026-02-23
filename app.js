/* =========================================================
   GLEN TRACK — Mobile-only, no libs, no servers, no CDN.
   - localStorage single key: "fitnessTrackerData"
   - Week view Mon–Sun with prev/next
   - Weight, Macros, Workouts, Meals (templates + grocery)
   - Goals + Streaks
   - Export/Import JSON
   - Inline SVG charts
   ========================================================= */

const STORAGE_KEY = "fitnessTrackerData";

/* ---------- Tiny helpers ---------- */
const $ = (id) => document.getElementById(id);

function safeText(s) {
  return String(s ?? "").replace(/[<>]/g, "");
}

function todayISO() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0, 10);
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(iso) {
  try {
    return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function toNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoAddDays(iso, days) {
  const dt = parseISO(iso);
  dt.setDate(dt.getDate() + days);
  const tzOff = dt.getTimezoneOffset() * 60000;
  return new Date(dt - tzOff).toISOString().slice(0, 10);
}

function startOfWeekISO(iso) {
  // Monday start. JS getDay: Sun=0
  const dt = parseISO(iso);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  dt.setDate(dt.getDate() + diff);
  const tzOff = dt.getTimezoneOffset() * 60000;
  return new Date(dt - tzOff).toISOString().slice(0, 10);
}

function weekDays(weekStartISO) {
  return Array.from({ length: 7 }, (_, i) => isoAddDays(weekStartISO, i));
}

function uuid() {
  // good-enough id without external libs
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

/* ---------- Data model (single object) ---------- */
function defaultData() {
  return {
    version: 1,
    ui: {
      weekStart: startOfWeekISO(todayISO())
    },
    settings: {
      goalWeeklyLoss: 0.5,
      goalWorkoutsPerWeek: 3,
      goalProtein: 180,
      caloriesWorkoutDay: 2400,
      caloriesRestDay: 2100,
      streakCountsMeals: false
    },
    weights: {
      // "YYYY-MM-DD": { lbs: number, note: string }
    },
    macros: {
      // "YYYY-MM-DD": { calories, protein, carbs, fat, fiber }
    },
    workouts: {
      // "YYYY-MM-DD": [ { id, name, cardioType, cardioMins, exercises:[{name,sets,reps,weight,notes}] } ]
    },
    meals: {
      templates: {
        // templateId: { id, name, macros:{calories,protein,carbs,fat}, ingredients:[...], notes }
      },
      logs: {
        // "YYYY-MM-DD": [ { id, templateId, servings } ]
      },
      usage: {
        // templateId: count
      }
    }
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    // shallow validate
    if (!parsed || typeof parsed !== "object") return defaultData();
    // merge defaults (so new settings don't break old data)
    const d = defaultData();
    return {
      ...d,
      ...parsed,
      ui: { ...d.ui, ...(parsed.ui || {}) },
      settings: { ...d.settings, ...(parsed.settings || {}) },
      weights: parsed.weights || {},
      macros: parsed.macros || {},
      workouts: parsed.workouts || {},
      meals: {
        templates: parsed.meals?.templates || {},
        logs: parsed.meals?.logs || {},
        usage: parsed.meals?.usage || {}
      }
    };
  } catch {
    return defaultData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

/* ---------- Global state ---------- */
let DATA = loadData();

/* ---------- Week utilities ---------- */
function getWeekStart() {
  return DATA.ui.weekStart;
}
function setWeekStart(iso) {
  DATA.ui.weekStart = startOfWeekISO(iso);
  saveData();
  renderAll();
}

/* ---------- Activity & streak ---------- */
function getActivityDatesSet() {
  const s = new Set();
  Object.keys(DATA.weights).forEach(d => s.add(d));
  Object.keys(DATA.macros).forEach(d => s.add(d));
  Object.keys(DATA.workouts).forEach(d => {
    if ((DATA.workouts[d] || []).length) s.add(d);
  });
  if (DATA.settings.streakCountsMeals) {
    Object.keys(DATA.meals.logs).forEach(d => {
      if ((DATA.meals.logs[d] || []).length) s.add(d);
    });
  }
  return s;
}

function computeStreak() {
  const set = getActivityDatesSet();
  let streak = 0;
  let cur = todayISO();
  while (set.has(cur)) {
    streak++;
    cur = isoAddDays(cur, -1);
  }
  return streak;
}

/* ---------- Calorie cycling ---------- */
function didWorkoutOn(dateISO) {
  return (DATA.workouts[dateISO] || []).length > 0;
}
function calorieTargetFor(dateISO) {
  return didWorkoutOn(dateISO) ? DATA.settings.caloriesWorkoutDay : DATA.settings.caloriesRestDay;
}

/* ---------- Inline SVG chart helpers ---------- */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function renderLineChart(containerEl, labels, values, opts = {}) {
  // simple: 7-day or N-day line
  const w = 320, h = 160, pad = 26;
  containerEl.innerHTML = "";

  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", height: "160", role: "img" });
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: w, height: h, rx: 12, fill: "rgba(255,255,255,0.02)" }));

  const clean = values.map(v => (Number.isFinite(v) ? v : null));
  const pts = clean.map((v, i) => ({ i, v })).filter(p => p.v != null);

  if (!pts.length) {
    const t = svgEl("text", { x: w/2, y: h/2, "text-anchor": "middle", fill: "rgba(159,178,214,0.9)", "font-size": "12" });
    t.textContent = opts.emptyText || "No data yet.";
    svg.appendChild(t);
    containerEl.appendChild(svg);
    return;
  }

  const min = Math.min(...pts.map(p => p.v));
  const max = Math.max(...pts.map(p => p.v));
  const span = (max - min) || 1;

  // grid lines
  for (let g = 0; g <= 4; g++) {
    const y = pad + (h - pad*2) * (g / 4);
    svg.appendChild(svgEl("line", { x1: pad, y1: y, x2: w - pad, y2: y, stroke: "rgba(255,255,255,0.06)" }));
  }

  const xFor = (i) => {
    if (labels.length <= 1) return pad;
    return pad + (w - pad*2) * (i / (labels.length - 1));
  };
  const yFor = (v) => pad + (h - pad*2) * (1 - (v - min) / span);

  // path
  let d = "";
  for (let i = 0; i < labels.length; i++) {
    const v = clean[i];
    if (v == null) continue;
    const x = xFor(i);
    const y = yFor(v);
    d += (d ? " L " : "M ") + `${x} ${y}`;
  }

  const stroke = opts.stroke || "rgba(77,163,255,0.95)";
  const path = svgEl("path", { d, fill: "none", stroke, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" });
  svg.appendChild(path);

  // points
  for (let i = 0; i < labels.length; i++) {
    const v = clean[i];
    if (v == null) continue;
    const x = xFor(i), y = yFor(v);
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 3.8, fill: "rgba(234,241,255,0.9)" }));
  }

  // min/max labels (tiny)
  const minT = svgEl("text", { x: pad, y: h - 8, fill: "rgba(159,178,214,0.85)", "font-size": "11" });
  minT.textContent = opts.minLabel ? opts.minLabel(min) : `${min.toFixed(1)}`;
  svg.appendChild(minT);

  const maxT = svgEl("text", { x: pad, y: 14, fill: "rgba(159,178,214,0.85)", "font-size": "11" });
  maxT.textContent = opts.maxLabel ? opts.maxLabel(max) : `${max.toFixed(1)}`;
  svg.appendChild(maxT);

  containerEl.appendChild(svg);
}

function renderBarsChart(containerEl, labels, values, opts = {}) {
  const w = 320, h = 160, pad = 22;
  containerEl.innerHTML = "";
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", height: "160", role: "img" });
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: w, height: h, rx: 12, fill: "rgba(255,255,255,0.02)" }));

  const clean = values.map(v => (Number.isFinite(v) ? v : 0));
  const max = Math.max(...clean, 1);

  const barW = (w - pad*2) / labels.length;
  for (let i = 0; i < labels.length; i++) {
    const v = clean[i];
    const bh = (h - pad*2) * (v / max);
    const x = pad + i * barW + 4;
    const y = h - pad - bh;
    svg.appendChild(svgEl("rect", {
      x, y, width: Math.max(6, barW - 8), height: bh,
      rx: 6,
      fill: opts.fill || "rgba(53,208,127,0.85)"
    }));
  }

  const t = svgEl("text", { x: pad, y: 14, fill: "rgba(159,178,214,0.85)", "font-size": "11" });
  t.textContent = opts.topLabel || `max ${max}`;
  svg.appendChild(t);

  containerEl.appendChild(svg);
}

/* ---------- Navigation ---------- */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".navBtn").forEach(b => b.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
  document.querySelector(`.navBtn[data-target="${name}"]`)?.classList.add("active");
}

/* ---------- Renderers ---------- */
function renderWeekHeader() {
  const ws = getWeekStart();
  const we = isoAddDays(ws, 6);
  $("weekTitle").textContent = `Week of ${fmtDate(ws)}`;
  $("weekRange").textContent = `${fmtDate(ws)} – ${fmtDate(we)}`;
}

function listWeekWeights(ws) {
  const days = weekDays(ws);
  return days
    .map(d => ({ date: d, entry: DATA.weights[d] || null }))
    .filter(x => x.entry);
}

function listWeekMacros(ws) {
  const days = weekDays(ws);
  return days
    .map(d => ({ date: d, entry: DATA.macros[d] || null }))
    .filter(x => x.entry);
}

function listWeekWorkouts(ws) {
  const days = weekDays(ws);
  const out = [];
  for (const d of days) {
    for (const w of (DATA.workouts[d] || [])) out.push({ date: d, workout: w });
  }
  return out;
}

function renderDashboard() {
  renderWeekHeader();
  $("streakBadge").textContent = `Streak: ${computeStreak()}`;

  const ws = getWeekStart();
  const days = weekDays(ws);

  // Weight stats
  const wEntries = listWeekWeights(ws);
  const wVals = wEntries.map(x => x.entry.lbs);
  const avgW = wVals.length ? (wVals.reduce((a,b)=>a+b,0)/wVals.length) : null;
  $("dashAvgWeight").textContent = avgW ? `${avgW.toFixed(1)} lbs` : "—";

  let wDeltaText = "—";
  if (wVals.length >= 2) {
    const start = wEntries[0].entry.lbs;
    const end = wEntries[wEntries.length - 1].entry.lbs;
    const delta = end - start;
    const sign = delta > 0 ? "+" : "";
    wDeltaText = `${sign}${delta.toFixed(1)} this week`;
  } else if (wVals.length === 1) {
    wDeltaText = "log 2+ days for change";
  }
  $("dashWeightDelta").textContent = wDeltaText;

  // Workout count
  const wkWorkouts = listWeekWorkouts(ws).length;
  $("dashWorkoutCount").textContent = String(wkWorkouts);
  $("dashWorkoutGoal").textContent = `Goal: ${DATA.settings.goalWorkoutsPerWeek}/wk`;

  // Macro stats
  const mEntries = listWeekMacros(ws);
  const cals = mEntries.map(x => x.entry.calories).filter(n => Number.isFinite(n));
  const prot = mEntries.map(x => x.entry.protein).filter(n => Number.isFinite(n));
  const avgC = cals.length ? Math.round(cals.reduce((a,b)=>a+b,0)/cals.length) : null;
  const avgP = prot.length ? Math.round(prot.reduce((a,b)=>a+b,0)/prot.length) : null;

  $("dashAvgCalories").textContent = avgC != null ? `${avgC}` : "—";
  $("dashAvgProtein").textContent = avgP != null ? `${avgP}g` : "—";

  // targets shown as weekly avg targets (rough)
  const targetDays = days.map(d => calorieTargetFor(d));
  const avgTarget = Math.round(targetDays.reduce((a,b)=>a+b,0)/targetDays.length);
  $("dashCalTarget").textContent = `Target: ${avgTarget}`;
  $("dashProteinGoal").textContent = `Goal: ${DATA.settings.goalProtein}g`;

  // Goal progress bars
  const workoutsGoal = Math.max(1, DATA.settings.goalWorkoutsPerWeek);
  const workoutPct = Math.min(100, Math.round((wkWorkouts / workoutsGoal) * 100));
  $("progWorkoutsText").textContent = `${wkWorkouts}/${workoutsGoal}`;
  $("progWorkoutsFill").style.width = `${workoutPct}%`;

  // protein days: days where protein >= goal
  let proteinDays = 0;
  let calDays = 0;
  for (const d of days) {
    const me = DATA.macros[d];
    if (me && Number.isFinite(me.protein) && me.protein >= DATA.settings.goalProtein) proteinDays++;
    if (me && Number.isFinite(me.calories) && me.calories <= calorieTargetFor(d)) calDays++;
  }

  $("progProteinText").textContent = `${proteinDays}/7`;
  $("progProteinFill").style.width = `${Math.round((proteinDays/7)*100)}%`;

  $("progCalText").textContent = `${calDays}/7`;
  $("progCalFill").style.width = `${Math.round((calDays/7)*100)}%`;

  // Charts (week)
  const weekLabels = days.map(d => d.slice(5));
  const weekWeightVals = days.map(d => DATA.weights[d]?.lbs ?? null);
  renderLineChart($("weightWeekChart"), weekLabels, weekWeightVals, { emptyText: "No weigh-ins this week." });

  const weekProteinVals = days.map(d => DATA.macros[d]?.protein ?? null);
  renderLineChart($("macroWeekChart"), weekLabels, weekProteinVals, {
    emptyText: "No macros this week.",
    stroke: "rgba(53,208,127,0.9)",
    minLabel: (v) => `${Math.round(v)}g`,
    maxLabel: (v) => `${Math.round(v)}g`
  });
}

function renderWeight() {
  const ws = getWeekStart();
  const days = weekDays(ws);

  $("weightDate").value = $("weightDate").value || todayISO();

  // list (week only)
  const list = $("weightList");
  list.innerHTML = "";
  const entries = listWeekWeights(ws).sort((a,b)=>b.date.localeCompare(a.date));

  if (!entries.length) {
    list.innerHTML = `<div class="subtle">No weigh-ins this week yet.</div>`;
  } else {
    for (const e of entries) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div class="itemTitle">${safeText(e.date)} • ${e.entry.lbs.toFixed(1)} lbs</div>
          <div class="itemSub">${safeText(e.entry.note || "")}</div>
        </div>
        <div class="itemRight">
          <button class="smallBtn" data-edit-weight="${safeText(e.date)}">Edit</button>
          <button class="smallBtn" data-del-weight="${safeText(e.date)}">Delete</button>
        </div>
      `;
      list.appendChild(div);
    }
  }

  list.querySelectorAll("[data-del-weight]").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-del-weight");
      if (!confirm(`Delete weight entry for ${date}?`)) return;
      delete DATA.weights[date];
      saveData();
      renderAll();
    });
  });

  list.querySelectorAll("[data-edit-weight]").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-edit-weight");
      const entry = DATA.weights[date];
      if (!entry) return;
      $("weightDate").value = date;
      $("weightLbs").value = entry.lbs;
      $("weightNote").value = entry.note || "";
      showScreen("weight");
    });
  });

  // all-time chart (last 30 points)
  const allDates = Object.keys(DATA.weights).sort();
  const lastDates = allDates.slice(-30);
  const labels = lastDates.map(d => d.slice(5));
  const vals = lastDates.map(d => DATA.weights[d].lbs);
  renderLineChart($("weightAllChart"), labels, vals, { emptyText: "Log weight to see a trend." });
}

function renderMacros() {
  const ws = getWeekStart();
  $("macroDate").value = $("macroDate").value || todayISO();

  const date = $("macroDate").value || todayISO();
  const entry = DATA.macros[date] || null;

  // keep user input if they’re typing; only auto-fill if empty
  if (entry) {
    // only fill if empty to avoid fighting the user
    if ($("macroCalories").value === "") $("macroCalories").value = entry.calories ?? "";
    if ($("macroProtein").value === "") $("macroProtein").value = entry.protein ?? "";
    if ($("macroCarbs").value === "") $("macroCarbs").value = entry.carbs ?? "";
    if ($("macroFat").value === "") $("macroFat").value = entry.fat ?? "";
    if ($("macroFiber").value === "") $("macroFiber").value = entry.fiber ?? "";
  }

  $("todayCalTarget").textContent = `${calorieTargetFor(date)} kcal`;
  $("todayProteinGoal").textContent = `${DATA.settings.goalProtein}g`;

  // week list
  const list = $("macroList");
  list.innerHTML = "";
  const entries = listWeekMacros(ws).sort((a,b)=>b.date.localeCompare(a.date));

  if (!entries.length) {
    list.innerHTML = `<div class="subtle">No macros this week yet.</div>`;
  } else {
    for (const e of entries) {
      const m = e.entry;
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div class="itemTitle">${safeText(e.date)}</div>
          <div class="itemSub">${m.calories ?? 0} kcal • P ${m.protein ?? 0}g • C ${m.carbs ?? 0}g • F ${m.fat ?? 0}g</div>
        </div>
        <div class="itemRight">
          <button class="smallBtn" data-edit-macro="${safeText(e.date)}">Edit</button>
          <button class="smallBtn" data-del-macro="${safeText(e.date)}">Delete</button>
        </div>
      `;
      list.appendChild(div);
    }
  }

  list.querySelectorAll("[data-del-macro]").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-del-macro");
      if (!confirm(`Delete macros for ${d}?`)) return;
      delete DATA.macros[d];
      saveData();
      renderAll();
    });
  });

  list.querySelectorAll("[data-edit-macro]").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-edit-macro");
      const m = DATA.macros[d];
      if (!m) return;
      $("macroDate").value = d;
      $("macroCalories").value = m.calories ?? "";
      $("macroProtein").value = m.protein ?? "";
      $("macroCarbs").value = m.carbs ?? "";
      $("macroFat").value = m.fat ?? "";
      $("macroFiber").value = m.fiber ?? "";
      showScreen("macros");
    });
  });

  // all-time protein chart (last 30)
  const allDates = Object.keys(DATA.macros).sort();
  const lastDates = allDates.slice(-30);
  const labels = lastDates.map(d => d.slice(5));
  const vals = lastDates.map(d => DATA.macros[d].protein ?? null);
  renderLineChart($("macroAllChart"), labels, vals, {
    emptyText: "Log macros to see trends.",
    stroke: "rgba(53,208,127,0.9)",
    minLabel: (v)=>`${Math.round(v)}g`,
    maxLabel: (v)=>`${Math.round(v)}g`
  });
}

function volumeMetric(ex) {
  const sets = Number(ex.sets ?? 0);
  const reps = Number(ex.reps ?? 0);
  const w = Number(ex.weight ?? 0);
  if (!Number.isFinite(sets) || !Number.isFinite(reps) || !Number.isFinite(w)) return 0;
  return Math.max(0, sets) * Math.max(0, reps) * Math.max(0, w);
}

function renderWorkouts() {
  const ws = getWeekStart();
  $("workoutDate").value = $("workoutDate").value || todayISO();

  // ensure at least one row
  if (!$("exerciseList").children.length) addExerciseRow();

  // list week workouts
  const list = $("workoutList");
  list.innerHTML = "";
  const items = listWeekWorkouts(ws).sort((a,b)=>b.date.localeCompare(a.date));

  if (!items.length) {
    list.innerHTML = `<div class="subtle">No workouts this week yet.</div>`;
  } else {
    // group by date
    const grouped = {};
    for (const it of items) {
      grouped[it.date] = grouped[it.date] || [];
      grouped[it.date].push(it.workout);
    }

    const dates = Object.keys(grouped).sort().reverse();
    for (const d of dates) {
      for (const w of grouped[d]) {
        const vol = (w.exercises || []).reduce((sum, ex)=>sum + volumeMetric(ex), 0);
        const cardio = w.cardioMins ? ` • ${w.cardioType || "cardio"} ${w.cardioMins}m` : "";
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
          <div>
            <div class="itemTitle">${safeText(d)} • ${safeText(w.name || "Workout")}</div>
            <div class="itemSub">${(w.exercises||[]).length} exercises${cardio} • Volume ${Math.round(vol).toLocaleString()}</div>
          </div>
          <div class="itemRight">
            <button class="smallBtn" data-load-workout="${safeText(d)}::${safeText(w.id)}">Load</button>
            <button class="smallBtn" data-del-workout="${safeText(d)}::${safeText(w.id)}">Delete</button>
          </div>
        `;
        list.appendChild(div);
      }
    }
  }

  list.querySelectorAll("[data-del-workout]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-del-workout");
      const [d, id] = key.split("::");
      if (!confirm(`Delete workout on ${d}?`)) return;
      const arr = DATA.workouts[d] || [];
      DATA.workouts[d] = arr.filter(w => w.id !== id);
      if (!DATA.workouts[d].length) delete DATA.workouts[d];
      saveData();
      renderAll();
    });
  });

  list.querySelectorAll("[data-load-workout]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-load-workout");
      const [d, id] = key.split("::");
      const w = (DATA.workouts[d] || []).find(x => x.id === id);
      if (!w) return;
      loadWorkoutIntoForm(d, w);
      showScreen("workouts");
    });
  });
}

function renderMeals() {
  $("mealDate").value = $("mealDate").value || todayISO();

  // populate template select
  const sel = $("mealTemplateSelect");
  sel.innerHTML = "";
  const templates = Object.values(DATA.meals.templates);

  if (!templates.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "No templates yet (tap Add starter templates)";
    sel.appendChild(o);
  } else {
    templates.sort((a,b)=>a.name.localeCompare(b.name));
    for (const t of templates) {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      sel.appendChild(o);
    }
  }

  // today logs
  const date = $("mealDate").value || todayISO();
  const logs = DATA.meals.logs[date] || [];
  const list = $("mealsTodayList");
  list.innerHTML = "";

  if (!logs.length) {
    list.innerHTML = `<div class="subtle">No meals logged today.</div>`;
  } else {
    for (const l of logs) {
      const t = DATA.meals.templates[l.templateId];
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div class="itemTitle">${safeText(t?.name || "Meal")} • ${l.servings}x</div>
          <div class="itemSub">${t ? `Macros: ${t.macros.calories} kcal • P ${t.macros.protein}g` : ""}</div>
        </div>
        <div class="itemRight">
          <button class="smallBtn" data-del-meal="${safeText(date)}::${safeText(l.id)}">Remove</button>
        </div>
      `;
      list.appendChild(div);
    }
  }

  list.querySelectorAll("[data-del-meal]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-del-meal");
      const [d, id] = key.split("::");
      DATA.meals.logs[d] = (DATA.meals.logs[d] || []).filter(x => x.id !== id);
      if (!DATA.meals.logs[d].length) delete DATA.meals.logs[d];
      saveData();
      renderMeals();
    });
  });

  // templates list
  const tList = $("mealTemplatesList");
  tList.innerHTML = "";
  if (!templates.length) {
    tList.innerHTML = `<div class="subtle">Add templates to enable one-tap logging and grocery list.</div>`;
  } else {
    for (const t of templates) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div class="itemTitle">${safeText(t.name)}</div>
          <div class="itemSub">${safeText(t.notes || "")}</div>
        </div>
        <div class="itemRight">
          <button class="smallBtn" data-del-template="${safeText(t.id)}">Delete</button>
        </div>
      `;
      tList.appendChild(div);
    }
  }

  tList.querySelectorAll("[data-del-template]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-template");
      if (!confirm("Delete this meal template?")) return;
      delete DATA.meals.templates[id];
      // remove from logs
      for (const d of Object.keys(DATA.meals.logs)) {
        DATA.meals.logs[d] = (DATA.meals.logs[d] || []).filter(x => x.templateId !== id);
        if (!DATA.meals.logs[d].length) delete DATA.meals.logs[d];
      }
      delete DATA.meals.usage[id];
      saveData();
      renderMeals();
    });
  });
}

function renderSettings() {
  $("goalWeeklyLoss").value = DATA.settings.goalWeeklyLoss;
  $("goalWorkoutsPerWeek").value = DATA.settings.goalWorkoutsPerWeek;
  $("goalProtein").value = DATA.settings.goalProtein;
  $("goalCaloriesWorkout").value = DATA.settings.caloriesWorkoutDay;
  $("goalCaloriesRest").value = DATA.settings.caloriesRestDay;
  $("streakCountsMeals").value = DATA.settings.streakCountsMeals ? "yes" : "no";
}

/* ---------- Weight actions ---------- */
function saveWeight() {
  const date = $("weightDate").value || todayISO();
  const lbs = clampNum(toNum($("weightLbs").value), 0, 2000);
  if (lbs == null) return alert("Enter a valid weight.");

  const note = $("weightNote").value?.trim() || "";
  DATA.weights[date] = { lbs, note };
  saveData();
  $("weightLbs").value = "";
  $("weightNote").value = "";
  renderAll();
}

function clearWeightWeek() {
  const ws = getWeekStart();
  const days = weekDays(ws);
  if (!confirm("Clear weight entries for this week?")) return;
  for (const d of days) delete DATA.weights[d];
  saveData();
  renderAll();
}

/* ---------- Macro actions ---------- */
function saveMacros() {
  const date = $("macroDate").value || todayISO();

  const calories = clampNum(toNum($("macroCalories").value) ?? 0, 0, 20000);
  const protein  = clampNum(toNum($("macroProtein").value) ?? 0, 0, 1000);
  const carbs    = clampNum(toNum($("macroCarbs").value) ?? 0, 0, 2000);
  const fat      = clampNum(toNum($("macroFat").value) ?? 0, 0, 1000);
  const fiber    = clampNum(toNum($("macroFiber").value) ?? 0, 0, 200);

  DATA.macros[date] = { calories, protein, carbs, fat, fiber };
  saveData();
  // clear entry fields lightly
  $("macroCalories").value = "";
  $("macroProtein").value = "";
  $("macroCarbs").value = "";
  $("macroFat").value = "";
  $("macroFiber").value = "";
  renderAll();
}

function clearMacrosWeek() {
  const ws = getWeekStart();
  const days = weekDays(ws);
  if (!confirm("Clear macros for this week?")) return;
  for (const d of days) delete DATA.macros[d];
  saveData();
  renderAll();
}

/* ---------- Workout form ---------- */
function addExerciseRow(prefill = {}) {
  const wrap = $("exerciseList");
  const card = document.createElement("div");
  card.className = "exerciseCard";
  card.innerHTML = `
    <div class="exerciseTop">
      <input class="exerciseName" type="text" placeholder="Exercise name" value="${safeText(prefill.name || "")}" />
      <button class="smallBtn" type="button" data-remove-ex>✕</button>
    </div>
    <div class="exerciseFields">
      <input class="exField" type="number" inputmode="numeric" placeholder="Sets" value="${prefill.sets ?? ""}" />
      <input class="exField" type="number" inputmode="numeric" placeholder="Reps" value="${prefill.reps ?? ""}" />
      <input class="exField" type="number" inputmode="decimal" step="0.5" placeholder="Weight" value="${prefill.weight ?? ""}" />
    </div>
  `;
  wrap.appendChild(card);

  card.querySelector("[data-remove-ex]").addEventListener("click", () => card.remove());
}

function readExercisesFromForm() {
  const cards = [...$("exerciseList").querySelectorAll(".exerciseCard")];
  const out = [];
  for (const c of cards) {
    const name = c.querySelector(".exerciseName")?.value?.trim();
    const fields = c.querySelectorAll(".exField");
    const sets = clampNum(toNum(fields[0].value) ?? 0, 0, 50);
    const reps = clampNum(toNum(fields[1].value) ?? 0, 0, 200);
    const weight = clampNum(toNum(fields[2].value) ?? 0, 0, 2000);
    if (!name) continue;
    out.push({ name, sets, reps, weight });
  }
  return out;
}

function loadWorkoutIntoForm(date, workout) {
  $("workoutDate").value = date;
  $("workoutName").value = workout.name || "";
  $("cardioType").value = workout.cardioType || "";
  $("cardioMins").value = workout.cardioMins ?? "";
  $("exerciseList").innerHTML = "";
  (workout.exercises || []).forEach(ex => addExerciseRow(ex));
  if (!$("exerciseList").children.length) addExerciseRow();
}

function setWorkoutTemplate(kind) {
  const templates = {
    FULL: {
      name: "Full Body",
      exercises: [
        { name: "Leg Press (or Goblet Squat)", sets: 3, reps: 10, weight: "" },
        { name: "Bench Press (or Chest Press)", sets: 3, reps: 8, weight: "" },
        { name: "Lat Pulldown (or Assisted Pull-up)", sets: 3, reps: 10, weight: "" },
        { name: "Romanian Deadlift", sets: 2, reps: 10, weight: "" },
        { name: "Plank (seconds)", sets: 2, reps: 45, weight: "" }
      ]
    },
    PUSH: {
      name: "Push",
      exercises: [
        { name: "Bench Press", sets: 3, reps: 8, weight: "" },
        { name: "Incline Dumbbell Press", sets: 3, reps: 10, weight: "" },
        { name: "Shoulder Press", sets: 3, reps: 10, weight: "" },
        { name: "Triceps Pushdown", sets: 3, reps: 12, weight: "" }
      ]
    },
    PULL: {
      name: "Pull",
      exercises: [
        { name: "Lat Pulldown", sets: 3, reps: 10, weight: "" },
        { name: "Dumbbell Row", sets: 3, reps: 10, weight: "" },
        { name: "Face Pull", sets: 3, reps: 12, weight: "" },
        { name: "Biceps Curl", sets: 3, reps: 12, weight: "" }
      ]
    },
    LEGS: {
      name: "Legs",
      exercises: [
        { name: "Squat (or Leg Press)", sets: 3, reps: 8, weight: "" },
        { name: "Romanian Deadlift", sets: 3, reps: 10, weight: "" },
        { name: "Leg Curl", sets: 3, reps: 12, weight: "" },
        { name: "Calf Raise", sets: 3, reps: 15, weight: "" }
      ]
    }
  };

  const t = templates[kind];
  if (!t) return;
  $("workoutName").value = t.name;
  $("exerciseList").innerHTML = "";
  t.exercises.forEach(ex => addExerciseRow(ex));
}

function saveWorkout() {
  const date = $("workoutDate").value || todayISO();
  const name = $("workoutName").value.trim() || "Workout";
  const cardioType = $("cardioType").value || "";
  const cardioMins = clampNum(toNum($("cardioMins").value) ?? 0, 0, 600);
  const exercises = readExercisesFromForm();

  if (!exercises.length && !cardioMins) return alert("Add at least one exercise or cardio minutes.");

  const w = { id: uuid(), name, cardioType, cardioMins, exercises };
  DATA.workouts[date] = DATA.workouts[date] || [];
  DATA.workouts[date].push(w);

  saveData();
  renderAll();

  // small “reset” for next entry
  $("cardioType").value = "";
  $("cardioMins").value = "";
  $("exerciseList").innerHTML = "";
  addExerciseRow();
}

function clearWorkoutsWeek() {
  const ws = getWeekStart();
  const days = weekDays(ws);
  if (!confirm("Clear workouts for this week?")) return;
  for (const d of days) delete DATA.workouts[d];
  saveData();
  renderAll();
}

/* ---------- Meals + grocery ---------- */
function seedStarterMeals() {
  const t = DATA.meals.templates;
  if (Object.keys(t).length) return;

  const add = (name, macros, ingredients, notes="") => {
    const id = uuid();
    t[id] = { id, name, macros, ingredients, notes };
  };

  // Costco-friendly + your preferences (no cottage cheese; greens included)
  add(
    "Costco Al Pastor Chicken + Rice + Roasted Veg",
    { calories: 650, protein: 45, carbs: 65, fat: 20 },
    ["Al pastor diced chicken", "rice", "fire roasted veggie mix", "salsa", "olive oil"],
    "Your go-to lunch. Add salsa. Add spinach/arugula if you want extra greens."
  );

  add(
    "Eggs + Cheese + Salsa + Spinach",
    { calories: 420, protein: 28, carbs: 8, fat: 30 },
    ["eggs", "shredded cheese", "salsa", "spinach"],
    "Egg upgrade: cook in butter/olive oil, add garlic powder + paprika, finish with salsa."
  );

  add(
    "Eggs + Diced Chicken + Salsa Bowl",
    { calories: 520, protein: 45, carbs: 10, fat: 30 },
    ["eggs", "diced chicken", "salsa", "spinach or roasted veggies"],
    "Easy protein. Add hot sauce / salsa verde for flavor."
  );

  add(
    "Greek Yogurt + Berries (Protein Bowl)",
    { calories: 350, protein: 30, carbs: 35, fat: 5 },
    ["greek yogurt", "berries (frozen ok)", "honey (optional)", "granola (small)"],
    "Uber pre-shift friendly if you need protein fast."
  );

  add(
    "Uber Pre-Shift: Protein Shake + Banana",
    { calories: 320, protein: 30, carbs: 35, fat: 4 },
    ["protein shake (ready-made or powder)", "banana"],
    "Portable. Stops the ‘drive-thru spiral’."
  );

  saveData();
  renderAll();
  alert("Starter meal templates added ✅");
}

function addMealToDay() {
  const date = $("mealDate").value || todayISO();
  const templateId = $("mealTemplateSelect").value;
  if (!templateId) return alert("Pick a meal template first.");

  DATA.meals.logs[date] = DATA.meals.logs[date] || [];
  DATA.meals.logs[date].push({ id: uuid(), templateId, servings: 1 });

  DATA.meals.usage[templateId] = (DATA.meals.usage[templateId] || 0) + 1;

  // Optional: auto-add macros from meals into macros log (big-company feel)
  // We do it gently: add meal macros into that day's macros entry.
  const tpl = DATA.meals.templates[templateId];
  if (tpl) {
    const m = DATA.macros[date] || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    m.calories = (m.calories || 0) + (tpl.macros.calories || 0);
    m.protein  = (m.protein  || 0) + (tpl.macros.protein  || 0);
    m.carbs    = (m.carbs    || 0) + (tpl.macros.carbs    || 0);
    m.fat      = (m.fat      || 0) + (tpl.macros.fat      || 0);
    DATA.macros[date] = m;
  }

  saveData();
  renderAll();
}

function clearMealsWeek() {
  const ws = getWeekStart();
  const days = weekDays(ws);
  if (!confirm("Clear meals for this week?")) return;
  for (const d of days) delete DATA.meals.logs[d];
  saveData();
  renderAll();
}

function generateGroceryList() {
  // Based on template usage in last ~21 days, weighted by what you used most
  const cutoff = isoAddDays(todayISO(), -21);
  const recentDays = Object.keys(DATA.meals.logs).filter(d => d >= cutoff);
  const usedTemplateIds = [];
  for (const d of recentDays) {
    for (const log of (DATA.meals.logs[d] || [])) usedTemplateIds.push(log.templateId);
  }

  const counts = {};
  for (const id of usedTemplateIds) counts[id] = (counts[id] || 0) + 1;

  const top = Object.entries(counts)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, 12)
    .map(([id]) => id);

  // Build ingredient list
  const items = [];
  for (const id of top) {
    const tpl = DATA.meals.templates[id];
    if (!tpl) continue;
    for (const ing of (tpl.ingredients || [])) items.push(ing);
  }

  // Add a few evergreen “stability” items
  items.push("sparkling water / zero drink");
  items.push("olive oil / spray");
  items.push("seasonings: garlic powder, paprika, taco seasoning, salt/pepper");
  items.push("greens: spinach/arugula");

  // De-dupe and format
  const uniq = [...new Set(items.map(x => String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $("groceryOut").textContent = uniq.length ? uniq.map(x => `• ${x}`).join("\n") : "Nothing yet. Log meals from templates first.";
}

/* ---------- Quick Add ---------- */
function openModal() {
  $("modalBackdrop").classList.remove("hidden");
  $("quickAddModal").classList.remove("hidden");
}
function closeModal() {
  $("modalBackdrop").classList.add("hidden");
  $("quickAddModal").classList.add("hidden");
}

function quickAddSave() {
  const date = todayISO();

  const w = clampNum(toNum($("qaWeight").value), 0, 2000);
  if (w != null) DATA.weights[date] = { lbs: w, note: "" };

  const c = clampNum(toNum($("qaCalories").value), 0, 20000);
  const p = clampNum(toNum($("qaProtein").value), 0, 1000);
  if (c != null || p != null) {
    const m = DATA.macros[date] || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    if (c != null) m.calories = c;
    if (p != null) m.protein = p;
    DATA.macros[date] = m;
  }

  const cardio = clampNum(toNum($("qaCardioMins").value), 0, 600);
  if (cardio != null && cardio > 0) {
    DATA.workouts[date] = DATA.workouts[date] || [];
    // cardio-only workout entry
    DATA.workouts[date].push({
      id: uuid(),
      name: "Cardio",
      cardioType: "run",
      cardioMins: cardio,
      exercises: []
    });
  }

  saveData();
  $("qaWeight").value = "";
  $("qaCalories").value = "";
  $("qaProtein").value = "";
  $("qaCardioMins").value = "";
  closeModal();
  renderAll();
}

/* ---------- Export / Import ---------- */
function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    payload: DATA
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glen-track-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const payload = parsed?.payload;
      if (!payload || typeof payload !== "object") throw new Error("Missing payload");
      // minimal validation
      if (!payload.settings || !payload.ui) throw new Error("Invalid format");
      DATA = payload;
      // merge defaults to be safe
      const d = defaultData();
      DATA = {
        ...d,
        ...DATA,
        ui: { ...d.ui, ...(DATA.ui || {}) },
        settings: { ...d.settings, ...(DATA.settings || {}) },
        weights: DATA.weights || {},
        macros: DATA.macros || {},
        workouts: DATA.workouts || {},
        meals: {
          templates: DATA.meals?.templates || {},
          logs: DATA.meals?.logs || {},
          usage: DATA.meals?.usage || {}
        }
      };
      saveData();
      renderAll();
      alert("Import complete ✅");
    } catch (e) {
      alert("Import failed: " + (e?.message || "unknown error"));
    }
  };
  reader.readAsText(file);
}

/* ---------- Settings ---------- */
function saveSettingsFromUI() {
  const weeklyLoss = clampNum(toNum($("goalWeeklyLoss").value) ?? 0.5, 0, 5);
  const workouts = clampNum(toNum($("goalWorkoutsPerWeek").value) ?? 3, 0, 14);
  const protein = clampNum(toNum($("goalProtein").value) ?? 180, 0, 500);
  const calW = clampNum(toNum($("goalCaloriesWorkout").value) ?? 2400, 0, 10000);
  const calR = clampNum(toNum($("goalCaloriesRest").value) ?? 2100, 0, 10000);
  const meals = $("streakCountsMeals").value === "yes";

  DATA.settings.goalWeeklyLoss = weeklyLoss;
  DATA.settings.goalWorkoutsPerWeek = workouts;
  DATA.settings.goalProtein = protein;
  DATA.settings.caloriesWorkoutDay = calW;
  DATA.settings.caloriesRestDay = calR;
  DATA.settings.streakCountsMeals = meals;

  saveData();
  renderAll();
  alert("Settings saved ✅");
}

function resetAll() {
  if (!confirm("Reset ALL data? This cannot be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  DATA = defaultData();
  saveData();
  renderAll();
  alert("Reset complete ✅");
}

/* ---------- Events ---------- */
function bindEvents() {
  // nav
  document.querySelectorAll(".navBtn").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.getAttribute("data-target")));
  });

  // week
  $("weekPrevBtn").addEventListener("click", () => setWeekStart(isoAddDays(getWeekStart(), -7)));
  $("weekNextBtn").addEventListener("click", () => setWeekStart(isoAddDays(getWeekStart(), 7)));

  // weight
  $("saveWeightBtn").addEventListener("click", saveWeight);
  $("clearWeightWeekBtn").addEventListener("click", clearWeightWeek);
  $("weightDate").addEventListener("change", () => {
    const d = $("weightDate").value;
    const e = DATA.weights[d];
    $("weightLbs").value = e?.lbs ?? "";
    $("weightNote").value = e?.note ?? "";
  });

  // macros
  $("saveMacrosBtn").addEventListener("click", saveMacros);
  $("clearMacrosWeekBtn").addEventListener("click", clearMacrosWeek);
  $("macroDate").addEventListener("change", () => {
    const d = $("macroDate").value;
    const e = DATA.macros[d];
    $("macroCalories").value = e?.calories ?? "";
    $("macroProtein").value = e?.protein ?? "";
    $("macroCarbs").value = e?.carbs ?? "";
    $("macroFat").value = e?.fat ?? "";
    $("macroFiber").value = e?.fiber ?? "";
    renderMacros();
  });

  // workouts
  $("addExerciseBtn").addEventListener("click", () => addExerciseRow());
  $("tplFullBtn").addEventListener("click", () => setWorkoutTemplate("FULL"));
  $("tplPushBtn").addEventListener("click", () => setWorkoutTemplate("PUSH"));
  $("tplPullBtn").addEventListener("click", () => setWorkoutTemplate("PULL"));
  $("tplLegsBtn").addEventListener("click", () => setWorkoutTemplate("LEGS"));
  $("saveWorkoutBtn").addEventListener("click", saveWorkout);
  $("clearWorkoutsWeekBtn").addEventListener("click", clearWorkoutsWeek);

  // meals
  $("seedMealsBtn").addEventListener("click", seedStarterMeals);
  $("addMealBtn").addEventListener("click", addMealToDay);
  $("clearMealsWeekBtn").addEventListener("click", clearMealsWeek);
  $("genGroceryBtn").addEventListener("click", generateGroceryList);
  $("mealDate").addEventListener("change", renderMeals);

  // quick add modal
  $("quickAddBtn").addEventListener("click", openModal);
  $("closeModalBtn").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", closeModal);
  $("qaClearBtn").addEventListener("click", () => {
    $("qaWeight").value = "";
    $("qaCalories").value = "";
    $("qaProtein").value = "";
    $("qaCardioMins").value = "";
  });
  $("qaSaveBtn").addEventListener("click", quickAddSave);

  // export/import
  $("exportBtn").addEventListener("click", exportJSON);
  $("exportBtn2").addEventListener("click", exportJSON);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importBtn2").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importJSONFile(f);
    $("importFile").value = "";
  });

  // settings
  $("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);
  $("resetAllBtn").addEventListener("click", resetAll);
}

/* ---------- Master render ---------- */
function renderAll() {
  // update default dates
  $("weightDate").value = $("weightDate").value || todayISO();
  $("macroDate").value = $("macroDate").value || todayISO();
  $("workoutDate").value = $("workoutDate").value || todayISO();
  $("mealDate").value = $("mealDate").value || todayISO();

  // update subtitle
  $("brandSub").textContent = `Today: ${fmtDate(todayISO())} • Target: ${calorieTargetFor(todayISO())} kcal`;

  // render sections
  renderDashboard();
  renderWeight();
  renderMacros();
  renderWorkouts();
  renderMeals();
  renderSettings();

  // keep calorie target display on macros card
  $("todayCalTarget").textContent = `${calorieTargetFor($("macroDate").value || todayISO())} kcal`;
  $("todayProteinGoal").textContent = `${DATA.settings.goalProtein}g`;
}

/* ---------- PWA service worker ---------- */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // ignore
  }
}

/* ---------- Init ---------- */
function init() {
  bindEvents();

  // seed at least one exercise row
  if (!$("exerciseList").children.length) addExerciseRow();

  // set current week to this week
  DATA.ui.weekStart = startOfWeekISO(DATA.ui.weekStart || todayISO());
  saveData();

  renderAll();
  registerSW();
}

document.addEventListener("DOMContentLoaded", init);