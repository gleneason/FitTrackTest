/* Glen Track — mobile-only PWA
   - localStorage only
   - Whoop-ish navy + teal UI
   - Weight, macros, workouts, grocery, goals, streaks
*/

const STORE_KEY = "glentrack.data.v2";

const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

function startOfWeekISO(dateISO) {
  const d = new Date(dateISO + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

function addDaysISO(dateISO, days) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

function uid(prefix="id"){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function setStatus(msg){
  const el = $("status");
  if (!el) return;
  el.textContent = msg;
}

function loadData(){
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return freshData();
  try{
    const obj = JSON.parse(raw);
    return normalizeData(obj);
  }catch{
    return freshData();
  }
}

function saveData(data){
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function freshData(){
  return normalizeData({
    version: 2,
    goals: {
      weeklyLoss: 0.5,
      proteinPerDay: 190,
      workoutsPerWeek: 3,
      workoutDayCals: 2400,
      restDayCals: 2100
    },
    streak: { current: 0, lastLogDate: null, best: 0 },
    weights: [],               // [{id,date,lbs}]
    macros: {},                // { "YYYY-MM-DD": {date,cals,p,c,f} }
    workouts: [],              // [{id,date,type,exercises:[{name,sets,reps}], cardioMode, cardioMins}]
    mealTemplates: [],         // [{id,name,cals,p,c,f,ingredients:[...]}]
    grocery: []                // [{id,text,done}]
  });
}

function normalizeData(d){
  d.version ??= 2;
  d.goals ??= { weeklyLoss:0.5, proteinPerDay:190, workoutsPerWeek:3, workoutDayCals:2400, restDayCals:2100 };
  d.streak ??= { current:0, lastLogDate:null, best:0 };
  d.weights ??= [];
  d.macros ??= {};
  d.workouts ??= [];
  d.mealTemplates ??= [];
  d.grocery ??= [];
  return d;
}

function bumpStreak(data, dateISO){
  const st = data.streak;
  if (!st.lastLogDate){
    st.current = 1;
    st.best = Math.max(st.best, st.current);
    st.lastLogDate = dateISO;
    return;
  }
  if (st.lastLogDate === dateISO) return;

  const yesterday = addDaysISO(dateISO, -1);
  st.current = (st.lastLogDate === yesterday) ? (st.current + 1) : 1;
  st.best = Math.max(st.best, st.current);
  st.lastLogDate = dateISO;
}

function weekDates(weekStartISO){
  return Array.from({length:7}, (_,i)=> addDaysISO(weekStartISO, i));
}

/* ---------------- Navigation ---------------- */

function showScreen(name){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelector(`.screen[data-screen="${name}"]`)?.classList.add("active");

  document.querySelectorAll(".navItem").forEach(b => b.classList.toggle("active", b.dataset.nav === name));

  // Render per screen
  if (name === "dashboard") renderDashboard();
  if (name === "weight") renderWeights();
  if (name === "macros") renderMacros();
  if (name === "workouts") renderWorkouts();
  if (name === "grocery") renderGrocery();
}

/* ---------------- Charts ---------------- */

let chartWeight30 = null;
let chartMacrosWeek = null;
let chartMacrosDash = null;

function destroyChart(ch){
  try{ ch?.destroy?.(); }catch{}
}

function renderChartsDashboard(data){
  // Weight last 30
  const ctxW = $("chartWeight");
  if (ctxW){
    const last = data.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
    const labels = last.map(x=> x.date.slice(5));
    const vals = last.map(x=> x.lbs);

    destroyChart(chartWeight30);
    chartWeight30 = new Chart(ctxW, {
      type:"line",
      data:{ labels, datasets:[{ label:"Weight", data: vals, tension:0.35, borderWidth:2, pointRadius:2 }]},
      options:{
        responsive:true,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ ticks:{ color:"rgba(230,237,245,.55)" }, grid:{ color:"rgba(255,255,255,.06)" } },
          y:{ ticks:{ color:"rgba(230,237,245,.55)" }, grid:{ color:"rgba(255,255,255,.06)" } }
        }
      }
    });
  }

  // Macros dashboard: this week cals + protein
  const ctxM = $("chartMacros");
  if (ctxM){
    const weekStart = startOfWeekISO(todayISO());
    const days = weekDates(weekStart);
    const labels = days.map(d=> d.slice(5));
    const cals = days.map(d=> data.macros[d]?.cals || 0);
    const prot = days.map(d=> data.macros[d]?.p || 0);

    destroyChart(chartMacrosDash);
    chartMacrosDash = new Chart(ctxM, {
      type:"bar",
      data:{
        labels,
        datasets:[
          { label:"Calories", data: cals, borderWidth:1 },
          { label:"Protein", data: prot, borderWidth:1 }
        ]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ labels:{ color:"rgba(230,237,245,.75)" } } },
        scales:{
          x:{ ticks:{ color:"rgba(230,237,245,.55)" }, grid:{ color:"rgba(255,255,255,.06)" } },
          y:{ ticks:{ color:"rgba(230,237,245,.55)" }, grid:{ color:"rgba(255,255,255,.06)" } }
        }
      }
    });
  }
}

