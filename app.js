/* Glen Track — vanilla JS, localStorage, lightweight SVG charts (no chart libs) */

const STORAGE_KEY = "glenTrackData_v1";

const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  const pill = $("statusPill");
  pill.textContent = msg;
}

function todayISO() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOff).toISOString().slice(0, 10);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { weights: [], macros: [], workouts: [] };
    const obj = JSON.parse(raw);
    return {
      weights: Array.isArray(obj.weights) ? obj.weights : [],
      macros: Array.isArray(obj.macros) ? obj.macros : [],
      workouts: Array.isArray(obj.workouts) ? obj.workouts : [],
    };
  } catch {
    return { weights: [], macros: [], workouts: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  // crypto.randomUUID is supported on modern iOS; fallback if needed.
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now();
}

function sortByDateAsc(list) {
  return [...list].sort((a, b) => (a.date > b.date ? 1 : -1));
}

function lastNDaysSet(n) {
  const s = new Set();
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tzOff = d.getTimezoneOffset() * 60000;
    s.add(new Date(d - tzOff).toISOString().slice(0, 10));
  }
  return s;
}

/* ---------- Lightweight SVG Charts ---------- */

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function renderLineChart(containerEl, series, opts = {}) {
  // series: [{name, points:[{xLabel, y}], stroke, fill?}]
  // opts: {height, yLabel?}
  const W = containerEl.clientWidth || 600;
  const H = opts.height || 170;
  const P = 14; // padding
  containerEl.innerHTML = "";

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img" });
  const bg = svgEl("rect", { x: 0, y: 0, width: W, height: H, rx: 16, fill: "transparent" });
  svg.appendChild(bg);

  // Collect x labels union (in order)
  const labels = [];
  const labelSet = new Set();
  series.forEach(s => {
    s.points.forEach(p => {
      if (!labelSet.has(p.xLabel)) {
        labelSet.add(p.xLabel);
        labels.push(p.xLabel);
      }
    });
  });

  const allY = series.flatMap(s => s.points.map(p => p.y)).filter(Number.isFinite);
  if (labels.length === 0 || allY.length === 0) {
    const t = svgEl("text", { x: 16, y: 28, fill: "rgba(255,255,255,.55)", "font-size": 13 });
    t.textContent = "No data yet";
    svg.appendChild(t);
    containerEl.appendChild(svg);
    return;
  }

  let yMin = Math.min(...allY);
  let yMax = Math.max(...allY);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }

  const plotX0 = P, plotY0 = P, plotX1 = W - P, plotY1 = H - P - 18;

  // Grid lines
  const grid = svgEl("g", {});
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = plotY0 + (i / gridLines) * (plotY1 - plotY0);
    grid.appendChild(svgEl("line", {
      x1: plotX0, y1: y, x2: plotX1, y2: y,
      stroke: "rgba(255,255,255,.08)",
      "stroke-width": 1
    }));
  }
  svg.appendChild(grid);

  function xFor(idx) {
    if (labels.length === 1) return (plotX0 + plotX1) / 2;
    return plotX0 + (idx / (labels.length - 1)) * (plotX1 - plotX0);
  }
  function yFor(val) {
    const t = (val - yMin) / (yMax - yMin);
    return plotY1 - t * (plotY1 - plotY0);
  }

  // Render each series
  series.forEach((s, si) => {
    const pts = s.points
      .map(p => ({ ...p, xi: labels.indexOf(p.xLabel) }))
      .filter(p => p.xi >= 0 && Number.isFinite(p.y))
      .sort((a, b) => a.xi - b.xi);

    if (pts.length === 0) return;

    let d = "";
    pts.forEach((p, i) => {
      const x = xFor(p.xi);
      const y = yFor(p.y);
      d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });

    const path = svgEl("path", {
      d,
      fill: "none",
      stroke: s.stroke || "rgba(90,167,255,.95)",
      "stroke-width": 2.6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.appendChild(path);

    // dots
    pts.forEach(p => {
      const x = xFor(p.xi);
      const y = yFor(p.y);
      svg.appendChild(svgEl("circle", {
        cx: x, cy: y, r: 3.4,
        fill: s.stroke || "rgba(90,167,255,.95)",
        stroke: "rgba(0,0,0,.25)",
        "stroke-width": 1
      }));
    });

    // Legend
    const lx = 16 + si * 140;
    const ly = H - 10;
    const legend = svgEl("g", {});
    legend.appendChild(svgEl("rect", { x: lx, y: ly - 10, width: 10, height: 4, rx: 2, fill: s.stroke || "rgba(90,167,255,.95)" }));
    const lt = svgEl("text", { x: lx + 14, y: ly - 6, fill: "rgba(255,255,255,.65)", "font-size": 12 });
    lt.textContent = s.name || "Series";
    legend.appendChild(lt);
    svg.appendChild(legend);
  });

  containerEl.appendChild(svg);
}

/* ---------- Workout Templates ---------- */

const WORKOUT_TEMPLATES = {
  push: {
    name: "Push",
    exercises: [
      { name: "Bench Press", sets: 4, reps: 8, weight: 0 },
      { name: "Overhead Press", sets: 3, reps: 8, weight: 0 },
      { name: "Incline DB Press", sets: 3, reps: 10, weight: 0 },
      { name: "Triceps Pushdown", sets: 3, reps: 12, weight: 0 },
    ],
  },
  pull: {
    name: "Pull",
    exercises: [
      { name: "Lat Pulldown", sets: 4, reps: 10, weight: 0 },
      { name: "Barbell Row", sets: 4, reps: 8, weight: 0 },
      { name: "Face Pull", sets: 3, reps: 12, weight: 0 },
      { name: "Biceps Curl", sets: 3, reps: 12, weight: 0 },
    ],
  },
  legs: {
    name: "Legs",
    exercises: [
      { name: "Squat", sets: 4, reps: 6, weight: 0 },
      { name: "Romanian Deadlift", sets: 3, reps: 8, weight: 0 },
      { name: "Leg Press", sets: 3, reps: 12, weight: 0 },
      { name: "Calf Raise", sets: 4, reps: 12, weight: 0 },
    ],
  },
};

let draftWorkout = {
  date: todayISO(),
  name: "Workout",
  template: "custom",
  exercises: []
};

/* ---------- UI: Navigation ---------- */

function go(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $("page-" + page).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-btn[data-go="${page}"]`)?.classList.add("active");

  setStatus("Ready");
}

function setupNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => go(btn.dataset.go));
  });
}

/* ---------- WEIGHTS ---------- */

function upsertWeight(date, weight) {
  const data = loadData();
  const idx = data.weights.findIndex(x => x.date === date);
  if (idx >= 0) data.weights[idx] = { ...data.weights[idx], weight };
  else data.weights.push({ id: uid(), date, weight });
  saveData(data);
}

function deleteWeight(id) {
  const data = loadData();
  data.weights = data.weights.filter(w => w.id !== id);
  saveData(data);
}

function clearWeights() {
  const data = loadData();
  data.weights = [];
  saveData(data);
}

function renderWeights() {
  const data = loadData();
  const list = sortByDateAsc(data.weights);
  $("weightCount").textContent = `${list.length} entr${list.length === 1 ? "y" : "ies"}`;

  const box = $("weightList");
  box.innerHTML = "";

  if (list.length === 0) {
    box.innerHTML = `<div class="item"><div class="left"><div class="item-title">No entries yet</div><div class="item-sub">Log a weight and you’ll see history here.</div></div></div>`;
  } else {
    const newestFirst = [...list].sort((a,b) => (a.date < b.date ? 1 : -1));
    newestFirst.forEach(w => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="left">
          <div class="item-title">${w.date}</div>
          <div class="item-sub">${Number(w.weight).toFixed(1)} lbs</div>
        </div>
        <div class="item-actions">
          <button class="small-btn danger" type="button">Delete</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        if (!confirm("Delete this weight entry?")) return;
        deleteWeight(w.id);
        renderAll();
        setStatus("Deleted ✅");
      });
      box.appendChild(el);
    });
  }

  // Weight chart (all entries)
  const points = sortByDateAsc(data.weights)
    .map(w => ({ xLabel: w.date, y: Number(w.weight) }))
    .filter(p => Number.isFinite(p.y));

  renderLineChart($("weightChart"), [{
    name: "Weight (lbs)",
    points: points,
    stroke: "rgba(90,167,255,.95)"
  }], { height: 190 });

  // Dashboard mini chart last 30
  const last30 = points.slice(-30);
  renderLineChart($("dashWeightChart"), [{
    name: "Weight",
    points: last30,
    stroke: "rgba(90,167,255,.95)"
  }], { height: 190 });
}

/* ---------- MACROS ---------- */

function upsertMacros(date, macros) {
  const data = loadData();
  const idx = data.macros.findIndex(x => x.date === date);
  const entry = { id: idx >= 0 ? data.macros[idx].id : uid(), date, ...macros };
  if (idx >= 0) data.macros[idx] = entry;
  else data.macros.push(entry);
  saveData(data);
}

function deleteMacros(id) {
  const data = loadData();
  data.macros = data.macros.filter(m => m.id !== id);
  saveData(data);
}

function clearMacros() {
  const data = loadData();
  data.macros = [];
  saveData(data);
}

function renderMacros() {
  const data = loadData();
  const list = sortByDateAsc(data.macros);
  $("macroCount").textContent = `${list.length} entr${list.length === 1 ? "y" : "ies"}`;

  const box = $("macroList");
  box.innerHTML = "";

  if (list.length === 0) {
    box.innerHTML = `<div class="item"><div class="left"><div class="item-title">No entries yet</div><div class="item-sub">Log calories + protein/carbs/fat.</div></div></div>`;
  } else {
    const newestFirst = [...list].sort((a,b) => (a.date < b.date ? 1 : -1));
    newestFirst.forEach(m => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="left">
          <div class="item-title">${m.date}</div>
          <div class="item-sub">${m.calories} cal • P ${m.protein} • C ${m.carbs} • F ${m.fat}</div>
        </div>
        <div class="item-actions">
          <button class="small-btn danger" type="button">Delete</button>
        </div>
      `;
      el.querySelector("button").addEventListener("click", () => {
        if (!confirm("Delete this macros entry?")) return;
        deleteMacros(m.id);
        renderAll();
        setStatus("Deleted ✅");
      });
      box.appendChild(el);
    });
  }

  // Macros chart (all): calories + protein
  const pointsCal = sortByDateAsc(data.macros).map(m => ({ xLabel: m.date, y: Number(m.calories) })).filter(p => Number.isFinite(p.y));
  const pointsPro = sortByDateAsc(data.macros).map(m => ({ xLabel: m.date, y: Number(m.protein) })).filter(p => Number.isFinite(p.y));

  renderLineChart($("macroChart"), [
    { name: "Calories", points: pointsCal, stroke: "rgba(123,240,201,.92)" },
    { name: "Protein", points: pointsPro, stroke: "rgba(90,167,255,.92)" },
  ], { height: 200 });

  // Dashboard last 14 days
  renderLineChart($("dashMacroChart"), [
    { name: "Calories", points: pointsCal.slice(-14), stroke: "rgba(123,240,201,.92)" },
    { name: "Protein", points: pointsPro.slice(-14), stroke: "rgba(90,167,255,.92)" },
  ], { height: 210 });
}

