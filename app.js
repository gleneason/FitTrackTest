// Glen Track (Mobile-first PWA) - single-file JS
// Data stored locally in your iPhone via localStorage.

const KEY = {
  weights: "glentrack.weights.v1",
  macros: "glentrack.macros.v1",
  workouts: "glentrack.workouts.v1",
  templates: "glentrack.mealTemplates.v1",
  grocery: "glentrack.grocery.v1",
  streak: "glentrack.streak.v1",
  prefs: "glentrack.prefs.v1",
};

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

function setStatus(msg, ok=true){
  const el = $("status");
  el.textContent = msg;
  el.style.color = ok ? "rgba(255,255,255,0.72)" : "#ffd7df";
}

function uniqId(prefix="id") {
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function startOfWeekISO(dateISO){
  // Monday start
  const d = new Date(dateISO + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0,10);
}

function addDaysISO(dateISO, days){
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0,10);
}

function isSameDay(a,b){ return a === b; }

// ----------------- Navigation -----------------
function initNav(){
  const navBtns = document.querySelectorAll(".navBtn");
  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      showScreen(btn.dataset.nav);
    });
  });

  // Quick add routes
  $("qaWeight")?.addEventListener("click", () => { showScreen("weight"); $("weightValue")?.focus(); });
  $("qaMacros")?.addEventListener("click", () => { showScreen("macros"); $("macroCals")?.focus(); });
  $("qaWorkout")?.addEventListener("click", () => { showScreen("workouts"); });

  // Default
  showScreen("dashboard");
}

function showScreen(name){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelector(`.screen[data-screen="${name}"]`)?.classList.add("active");

  document.querySelectorAll(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.nav === name));

  // refresh screen-specific UI
  if (name === "dashboard") renderDashboard();
  if (name === "weight") { renderWeights(); renderWeightChart(); }
  if (name === "macros") { renderTemplates(); renderMacroChart(); }
  if (name === "workouts") { renderWorkoutHistory(); }
  if (name === "grocery") { renderGrocery(); renderTemplateButtonsForGrocery(); }
}

// ----------------- Streaks & Goals -----------------
function getStreak(){
  return loadJSON(KEY.streak, { current:0, lastLogged:null, best:0, paceLbPerWeek:0.5 });
}

function saveStreak(st){
  saveJSON(KEY.streak, st);
  $("kpiStreak").textContent = String(st.current || 0);
  $("kpiPace").textContent = String(st.paceLbPerWeek || 0.5);
}

function bumpStreakIfNeeded(dateISO){
  const st = getStreak();
  if (!st.lastLogged){
    st.current = 1;
    st.best = Math.max(st.best||0, st.current);
    st.lastLogged = dateISO;
    saveStreak(st);
    return;
  }
  if (isSameDay(st.lastLogged, dateISO)){
    // already counted today
    return;
  }
  // check if yesterday
  const y = addDaysISO(dateISO, -1);
  if (isSameDay(st.lastLogged, y)){
    st.current = (st.current || 0) + 1;
  } else {
    st.current = 1;
  }
  st.best = Math.max(st.best||0, st.current);
  st.lastLogged = dateISO;
  saveStreak(st);
}

// ----------------- Weight -----------------
function initWeight(){
  $("weightDate").value = todayISO();

  $("addWeight").addEventListener("click", () => {
    const date = $("weightDate").value || todayISO();
    const val = parseFloat($("weightValue").value);
    if (!Number.isFinite(val)) return setStatus("Enter a valid weight", false);

    const weights = loadJSON(KEY.weights, []);
    // unique by date (overwrite if exists)
    const idx = weights.findIndex(w => w.date === date);
    const entry = { id: uniqId("w"), date, lbs: val };
    if (idx >= 0) weights[idx] = entry; else weights.push(entry);
    weights.sort((a,b)=> a.date.localeCompare(b.date));
    saveJSON(KEY.weights, weights);

    bumpStreakIfNeeded(date);
    $("weightValue").value = "";
    setStatus("Weight saved ✅");
    renderWeights();
    renderWeightChart();
    renderDashboard();
  });

  $("clearWeights").addEventListener("click", () => {
    saveJSON(KEY.weights, []);
    setStatus("Weights cleared");
    renderWeights();
    renderWeightChart();
    renderDashboard();
  });
}