function renderMacrosWeekChart(data){
  const ctx = $("chartMacrosWeek");
  if (!ctx) return;

  const weekStart = startOfWeekISO(todayISO());
  const days = weekDates(weekStart);
  const labels = days.map(d=> d.slice(5));
  const cals = days.map(d=> data.macros[d]?.cals || 0);
  const prot = days.map(d=> data.macros[d]?.p || 0);

  destroyChart(chartMacrosWeek);
  chartMacrosWeek = new Chart(ctx, {
    type:"bar",
    data:{
      labels,
      datasets:[
        { label:"Calories", data:cals, borderWidth:1 },
        { label:"Protein", data:prot, borderWidth:1 }
      ]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:"rgba(230,237,245,.75)" } } },
      scales:{
        x:{ ticks:{ color:"rgba(230,237,245,.55)" }, grid:{ color:"rgba(255,255,255,.06)" } },
        y:{ ticks:{ color:"rgba(230,237,245,.55)" }, grid:{ color:"rgba(255,255,255,.06)" } }
      }
    }
  });
}

/* ---------------- Dashboard ---------------- */

function renderDashboard(){
  const data = loadData();
  const today = todayISO();
  const weekStart = startOfWeekISO(today);
  const days = weekDates(weekStart);

  // week range label
  $("weekRange").textContent = `${weekStart} → ${days[6]}`;

  // avg weight (7d) from entries in week
  const weekWeights = data.weights.filter(w => w.date >= weekStart && w.date <= days[6]).sort((a,b)=>a.date.localeCompare(b.date));
  const avgW = weekWeights.length ? (weekWeights.reduce((s,x)=>s+x.lbs,0)/weekWeights.length) : null;
  $("mAvgWeight").textContent = avgW ? `${avgW.toFixed(1)} lb` : "—";

  // start vs end delta (week)
  if (weekWeights.length >= 2){
    const delta = weekWeights[weekWeights.length-1].lbs - weekWeights[0].lbs;
    const sign = delta > 0 ? "+" : "";
    $("mWeightDelta").textContent = `${sign}${delta.toFixed(1)} lb (wk)`;
  } else {
    $("mWeightDelta").textContent = "Log 2+ weigh-ins";
  }

  // macros weekly averages
  const weekMacros = days.map(d=> data.macros[d]).filter(Boolean);
  const avgCals = weekMacros.length ? Math.round(weekMacros.reduce((s,m)=>s+(m.cals||0),0)/weekMacros.length) : null;
  const avgProt = weekMacros.length ? Math.round(weekMacros.reduce((s,m)=>s+(m.p||0),0)/weekMacros.length) : null;

  $("mAvgCalories").textContent = avgCals ? String(avgCals) : "—";
  $("mProteinAvg").textContent = avgProt ? `${avgProt} g protein avg` : "No macros yet";

  // workouts weekly count + cardio minutes
  const weekWorkouts = data.workouts.filter(w => w.date >= weekStart && w.date <= days[6]);
  $("mWorkouts").textContent = String(weekWorkouts.length);

  const cardioSum = weekWorkouts.reduce((s,w)=> s + (w.cardioMins||0), 0);
  $("mCardioMins").textContent = cardioSum ? `${cardioSum} min cardio` : "No cardio logged";

  // streak
  $("mStreak").textContent = String(data.streak.current || 0);

  // goal progress line
  const g = data.goals;
  const workoutsGoal = g.workoutsPerWeek || 0;
  const workoutsProgress = workoutsGoal ? `${weekWorkouts.length}/${workoutsGoal} workouts` : `${weekWorkouts.length} workouts`;
  const proteinGoal = g.proteinPerDay || 0;
  const proteinProgress = proteinGoal && avgProt ? `${avgProt}/${proteinGoal}g protein` : (proteinGoal ? `${proteinGoal}g protein goal` : "Set goals");
  $("mGoalProgress").textContent = `${workoutsProgress} • ${proteinProgress}`;

  // preload goal fields
  $("goalLoss").value = String(g.weeklyLoss ?? 0.5);
  $("goalProtein").value = String(g.proteinPerDay ?? 190);
  $("goalWorkouts").value = String(g.workoutsPerWeek ?? 3);
  $("goalWorkoutCals").value = String(g.workoutDayCals ?? 2400);
  $("goalRestCals").value = String(g.restDayCals ?? 2100);

  renderChartsDashboard(data);
}