/* ---------- WORKOUTS ---------- */

function workoutVolume(workout) {
  // sum(sets*reps*weight) for each exercise where weight is finite and > 0
  let total = 0;
  workout.exercises.forEach(ex => {
    const sets = Number(ex.sets);
    const reps = Number(ex.reps);
    const wt = Number(ex.weight);
    if (Number.isFinite(sets) && Number.isFinite(reps) && Number.isFinite(wt) && wt > 0) {
      total += sets * reps * wt;
    }
  });
  return total;
}

function saveWorkout(workout) {
  const data = loadData();
  data.workouts.push(workout);
  saveData(data);
}

function deleteWorkout(id) {
  const data = loadData();
  data.workouts = data.workouts.filter(w => w.id !== id);
  saveData(data);
}

function clearWorkouts() {
  const data = loadData();
  data.workouts = [];
  saveData(data);
}

function renderWorkoutEditor() {
  const box = $("exerciseEditor");
  box.innerHTML = "";

  if (!draftWorkout.exercises.length) {
    box.innerHTML = `<div class="item"><div class="left"><div class="item-title">No exercises yet</div><div class="item-sub">Use Auto-fill or + Add Exercise.</div></div></div>`;
    return;
  }

  draftWorkout.exercises.forEach((ex, idx) => {
    const row = document.createElement("div");
    row.className = "ex-row";
    row.innerHTML = `
      <label class="field wide">
        <span>Exercise</span>
        <input class="xsmall" type="text" value="${escapeHtml(ex.name)}" data-k="name" data-i="${idx}">
      </label>

      <label class="field">
        <span>Sets</span>
        <input class="xsmall" type="number" inputmode="numeric" pattern="[0-9]*" value="${ex.sets ?? ""}" data-k="sets" data-i="${idx}">
      </label>

      <label class="field">
        <span>Reps</span>
        <input class="xsmall" type="number" inputmode="numeric" pattern="[0-9]*" value="${ex.reps ?? ""}" data-k="reps" data-i="${idx}">
      </label>

      <label class="field">
        <span>Weight</span>
        <input class="xsmall" type="number" inputmode="decimal" pattern="[0-9]*" step="0.5" value="${ex.weight ?? ""}" data-k="weight" data-i="${idx}">
      </label>

      <button class="small-btn danger remove" type="button" data-remove="${idx}">Remove</button>
    `;

    row.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        const k = inp.dataset.k;
        if (k === "name") draftWorkout.exercises[i].name = inp.value;
        else draftWorkout.exercises[i][k] = inp.value === "" ? "" : Number(inp.value);
      });
    });

    row.querySelector("button[data-remove]")?.addEventListener("click", () => {
      draftWorkout.exercises.splice(idx, 1);
      renderWorkoutEditor();
      setStatus("Removed");
    });

    box.appendChild(row);
  });
}

