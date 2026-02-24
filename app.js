/* Glen Track — mobile PWA
   localStorage only · navy + teal UI
   Weight · Macros · Workouts · Food Log · Food Library · Grocery · Goals · Streaks
*/

const STORE_KEY = "glentrack.data.v2";
const $ = (id) => document.getElementById(id);

/* ─── Date helpers ────────────────────────────────────────────────────────── */
function todayISO() {
  const d = new Date(), off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}
function startOfWeekISO(iso) {
  const d = new Date(iso + "T00:00:00"), day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function weekDates(start) { return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i)); }
function uid(p = "id") { return `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }
function setStatus(msg) { const el = $("status"); if (el) el.textContent = msg; }

/* ─── Data layer ──────────────────────────────────────────────────────────── */
function loadData() {
  try { return normalizeData(JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); }
  catch { return freshData(); }
}
function saveData(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }
function freshData() { return normalizeData({}); }
function normalizeData(d) {
  d.version       ??= 2;
  d.goals         ??= { weeklyLoss: 0.5, proteinPerDay: 190, workoutsPerWeek: 3, workoutDayCals: 2400, restDayCals: 2100 };
  d.streak        ??= { current: 0, lastLogDate: null, best: 0 };
  d.weights       ??= [];
  d.macros        ??= {};
  d.foodLog       ??= {};
  d.foodLibrary   ??= [];   // ← NEW: saved food items
  d.workouts      ??= [];
  d.mealTemplates ??= [];
  d.grocery       ??= [];
  return d;
}
function bumpStreak(data, iso) {
  const st = data.streak;
  if (!st.lastLogDate) { st.current = 1; st.best = 1; st.lastLogDate = iso; return; }
  if (st.lastLogDate === iso) return;
  st.current = st.lastLogDate === addDaysISO(iso, -1) ? st.current + 1 : 1;
  st.best = Math.max(st.best, st.current);
  st.lastLogDate = iso;
}

/* ─── Navigation ──────────────────────────────────────────────────────────── */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelector(`.screen[data-screen="${name}"]`)?.classList.add("active");
  document.querySelectorAll(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  if (name === "dashboard") renderDashboard();
  if (name === "weight")    renderWeights();
  if (name === "macros")    renderMacros();
  if (name === "workouts")  renderWorkouts();
  if (name === "food")      renderFoodScreen();
  if (name === "grocery")   renderGrocery();
  if (name === "goals")     renderGoalsTracker();
}

/* ─── Charts ──────────────────────────────────────────────────────────────── */
let chartWeight30 = null, chartMacrosWeek = null, chartMacrosDash = null;
function destroyChart(c) { try { c?.destroy?.(); } catch {} }
function chartOpts(showLegend = true) {
  return {
    responsive: true,
    plugins: { legend: { display: showLegend, labels: { color: "rgba(230,241,255,.65)", font: { weight: "700" } } } },
    scales: {
      x: { ticks: { color: "rgba(159,178,214,.7)" }, grid: { color: "rgba(255,255,255,.05)" } },
      y: { ticks: { color: "rgba(159,178,214,.7)" }, grid: { color: "rgba(255,255,255,.05)" } }
    }
  };
}
function renderChartsDashboard(data) {
  const ctxW = $("chartWeight");
  if (ctxW) {
    const last = data.weights.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
    destroyChart(chartWeight30);
    chartWeight30 = new Chart(ctxW, {
      type: "line",
      data: { labels: last.map(x => x.date.slice(5)), datasets: [{ label: "lbs", data: last.map(x => x.lbs), tension: 0.38, borderWidth: 2, pointRadius: 3, borderColor: "rgba(77,163,255,.9)", backgroundColor: "rgba(77,163,255,.08)" }] },
      options: { ...chartOpts(false) }
    });
  }
  const ctxM = $("chartMacros");
  if (ctxM) {
    const days = weekDates(startOfWeekISO(todayISO()));
    destroyChart(chartMacrosDash);
    chartMacrosDash = new Chart(ctxM, {
      type: "bar",
      data: { labels: days.map(d => d.slice(5)), datasets: [
        { label: "Calories", data: days.map(d => data.macros[d]?.cals || 0), borderWidth: 1, backgroundColor: "rgba(77,163,255,.55)" },
        { label: "Protein",  data: days.map(d => data.macros[d]?.p   || 0), borderWidth: 1, backgroundColor: "rgba(53,208,127,.55)" }
      ]},
      options: chartOpts()
    });
  }
}
function renderMacrosWeekChart(data) {
  const ctx = $("chartMacrosWeek"); if (!ctx) return;
  const days = weekDates(startOfWeekISO(todayISO()));
  destroyChart(chartMacrosWeek);
  chartMacrosWeek = new Chart(ctx, {
    type: "bar",
    data: { labels: days.map(d => d.slice(5)), datasets: [
      { label: "Calories", data: days.map(d => data.macros[d]?.cals || 0), borderWidth: 1, backgroundColor: "rgba(77,163,255,.55)" },
      { label: "Protein",  data: days.map(d => data.macros[d]?.p   || 0), borderWidth: 1, backgroundColor: "rgba(53,208,127,.55)" }
    ]},
    options: chartOpts()
  });
}

/* ─── Dashboard ───────────────────────────────────────────────────────────── */
function renderDashboard() {
  const data = loadData(), today = todayISO();
  const ws = startOfWeekISO(today), days = weekDates(ws);
  $("weekRange").textContent = `${ws} → ${days[6]}`;

  const ww = data.weights.filter(w => w.date >= ws && w.date <= days[6]).sort((a, b) => a.date.localeCompare(b.date));
  const avgW = ww.length ? ww.reduce((s, x) => s + x.lbs, 0) / ww.length : null;
  setText("mAvgWeight",  avgW ? `${avgW.toFixed(1)} lb` : "—");
  setText("mWeightDelta", ww.length >= 2 ? `${ww.at(-1).lbs - ww[0].lbs > 0 ? "+" : ""}${(ww.at(-1).lbs - ww[0].lbs).toFixed(1)} lb (wk)` : "Log 2+ weigh-ins");

  const wm = days.map(d => data.macros[d]).filter(Boolean);
  setText("mAvgCalories", wm.length ? Math.round(wm.reduce((s, m) => s + (m.cals || 0), 0) / wm.length) : "—");
  setText("mProteinAvg",  wm.length ? `${Math.round(wm.reduce((s, m) => s + (m.p || 0), 0) / wm.length)}g protein avg` : "No macros yet");

  const wwo = data.workouts.filter(w => w.date >= ws && w.date <= days[6]);
  setText("mWorkouts",   wwo.length);
  const csm = wwo.reduce((s, w) => s + (w.cardioMins || 0), 0);
  setText("mCardioMins", csm ? `${csm} min cardio` : "No cardio logged");
  setText("mStreak",     data.streak.current || 0);

  const g = data.goals;
  const avgP = wm.length ? Math.round(wm.reduce((s, m) => s + (m.p || 0), 0) / wm.length) : null;
  setText("mGoalProgress", `${wwo.length}/${g.workoutsPerWeek || 3} workouts · ${avgP ? `${avgP}/${g.proteinPerDay}g protein` : `${g.proteinPerDay}g protein goal`}`);

  $("goalLoss").value        = g.weeklyLoss      ?? 0.5;
  $("goalProtein").value     = g.proteinPerDay   ?? 190;
  $("goalWorkouts").value    = g.workoutsPerWeek ?? 3;
  $("goalWorkoutCals").value = g.workoutDayCals  ?? 2400;
  $("goalRestCals").value    = g.restDayCals     ?? 2100;

  renderChartsDashboard(data);
}

/* ─── Weight ──────────────────────────────────────────────────────────────── */
function renderWeights() {
  const data = loadData();
  $("weightDate").value = todayISO();
  const list  = $("weightList");
  const items = data.weights.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) { list.innerHTML = `<p class="subtle">No entries yet.</p>`; return; }
  list.innerHTML = "";
  for (const w of items) {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `<div><div class="itemTitle">${w.date}</div><div class="itemSub">${Number(w.lbs).toFixed(1)} lb</div></div>
      <div class="itemRight"><button class="smallBtn" data-del="${w.id}">Delete</button></div>`;
    el.querySelector("[data-del]").addEventListener("click", () => {
      const next = loadData(); next.weights = next.weights.filter(x => x.id !== w.id);
      saveData(next); setStatus("Deleted"); renderWeights(); renderDashboard();
    });
    list.appendChild(el);
  }
}

/* ─── Macros ──────────────────────────────────────────────────────────────── */
function ensureDefaultTemplates(data) {
  if (data.mealTemplates.length) return;
  data.mealTemplates = [
    { id: uid("t"), name: "Costco chicken + rice + veggies", cals: 650, p: 45, c: 70, f: 20, ingredients: ["chicken", "rice cups", "frozen veggies", "salsa"] },
    { id: uid("t"), name: "Eggs + cheese + salsa",           cals: 420, p: 30, c: 8,  f: 28, ingredients: ["eggs", "shredded cheese", "salsa"] },
    { id: uid("t"), name: "Pre-Uber protein snack",          cals: 320, p: 35, c: 15, f: 10, ingredients: ["greek yogurt", "protein shake", "banana"] }
  ];
}
function addIngredientsToGrocery(data, ingredients) {
  for (const item of ingredients) {
    const text = String(item).trim(); if (!text) continue;
    if (!data.grocery.some(g => g.text.toLowerCase() === text.toLowerCase()))
      data.grocery.unshift({ id: uid("g"), text, done: false });
  }
}
function renderMacros() {
  const data = loadData(); ensureDefaultTemplates(data); saveData(data);
  $("macroDate").value = todayISO();
  const m = data.macros[$("macroDate").value];
  $("macroCals").value = m?.cals ?? ""; $("macroP").value = m?.p ?? "";
  $("macroC").value    = m?.c   ?? ""; $("macroF").value = m?.f ?? "";

  const box = $("mealTemplates"); box.innerHTML = "";
  for (const t of data.mealTemplates) {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="itemTitle">${escHtml(t.name)}</div>
        <div class="itemSub">${t.cals} cal · P${t.p} C${t.c} F${t.f}</div>
        <div class="row mt8" style="gap:6px">
          <button class="smallBtn" data-add="${t.id}">+ Today</button>
          <button class="smallBtn" data-gro="${t.id}">🛒 Grocery</button>
          <button class="smallBtn" style="color:var(--bad)" data-del="${t.id}">Delete</button>
        </div>
      </div>`;
    el.querySelector("[data-add]").addEventListener("click", () => {
      const next = loadData(), date = $("macroDate").value || todayISO();
      const cur = next.macros[date] || { date, cals: 0, p: 0, c: 0, f: 0 };
      cur.cals += t.cals; cur.p += t.p; cur.c += t.c; cur.f += t.f;
      next.macros[date] = cur; addIngredientsToGrocery(next, t.ingredients || []);
      bumpStreak(next, date); saveData(next);
      setStatus("Added template"); renderMacros(); renderGrocery(); renderDashboard();
    });
    el.querySelector("[data-gro]").addEventListener("click", () => {
      const next = loadData(); addIngredientsToGrocery(next, t.ingredients || [t.name]); saveData(next);
      setStatus("Added to grocery"); renderGrocery();
    });
    el.querySelector("[data-del]").addEventListener("click", () => {
      const next = loadData(); next.mealTemplates = next.mealTemplates.filter(x => x.id !== t.id); saveData(next);
      setStatus("Deleted"); renderMacros();
    });
    box.appendChild(el);
  }
  renderMacrosWeekChart(data);
}
function autoSetMacros() {
  const data = loadData(), date = $("macroDate").value || todayISO();
  const isWo = data.workouts.some(w => w.date === date);
  $("macroCals").value = isWo ? data.goals.workoutDayCals : data.goals.restDayCals;
  $("macroP").value    = data.goals.proteinPerDay;
  setStatus(isWo ? "Workout day targets" : "Rest day targets");
}
function saveMacros() {
  const data = loadData(), date = $("macroDate").value || todayISO();
  const entry = { date, cals: toInt($("macroCals").value), p: toInt($("macroP").value), c: toInt($("macroC").value), f: toInt($("macroF").value) };
  if (!entry.cals && !entry.p && !entry.c && !entry.f) { setStatus("Enter at least one value"); return; }
  data.macros[date] = entry; bumpStreak(data, date); saveData(data);
  setStatus("Saved"); renderDashboard(); renderMacrosWeekChart(data);
}
function clearMacrosThisWeek() {
  const data = loadData(); for (const d of weekDates(startOfWeekISO(todayISO()))) delete data.macros[d];
  saveData(data); setStatus("Cleared"); renderMacros(); renderDashboard();
}