/* ---------------- Weight ---------------- */

function renderWeights(){
  const data = loadData();
  $("weightDate").value = todayISO();

  const list = $("weightList");
  const items = data.weights.slice().sort((a,b)=>b.date.localeCompare(a.date));
  if (!items.length){
    list.innerHTML = `<div class="sub">No entries yet.</div>`;
    return;
  }
  list.innerHTML = "";
  for (const w of items){
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${w.date}</div>
        <div class="itemSub">${Number(w.lbs).toFixed(1)} lb</div>
      </div>
      <div class="itemRight">
        <button class="btn danger ghost" data-del="${w.id}">Delete</button>
      </div>
    `;
    el.querySelector("[data-del]").addEventListener("click", () => {
      const next = loadData();
      next.weights = next.weights.filter(x => x.id !== w.id);
      saveData(next);
      setStatus("Deleted");
      renderWeights();
      renderDashboard();
    });
    list.appendChild(el);
  }
}

/* ---------------- Macros ---------------- */

function ensureDefaultTemplates(data){
  if (data.mealTemplates.length) return;

  data.mealTemplates = [
    {
      id: uid("t"),
      name: "Costco chicken + rice + veggies",
      cals: 650, p: 45, c: 70, f: 20,
      ingredients: ["chicken", "rice cups", "frozen veggies", "salsa"]
    },
    {
      id: uid("t"),
      name: "Eggs + cheese + salsa",
      cals: 420, p: 30, c: 8, f: 28,
      ingredients: ["eggs", "shredded cheese", "salsa", "spinach (optional)"]
    },
    {
      id: uid("t"),
      name: "Pre-Uber protein snack",
      cals: 320, p: 35, c: 15, f: 10,
      ingredients: ["high-protein greek yogurt", "protein shake", "banana"]
    }
  ];
}

function addIngredientsToGrocery(data, ingredients){
  for (const item of ingredients){
    const text = String(item).trim();
    if (!text) continue;
    const exists = data.grocery.some(g => g.text.toLowerCase() === text.toLowerCase());
    if (!exists) data.grocery.unshift({ id: uid("g"), text, done:false });
  }
}

function renderMacros(){
  const data = loadData();
  ensureDefaultTemplates(data);
  saveData(data);

  $("macroDate").value = todayISO();
  const today = $("macroDate").value;
  const m = data.macros[today];
  $("macroCals").value = m?.cals ?? "";
  $("macroP").value = m?.p ?? "";
  $("macroC").value = m?.c ?? "";
  $("macroF").value = m?.f ?? "";

  // templates list
  const box = $("mealTemplates");
  box.innerHTML = "";
  for (const t of data.mealTemplates){
    const el = document.createElement("div");
    el.className = "template";
    el.innerHTML = `
      <div class="templateName">${escapeHtml(t.name)}</div>
      <div class="templateMeta">${t.cals} cals • P ${t.p} • C ${t.c} • F ${t.f}</div>
      <div class="templateBtns">
        <button class="btn primary" data-add="${t.id}">Add to today</button>
        <button class="btn ghost" data-gro="${t.id}">Add to grocery</button>
        <button class="btn danger ghost" data-del="${t.id}">Delete</button>
      </div>
    `;

    el.querySelector(`[data-add="${t.id}"]`).addEventListener("click", () => {
      const next = loadData();
      const date = $("macroDate").value || todayISO();
      const cur = next.macros[date] || { date, cals:0, p:0, c:0, f:0 };
      cur.cals += (t.cals || 0);
      cur.p += (t.p || 0);
      cur.c += (t.c || 0);
      cur.f += (t.f || 0);
      next.macros[date] = cur;

      addIngredientsToGrocery(next, t.ingredients || []);
      bumpStreak(next, date);

      saveData(next);
      setStatus("Added template");
      renderMacros();
      renderGrocery(); // keep grocery current
      renderDashboard();
      renderMacrosWeekChart(next);
    });

    el.querySelector(`[data-gro="${t.id}"]`).addEventListener("click", () => {
      const next = loadData();
      addIngredientsToGrocery(next, t.ingredients || []);
      saveData(next);
      setStatus("Added to grocery");
      renderGrocery();
    });

    el.querySelector(`[data-del="${t.id}"]`).addEventListener("click", () => {
      const next = loadData();
      next.mealTemplates = next.mealTemplates.filter(x => x.id !== t.id);
      saveData(next);
      setStatus("Template deleted");
      renderMacros();
      renderGrocery();
    });

    box.appendChild(el);
  }

  renderMacrosWeekChart(data);
}

function autoSetMacros(){
  const data = loadData();
  const date = $("macroDate").value || todayISO();

  // if workout logged today => workout day, else rest day
  const isWorkoutDay = data.workouts.some(w => w.date === date);

  const cals = isWorkoutDay ? data.goals.workoutDayCals : data.goals.restDayCals;
  const p = data.goals.proteinPerDay;

  $("macroCals").value = cals;
  $("macroP").value = p;

  setStatus(isWorkoutDay ? "Workout day targets" : "Rest day targets");
}

function saveMacros(){
  const data = loadData();
  const date = $("macroDate").value || todayISO();

  const entry = {
    date,
    cals: toInt($("macroCals").value),
    p: toInt($("macroP").value),
    c: toInt($("macroC").value),
    f: toInt($("macroF").value),
  };

  if (!entry.cals && !entry.p && !entry.c && !entry.f){
    setStatus("Enter at least one macro value");
    return;
  }

  data.macros[date] = entry;
  bumpStreak(data, date);
  saveData(data);
  setStatus("Saved");
  renderDashboard();
  renderMacrosWeekChart(data);
}

function clearMacrosThisWeek(){
  const data = loadData();
  const weekStart = startOfWeekISO(todayISO());
  const days = weekDates(weekStart);
  for (const d of days) delete data.macros[d];
  saveData(data);
  setStatus("Cleared week macros");
  renderMacros();
  renderDashboard();
}

/* ---------------- Workouts ---------------- */

const WORKOUT_TEMPLATES = {
  "Full Body": [
    { name:"Goblet squat", sets:3, reps:10 },
    { name:"DB bench press", sets:3, reps:10 },
    { name:"Lat pulldown", sets:3, reps:10 },
    { name:"RDL", sets:3, reps:10 },
    { name:"DB shoulder press", sets:2, reps:12 },
    { name:"Plank (seconds)", sets:3, reps:45 },
  ],
  "Push": [
    { name:"Bench press", sets:4, reps:8 },
    { name:"Incline DB press", sets:3, reps:10 },
    { name:"Shoulder press", sets:3, reps:10 },
    { name:"Triceps pushdown", sets:3, reps:12 },
  ],
  "Pull": [
    { name:"Lat pulldown", sets:4, reps:10 },
    { name:"Seated row", sets:3, reps:10 },
    { name:"DB curls", sets:3, reps:12 },
    { name:"Face pulls", sets:3, reps:15 },
  ],
  "Legs": [
    { name:"Squat / Leg press", sets:4, reps:10 },
    { name:"RDL", sets:3, reps:10 },
    { name:"Leg curl", sets:3, reps:12 },
    { name:"Calf raises", sets:3, reps:15 },
  ],
  "Cardio": [
    { name:"Cardio session", sets:1, reps:20 }
  ]
};

function seedExerciseRows(rows){
  const box = $("exerciseFields");
  box.innerHTML = "";
  const use = rows.length ? rows : [{name:"",sets:"",reps:""},{name:"",sets:"",reps:""}];
  for (const r of use) addExerciseRow(r.name, r.sets, r.reps);
}

function addExerciseRow(name="", sets="", reps=""){
  const box = $("exerciseFields");
  const row = document.createElement("div");
  row.className = "exerciseRow";
  row.innerHTML = `
    <input type="text" placeholder="Exercise" value="${escapeHtml(name)}" />
    <input type="number" inputmode="numeric" step="1" placeholder="Sets" value="${escapeHtml(String(sets ?? ""))}" />
    <input type="number" inputmode="numeric" step="1" placeholder="Reps" value="${escapeHtml(String(reps ?? ""))}" />
  `;
  box.appendChild(row);
}

function readExerciseRows(){
  const rows = [];
  document.querySelectorAll("#exerciseFields .exerciseRow").forEach(r => {
    const inputs = r.querySelectorAll("input");
    const name = inputs[0].value.trim();
    const sets = toInt(inputs[1].value);
    const reps = toInt(inputs[2].value);
    if (name) rows.push({ name, sets, reps });
  });
  return rows;
}

function renderWorkouts(){
  const data = loadData();
  $("woDate").value = todayISO();
  $("cardioMins").value = "";
  seedExerciseRows([]);

  renderWorkoutList(data);
}

function loadWorkoutTemplate(name){
  $("woType").value = name;
  const rows = (WORKOUT_TEMPLATES[name] || []).map(x => ({ name:x.name, sets:x.sets, reps:x.reps }));
  seedExerciseRows(rows);
  setStatus("Template loaded");
}

function saveWorkout(){
  const data = loadData();
  const date = $("woDate").value || todayISO();
  const type = $("woType").value || "Full Body";
  const exercises = readExerciseRows();

  const cardioMode = $("cardioMode").value;
  const cardioMins = toInt($("cardioMins").value);

  if (!exercises.length && !cardioMins){
    setStatus("Add exercises or cardio minutes");
    return;
  }

  data.workouts.push({
    id: uid("wo"),
    date,
    type,
    exercises,
    cardioMode,
    cardioMins
  });
  data.workouts.sort((a,b)=> b.date.localeCompare(a.date));

  bumpStreak(data, date);
  saveData(data);

  setStatus("Saved");
  renderWorkoutList(data);
  renderDashboard();
}

function renderWorkoutList(data){
  const list = $("workoutList");
  const today = todayISO();
  const weekStart = startOfWeekISO(today);
  const weekEnd = addDaysISO(weekStart, 6);

  const week = data.workouts.filter(w => w.date >= weekStart && w.date <= weekEnd);
  const older = data.workouts.filter(w => w.date < weekStart);

  list.innerHTML = "";

  const renderGroup = (title, items) => {
    if (!items.length) return;
    const header = document.createElement("div");
    header.className = "sub";
    header.style.marginTop = "4px";
    header.textContent = title;
    list.appendChild(header);

    for (const w of items){
      const exCount = w.exercises?.length || 0;
      const cardio = w.cardioMins ? ` • ${w.cardioMode}: ${w.cardioMins}m` : "";
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="itemLeft">
          <div class="itemTitle">${w.date} • ${escapeHtml(w.type)}</div>
          <div class="itemSub">${exCount} exercises${cardio}</div>
        </div>
        <div class="itemRight">
          <button class="btn danger ghost" data-del="${w.id}">Delete</button>
        </div>
      `;
      el.querySelector("[data-del]").addEventListener("click", () => {
        const next = loadData();
        next.workouts = next.workouts.filter(x => x.id !== w.id);
        saveData(next);
        setStatus("Deleted");
        renderWorkoutList(next);
        renderDashboard();
      });
      list.appendChild(el);
    }
  };

  renderGroup("This week", week);
  renderGroup("Older", older);

  if (!week.length && !older.length){
    list.innerHTML = `<div class="sub">No workouts yet. Load a template and save your first one.</div>`;
  }
}