function renderWorkouts() {
  const data = loadData();
  const list = [...data.workouts].sort((a,b) => (a.date < b.date ? 1 : -1));
  $("workoutCount").textContent = `${list.length} workout${list.length === 1 ? "" : "s"}`;

  const box = $("workoutList");
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<div class="item"><div class="left"><div class="item-title">No workouts yet</div><div class="item-sub">Save a workout to build a history.</div></div></div>`;
    return;
  }

  list.forEach(w => {
    const vol = workoutVolume(w);
    const exCount = w.exercises?.length ?? 0;

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="left">
        <div class="item-title">${escapeHtml(w.date)} — ${escapeHtml(w.name || "Workout")}</div>
        <div class="item-sub">${exCount} exercises • Volume: ${Math.round(vol).toLocaleString()}</div>
      </div>
      <div class="item-actions">
        <button class="small-btn" type="button" data-view="${w.id}">View</button>
        <button class="small-btn danger" type="button" data-del="${w.id}">Delete</button>
      </div>
    `;

    el.querySelector("[data-del]")?.addEventListener("click", () => {
      if (!confirm("Delete this workout?")) return;
      deleteWorkout(w.id);
      renderAll();
      setStatus("Deleted ✅");
    });

    el.querySelector("[data-view]")?.addEventListener("click", () => {
      // Show a quick alert with details (simple, fast, mobile-friendly)
      const lines = (w.exercises || []).map(ex => {
        const s = ex.sets ?? "";
        const r = ex.reps ?? "";
        const wt = ex.weight ?? "";
        return `• ${ex.name} — ${s}x${r} @ ${wt}`;
      });
      alert(`${w.date} — ${w.name}\n\n${lines.join("\n")}`);
    });

    box.appendChild(el);
  });
}