/* ═══════════════════════════════════════════════════════════════════════════
   FOOD LOG
   ═══════════════════════════════════════════════════════════════════════════ */
const MEAL_TYPES  = ["breakfast", "lunch", "dinner", "snacks", "custom"];
const MEAL_LABELS = { breakfast: "🌅 Breakfast", lunch: "☀️ Lunch", dinner: "🌙 Dinner", snacks: "🍎 Snacks", custom: "⚡ Custom" };

let _undoQueue = [];

function getFoodsForDate(data, date) {
  return (data.foodLog[date] || []).filter(f => !f.deletedAt);
}
function getDailyTotals(data, date) {
  return getFoodsForDate(data, date).reduce((a, f) => {
    const s = f.servings || 1;
    a.cals += (f.calories || 0) * s; a.p += (f.protein || 0) * s;
    a.c    += (f.carbs    || 0) * s; a.f += (f.fat     || 0) * s;
    return a;
  }, { cals: 0, p: 0, c: 0, f: 0 });
}
function getMealTotals(data, date, mealType) {
  return (data.foodLog[date] || []).filter(f => !f.deletedAt && f.mealType === mealType).reduce((a, f) => {
    const s = f.servings || 1;
    a.cals += (f.calories || 0) * s; a.p += (f.protein || 0) * s;
    a.c    += (f.carbs    || 0) * s; a.f += (f.fat     || 0) * s;
    return a;
  }, { cals: 0, p: 0, c: 0, f: 0 });
}

