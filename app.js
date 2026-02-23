const STORAGE_KEY = "fittrack_weights_v1";

const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const historyEl = document.getElementById("history");
const statusEl = document.getElementById("status");

let chart; // Chart.js instance

function setStatus(msg) {
  statusEl.textContent = msg;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadWeights() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveWeights(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function sortByDateAsc(list) {
  return [...list].sort((a, b) => (a.date > b.date ? 1 : -1));
}

function renderHistory(list) {
  if (list.length === 0) {
    historyEl.innerHTML = `<div class="item"><small>No entries yet.</small></div>`;
    return;
  }

  // Newest first
  const newestFirst = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));

  historyEl.innerHTML = newestFirst
    .map((e, idx) => {
      const w = Number(e.weight).toFixed(1);
      return `
        <div class="item">
          <div>
            <div><strong>${e.date}</strong></div>
            <small>${w} lbs</small>
          </div>
          <button class="del" data-date="${e.date}" data-weight="${e.weight}">Delete</button>
        </div>
      `;
    })
    .join("");

  // Hook up delete buttons
  historyEl.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-date");
      const weight = btn.getAttribute("data-weight");
      deleteEntry(date, weight);
    });
  });
}

function renderChart(list) {
  const sorted = sortByDateAsc(list);

  const labels = sorted.map((e) => e.date);
  const data = sorted.map((e) => Number(e.weight));

  const ctx = document.getElementById("weightChart").getContext("2d");

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight (lbs)",
          data,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        x: { ticks: { maxRotation: 0 } }
      }
    }
  });
}

function addEntry() {
  const date = dateInput.value || todayISO();
  const weight = weightInput.value;

  if (!weight) {
    setStatus("Enter a weight first.");
    return;
  }

  const num = Number(weight);
  if (!Number.isFinite(num) || num <= 0) {
    setStatus("Weight must be a positive number.");
    return;
  }

  const list = loadWeights();
  list.push({ date, weight: num });

  saveWeights(list);
  weightInput.value = "";

  setStatus("Saved ✅");
  refreshUI();
}

function deleteEntry(date, weight) {
  const list = loadWeights();
  const w = Number(weight);

  // Remove only ONE matching entry (date + weight)
  const idx = list.findIndex((e) => e.date === date && Number(e.weight) === w);
  if (idx >= 0) list.splice(idx, 1);

  saveWeights(list);
  setStatus("Deleted");
  refreshUI();
}

function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
  setStatus("Cleared");
  refreshUI();
}

function refreshUI() {
  const list = loadWeights();
  renderHistory(list);
  renderChart(list);
}

// Init
dateInput.value = todayISO();
addBtn.addEventListener("click", addEntry);
clearBtn.addEventListener("click", clearAll);

refreshUI();
setStatus("Ready");