function renderWeights(){
  const list = $("weightList");
  const weights = loadJSON(KEY.weights, []);
  if (!weights.length){
    list.innerHTML = '<div class="small">No weight entries yet. Add your first one.</div>';
    return;
  }
  list.innerHTML = "";
  weights.slice().reverse().forEach(w => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${w.date}</div>
        <div class="itemSub">${w.lbs.toFixed(1)} lbs</div>
      </div>
      <div class="itemRight">
        <button class="pill danger" data-del="${w.id}">Delete</button>
      </div>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      const next = loadJSON(KEY.weights, []).filter(x => x.id !== w.id);
      saveJSON(KEY.weights, next);
      setStatus("Deleted");
      renderWeights();
      renderWeightChart();
      renderDashboard();
    });
    list.appendChild(row);
  });
}

let weightChart;
function renderWeightChart(){
  const weights = loadJSON(KEY.weights, []);
  const ctx = $("weightChart");
  if (!ctx) return;

  const labels = weights.map(w => w.date);
  const data = weights.map(w => w.lbs);

  if (weightChart) weightChart.destroy();
  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Weight (lbs)",
        data,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, labels: { color: "rgba(255,255,255,0.75)" } }
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } },
        y: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } }
      }
    }
  });
}

// ----------------- Macros + Calorie Cycling + Templates -----------------
function defaultPrefs(){
  return {
    workoutDay: { cals: 2400, p: 190, c: 260, f: 70 },
    restDay:    { cals: 2100, p: 190, c: 190, f: 75 },
  };
}

function initMacros(){
  $("macroDate").value = todayISO();
  $("cycleHint").textContent = "Auto-set uses Workout vs Rest presets. Edit numbers anytime.";

  $("saveMacros").addEventListener("click", () => {
    const date = $("macroDate").value || todayISO();
    const entry = {
      date,
      cals: parseInt($("macroCals").value || "0", 10),
      p: parseInt($("macroP").value || "0", 10),
      c: parseInt($("macroC").value || "0", 10),
      f: parseInt($("macroF").value || "0", 10),
    };
    if (!entry.cals && !entry.p && !entry.c && !entry.f) return setStatus("Enter at least one macro value", false);

    const macros = loadJSON(KEY.macros, {});
    macros[date] = entry;
    saveJSON(KEY.macros, macros);

    bumpStreakIfNeeded(date);
    setStatus("Macros saved ✅");
    renderMacroChart();
    renderDashboard();
  });

  $("applyCycle").addEventListener("click", () => {
    const prefs = loadJSON(KEY.prefs, defaultPrefs());
    const date = $("macroDate").value || todayISO();

    // if workout logged today, treat as workout day
    const workouts = loadJSON(KEY.workouts, []);
    const isWorkoutDay = workouts.some(w => w.date === date && (w.type !== "Cardio" || w.cardioMinutes > 0));

    const preset = isWorkoutDay ? prefs.workoutDay : prefs.restDay;
    $("macroCals").value = preset.cals;
    $("macroP").value = preset.p;
    $("macroC").value = preset.c;
    $("macroF").value = preset.f;
    setStatus(isWorkoutDay ? "Workout-day macros loaded" : "Rest-day macros loaded");
  });

  // Templates
  if (!localStorage.getItem(KEY.templates)){
    const seed = [
      {
        id: uniqId("t"),
        name: "Costco Al Pastor chicken + rice + fire-roasted veg",
        cals: 650, p: 45, c: 70, f: 20,
        ingredients: ["Al pastor chicken", "Microwave rice cups", "Fire-roasted veggies", "Salsa / hot sauce"]
      },
      {
        id: uniqId("t"),
        name: "Eggs + cheese + salsa (easy)",
        cals: 420, p: 30, c: 8, f: 28,
        ingredients: ["Eggs", "Shredded cheese", "Salsa", "Spinach (optional)"]
      },
      {
        id: uniqId("t"),
        name: "Uber protein snack (pre-shift)",
        cals: 320, p: 35, c: 15, f: 10,
        ingredients: ["Greek yogurt (high protein)", "Protein shake", "Banana or berries"]
      }
    ];
    saveJSON(KEY.templates, seed);
  }

  $("addTemplate").addEventListener("click", () => {
    const name = $("tmplName").value.trim();
    if (!name) return setStatus("Template needs a name", false);
    const t = {
      id: uniqId("t"),
      name,
      cals: parseInt($("tmplCals").value || "0", 10),
      p: parseInt($("tmplP").value || "0", 10),
      c: parseInt($("tmplC").value || "0", 10),
      f: parseInt($("tmplF").value || "0", 10),
      ingredients: guessIngredientsFromName(name),
    };
    const all = loadJSON(KEY.templates, []);
    all.unshift(t);
    saveJSON(KEY.templates, all);

    $("tmplName").value = "";
    $("tmplCals").value = "";
    $("tmplP").value = "";
    $("tmplC").value = "";
    $("tmplF").value = "";

    setStatus("Template added ✅");
    renderTemplates();
    renderTemplateButtonsForGrocery();
  });
}