function renderFoodScreen() {
  const data   = loadData();
  const dateEl = $("foodDate");
  if (dateEl && !dateEl.value) dateEl.value = todayISO();
  const date = dateEl?.value || todayISO();
  renderFoodTotals(data, date);
  renderFoodMealSections(data, date);
}

function renderFoodTotals(data, date) {
  const g = data.goals, totals = getDailyTotals(data, date);
  const calGoal = g.workoutDayCals || 2400, proGoal = g.proteinPerDay || 190;
  setText("foodTotalCals", Math.round(totals.cals));
  setText("foodTotalP",    Math.round(totals.p) + "g");
  setText("foodTotalC",    Math.round(totals.c) + "g");
  setText("foodTotalF",    Math.round(totals.f) + "g");
  setText("foodCalGoal",   `/ ${calGoal} cal`);
  setBar("barCals", totals.cals, calGoal);
  setBar("barP",    totals.p,    proGoal);
  setBar("barC",    totals.c,    250);
  setBar("barF",    totals.f,    80);
}

function setText(id, val) { const el = $(id); if (el) el.textContent = val; }
function setBar(id, val, max) {
  const el = $(id); if (!el) return;
  const pct = Math.min(100, Math.round((val / (max || 1)) * 100));
  el.style.width = pct + "%";
  el.style.background = pct >= 100
    ? "linear-gradient(90deg,rgba(255,90,106,.9),rgba(255,90,106,.7))"
    : "linear-gradient(90deg,rgba(77,163,255,.95),rgba(53,208,127,.85))";
}

function renderFoodMealSections(data, date) {
  const box = $("foodMealSections"); if (!box) return;
  box.innerHTML = "";
  for (const mealType of MEAL_TYPES) {
    const items  = (data.foodLog[date] || []).filter(f => !f.deletedAt && f.mealType === mealType);
    const totals = getMealTotals(data, date, mealType);
    const section = document.createElement("div");
    section.className = "card";
    section.innerHTML = `
      <div class="cardHeader" style="margin-bottom:10px">
        <div>
          <h3>${MEAL_LABELS[mealType]}</h3>
          ${items.length
            ? `<div class="itemSub">${Math.round(totals.cals)} cal · P${Math.round(totals.p)}g C${Math.round(totals.c)}g F${Math.round(totals.f)}g</div>`
            : `<div class="itemSub" style="opacity:.45">Empty — tap + Add</div>`}
        </div>
        <button class="chip" data-meal="${mealType}">+ Add</button>
      </div>
      <div class="list" id="foodList_${mealType}"></div>`;
    section.querySelector("[data-meal]").addEventListener("click", () => openFoodModal(null, mealType, date));
    box.appendChild(section);
    const listEl = $(`foodList_${mealType}`);
    for (const food of items) listEl.appendChild(buildFoodItemEl(food, date));
  }
}

function buildFoodItemEl(food, date) {
  const s = food.servings || 1, cals = Math.round((food.calories || 0) * s);
  const el = document.createElement("div"); el.className = "item"; el.dataset.id = food.id;
  el.innerHTML = `
    <div style="flex:1;min-width:0">
      <div class="itemTitle">${escHtml(food.name)}${food.brand ? ` <span style="font-weight:400;opacity:.55;font-size:12px">${escHtml(food.brand)}</span>` : ""}</div>
      <div class="itemSub">${s} × ${escHtml(food.servingSize || "serving")} · ${cals} cal · P${Math.round((food.protein||0)*s)}g C${Math.round((food.carbs||0)*s)}g F${Math.round((food.fat||0)*s)}g</div>
    </div>
    <div class="itemRight">
      <button class="smallBtn" data-edit="${food.id}">Edit</button>
      <button class="smallBtn" style="color:var(--bad)" data-del="${food.id}">✕</button>
    </div>`;
  el.querySelector("[data-edit]").addEventListener("click", () => openFoodModal(food, food.mealType, date));
  el.querySelector("[data-del]").addEventListener("click",  () => deleteFoodItem(food.id, date));
  return el;
}

/* ─── Food Modal ──────────────────────────────────────────────────────────── */
let _fId = null, _fMeal = "custom", _fDate = null;

function openFoodModal(food, mealType, date) {
  _fId   = food?.id || null;
  _fMeal = mealType  || "custom";
  _fDate = date      || todayISO();
  setText("foodModalTitle", food ? "Edit Food" : "Add Food");
  $("foodModalMealType").value = _fMeal;
  $("fName").value        = food?.name        || "";
  $("fBrand").value       = food?.brand       || "";
  $("fServingSize").value = food?.servingSize || "1 serving";
  $("fServings").value    = food?.servings    ?? 1;
  $("fCalories").value    = food?.calories    ?? "";
  $("fProtein").value     = food?.protein     ?? "";
  $("fCarbs").value       = food?.carbs       ?? "";
  $("fFat").value         = food?.fat         ?? "";
  $("fSaveToLib").checked = false;
  // populate library search results area
  renderLibrarySearchResults("", true);
  $("foodModal").classList.remove("hidden");
  $("foodModalBackdrop").classList.remove("hidden");
  setTimeout(() => $("fName").focus(), 50);
}

function closeFoodModal() {
  $("foodModal").classList.add("hidden");
  $("foodModalBackdrop").classList.add("hidden");
  _fId = null;
  $("fLibSearch").value = "";
  $("libSearchResults").innerHTML = "";
}

