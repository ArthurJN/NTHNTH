const NOTES_URL = "/api/notes";
const SERVER_HINT = "Not saving to notes.json. Stop python3 -m http.server with Ctrl+C, then run: python3 server.py";
const statusEl = document.getElementById("save-status");

const lists = {
  need: document.querySelector('[data-list="need"]'),
  nice: document.querySelector('[data-list="nice"]'),
};

const modal = document.getElementById("note-modal");
const form = document.getElementById("note-form");
const titleInput = document.getElementById("note-title");
const bodyInput = document.getElementById("note-body");
const modalTitle = document.getElementById("modal-title");
const searchInput = document.getElementById("search");

const placeholder = document.createElement("div");
placeholder.className = "placeholder";

let notes = [];
let canSave = false;
let editingId = null;
let draggingId = null;
let lastAuthor = "Arthur";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function normalizeImportance(value) {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 5) return 3;
  return level;
}

function normalizeColumn(value) {
  return value === "nice" ? "nice" : "need";
}

function normalizeAuthor(value) {
  return value === "Alice" ? "Alice" : "Arthur";
}

function pipsHtml(level) {
  return Array.from({ length: 5 }, (_, index) => {
    const on = index < level ? " on" : "";
    return `<span class="pip${on}"></span>`;
  }).join("");
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function loadNotes() {
  const api = await fetch(NOTES_URL, { cache: "no-store" });
  if (api.ok) {
    const data = await api.json();
    if (!Array.isArray(data)) throw new Error("notes.json is not a list");
    canSave = true;
    return data.map(normalizeNote);
  }

  const file = await fetch("/notes.json", { cache: "no-store" });
  if (!file.ok) throw new Error("Could not load notes.json");
  const data = await file.json();
  if (!Array.isArray(data)) throw new Error("notes.json is not a list");
  canSave = false;
  return data.map(normalizeNote);
}

async function saveNotes() {
  if (!canSave) throw new Error("Save API is not available");
  const response = await fetch(NOTES_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notes, null, 2),
  });
  if (!response.ok) throw new Error("Could not save notes.json");
  setStatus("");
}

function persist() {
  return saveNotes().catch(() => {
    setStatus(SERVER_HINT);
  });
}

function normalizeNote(note) {
  return {
    ...note,
    importance: normalizeImportance(note.importance),
    author: normalizeAuthor(note.author),
  };
}

function notesIn(column) {
  return notes.filter((note) => note.column === column);
}

function render() {
  Object.entries(lists).forEach(([column, list]) => {
    list.replaceChildren();
    notesIn(column).forEach((note) => list.append(createCard(note)));
    document.querySelector(`[data-count="${column}"]`).textContent = notesIn(column).length;
  });
  applyFilter(searchInput.value);
}

function createCard(note) {
  const card = document.createElement("article");
  const author = normalizeAuthor(note.author);
  card.className = author === "Alice" ? "note alice" : "note";
  card.draggable = true;
  card.dataset.id = note.id;
  card.innerHTML = `
    <div class="note-top">
      <span class="grip" aria-hidden="true">⋮⋮</span>
      <h3></h3>
      <button class="icon-btn" type="button" data-edit title="Edit">Edit</button>
      <button class="icon-btn" type="button" data-delete title="Delete">✕</button>
    </div>
    ${note.body ? "<p></p>" : ""}
    <div class="note-meta">
      <span class="meta-left">
        <span class="chip ${note.column}">${note.column === "need" ? "Need" : "Nice"}</span>
        <span class="chip ${author.toLowerCase()}">${author}</span>
      </span>
      ${author === "Alice" ? `<span class="alice-garden" aria-hidden="true"><span>🌸</span><span>✿</span><span>🌷</span><span>🌼</span></span>` : ""}
      <span class="importance" data-level="${normalizeImportance(note.importance)}" title="Importance ${normalizeImportance(note.importance)} of 5">
        <span class="pips">${pipsHtml(normalizeImportance(note.importance))}</span>
        ${normalizeImportance(note.importance)}/5
      </span>
    </div>
  `;
  card.querySelector("h3").textContent = note.title;
  const body = card.querySelector("p");
  if (body) body.textContent = note.body;

  card.addEventListener("mousedown", (event) => {
    card.draggable = !event.target.closest("button");
  });
  card.addEventListener("dragstart", (event) => onDragStart(event, note.id));
  card.addEventListener("dragend", onDragEnd);

  card.querySelector("[data-edit]").addEventListener("click", () => openModal(note));
  card.querySelector("[data-delete]").addEventListener("click", () => {
    notes = notes.filter((item) => item.id !== note.id);
    persist();
    render();
  });
  return card;
}

function onDragStart(event, id) {
  draggingId = id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
  const card = event.currentTarget;
  requestAnimationFrame(() => {
    card.classList.add("dragging");
    card.after(placeholder);
  });
}

function onDragEnd() {
  draggingId = null;
  placeholder.remove();
  document.querySelectorAll(".column").forEach((column) => column.classList.remove("drop-target"));
  document.querySelectorAll(".note.dragging").forEach((card) => card.classList.remove("dragging"));
}

function placePlaceholder(event, column) {
  const list = column.querySelector(".card-list");
  const after = [...list.querySelectorAll(".note:not(.dragging)")].find((sibling) => {
    const box = sibling.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });
  if (after) list.insertBefore(placeholder, after);
  else list.append(placeholder);
}