function guessIngredientsFromName(name){
  const lower = name.toLowerCase();
  const items = [];
  if (lower.includes("chicken")) items.push("Chicken");
  if (lower.includes("rice")) items.push("Rice");
  if (lower.includes("veg") || lower.includes("vegg")) items.push("Vegetables");
  if (lower.includes("salsa")) items.push("Salsa");
  if (lower.includes("yogurt")) items.push("Greek yogurt");
  if (!items.length) items.push(name);
  return items;
}

function applyTemplateToDay(tmpl){
  const date = $("macroDate").value || todayISO();
  const macros = loadJSON(KEY.macros, {});
  const cur = macros[date] || { date, cals:0, p:0, c:0, f:0 };

  cur.cals = (cur.cals || 0) + (tmpl.cals || 0);
  cur.p = (cur.p || 0) + (tmpl.p || 0);
  cur.c = (cur.c || 0) + (tmpl.c || 0);
  cur.f = (cur.f || 0) + (tmpl.f || 0);

  macros[date] = cur;
  saveJSON(KEY.macros, macros);

  $("macroCals").value = cur.cals;
  $("macroP").value = cur.p;
  $("macroC").value = cur.c;
  $("macroF").value = cur.f;

  bumpStreakIfNeeded(date);
  setStatus(`Added: ${tmpl.name} ✅`);
  renderMacroChart();
  renderDashboard();
}

function renderTemplates(){
  const box = $("mealTemplates");
  const templates = loadJSON(KEY.templates, []);
  if (!templates.length){
    box.innerHTML = '<div class="small">No meal templates yet.</div>';
    return;
  }
  box.innerHTML = "";
  templates.forEach(t => {
    const el = document.createElement("div");
    el.className = "template";
    el.innerHTML = `
      <div class="templateTop">
        <div>
          <div class="templateName">${t.name}</div>
          <div class="templateMeta">${t.cals || 0} cals • P ${t.p || 0} • C ${t.c || 0} • F ${t.f || 0}</div>
        </div>
        <span class="pill">One-tap</span>
      </div>
      <div class="templateBtns">
        <button class="btnPrimary" data-add="${t.id}">Add to today</button>
        <button class="btnGhost" data-del="${t.id}">Delete</button>
      </div>
    `;
    el.querySelector(`[data-add="${t.id}"]`).addEventListener("click", () => applyTemplateToDay(t));
    el.querySelector(`[data-del="${t.id}"]`).addEventListener("click", () => {
      const next = loadJSON(KEY.templates, []).filter(x => x.id !== t.id);
      saveJSON(KEY.templates, next);
      setStatus("Template deleted");
      renderTemplates();
      renderTemplateButtonsForGrocery();
    });
    box.appendChild(el);
  });
}