/* ---------- DASHBOARD ---------- */

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a,b) => a + b, 0) / nums.length;
}

function renderDashboard() {
  const data = loadData();
  const last7 = lastNDaysSet(7);

  const weights7 = data.weights.filter(w => last7.has(w.date)).map(w => Number(w.weight)).filter(Number.isFinite);
  const macros7 = data.macros.filter(m => last7.has(m.date));
  const calories7 = macros7.map(m => Number(m.calories)).filter(Number.isFinite);
  const protein7 = macros7.map(m => Number(m.protein)).filter(Number.isFinite);

  const workouts7 = data.workouts.filter(w => last7.has(w.date));
  const workoutCount = workouts7.length;
  const volume7 = workouts7.reduce((sum, w) => sum + workoutVolume(w), 0);

  // Latest weight
  const weightsSorted = sortByDateAsc(data.weights);
  if (weightsSorted.length) {
    const latest = weightsSorted[weightsSorted.length - 1];
    $("statLatestWeight").textContent = `${Number(latest.weight).toFixed(1)} lbs`;
    $("statLatestWeightFoot").textContent = `Logged: ${latest.date}`;
  } else {
    $("statLatestWeight").textContent = "—";
    $("statLatestWeightFoot").textContent = "No weigh-ins yet";
  }

  const aW = avg(weights7);
  $("statAvgWeight").textContent = aW == null ? "—" : `${aW.toFixed(1)}`;

  // Weight delta (start vs end in last 7, if available)
  const weights7Sorted = sortByDateAsc(data.weights.filter(w => last7.has(w.date)));
  if (weights7Sorted.length >= 2) {
    const start = Number(weights7Sorted[0].weight);
    const end = Number(weights7Sorted[weights7Sorted.length - 1].weight);
    const delta = end - start;
    const sign = delta > 0 ? "+" : "";
    $("statWeightDelta").textContent = `Δ 7d: ${sign}${delta.toFixed(1)} lbs`;
  } else {
    $("statWeightDelta").textContent = "Δ 7d: —";
  }

  const aC = avg(calories7);
  $("statAvgCalories").textContent = aC == null ? "—" : `${Math.round(aC)}`;
  const aP = avg(protein7);
  $("statAvgProtein").textContent = aP == null ? "Avg Protein: —" : `Avg Protein: ${Math.round(aP)}g`;

  $("statWorkoutCount").textContent = `${workoutCount}`;
  $("statWorkoutVolume").textContent = workoutCount ? `7d Volume: ${Math.round(volume7).toLocaleString()}` : "7d Volume: —";
}