function saveFoodModal() {
  const name = $("fName").value.trim();
  if (!name) { setStatus("Food name required"); return; }
  const data = loadData(), date = _fDate;
  if (!data.foodLog[date]) data.foodLog[date] = [];
  const mealType = $("foodModalMealType").value || _fMeal;
  const entry = {
    id:          _fId || uid("food"),
    name,
    brand:       $("fBrand").value.trim(),
    servingSize: $("fServingSize").value.trim() || "1 serving",
    servings:    toFloat($("fServings").value, 1),
    calories:    toFloat($("fCalories").value, 0),
    protein:     toFloat($("fProtein").value, 0),
    carbs:       toFloat($("fCarbs").value, 0),
    fat:         toFloat($("fFat").value, 0),
    mealType, date,
    updatedAt: new Date().toISOString()
  };
  if (_fId) {
    const idx = data.foodLog[date].findIndex(f => f.id === _fId);
    if (idx >= 0) { entry.createdAt = data.foodLog[date][idx].createdAt; data.foodLog[date][idx] = entry; }
  } else {
    entry.createdAt = new Date().toISOString();
    data.foodLog[date].push(entry);
  }
  // Save to library if checkbox ticked
  if ($("fSaveToLib").checked) {
    saveToFoodLibrary(data, entry);
  }
  bumpStreak(data, date); saveData(data);
  closeFoodModal(); setStatus(_fId ? "Updated" : "Food added"); renderFoodScreen();
}

/* ─── Food Delete + Undo (10s) ────────────────────────────────────────────── */
function deleteFoodItem(id, date) {
  const data = loadData(); if (!data.foodLog[date]) return;
  const idx = data.foodLog[date].findIndex(f => f.id === id); if (idx < 0) return;
  const item = data.foodLog[date][idx];
  data.foodLog[date][idx] = { ...item, deletedAt: new Date().toISOString() };
  saveData(data);
  _undoQueue = _undoQueue.filter(u => u.id !== id);
  const timer = setTimeout(() => {
    const next = loadData();
    if (next.foodLog[date]) next.foodLog[date] = next.foodLog[date].filter(f => f.id !== id);
    saveData(next); _undoQueue = _undoQueue.filter(u => u.id !== id);
  }, 10000);
  _undoQueue.push({ id, date, item, timer });
  renderFoodScreen(); showUndoToast(item.name, id, date);
}
function undoDeleteFood(id, date) {
  const entry = _undoQueue.find(u => u.id === id && u.date === date); if (!entry) return;
  clearTimeout(entry.timer); _undoQueue = _undoQueue.filter(u => u.id !== id);
  const data = loadData();
  if (data.foodLog[date]) {
    const idx = data.foodLog[date].findIndex(f => f.id === id);
    if (idx >= 0) { const f = { ...data.foodLog[date][idx] }; delete f.deletedAt; data.foodLog[date][idx] = f; }
  }
  saveData(data); hideUndoToast(); setStatus("Restored"); renderFoodScreen();
}
function showUndoToast(name, id, date) {
  const toast = $("undoToast"); if (!toast) return;
  const label = name.length > 22 ? name.slice(0, 22) + "…" : name;
  setText("undoToastMsg", `Deleted "${label}"`);
  toast.classList.remove("hidden");
  $("undoToastBtn").onclick = () => undoDeleteFood(id, date);
  clearTimeout(toast._t); toast._t = setTimeout(hideUndoToast, 10000);
}
function hideUndoToast() { const t = $("undoToast"); if (t) t.classList.add("hidden"); }

/* ═══════════════════════════════════════════════════════════════════════════
   FOOD LIBRARY  — save & reuse food items
   ═══════════════════════════════════════════════════════════════════════════ */
function saveToFoodLibrary(data, food) {
  // build a clean library entry (no log-specific fields)
  const entry = {
    id:          uid("lib"),
    name:        food.name,
    brand:       food.brand       || "",
    servingSize: food.servingSize || "1 serving",
    calories:    food.calories    || 0,
    protein:     food.protein     || 0,
    carbs:       food.carbs       || 0,
    fat:         food.fat         || 0,
    savedAt:     new Date().toISOString()
  };
  // avoid duplicates by name+brand
  const dup = data.foodLibrary.some(x =>
    x.name.toLowerCase() === entry.name.toLowerCase() &&
    x.brand.toLowerCase() === entry.brand.toLowerCase()
  );
  if (!dup) { data.foodLibrary.unshift(entry); setStatus("Saved to library"); }
  else setStatus("Already in library");
}