let macroChart;
function renderMacroChart(){
  const ctx = $("macroChart");
  if (!ctx) return;

  const macros = loadJSON(KEY.macros, {});
  const end = todayISO();
  const start = addDaysISO(end, -6);

  const labels = [];
  const cals = [];
  const protein = [];

  for (let i=0;i<7;i++){
    const d = addDaysISO(start, i);
    labels.push(d.slice(5));
    const m = macros[d];
    cals.push(m?.cals || 0);
    protein.push(m?.p || 0);
  }

  if (macroChart) macroChart.destroy();
  macroChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Calories", data: cals, borderWidth: 1 },
        { label: "Protein (g)", data: protein, borderWidth: 1 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "rgba(255,255,255,0.75)" } } },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } },
        y: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } }
      }
    }
  });
}

// ----------------- Workouts + Templates (Push/Pull/Legs/Full Body) -----------------
const WORKOUT_TEMPLATES = {
  "Full Body": [
    { name: "Goblet squat", sets: 3, reps: 10 },
    { name: "DB bench press", sets: 3, reps: 10 },
    { name: "Lat pulldown", sets: 3, reps: 10 },
    { name: "RDL (Romanian deadlift)", sets: 3, reps: 10 },
    { name: "DB shoulder press", sets: 2, reps: 12 },
    { name: "Plank", sets: 3, reps: 45 },
  ],
  "Push": [
    { name: "Bench press", sets: 4, reps: 8 },
    { name: "Incline DB press", sets: 3, reps: 10 },
    { name: "Shoulder press", sets: 3, reps: 10 },
    { name: "Triceps pushdown", sets: 3, reps: 12 },
  ],
  "Pull": [
    { name: "Lat pulldown", sets: 4, reps: 10 },
    { name: "Seated row", sets: 3, reps: 10 },
    { name: "DB curls", sets: 3, reps: 12 },
    { name: "Face pulls", sets: 3, reps: 15 },
  ],
  "Legs": [
    { name: "Squat / Leg press", sets: 4, reps: 10 },
    { name: "RDL", sets: 3, reps: 10 },
    { name: "Leg curl", sets: 3, reps: 12 },
    { name: "Calf raises", sets: 3, reps: 15 },
  ],
  "Cardio": [
    { name: "Run / Bike", sets: 1, reps: 20 }
  ]
};

function initWorkouts(){
  $("woDate").value = todayISO();
  seedExerciseFields([]);

  $("addExercise").addEventListener("click", () => addExerciseRow({ name:"", sets:"", reps:"" }));

  document.querySelectorAll("[data-template]").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.template;
      $("woType").value = name;
      const fields = (WORKOUT_TEMPLATES[name] || []).map(x => ({
        name: x.name, sets: String(x.sets || ""), reps: String(x.reps || "")
      }));
      seedExerciseFields(fields);
      setStatus(`${name} template loaded`);
    });
  });

  $("saveWorkout").addEventListener("click", () => {
    const date = $("woDate").value || todayISO();
    const type = $("woType").value || "Full Body";

    const exercises = readExerciseRows().filter(x => x.name.trim());
    const cardioMode = $("cardioMode").value;
    const cardioMinutes = parseInt($("cardioMins").value || "0", 10);

    if (!exercises.length && !cardioMinutes){
      return setStatus("Add at least one exercise or cardio minutes", false);
    }

    const entry = {
      id: uniqId("wo"),
      date,
      type,
      exercises,
      cardioMode,
      cardioMinutes: cardioMinutes || 0
    };

    const all = loadJSON(KEY.workouts, []);
    all.push(entry);
    all.sort((a,b)=> a.date.localeCompare(b.date));
    saveJSON(KEY.workouts, all);

    bumpStreakIfNeeded(date);
    setStatus("Workout saved ✅");
    $("cardioMins").value = "";
    renderWorkoutHistory();
    renderDashboard();
  });
}