/* ---------- Utilities ---------- */

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Wiring ---------- */

function bindWeight() {
  $("weightDate").value = todayISO();

  $("btnSaveWeight").addEventListener("click", () => {
    const date = $("weightDate").value || todayISO();
    const weight = safeNum($("weightValue").value);
    if (weight == null || weight <= 0) return setStatus("Enter a valid weight");
    upsertWeight(date, Number(weight.toFixed(1)));
    $("weightValue").value = "";
    renderAll();
    setStatus("Saved ✅");
  });

  $("btnClearWeights").addEventListener("click", () => {
    if (!confirm("Clear ALL weight entries?")) return;
    clearWeights();
    renderAll();
    setStatus("Cleared ✅");
  });
}

function bindMacros() {
  $("macroDate").value = todayISO();

  $("btnSaveMacros").addEventListener("click", () => {
    const date = $("macroDate").value || todayISO();

    const calories = safeNum($("macroCalories").value);
    const protein = safeNum($("macroProtein").value);
    const carbs = safeNum($("macroCarbs").value);
    const fat = safeNum($("macroFat").value);

    // allow zeros, but require all fields present
    if ([calories, protein, carbs, fat].some(v => v == null || v < 0)) {
      return setStatus("Fill macros with valid numbers");
    }

    upsertMacros(date, {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    });

    $("macroCalories").value = "";
    $("macroProtein").value = "";
    $("macroCarbs").value = "";
    $("macroFat").value = "";

    renderAll();
    setStatus("Saved ✅");
  });

  $("btnClearMacros").addEventListener("click", () => {
    if (!confirm("Clear ALL macros entries?")) return;
    clearMacros();
    renderAll();
    setStatus("Cleared ✅");
  });
}