function onColumnDragOver(event) {
  if (!draggingId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const column = event.currentTarget;
  document.querySelectorAll(".column").forEach((el) => el.classList.toggle("drop-target", el === column));
  placePlaceholder(event, column);
}

function onColumnDrop(event, columnEl = event.currentTarget) {
  event.preventDefault();
  event.stopPropagation();
  const id = event.dataTransfer.getData("text/plain") || draggingId;
  const column = columnEl?.dataset.column;
  if (!id || !column) return;

  placePlaceholder(event, columnEl);
  const beforeId = placeholder.nextElementSibling?.dataset.id ?? null;
  moveNote(id, column, beforeId);
  onDragEnd();
  persist();
  render();
}

function moveNote(id, column, beforeId) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  notes = notes.filter((item) => item.id !== id);
  note.column = column;

  if (!beforeId) {
    notes.push(note);
    return;
  }

  const index = notes.findIndex((item) => item.id === beforeId);
  if (index === -1) notes.push(note);
  else notes.splice(index, 0, note);
}

function openModal(note, column = "need") {
  editingId = note?.id ?? null;
  modalTitle.textContent = note ? "Edit note" : "New note";
  titleInput.value = note?.title ?? "";
  bodyInput.value = note?.body ?? "";
  const columnValue = normalizeColumn(note?.column ?? column);
  const columnRadio = form.querySelector(`input[name="column"][value="${columnValue}"]`);
  if (columnRadio) columnRadio.checked = true;
  const level = normalizeImportance(note?.importance ?? 3);
  const radio = form.querySelector(`input[name="importance"][value="${level}"]`);
  if (radio) radio.checked = true;
  const author = normalizeAuthor(note?.author ?? lastAuthor);
  const authorRadio = form.querySelector(`input[name="author"][value="${author}"]`);
  if (authorRadio) authorRadio.checked = true;
  syncAuthorSwitch(false);
  modal.showModal();
  titleInput.focus();
}

function closeModal() {
  editingId = null;
  form.reset();
  if (modal.open) modal.close();
}

function applyFilter(query) {
  const needle = query.trim().toLowerCase();
  document.querySelectorAll(".note").forEach((card) => {
    const note = notes.find((item) => item.id === card.dataset.id);
    if (!note) return;
    const haystack = `${note.title} ${note.body} ${note.author}`.toLowerCase();
    card.classList.toggle("hidden-by-filter", Boolean(needle) && !haystack.includes(needle));
  });
}

document.querySelectorAll(".column").forEach((column) => {
  column.addEventListener("dragover", onColumnDragOver);
  column.addEventListener("drop", onColumnDrop);
});

document.addEventListener("dragover", (event) => {
  if (!draggingId) return;
  const column = document.elementFromPoint(event.clientX, event.clientY)?.closest(".column");
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".column").forEach((el) => el.classList.toggle("drop-target", el === column));
  placePlaceholder(event, column);
});

document.addEventListener("drop", (event) => {
  if (!draggingId) return;
  const column = document.elementFromPoint(event.clientX, event.clientY)?.closest(".column");
  if (!column) return;
  onColumnDrop(event, column);
});

document.getElementById("new-note").addEventListener("click", () => openModal(null, "need"));
document.getElementById("cancel-note").addEventListener("click", closeModal);
document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => openModal(null, button.dataset.add));
});

document.querySelectorAll('input[name="author"]').forEach((input) => {
  input.addEventListener("change", () => {
    syncAuthorSwitch(input.value === "Alice");
  });
});

function syncAuthorSwitch(animate) {
  const switchEl = document.getElementById("author-switch");
  const burst = document.getElementById("alice-burst");
  const alice = form.querySelector('input[name="author"]:checked')?.value === "Alice";
  switchEl.classList.toggle("alice-selected", alice);
  modal.classList.toggle("alice-theme", alice);
  if (!alice) burst.replaceChildren();
  if (animate && alice) {
    bloomAlice(switchEl.querySelector('label:has(input[value="Alice"])') || switchEl);
  }
}

function bloomAlice(origin) {
  if (!origin) return;
  const layer = document.getElementById("alice-burst");
  layer.replaceChildren();
  const originRect = origin.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();
  const x = originRect.left + originRect.width / 2 - layerRect.left;
  const y = originRect.top + originRect.height / 2 - layerRect.top;
  const flowers = ["🌸", "✿", "🌺", "🌼", "🌷", "❀"];
  for (let i = 0; i < 18; i += 1) {
    const petal = document.createElement("span");
    petal.className = "alice-petal";
    petal.textContent = flowers[i % flowers.length];
    petal.style.left = `${x}px`;
    petal.style.top = `${y}px`;
    petal.style.setProperty("--dx", `${(Math.random() - 0.5) * 560}px`);
    petal.style.setProperty("--dy", `${(Math.random() - 0.72) * 480}px`);
    petal.style.setProperty("--rot", `${(Math.random() - 0.5) * 90}deg`);
    petal.style.setProperty("--delay", `${i * 18}ms`);
    layer.append(petal);
    setTimeout(() => petal.remove(), 1300);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const payload = {
    title: titleInput.value.trim(),
    body: bodyInput.value.trim(),
    column: normalizeColumn(form.querySelector('input[name="column"]:checked')?.value),
    importance: normalizeImportance(form.querySelector('input[name="importance"]:checked')?.value),
    author: normalizeAuthor(form.querySelector('input[name="author"]:checked')?.value),
  };
  if (!payload.title) return;
  lastAuthor = payload.author;

  if (editingId) {
    notes = notes.map((note) => (note.id === editingId ? { ...note, ...payload } : note));
  } else {
    notes.push({ id: uid(), ...payload });
  }
  persist();
  closeModal();
  render();
});

searchInput.addEventListener("input", (event) => applyFilter(event.target.value));
modal.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeModal();
});

async function init() {
  try {
    notes = await loadNotes();
    setStatus(canSave ? "" : SERVER_HINT);
  } catch {
    notes = [];
    setStatus(SERVER_HINT);
  }
  render();
}

init();