function seedExerciseFields(rows){
  const box = $("exerciseFields");
  box.innerHTML = "";
  if (!rows.length){
    addExerciseRow({ name:"", sets:"", reps:"" });
    addExerciseRow({ name:"", sets:"", reps:"" });
    return;
  }
  rows.forEach(r => addExerciseRow(r));
}

function addExerciseRow({name, sets, reps}){
  const box = $("exerciseFields");
  const row = document.createElement("div");
  row.className = "exerciseRow";
  row.innerHTML = `
    <input type="text" placeholder="Exercise" value="${escapeHtml(name || "")}">
    <input inputmode="numeric" type="number" step="1" placeholder="Sets" value="${escapeHtml(sets || "")}">
    <input inputmode="numeric" type="number" step="1" placeholder="Reps" value="${escapeHtml(reps || "")}">
  `;
  box.appendChild(row);
}

function readExerciseRows(){
  const rows = [];
  document.querySelectorAll("#exerciseFields .exerciseRow").forEach(r => {
    const inputs = r.querySelectorAll("input");
    rows.push({
      name: inputs[0].value || "",
      sets: parseInt(inputs[1].value || "0", 10) || 0,
      reps: parseInt(inputs[2].value || "0", 10) || 0,
    });
  });
  return rows;
}

function renderWorkoutHistory(){
  const box = $("workoutList");
  const all = loadJSON(KEY.workouts, []);
  if (!all.length){
    box.innerHTML = '<div class="small">No workouts yet. Start with a Full Body template.</div>';
    return;
  }
  box.innerHTML = "";
  all.slice().reverse().forEach(w => {
    const row = document.createElement("div");
    row.className = "item";
    const exCount = w.exercises?.filter(x=>x.name).length || 0;
    const cardio = w.cardioMinutes ? ` • ${w.cardioMode}: ${w.cardioMinutes} min` : "";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${w.date} • ${w.type}</div>
        <div class="itemSub">${exCount} exercises${cardio}</div>
      </div>
      <div class="itemRight">
        <button class="pill danger" data-del="${w.id}">Delete</button>
      </div>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      const next = loadJSON(KEY.workouts, []).filter(x => x.id !== w.id);
      saveJSON(KEY.workouts, next);
      setStatus("Workout deleted");
      renderWorkoutHistory();
      renderDashboard();
    });
    box.appendChild(row);
  });
}

// ----------------- Grocery (generated from templates) -----------------
function initGrocery(){
  $("addGrocery").addEventListener("click", () => {
    const text = $("groceryAdd").value.trim();
    if (!text) return;
    const list = loadJSON(KEY.grocery, []);
    list.unshift({ id: uniqId("g"), text, done:false });
    saveJSON(KEY.grocery, list);
    $("groceryAdd").value = "";
    setStatus("Added to grocery ✅");
    renderGrocery();
  });

  $("clearGrocery").addEventListener("click", () => {
    saveJSON(KEY.grocery, []);
    setStatus("Grocery cleared");
    renderGrocery();
  });
}

function renderTemplateButtonsForGrocery(){
  const box = $("groceryFromTemplates");
  if (!box) return;
  const templates = loadJSON(KEY.templates, []);
  box.innerHTML = "";
  templates.forEach(t => {
    const el = document.createElement("div");
    el.className = "template";
    const ing = (t.ingredients || []).slice(0,4).join(", ");
    el.innerHTML = `
      <div class="templateTop">
        <div>
          <div class="templateName">${t.name}</div>
          <div class="templateMeta">${ing || "Tap to add ingredients"}</div>
        </div>
        <span class="pill">Add</span>
      </div>
    `;
    el.addEventListener("click", () => addTemplateIngredientsToGrocery(t));
    box.appendChild(el);
  });
}