function renderLibrarySearchResults(query, inModal) {
  const data = loadData();
  const resultsEl = $("libSearchResults"); if (!resultsEl) return;
  const q = query.trim().toLowerCase();
  const matches = q.length < 1
    ? data.foodLibrary.slice(0, 8)
    : data.foodLibrary.filter(x =>
        x.name.toLowerCase().includes(q) || (x.brand || "").toLowerCase().includes(q)
      ).slice(0, 12);

  if (!matches.length) {
    resultsEl.innerHTML = q ? `<p class="subtle" style="padding:8px 0">No matches in library</p>` : "";
    return;
  }
  resultsEl.innerHTML = "";
  for (const lib of matches) {
    const el = document.createElement("div");
    el.className = "item";
    el.style.cursor = "pointer";
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="itemTitle">${escHtml(lib.name)}${lib.brand ? ` <span style="font-weight:400;opacity:.55;font-size:12px">${escHtml(lib.brand)}</span>` : ""}</div>
        <div class="itemSub">${lib.servingSize} · ${lib.calories} cal · P${lib.protein}g C${lib.carbs}g F${lib.fat}g</div>
      </div>
      <div class="itemRight">
        ${inModal ? `<button class="chip" data-use="${lib.id}">Use</button>` : `<button class="smallBtn" style="color:var(--bad)" data-libdel="${lib.id}">✕</button>`}
      </div>`;
    if (inModal) {
      el.querySelector("[data-use]").addEventListener("click", () => fillModalFromLibrary(lib));
    } else {
      el.querySelector("[data-libdel]").addEventListener("click", () => deleteLibraryItem(lib.id));
    }
    resultsEl.appendChild(el);
  }
}

function fillModalFromLibrary(lib) {
  $("fName").value        = lib.name;
  $("fBrand").value       = lib.brand       || "";
  $("fServingSize").value = lib.servingSize || "1 serving";
  $("fServings").value    = 1;
  $("fCalories").value    = lib.calories    || "";
  $("fProtein").value     = lib.protein     || "";
  $("fCarbs").value       = lib.carbs       || "";
  $("fFat").value         = lib.fat         || "";
  $("fLibSearch").value   = "";
  $("libSearchResults").innerHTML = "";
  setStatus("Filled from library");
}

function deleteLibraryItem(id) {
  const data = loadData(); data.foodLibrary = data.foodLibrary.filter(x => x.id !== id); saveData(data);
  setStatus("Removed from library"); renderLibraryScreen();
}

function renderLibraryScreen() {
  const data = loadData();
  const search = $("libScreenSearch")?.value.trim().toLowerCase() || "";
  const list   = $("libraryList"); if (!list) return;
  const items  = search
    ? data.foodLibrary.filter(x => x.name.toLowerCase().includes(search) || (x.brand || "").toLowerCase().includes(search))
    : data.foodLibrary;

  setText("libCount", `${data.foodLibrary.length} saved`);

  if (!items.length) {
    list.innerHTML = `<p class="subtle">${search ? "No matches." : "No foods saved yet. Add a food and tick 'Save to library'."}</p>`;
    return;
  }
  list.innerHTML = "";
  for (const lib of items) {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="itemTitle">${escHtml(lib.name)}${lib.brand ? ` <span style="font-weight:400;opacity:.55;font-size:12px">${escHtml(lib.brand)}</span>` : ""}</div>
        <div class="itemSub">${escHtml(lib.servingSize)} · ${lib.calories} cal · P${lib.protein}g C${lib.carbs}g F${lib.fat}g</div>
      </div>
      <div class="itemRight">
        <button class="smallBtn" data-libuse="${lib.id}">+ Log</button>
        <button class="smallBtn" style="color:var(--bad)" data-libdel="${lib.id}">✕</button>
      </div>`;
    el.querySelector("[data-libuse]").addEventListener("click", () => {
      // jump to food screen with this item pre-filled
      showScreen("food");
      setTimeout(() => openFoodModal(
        { ...lib, servings: 1 }, "custom", $("foodDate")?.value || todayISO()
      ), 80);
    });
    el.querySelector("[data-libdel]").addEventListener("click", () => deleteLibraryItem(lib.id));
    list.appendChild(el);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   GOAL TRACKER  — weekly progress toward all goals
   ═══════════════════════════════════════════════════════════════════════════ */
function renderGoalsTracker() {
  const data  = loadData();
  const today = todayISO();
  const ws    = startOfWeekISO(today);
  const days  = weekDates(ws);
  const g     = data.goals;

  // ── Weight loss ──────────────────────────────────────────────────────────
  const allWeights = data.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const firstW = allWeights[0], lastW = allWeights.at(-1);
  const totalLost = firstW && lastW ? firstW.lbs - lastW.lbs : null;
  const weeksLogged = firstW && lastW
    ? Math.max(1, Math.round((new Date(lastW.date) - new Date(firstW.date)) / 604800000))
    : 1;
  const weeklyRate = totalLost ? totalLost / weeksLogged : 0;
  const wkWeights  = data.weights.filter(w => w.date >= ws && w.date <= days[6]).sort((a,b)=>a.date.localeCompare(b.date));
  const wkLost     = wkWeights.length >= 2 ? wkWeights[0].lbs - wkWeights.at(-1).lbs : null;

  // ── Protein ───────────────────────────────────────────────────────────────
  const wm = days.map(d => data.macros[d]).filter(Boolean);
  const daysWithProtein = wm.filter(m => (m.p || 0) >= g.proteinPerDay);
  const avgP = wm.length ? Math.round(wm.reduce((s,m)=>s+(m.p||0),0)/wm.length) : 0;

  // ── Calories ─────────────────────────────────────────────────────────────
  const avgCals = wm.length ? Math.round(wm.reduce((s,m)=>s+(m.cals||0),0)/wm.length) : 0;

  // ── Workouts ──────────────────────────────────────────────────────────────
  const wwo = data.workouts.filter(w => w.date >= ws && w.date <= days[6]);
  const cardioMinsWk = wwo.reduce((s,w)=>s+(w.cardioMins||0),0);

  // ── Streak ────────────────────────────────────────────────────────────────
  const streak = data.streak.current || 0;

  // ── Render ────────────────────────────────────────────────────────────────
  const el = $("goalTrackerContent"); if (!el) return;

  const goalRow = (label, current, goal, unit, pct, note, good) => `
    <div class="goalRow">
      <div class="goalRowTop">
        <span class="goalRowLabel">${label}</span>
        <span class="goalRowVal ${good ? "goalGood" : pct>=100?"goalGood":"goalMiss"}">${current} <span style="opacity:.55;font-weight:600">/ ${goal} ${unit}</span></span>
      </div>
      <div class="progressBar" style="margin:6px 0 4px">
        <div class="progressFill" style="width:${Math.min(100,pct)}%;background:${pct>=100?"linear-gradient(90deg,rgba(53,208,127,.9),rgba(53,208,127,.7))":"linear-gradient(90deg,rgba(77,163,255,.95),rgba(53,208,127,.85))"}"></div>
      </div>
      ${note ? `<div class="subtle" style="font-size:11px">${note}</div>` : ""}
    </div>`;

  el.innerHTML = `
    <!-- This week header -->
    <div class="card">
      <h3>📅 This Week  <span class="badge" style="font-size:11px;margin-left:6px">${ws} – ${days[6]}</span></h3>
      <div class="goalRows mt10">
        ${goalRow("Workouts", wwo.length, g.workoutsPerWeek || 3, "sessions",
            Math.round((wwo.length / (g.workoutsPerWeek||3)) * 100),
            wwo.length >= (g.workoutsPerWeek||3) ? "🎯 Goal hit!" : `${(g.workoutsPerWeek||3) - wwo.length} more to go`,
            wwo.length >= (g.workoutsPerWeek||3))}

        ${goalRow("Protein avg", avgP + "g", g.proteinPerDay || 190, "g/day",
            Math.round((avgP / (g.proteinPerDay||190)) * 100),
            `${daysWithProtein.length}/${wm.length} days hit target · ${wm.length ? "" : "No macros logged yet"}`,
            avgP >= (g.proteinPerDay||190))}

        ${goalRow("Avg calories", avgCals, g.restDayCals || 2100, "cal",
            Math.round((avgCals / (g.restDayCals||2100)) * 100),
            avgCals > (g.workoutDayCals||2400) ? "⚠️ Above workout day target" : avgCals === 0 ? "No macros logged" : "On track",
            avgCals >= (g.restDayCals||2100) && avgCals <= (g.workoutDayCals||2400))}

        ${goalRow("Streak", streak + " day" + (streak===1?"":"s"), 7, "days",
            Math.round((streak/7)*100),
            `Best: ${data.streak.best || 0} days · Keep logging daily!`,
            streak >= 7)}
      </div>
    </div>

    <!-- Weight loss progress -->
    <div class="card">
      <h3>⚖️ Weight Loss Progress</h3>
      <div class="goalRows mt10">
        ${wkLost !== null
          ? goalRow(
              "This week", (wkLost >= 0 ? "-" : "+") + Math.abs(wkLost).toFixed(1) + " lb",
              (g.weeklyLoss || 0.5) + " lb loss", "",
              Math.round(Math.max(0, wkLost) / (g.weeklyLoss||0.5) * 100),
              wkLost >= (g.weeklyLoss||0.5) ? "🎯 Weekly goal hit!" : wkLost > 0 ? `${((g.weeklyLoss||0.5)-wkLost).toFixed(1)} lb short of goal` : "No weight change yet",
              wkLost >= (g.weeklyLoss||0.5))
          : `<p class="subtle">Log at least 2 weigh-ins this week to track.</p>`}

        ${totalLost !== null && totalLost > 0
          ? goalRow(
              "Total lost", totalLost.toFixed(1) + " lb", "—", "",
              100,
              `~${weeklyRate.toFixed(2)} lb/wk avg over ${weeksLogged} week${weeksLogged===1?"":"s"}`,
              true)
          : ""}
      </div>
      ${allWeights.length >= 2 ? `
        <div class="chartWrap mt10"><canvas id="chartGoalWeight" height="160"></canvas></div>` : ""}
    </div>

    <!-- Cardio -->
    <div class="card">
      <h3>🏃 Cardio This Week</h3>
      <div class="goalRows mt10">
        ${goalRow("Minutes", cardioMinsWk, 150, "min",
            Math.round((cardioMinsWk/150)*100),
            cardioMinsWk >= 150 ? "🎯 150 min/wk WHO goal hit!" : `${150-cardioMinsWk} min to weekly WHO recommendation`,
            cardioMinsWk >= 150)}
      </div>
    </div>

    <!-- Macros breakdown -->
    <div class="card">
      <h3>🥗 Macros vs Goals (Week Avg)</h3>
      <div class="goalRows mt10">
        ${wm.length ? `
          ${goalRow("Protein",  avgP+"g",     g.proteinPerDay||190,    "g", Math.round(avgP/(g.proteinPerDay||190)*100),    "", avgP>=(g.proteinPerDay||190))}
          ${goalRow("Calories", avgCals+"",   g.restDayCals||2100,     "cal", Math.round(avgCals/(g.restDayCals||2100)*100), "", avgCals>=(g.restDayCals||2100) && avgCals<=(g.workoutDayCals||2400))}
        ` : `<p class="subtle">No macros logged this week yet.</p>`}
      </div>
    </div>`;

  // render weight chart if enough data
  if (allWeights.length >= 2) {
    setTimeout(() => {
      const ctx = $("chartGoalWeight"); if (!ctx) return;
      const recent = allWeights.slice(-14);
      new Chart(ctx, {
        type: "line",
        data: {
          labels: recent.map(x => x.date.slice(5)),
          datasets: [{
            label: "Weight (lb)", data: recent.map(x => x.lbs),
            tension: 0.35, borderWidth: 2, pointRadius: 3,
            borderColor: "rgba(77,163,255,.9)", backgroundColor: "rgba(77,163,255,.08)"
          }]
        },
        options: chartOpts(false)
      });
    }, 60);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORKOUTS  — Full Body A, Full Body B, + Custom
   ═══════════════════════════════════════════════════════════════════════════ */
const WORKOUT_TEMPLATES = {
  "Full Body A": [
    { name: "Goblet squat",       sets: 3, reps: 10 },
    { name: "DB bench press",     sets: 3, reps: 10 },
    { name: "Lat pulldown",       sets: 3, reps: 10 },
    { name: "RDL",                sets: 3, reps: 10 },
    { name: "DB shoulder press",  sets: 3, reps: 10 },
    { name: "Plank (sec)",        sets: 3, reps: 45 },
  ],
  "Full Body B": [
    { name: "Leg press",          sets: 3, reps: 12 },
    { name: "Incline DB press",   sets: 3, reps: 10 },
    { name: "Seated cable row",   sets: 3, reps: 10 },
    { name: "Leg curl",           sets: 3, reps: 12 },
    { name: "Lateral raises",     sets: 3, reps: 15 },
    { name: "Dead bug (ea side)", sets: 3, reps: 10 },
  ],
  "Push": [
    { name: "Bench press",        sets: 4, reps: 8  },
    { name: "Incline DB press",   sets: 3, reps: 10 },
    { name: "Shoulder press",     sets: 3, reps: 10 },
    { name: "Triceps pushdown",   sets: 3, reps: 12 },
  ],
  "Pull": [
    { name: "Lat pulldown",       sets: 4, reps: 10 },
    { name: "Seated row",         sets: 3, reps: 10 },
    { name: "DB curls",           sets: 3, reps: 12 },
    { name: "Face pulls",         sets: 3, reps: 15 },
  ],
  "Legs": [
    { name: "Squat / Leg press",  sets: 4, reps: 10 },
    { name: "RDL",                sets: 3, reps: 10 },
    { name: "Leg curl",           sets: 3, reps: 12 },
    { name: "Calf raises",        sets: 3, reps: 15 },
  ],
  "Cardio":  [{ name: "Cardio session",     sets: 1, reps: 20 }],
  "Custom":  []   // ← starts empty, user builds from scratch
};

function seedExerciseRows(rows) {
  const box = $("exerciseFields"); box.innerHTML = "";
  const use = rows.length ? rows : [{ name: "", sets: "", reps: "" }, { name: "", sets: "", reps: "" }];
  for (const r of use) addExerciseRow(r.name, r.sets, r.reps);
}
function addExerciseRow(name = "", sets = "", reps = "") {
  const row = document.createElement("div");
  row.className = "exerciseRowGrid";
  row.innerHTML = `
    <input type="text"   placeholder="Exercise" value="${escHtml(name)}" />
    <input type="number" inputmode="numeric" step="1" placeholder="Sets" value="${escHtml(String(sets ?? ""))}" />
    <input type="number" inputmode="numeric" step="1" placeholder="Reps" value="${escHtml(String(reps ?? ""))}" />
    <button class="smallBtn" style="color:var(--bad);padding:10px 8px" data-rmrow>✕</button>`;
  row.querySelector("[data-rmrow]").addEventListener("click", () => row.remove());
  $("exerciseFields").appendChild(row);
}
function readExerciseRows() {
  const rows = [];
  document.querySelectorAll(".exerciseRowGrid").forEach(r => {
    const inp = r.querySelectorAll("input");
    const name = inp[0]?.value.trim();
    if (name) rows.push({ name, sets: toInt(inp[1]?.value), reps: toInt(inp[2]?.value) });
  });
  return rows;
}
function renderWorkouts() {
  const data = loadData(); $("woDate").value = todayISO(); $("cardioMins").value = "";
  // default to Full Body A
  if ($("woType")) $("woType").value = "Full Body A";
  seedExerciseRows(WORKOUT_TEMPLATES["Full Body A"]);
  renderWorkoutList(data);
}
function loadWorkoutTemplate(name) {
  $("woType").value = name;
  if (name === "Custom") {
    seedExerciseRows([{ name: "", sets: "", reps: "" }]);
    setStatus("Build your custom workout");
  } else {
    seedExerciseRows((WORKOUT_TEMPLATES[name] || []).map(x => ({ name: x.name, sets: x.sets, reps: x.reps })));
    setStatus("Template loaded");
  }
}
function saveWorkout() {
  const data = loadData(), date = $("woDate").value || todayISO();
  const exercises = readExerciseRows(), cardioMins = toInt($("cardioMins").value);
  if (!exercises.length && !cardioMins) { setStatus("Add exercises or cardio"); return; }
  data.workouts.push({ id: uid("wo"), date, type: $("woType").value || "Full Body A", exercises, cardioMode: $("cardioMode").value, cardioMins });
  data.workouts.sort((a, b) => b.date.localeCompare(a.date));
  bumpStreak(data, date); saveData(data);
  setStatus("Saved"); renderWorkoutList(data); renderDashboard();
}
function renderWorkoutList(data) {
  const list = $("workoutList"), today = todayISO();
  const ws = startOfWeekISO(today), we = addDaysISO(ws, 6);
  const week  = data.workouts.filter(w => w.date >= ws && w.date <= we);
  const older = data.workouts.filter(w => w.date < ws);
  list.innerHTML = "";
  const grp = (title, items) => {
    if (!items.length) return;
    const hdr = document.createElement("div"); hdr.className = "subtle"; hdr.style.marginBottom = "6px"; hdr.textContent = title;
    list.appendChild(hdr);
    for (const w of items) {
      const cardio = w.cardioMins ? ` · ${w.cardioMode}: ${w.cardioMins}m` : "";
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = `
        <div><div class="itemTitle">${w.date} · ${escHtml(w.type)}</div>
        <div class="itemSub">${w.exercises?.length || 0} exercises${cardio}</div></div>
        <div class="itemRight"><button class="smallBtn" style="color:var(--bad)" data-del="${w.id}">Delete</button></div>`;
      el.querySelector("[data-del]").addEventListener("click", () => {
        const next = loadData(); next.workouts = next.workouts.filter(x => x.id !== w.id); saveData(next);
        setStatus("Deleted"); renderWorkoutList(next); renderDashboard();
      });
      list.appendChild(el);
    }
  };
  grp("This week", week); grp("Older", older);
  if (!week.length && !older.length) list.innerHTML = `<p class="subtle">No workouts yet.</p>`;
}

/* ─── Grocery ─────────────────────────────────────────────────────────────── */
function renderGrocery() {
  const data = loadData();
  const tmpl = $("groceryTemplates"); tmpl.innerHTML = "";
  for (const t of data.mealTemplates) {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="itemTitle">${escHtml(t.name)}</div>
        <div class="itemSub">${(t.ingredients || []).slice(0,4).join(", ") || "—"}</div>
      </div>
      <div class="itemRight"><button class="smallBtn" data-add="${t.id}">Add</button></div>`;
    el.querySelector("[data-add]").addEventListener("click", () => {
      const next = loadData(); addIngredientsToGrocery(next, t.ingredients || [t.name]); saveData(next);
      setStatus("Added"); renderGrocery();
    });
    tmpl.appendChild(el);
  }
  const list = $("groceryList");
  if (!data.grocery.length) { list.innerHTML = `<p class="subtle">No items yet.</p>`; return; }
  list.innerHTML = "";
  for (const g of data.grocery) {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="itemTitle" style="${g.done ? "text-decoration:line-through;opacity:.4" : ""}">${escHtml(g.text)}</div>
        <div class="itemSub">${g.done ? "✓ Done" : "Tap to mark done"}</div>
      </div>
      <div class="itemRight"><button class="smallBtn" style="color:var(--bad)" data-del="${g.id}">✕</button></div>`;
    el.addEventListener("click", e => {
      if (e.target.dataset.del) return;
      const next = loadData(); next.grocery = next.grocery.map(x => x.id === g.id ? { ...x, done: !x.done } : x); saveData(next); renderGrocery();
    });
    el.querySelector("[data-del]").addEventListener("click", e => {
      e.stopPropagation();
      const next = loadData(); next.grocery = next.grocery.filter(x => x.id !== g.id); saveData(next); setStatus("Deleted"); renderGrocery();
    });
    list.appendChild(el);
  }
}
function addGroceryItem() {
  const text = $("groceryAdd").value.trim(); if (!text) return;
  const data = loadData(); data.grocery.unshift({ id: uid("g"), text, done: false }); saveData(data);
  $("groceryAdd").value = ""; setStatus("Added"); renderGrocery();
}

/* ─── Goals / Export / Import / Reset ────────────────────────────────────── */
function saveGoals() {
  const data = loadData();
  data.goals.weeklyLoss      = toFloat($("goalLoss").value, 0.5);
  data.goals.proteinPerDay   = toInt($("goalProtein").value)     || 190;
  data.goals.workoutsPerWeek = toInt($("goalWorkouts").value)    || 3;
  data.goals.workoutDayCals  = toInt($("goalWorkoutCals").value) || 2400;
  data.goals.restDayCals     = toInt($("goalRestCals").value)    || 2100;
  saveData(data); setStatus("Goals saved"); renderDashboard(); renderGoalsTracker();
}
function exportData() {
  const blob = new Blob([JSON.stringify(loadData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `glen-track-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importDataFromFile(file) {
  const r = new FileReader();
  r.onload = () => { try { saveData(normalizeData(JSON.parse(r.result))); setStatus("Imported"); renderAll(); } catch { setStatus("Import failed"); } };
  r.readAsText(file);
}
function resetAll() {
  if (!confirm("Reset ALL data? Cannot be undone.")) return;
  localStorage.removeItem(STORE_KEY); setStatus("Reset"); renderAll();
}
function loadSample() {
  const d = freshData(), t = todayISO(), ws = startOfWeekISO(t);
  d.weights = [0,2,4,6].map((i,n) => ({ id: uid("w"), date: addDaysISO(ws,i), lbs: 195 - n*0.4 }));
  for (let i=0;i<7;i++) { const date=addDaysISO(ws,i); d.macros[date]={ date, cals:i%2?2100:2400, p:185+i, c:190+i*5, f:70 }; }
  d.workouts = [
    { id:uid("wo"), date:addDaysISO(ws,1), type:"Full Body A", exercises:[{name:"Goblet squat",sets:3,reps:10},{name:"DB bench press",sets:3,reps:10}], cardioMode:"Run",  cardioMins:15 },
    { id:uid("wo"), date:addDaysISO(ws,3), type:"Full Body B", exercises:[{name:"Leg press",sets:3,reps:12},{name:"Seated cable row",sets:3,reps:10}],   cardioMode:"Bike", cardioMins:20 },
    { id:uid("wo"), date:addDaysISO(ws,5), type:"Custom",      exercises:[{name:"Cable fly",sets:3,reps:12},{name:"Hammer curl",sets:3,reps:10}],         cardioMode:"Walk", cardioMins:30 },
  ];
  d.foodLog[t] = [
    { id:uid("food"), name:"Oatmeal",        brand:"",       servingSize:"1 cup cooked", servings:1,   calories:300, protein:10, carbs:54, fat:5, mealType:"breakfast", date:t, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
    { id:uid("food"), name:"Chicken breast", brand:"Costco", servingSize:"6 oz",         servings:1,   calories:280, protein:52, carbs:0,  fat:6, mealType:"lunch",     date:t, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
    { id:uid("food"), name:"White rice",     brand:"",       servingSize:"1 cup cooked", servings:1.5, calories:200, protein:4,  carbs:45, fat:0, mealType:"lunch",     date:t, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
    { id:uid("food"), name:"Greek yogurt",   brand:"Chobani",servingSize:"5.3 oz",       servings:1,   calories:120, protein:15, carbs:8,  fat:0, mealType:"snacks",    date:t, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
  ];
  // seed library
  d.foodLibrary = [
    { id:uid("lib"), name:"Chicken breast", brand:"Costco",  servingSize:"6 oz",         calories:280, protein:52, carbs:0,  fat:6,  savedAt:new Date().toISOString() },
    { id:uid("lib"), name:"White rice",     brand:"",        servingSize:"1 cup cooked", calories:200, protein:4,  carbs:45, fat:0,  savedAt:new Date().toISOString() },
    { id:uid("lib"), name:"Greek yogurt",   brand:"Chobani", servingSize:"5.3 oz",       calories:120, protein:15, carbs:8,  fat:0,  savedAt:new Date().toISOString() },
    { id:uid("lib"), name:"Oatmeal",        brand:"",        servingSize:"1 cup cooked", calories:300, protein:10, carbs:54, fat:5,  savedAt:new Date().toISOString() },
    { id:uid("lib"), name:"Protein shake",  brand:"",        servingSize:"1 scoop",      calories:130, protein:25, carbs:5,  fat:2,  savedAt:new Date().toISOString() },
  ];
  ensureDefaultTemplates(d); addIngredientsToGrocery(d,["spinach","rice cups","salsa"]); bumpStreak(d,t);
  saveData(d); setStatus("Sample loaded"); renderAll();
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function escHtml(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function toInt(v)        { const n = parseInt(String(v||""),10); return Number.isFinite(n)?n:0; }
function toFloat(v, def) { const n = parseFloat(String(v||"")); return Number.isFinite(n)?n:def; }

function renderAll() {
  const active = document.querySelector(".screen.active")?.dataset?.screen || "dashboard";
  renderDashboard(); renderWeights(); renderMacros(); renderWorkouts();
  renderFoodScreen(); renderGrocery(); renderLibraryScreen(); renderGoalsTracker();
  showScreen(active);
}

/* ─── Wire events ─────────────────────────────────────────────────────────── */
function wireEvents() {
  document.querySelectorAll(".navBtn").forEach(b => b.addEventListener("click", () => showScreen(b.dataset.nav)));

  // Dashboard
  $("btnSaveGoals").addEventListener("click", saveGoals);
  $("btnResetAll").addEventListener("click",  resetAll);
  $("btnSample").addEventListener("click",    loadSample);
  $("btnExport").addEventListener("click",    exportData);
  $("btnImport").addEventListener("click",    () => $("importFile").click());
  $("importFile").addEventListener("change",  e => { const f = e.target.files?.[0]; if (f) importDataFromFile(f); e.target.value = ""; });

  // Weight
  $("weightDate").value = todayISO();
  $("btnAddWeight").addEventListener("click", () => {
    const data = loadData(), date = $("weightDate").value||todayISO(), lbs = toFloat($("weightValue").value,NaN);
    if (!Number.isFinite(lbs)||lbs<=0) { setStatus("Enter a valid weight"); return; }
    const idx = data.weights.findIndex(x=>x.date===date), entry = {id:uid("w"),date,lbs};
    if (idx>=0) data.weights[idx]=entry; else data.weights.push(entry);
    data.weights.sort((a,b)=>a.date.localeCompare(b.date));
    bumpStreak(data,date); saveData(data); $("weightValue").value="";
    setStatus("Saved"); renderWeights(); renderDashboard();
  });
  $("btnClearWeights").addEventListener("click", () => {
    if (!confirm("Clear all weight entries?")) return;
    const data=loadData(); data.weights=[]; saveData(data); setStatus("Cleared"); renderWeights(); renderDashboard();
  });

  // Macros
  $("macroDate").value = todayISO();
  $("btnAutoMacros").addEventListener("click",  autoSetMacros);
  $("btnSaveMacros").addEventListener("click",  saveMacros);
  $("btnClearMacros").addEventListener("click", clearMacrosThisWeek);
  $("btnAddTemplate").addEventListener("click", () => {
    const data=loadData(), name=$("tmplName").value.trim();
    if (!name) { setStatus("Template needs a name"); return; }
    data.mealTemplates.unshift({
      id:uid("t"), name,
      cals:toInt($("tmplCals").value), p:toInt($("tmplP").value),
      c:toInt($("tmplC").value), f:toInt($("tmplF").value),
      ingredients:$("tmplIng").value.split(",").map(s=>s.trim()).filter(Boolean)
    });
    saveData(data);
    ["tmplName","tmplCals","tmplP","tmplC","tmplF","tmplIng"].forEach(id=>$(id).value="");
    setStatus("Template added"); renderMacros(); renderGrocery();
  });

  // Food screen
  $("foodDate").value = todayISO();
  $("foodDate").addEventListener("change", renderFoodScreen);
  $("foodModalClose").addEventListener("click",    closeFoodModal);
  $("foodModalBackdrop").addEventListener("click", closeFoodModal);
  $("foodModalSave").addEventListener("click",     saveFoodModal);
  $("undoToastClose").addEventListener("click",    hideUndoToast);
  // library search inside modal
  $("fLibSearch").addEventListener("input", e => renderLibrarySearchResults(e.target.value, true));

  // Library screen
  $("libScreenSearch").addEventListener("input", e => renderLibraryScreen());

  // Workouts
  $("woDate").value = todayISO(); seedExerciseRows(WORKOUT_TEMPLATES["Full Body A"]);
  $("btnAddExercise").addEventListener("click", () => addExerciseRow());
  $("btnSaveWorkout").addEventListener("click", saveWorkout);
  document.querySelectorAll("[data-tmpl]").forEach(b => b.addEventListener("click", () => loadWorkoutTemplate(b.dataset.tmpl)));

  // Grocery
  $("btnAddGrocery").addEventListener("click",  addGroceryItem);
  $("btnClearGrocery").addEventListener("click", () => {
    if (!confirm("Clear grocery list?")) return;
    const data=loadData(); data.grocery=[]; saveData(data); setStatus("Cleared"); renderGrocery();
  });
}

/* ─── Boot ────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const update = () => setStatus(navigator.onLine ? "Ready" : "Offline");
  window.addEventListener("online", update); window.addEventListener("offline", update); update();
  wireEvents(); renderAll(); showScreen("dashboard");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(()=>{});
});