function bindWorkouts() {
  $("workoutDate").value = todayISO();
  $("workoutName").value = "Workout";
  $("workoutTemplate").value = "custom";

  function syncDraftFromHeader() {
    draftWorkout.date = $("workoutDate").value || todayISO();
    draftWorkout.name = ($("workoutName").value || "Workout").trim() || "Workout";
    draftWorkout.template = $("workoutTemplate").value || "custom";
  }

  $("btnApplyTemplate").addEventListener("click", () => {
    syncDraftFromHeader();
    const key = draftWorkout.template;
    if (key === "custom" || !WORKOUT_TEMPLATES[key]) {
      return setStatus("Choose Push/Pull/Legs first");
    }
    const t = WORKOUT_TEMPLATES[key];
    draftWorkout.name = t.name;
    $("workoutName").value = t.name;
    draftWorkout.exercises = t.exercises.map(ex => ({ ...ex }));
    renderWorkoutEditor();
    setStatus("Template loaded ✅");
  });

  $("btnAddExercise").addEventListener("click", () => {
    draftWorkout.exercises.push({ name: "New Exercise", sets: 3, reps: 10, weight: 0 });
    renderWorkoutEditor();
    setStatus("Added");
  });

  $("btnSaveWorkout").addEventListener("click", () => {
    syncDraftFromHeader();
    if (!draftWorkout.exercises.length) return setStatus("Add exercises first");

    // Validate: must have exercise names, sets/reps >=0
    for (const ex of draftWorkout.exercises) {
      if (!String(ex.name || "").trim()) return setStatus("Exercise name missing");
      const s = safeNum(ex.sets); const r = safeNum(ex.reps); const w = safeNum(ex.weight);
      if (s == null || s < 0 || r == null || r < 0 || w == null || w < 0) return setStatus("Fix exercise numbers");
    }

    const workout = {
      id: uid(),
      date: draftWorkout.date,
      name: draftWorkout.name,
      template: draftWorkout.template,
      exercises: draftWorkout.exercises.map(ex => ({
        name: String(ex.name).trim(),
        sets: Number(ex.sets),
        reps: Number(ex.reps),
        weight: Number(ex.weight),
      })),
      createdAt: new Date().toISOString(),
    };

    saveWorkout(workout);

    // Reset draft
    draftWorkout = { date: todayISO(), name: "Workout", template: "custom", exercises: [] };
    $("workoutDate").value = draftWorkout.date;
    $("workoutName").value = draftWorkout.name;
    $("workoutTemplate").value = draftWorkout.template;
    renderWorkoutEditor();

    renderAll();
    setStatus("Workout saved ✅");
  });

  $("btnClearWorkouts").addEventListener("click", () => {
    if (!confirm("Clear ALL workouts?")) return;
    clearWorkouts();
    renderAll();
    setStatus("Cleared ✅");
  });

  renderWorkoutEditor();
}

function renderAll() {
  renderWeights();
  renderMacros();
  renderWorkouts();
  renderDashboard();
}

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function init() {
  // Default dates
  $("weightDate").value = todayISO();
  $("macroDate").value = todayISO();
  $("workoutDate").value = todayISO();

  setupNav();
  bindWeight();
  bindMacros();
  bindWorkouts();

  renderAll();
  setupPWA();

  setStatus("Loaded ✅");
}

document.addEventListener("DOMContentLoaded", init);