function addTemplateIngredientsToGrocery(t){
  const list = loadJSON(KEY.grocery, []);
  const items = (t.ingredients && t.ingredients.length) ? t.ingredients : [t.name];
  items.forEach(item => {
    const text = item.trim();
    if (!text) return;
    // avoid duplicates by text
    const exists = list.some(x => x.text.toLowerCase() === text.toLowerCase());
    if (!exists) list.unshift({ id: uniqId("g"), text, done:false });
  });
  saveJSON(KEY.grocery, list);
  setStatus("Ingredients added ✅");
  renderGrocery();
}

function renderGrocery(){
  const box = $("groceryList");
  const list = loadJSON(KEY.grocery, []);
  if (!list.length){
    box.innerHTML = '<div class="small">No grocery items yet. Tap a meal template above or add one.</div>';
    return;
  }
  box.innerHTML = "";
  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(item.text)}</div>
        <div class="itemSub">${item.done ? "Done ✅" : "Tap to mark done"}</div>
      </div>
      <div class="itemRight">
        <button class="pill danger" data-del="${item.id}">Delete</button>
      </div>
    `;
    row.addEventListener("click", (e) => {
      if (e.target?.dataset?.del) return;
      const next = loadJSON(KEY.grocery, []).map(x => x.id === item.id ? { ...x, done: !x.done } : x);
      saveJSON(KEY.grocery, next);
      renderGrocery();
    });
    row.querySelector("[data-del]").addEventListener("click", (e) => {
      e.stopPropagation();
      const next = loadJSON(KEY.grocery, []).filter(x => x.id !== item.id);
      saveJSON(KEY.grocery, next);
      renderGrocery();
    });
    box.appendChild(row);
  });
}

// ----------------- Dashboard -----------------
function renderDashboard(){
  const st = getStreak();
  $("kpiStreak").textContent = String(st.current || 0);
  $("kpiPace").textContent = String(st.paceLbPerWeek || 0.5);

  const end = todayISO();
  const start = startOfWeekISO(end);

  // Weight avg
  const weights = loadJSON(KEY.weights, []);
  const weekWeights = weights.filter(w => w.date >= start && w.date <= end);
  const avgW = weekWeights.length ? (weekWeights.reduce((s,x)=>s+x.lbs,0)/weekWeights.length) : null;
  $("wkAvgWeight").textContent = avgW ? `${avgW.toFixed(1)} lb` : "—";

  // Workouts count
  const workouts = loadJSON(KEY.workouts, []);
  const weekWOs = workouts.filter(w => w.date >= start && w.date <= end);
  $("wkWorkouts").textContent = String(weekWOs.length);

  // Protein avg
  const macros = loadJSON(KEY.macros, {});
  let pSum = 0, pCount = 0;
  for (let i=0;i<7;i++){
    const d = addDaysISO(start, i);
    if (macros[d]?.p){
      pSum += macros[d].p;
      pCount += 1;
    }
  }
  $("wkProtein").textContent = pCount ? `${Math.round(pSum/pCount)} g` : "—";
}

// ----------------- Utils -----------------
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ----------------- Boot -----------------
function boot(){
  // defaults
  if (!localStorage.getItem(KEY.prefs)) saveJSON(KEY.prefs, defaultPrefs());

  initNav();
  initWeight();
  initMacros();
  initWorkouts();
  initGrocery();

  // first render
  renderDashboard();
  renderWeights();
  renderWeightChart();
  renderTemplates();
  renderMacroChart();
  renderWorkoutHistory();
  renderTemplateButtonsForGrocery();
  renderGrocery();

  setStatus("Loaded ✅");
}

document.addEventListener("DOMContentLoaded", boot);