/* ---------------- Grocery ---------------- */

function renderGrocery(){
  const data = loadData();

  // template tiles for grocery
  const tmplBox = $("groceryTemplates");
  tmplBox.innerHTML = "";
  for (const t of data.mealTemplates){
    const el = document.createElement("div");
    el.className = "template";
    const ing = (t.ingredients || []).slice(0,4).join(", ");
    el.innerHTML = `
      <div class="templateName">${escapeHtml(t.name)}</div>
      <div class="templateMeta">${escapeHtml(ing || "Tap to add ingredients")}</div>
      <div class="templateBtns">
        <button class="btn primary" data-add="${t.id}">Add ingredients</button>
      </div>
    `;
    el.querySelector(`[data-add="${t.id}"]`).addEventListener("click", () => {
      const next = loadData();
      addIngredientsToGrocery(next, t.ingredients || [t.name]);
      saveData(next);
      setStatus("Added ingredients");
      renderGrocery();
    });
    tmplBox.appendChild(el);
  }

  // grocery list
  const list = $("groceryList");
  if (!data.grocery.length){
    list.innerHTML = `<div class="sub">No grocery items yet.</div>`;
    return;
  }
  list.innerHTML = "";
  for (const g of data.grocery){
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(g.text)}</div>
        <div class="itemSub">${g.done ? "Done" : "Tap to mark done"}</div>
      </div>
      <div class="itemRight">
        <button class="btn danger ghost" data-del="${g.id}">Delete</button>
      </div>
    `;
    el.addEventListener("click", (e) => {
      if (e.target?.dataset?.del) return;
      const next = loadData();
      next.grocery = next.grocery.map(x => x.id === g.id ? ({...x, done: !x.done}) : x);
      saveData(next);
      renderGrocery();
    });
    el.querySelector("[data-del]").addEventListener("click", (e) => {
      e.stopPropagation();
      const next = loadData();
      next.grocery = next.grocery.filter(x => x.id !== g.id);
      saveData(next);
      setStatus("Deleted");
      renderGrocery();
    });
    list.appendChild(el);
  }
}

function addGroceryItem(){
  const text = $("groceryAdd").value.trim();
  if (!text) return;
  const data = loadData();
  data.grocery.unshift({ id: uid("g"), text, done:false });
  saveData(data);
  $("groceryAdd").value = "";
  setStatus("Added");
  renderGrocery();
}

/* ---------------- Goals / Import / Export ---------------- */

function saveGoals(){
  const data = loadData();
  data.goals.weeklyLoss = toFloat($("goalLoss").value, 0.5);
  data.goals.proteinPerDay = toInt($("goalProtein").value) || 190;
  data.goals.workoutsPerWeek = toInt($("goalWorkouts").value) || 3;
  data.goals.workoutDayCals = toInt($("goalWorkoutCals").value) || 2400;
  data.goals.restDayCals = toInt($("goalRestCals").value) || 2100;
  saveData(data);
  setStatus("Goals saved");
  renderDashboard();
}

function exportData(){
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glen-track-export-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importDataFromFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const obj = JSON.parse(String(reader.result || ""));
      const normalized = normalizeData(obj);
      saveData(normalized);
      setStatus("Imported");
      renderAll();
    }catch{
      setStatus("Import failed");
    }
  };
  reader.readAsText(file);
}

function resetAll(){
  if (!confirm("Reset all data? This cannot be undone.")) return;
  localStorage.removeItem(STORE_KEY);
  setStatus("Reset");
  renderAll();
}

function loadSample(){
  const d = freshData();
  const t = todayISO();
  const weekStart = startOfWeekISO(t);

  // weights
  d.weights = [
    {id:uid("w"), date: addDaysISO(weekStart,0), lbs:195.0},
    {id:uid("w"), date: addDaysISO(weekStart,2), lbs:194.2},
    {id:uid("w"), date: addDaysISO(weekStart,4), lbs:193.8},
    {id:uid("w"), date: addDaysISO(weekStart,6), lbs:193.6},
  ];

  // macros
  for (let i=0;i<7;i++){
    const date = addDaysISO(weekStart,i);
    d.macros[date] = { date, cals: (i%2?2100:2400), p: 185+i, c: 190+i*5, f: 70 };
  }

  // workouts
  d.workouts = [
    {id:uid("wo"), date:addDaysISO(weekStart,1), type:"Full Body", exercises:[{name:"Goblet squat",sets:3,reps:10},{name:"DB bench press",sets:3,reps:10}], cardioMode:"Run", cardioMins:15},
    {id:uid("wo"), date:addDaysISO(weekStart,3), type:"Pull", exercises:[{name:"Lat pulldown",sets:4,reps:10},{name:"Seated row",sets:3,reps:10}], cardioMode:"Bike", cardioMins:20},
  ];

  ensureDefaultTemplates(d);
  addIngredientsToGrocery(d, ["spinach", "rice cups", "salsa"]);
  bumpStreak(d, t);

  saveData(d);
  setStatus("Sample loaded");
  renderAll();
}

/* ---------------- Helpers ---------------- */

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function toInt(v){ const n = parseInt(String(v||"").trim(),10); return Number.isFinite(n)?n:0; }
function toFloat(v, def){ const n = parseFloat(String(v||"").trim()); return Number.isFinite(n)?n:def; }

function renderAll(){
  // keep current screen
  const active = document.querySelector(".screen.active")?.dataset?.screen || "dashboard";
  renderDashboard();
  renderWeights();
  renderMacros();
  renderWorkouts();
  renderGrocery();
  showScreen(active);
}

/* ---------------- Boot ---------------- */

function wireEvents(){
  // bottom nav
  document.querySelectorAll(".navItem").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.nav));
  });

  // dashboard
  $("btnSaveGoals").addEventListener("click", saveGoals);
  $("btnResetAll").addEventListener("click", resetAll);
  $("btnSample").addEventListener("click", loadSample);
  $("btnExport").addEventListener("click", exportData);

  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importDataFromFile(file);
    e.target.value = "";
  });

  // weight
  $("weightDate").value = todayISO();
  $("btnAddWeight").addEventListener("click", () => {
    const data = loadData();
    const date = $("weightDate").value || todayISO();
    const lbs = toFloat($("weightValue").value, NaN);
    if (!Number.isFinite(lbs) || lbs <= 0){
      setStatus("Enter a valid weight");
      return;
    }
    // overwrite same date
    const idx = data.weights.findIndex(x => x.date === date);
    const entry = { id: uid("w"), date, lbs };
    if (idx >= 0) data.weights[idx] = entry;
    else data.weights.push(entry);

    data.weights.sort((a,b)=>a.date.localeCompare(b.date));
    bumpStreak(data, date);
    saveData(data);

    $("weightValue").value = "";
    setStatus("Saved");
    renderWeights();
    renderDashboard();
  });

  $("btnClearWeights").addEventListener("click", () => {
    if (!confirm("Clear all weight entries?")) return;
    const data = loadData();
    data.weights = [];
    saveData(data);
    setStatus("Cleared");
    renderWeights();
    renderDashboard();
  });

  // macros
  $("macroDate").value = todayISO();
  $("btnAutoMacros").addEventListener("click", autoSetMacros);
  $("btnSaveMacros").addEventListener("click", saveMacros);
  $("btnClearMacros").addEventListener("click", clearMacrosThisWeek);

  $("btnAddTemplate").addEventListener("click", () => {
    const data = loadData();
    const name = $("tmplName").value.trim();
    if (!name){
      setStatus("Template needs a name");
      return;
    }
    const t = {
      id: uid("t"),
      name,
      cals: toInt($("tmplCals").value),
      p: toInt($("tmplP").value),
      c: toInt($("tmplC").value),
      f: toInt($("tmplF").value),
      ingredients: $("tmplIng").value.split(",").map(s=>s.trim()).filter(Boolean)
    };
    data.mealTemplates.unshift(t);
    saveData(data);

    $("tmplName").value = "";
    $("tmplCals").value = "";
    $("tmplP").value = "";
    $("tmplC").value = "";
    $("tmplF").value = "";
    $("tmplIng").value = "";

    setStatus("Template added");
    renderMacros();
    renderGrocery();
  });

  // workouts
  $("woDate").value = todayISO();
  seedExerciseRows([]);
  $("btnAddExercise").addEventListener("click", () => addExerciseRow());
  $("btnSaveWorkout").addEventListener("click", saveWorkout);
  document.querySelectorAll("[data-tmpl]").forEach(b => {
    b.addEventListener("click", () => loadWorkoutTemplate(b.dataset.tmpl));
  });

  // grocery
  $("btnAddGrocery").addEventListener("click", addGroceryItem);
  $("btnClearGrocery").addEventListener("click", () => {
    if (!confirm("Clear grocery list?")) return;
    const data = loadData();
    data.grocery = [];
    saveData(data);
    setStatus("Cleared");
    renderGrocery();
  });
}

function initPWAStatus(){
  const update = () => setStatus(navigator.onLine ? "Ready" : "Offline");
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

document.addEventListener("DOMContentLoaded", () => {
  initPWAStatus();
  wireEvents();
  renderAll();
  showScreen("dashboard");

  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  }
});