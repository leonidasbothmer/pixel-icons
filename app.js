const MIN_SIZE = 2;
const MAX_SIZE = 256;

const GALLERY_COPY_SVG = `<svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="3" y="1" width="3" height="1" fill="currentColor"/>
  <rect x="1" y="2" width="3" height="1" fill="currentColor"/>
  <rect x="5" y="2" width="1" height="1" fill="currentColor"/>
  <rect x="1" y="3" width="1" height="1" fill="currentColor"/>
  <rect x="3" y="3" width="3" height="1" fill="currentColor"/>
  <rect x="1" y="4" width="1" height="1" fill="currentColor"/>
  <rect x="4" y="4" width="1" height="1" fill="currentColor"/>
  <rect x="1" y="5" width="4" height="1" fill="currentColor"/>
</svg>`;

const GALLERY_DOWNLOAD_SVG = `<svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="3" y="1" width="1" height="1" fill="currentColor"/>
  <rect x="3" y="2" width="1" height="1" fill="currentColor"/>
  <rect x="1" y="3" width="1" height="1" fill="currentColor"/>
  <rect x="3" y="3" width="1" height="1" fill="currentColor"/>
  <rect x="5" y="3" width="1" height="1" fill="currentColor"/>
  <rect x="2" y="4" width="3" height="1" fill="currentColor"/>
  <rect x="3" y="5" width="1" height="1" fill="currentColor"/>
</svg>`;

const GALLERY_X_SVG = `<svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="1" y="1" width="1" height="1" fill="currentColor"/>
  <rect x="5" y="1" width="1" height="1" fill="currentColor"/>
  <rect x="2" y="2" width="1" height="1" fill="currentColor"/>
  <rect x="4" y="2" width="1" height="1" fill="currentColor"/>
  <rect x="3" y="3" width="1" height="1" fill="currentColor"/>
  <rect x="2" y="4" width="1" height="1" fill="currentColor"/>
  <rect x="4" y="4" width="1" height="1" fill="currentColor"/>
  <rect x="1" y="5" width="1" height="1" fill="currentColor"/>
  <rect x="5" y="5" width="1" height="1" fill="currentColor"/>
</svg>`;

const sizeControl = document.querySelector(".size-control");
const sizeSelect = document.querySelector("#size");
const manualSize = document.querySelector("#manual-size");
const sizePair = document.querySelector("#size-pair");
const autoButton = document.querySelector("#auto");
const paintButton = document.querySelector("#paint");
const eraseButton = document.querySelector("#erase");
const clearButton = document.querySelector("#clear");
const viewport = document.querySelector("#viewport");
const guides = document.querySelector(".guides");
const marginGuide = document.querySelector("#margin");
const canvas = document.querySelector("#canvas");
const saveForm = document.querySelector("#save-form");
const nameInput = document.querySelector("#name");
const clearNameButton = document.querySelector("#clear-name");
const copyButton = document.querySelector("#copy");
const downloadButton = document.querySelector("#download");
const galleryList = document.querySelector("#gallery-list");
const galleryEmpty = document.querySelector("#gallery-empty");
const askDialog = document.querySelector("#ask");
const askText = document.querySelector("#ask-text");
const askConfirm = document.querySelector("#ask-confirm");

const state = {
  size: 16,
  pixels: new Uint8Array(16 * 16),
  tool: "auto",
  icons: [],
  pointer: null,
  stroke: null,
};

const view = { zoom: 1 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const mobileQuery = window.matchMedia("(max-width: 760px)");
const pointers = new Map();
let gesture = null;
let pinchStart = null;
let pendingCell = null;

function isMobile() {
  return mobileQuery.matches;
}

function metrics(size) {
  const target = isMobile() ? viewport.clientWidth || window.innerWidth : 576;
  const pitch = Math.max(4, Math.min(64, Math.round((target - 1) / size)));
  return { pitch, board: size * pitch + 1, inner: pitch - 1 };
}

function layoutFrame() {
  const { board } = metrics(state.size);
  if (isMobile()) {
    viewport.style.width = "100%";
    viewport.style.height = `${viewport.clientWidth}px`;
  } else {
    viewport.style.width = `${board}px`;
    viewport.style.height = `${board}px`;
  }

  const base = isMobile() ? viewport.clientWidth : board;
  const size = base * view.zoom;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const border = size / board;
  guides.style.top = `${border}px`;
  guides.style.right = `${border}px`;
  guides.style.bottom = `${border}px`;
  guides.style.left = `${border}px`;
}

function validSize(size) {
  return Number.isInteger(size) && size >= MIN_SIZE && size <= MAX_SIZE;
}

function syncSizeControls() {
  const value = String(state.size);
  const entry = sizeSelect.querySelector("[data-entry]");
  const listed = [...sizeSelect.options].some((option) => !option.dataset.custom && !option.dataset.entry && option.value === value);
  let custom = sizeSelect.querySelector("[data-custom]");
  if (listed) {
    custom?.remove();
  } else {
    if (!custom) {
      custom = document.createElement("option");
      custom.dataset.custom = "true";
      sizeSelect.insertBefore(custom, entry);
    }
    custom.value = value;
    custom.textContent = `${value}x${value}`;
  }
  if (!sizeControl.classList.contains("is-editing")) sizeSelect.value = value;
  manualSize.value = value;
}

function syncSizeHint() {
  const value = manualSize.value.trim();
  sizePair.textContent = value ? `x ${value}` : "";
  manualSize.style.width = `${Math.max(value.length, 1)}ch`;
}

function openSizeEntry() {
  sizeControl.classList.add("is-editing");
  manualSize.value = String(state.size);
  syncSizeHint();
  manualSize.focus();
  manualSize.select();
}

function closeSizeEntry() {
  sizeControl.classList.remove("is-editing");
  syncSizeControls();
}

function updateMargin(pitch, board) {
  const inset = Math.round(state.size / 8);
  if (inset < 1 || inset * 2 >= state.size) {
    marginGuide.setAttribute("width", "0");
    marginGuide.setAttribute("height", "0");
    return;
  }
  const toPercent = (boardX) => ((boardX - 1) / (board - 2)) * 100;
  const start = toPercent(inset * pitch);
  const end = toPercent((state.size - inset) * pitch);
  marginGuide.setAttribute("x", start);
  marginGuide.setAttribute("y", start);
  marginGuide.setAttribute("width", end - start);
  marginGuide.setAttribute("height", end - start);
}

function resetView() {
  view.zoom = 1;
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
}

function zoomAt(clientX, clientY, nextZoom) {
  const rect = viewport.getBoundingClientRect();
  const previous = view.zoom;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  if (next === previous) return;
  const anchorX = viewport.scrollLeft + (clientX - rect.left);
  const anchorY = viewport.scrollTop + (clientY - rect.top);
  const ratio = next / previous;
  view.zoom = next;
  layoutFrame();
  viewport.scrollLeft = anchorX * ratio - (clientX - rect.left);
  viewport.scrollTop = anchorY * ratio - (clientY - rect.top);
}

function canvasDirty() {
  for (let i = 0; i < state.pixels.length; i += 1) {
    if (state.pixels[i]) return true;
  }
  return false;
}

function hasWork() {
  return canvasDirty() || state.icons.length > 0;
}

function drawEditor() {
  if (isMobile()) {
    viewport.style.width = "100%";
    viewport.style.height = `${viewport.clientWidth || window.innerWidth}px`;
  }
  const { pitch, board, inner } = metrics(state.size);
  const dpr = window.devicePixelRatio || 1;
  const pixels = Math.round(board * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#d2d2cd";
  ctx.fillRect(0, 0, board, board);

  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const on = state.pixels[y * state.size + x] === 1;
      ctx.fillStyle = on ? "#111111" : "#ffffff";
      ctx.fillRect(x * pitch + 1, y * pitch + 1, inner, inner);
    }
  }

  updateMargin(pitch, board);
  layoutFrame();
}

function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const { pitch, board } = metrics(state.size);
  const localX = ((event.clientX - rect.left) / rect.width) * board;
  const localY = ((event.clientY - rect.top) / rect.height) * board;
  const x = Math.floor(localX / pitch);
  const y = Math.floor(localY / pitch);
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) return null;
  return { x, y };
}

function paintCell(x, y) {
  const index = y * state.size + x;
  if (state.pixels[index] === state.stroke) return false;
  state.pixels[index] = state.stroke;
  return true;
}

function strokeFrom(cell) {
  if (state.tool === "paint") return 1;
  if (state.tool === "erase") return 0;
  return state.pixels[cell.y * state.size + cell.x] ? 0 : 1;
}

function bresenham(x0, y0, x1, y1, plot) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;

  while (true) {
    plot(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function strokeTo(x, y) {
  let changed = false;
  const plot = (px, py) => {
    if (paintCell(px, py)) changed = true;
  };

  if (state.pointer) bresenham(state.pointer.x, state.pointer.y, x, y, plot);
  else plot(x, y);

  state.pointer = { x, y };
  if (changed) drawEditor();
}

function setTool(tool) {
  state.tool = tool;
  autoButton.setAttribute("aria-pressed", String(tool === "auto"));
  paintButton.setAttribute("aria-pressed", String(tool === "paint"));
  eraseButton.setAttribute("aria-pressed", String(tool === "erase"));
}

function ask(message, confirmLabel) {
  askText.textContent = message;
  askConfirm.textContent = confirmLabel;
  askDialog.showModal();
  return new Promise((resolve) => {
    askDialog.addEventListener(
      "close",
      () => resolve(askDialog.returnValue === "confirm"),
      { once: true },
    );
  });
}

function drawThumb(thumb, icon) {
  const box = 96;
  const dpr = window.devicePixelRatio || 1;
  thumb.width = Math.round(box * dpr);
  thumb.height = Math.round(box * dpr);
  const ctx = thumb.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const source = document.createElement("canvas");
  source.width = icon.size;
  source.height = icon.size;
  const image = source.getContext("2d").createImageData(icon.size, icon.size);
  for (let i = 0; i < icon.pixels.length; i += 1) {
    const value = icon.pixels[i] ? 17 : 255;
    const offset = i * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  source.getContext("2d").putImageData(image, 0, 0);
  ctx.drawImage(source, 0, 0, box, box);
}

function renderGallery() {
  galleryList.replaceChildren();
  galleryEmpty.hidden = state.icons.length > 0;

  for (const icon of state.icons) {
    const item = document.createElement("li");
    const figure = document.createElement("figure");
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "thumb";

    const thumb = document.createElement("canvas");
    thumb.setAttribute("aria-hidden", "true");

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "thumb-copy";
    copy.setAttribute("aria-label", `Copy ${icon.name}`);
    copy.innerHTML = GALLERY_COPY_SVG;
    copy.addEventListener("click", () => copySavedIcon(icon.id, copy));

    const download = document.createElement("button");
    download.type = "button";
    download.className = "export";
    download.setAttribute("aria-label", `Download ${icon.name}`);
    download.innerHTML = GALLERY_DOWNLOAD_SVG;
    download.addEventListener("click", () => exportIcon(icon.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "trash";
    remove.setAttribute("aria-label", `Delete ${icon.name}`);
    remove.innerHTML = GALLERY_X_SVG;
    remove.addEventListener("click", () => deleteIcon(icon.id));

    const caption = document.createElement("figcaption");
    const name = document.createElement("span");
    name.className = "icon-name";
    name.textContent = icon.name;
    name.title = icon.name;
    const size = document.createElement("span");
    size.className = "icon-size";
    size.textContent = String(icon.size);

    thumbWrap.append(thumb, copy, download, remove);
    caption.append(name, size);
    figure.append(thumbWrap, caption);
    item.append(figure);
    galleryList.append(item);
    drawThumb(thumb, icon);
  }
}

async function deleteIcon(id) {
  const icon = state.icons.find((entry) => entry.id === id);
  if (!icon) return;
  const confirmed = await ask(`Delete "${icon.name}"?`, "Delete");
  if (!confirmed) return;
  state.icons = state.icons.filter((entry) => entry.id !== id);
  renderGallery();
}

function saveIcon() {
  const typed = nameInput.value.trim();
  const name = typed || `Icon ${state.icons.length + 1}`;
  state.icons.push({
    id: crypto.randomUUID(),
    name,
    size: state.size,
    pixels: Array.from(state.pixels),
  });
  if (!typed) nameInput.value = name;
  renderGallery();
  galleryList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  nameInput.focus();
  nameInput.select();
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function slug(name, index) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `icon-${index + 1}`;
}

function iconRects(icon) {
  const rects = [];
  for (let y = 0; y < icon.size; y += 1) {
    let run = 0;
    for (let x = 0; x <= icon.size; x += 1) {
      const on = x < icon.size && icon.pixels[y * icon.size + x] === 1;
      if (on) {
        run += 1;
      } else if (run) {
        rects.push(`<rect x="${x - run}" y="${y}" width="${run}" height="1"/>`);
        run = 0;
      }
    }
  }
  return rects.join("");
}

function iconSvg(icon) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" viewBox="0 0 ${icon.size} ${icon.size}" fill="#111111" shape-rendering="crispEdges">\n<title>${escapeXml(icon.name)}</title>\n${iconRects(icon)}\n</svg>\n`;
}

function downloadSvg(filename, svg) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadEditor() {
  const name = nameInput.value.trim();
  if (!name) return;
  downloadSvg(`${slug(name, 0)}.svg`, iconSvg({
    name,
    size: state.size,
    pixels: state.pixels,
  }));
}

function exportIcon(id) {
  const icon = state.icons.find((entry) => entry.id === id);
  if (!icon) return;
  downloadSvg(`${slug(icon.name, 0)}.svg`, iconSvg(icon));
}

let galleryCopyTimer = 0;
let galleryCopyButton = null;

async function copySavedIcon(id, button) {
  const icon = state.icons.find((entry) => entry.id === id);
  if (!icon) return;
  await writeClipboard(iconSvg(icon));
  galleryCopyButton?.classList.remove("is-copied");
  button.classList.add("is-copied");
  galleryCopyButton = button;
  window.clearTimeout(galleryCopyTimer);
  galleryCopyTimer = window.setTimeout(() => {
    button.classList.remove("is-copied");
    if (galleryCopyButton === button) galleryCopyButton = null;
  }, 1200);
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

let copyTimer = 0;

async function copyEditor() {
  const name = nameInput.value.trim();
  if (!name) return;
  await writeClipboard(iconSvg({
    name,
    size: state.size,
    pixels: state.pixels,
  }));
  const copyLabel = copyButton.querySelector("span");
  copyLabel.textContent = "Copied";
  copyButton.classList.add("is-copied");
  copyButton.setAttribute("aria-label", "Copied");
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copyLabel.textContent = "Copy";
    copyButton.classList.remove("is-copied");
    copyButton.setAttribute("aria-label", "Copy");
  }, 1200);
}

function transformPixels(mapPoint) {
  const size = state.size;
  const next = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [nextX, nextY] = mapPoint(x, y, size);
      next[nextY * size + nextX] = state.pixels[y * size + x];
    }
  }
  state.pixels = next;
  drawEditor();
}

autoButton.addEventListener("click", () => setTool("auto"));
paintButton.addEventListener("click", () => setTool("paint"));
eraseButton.addEventListener("click", () => setTool("erase"));

document.querySelector("#rotate").addEventListener("click", () => {
  transformPixels((x, y, size) => [size - 1 - y, x]);
});

document.querySelector("#mirror-h").addEventListener("click", () => {
  transformPixels((x, y, size) => [size - 1 - x, y]);
});

document.querySelector("#mirror-v").addEventListener("click", () => {
  transformPixels((x, y, size) => [x, size - 1 - y]);
});

clearButton.addEventListener("click", async () => {
  if (!canvasDirty()) return;
  const confirmed = await ask("Clear the canvas?", "Clear");
  if (!confirmed) return;
  state.pixels.fill(0);
  drawEditor();
});

async function applySize(next) {
  if (!validSize(next) || next === state.size) {
    syncSizeControls();
    return;
  }
  if (canvasDirty()) {
    const confirmed = await ask("Changing the grid clears the canvas.", "Change");
    if (!confirmed) {
      syncSizeControls();
      return;
    }
  }
  state.size = next;
  state.pixels = new Uint8Array(next * next);
  state.pointer = null;
  state.stroke = null;
  resetView();
  syncSizeControls();
  drawEditor();
}

sizeSelect.addEventListener("change", () => {
  if (sizeSelect.selectedOptions[0]?.dataset.entry) {
    openSizeEntry();
    return;
  }
  applySize(Number(sizeSelect.value));
});

let committingSize = false;

async function commitSizeEntry() {
  const next = Number(manualSize.value);
  if (!validSize(next)) return;
  committingSize = true;
  await applySize(next);
  committingSize = false;
  closeSizeEntry();
}

manualSize.addEventListener("input", syncSizeHint);

manualSize.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSizeEntry();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  commitSizeEntry();
});

manualSize.addEventListener("blur", () => {
  if (committingSize) return;
  closeSizeEntry();
});

function pinchMetrics() {
  const points = [...pointers.values()];
  const dx = points[0].x - points[1].x;
  const dy = points[0].y - points[1].y;
  return {
    dist: Math.hypot(dx, dy) || 1,
    midX: (points[0].x + points[1].x) / 2,
    midY: (points[0].y + points[1].y) / 2,
  };
}

function applyPinch() {
  const now = pinchMetrics();
  const rect = viewport.getBoundingClientRect();
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStart.zoom * (now.dist / pinchStart.dist)));
  const ratio = next / pinchStart.zoom;
  const originX = pinchStart.scrollLeft + (pinchStart.midX - pinchStart.rectLeft);
  const originY = pinchStart.scrollTop + (pinchStart.midY - pinchStart.rectTop);
  view.zoom = next;
  layoutFrame();
  viewport.scrollLeft = originX * ratio - (now.midX - rect.left);
  viewport.scrollTop = originY * ratio - (now.midY - rect.top);
}

viewport.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    gesture = "pinch";
    pendingCell = null;
    state.pointer = null;
    state.stroke = null;
    const rect = viewport.getBoundingClientRect();
    const pinch = pinchMetrics();
    pinchStart = {
      ...pinch,
      zoom: view.zoom,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      rectLeft: rect.left,
      rectTop: rect.top,
    };
    return;
  }

  if (gesture === "pinch") return;
  gesture = "draw";
  event.preventDefault();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // The pointer can already be gone. Drawing still follows the move.
  }
  state.pointer = null;
  state.stroke = null;
  pendingCell = cellFromEvent(event);
});

viewport.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (gesture === "pinch") {
    if (pointers.size >= 2) applyPinch();
    return;
  }
  if (gesture !== "draw") return;
  const cell = cellFromEvent(event);
  if (!cell) return;
  if (pendingCell) {
    if (cell.x === pendingCell.x && cell.y === pendingCell.y) return;
    state.pointer = null;
    state.stroke = strokeFrom(pendingCell);
    strokeTo(pendingCell.x, pendingCell.y);
    pendingCell = null;
  }
  if (state.stroke === null) return;
  strokeTo(cell.x, cell.y);
});

function endPointer(event) {
  pointers.delete(event.pointerId);
  if (gesture === "pinch") {
    if (pointers.size === 0) {
      gesture = null;
      pinchStart = null;
      pendingCell = null;
    }
    return;
  }
  if (pendingCell && gesture === "draw") {
    state.pointer = null;
    state.stroke = strokeFrom(pendingCell);
    strokeTo(pendingCell.x, pendingCell.y);
    pendingCell = null;
  }
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  state.pointer = null;
  state.stroke = null;
  if (pointers.size === 0) gesture = null;
}

viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);
viewport.addEventListener("contextmenu", (event) => event.preventDefault());

viewport.addEventListener("wheel", (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  zoomAt(event.clientX, event.clientY, view.zoom * Math.exp(-delta * 0.0025));
}, { passive: false });

viewport.addEventListener("gesturestart", (event) => event.preventDefault());
viewport.addEventListener("gesturechange", (event) => event.preventDefault());

window.addEventListener("resize", () => drawEditor());
mobileQuery.addEventListener("change", () => {
  resetView();
  drawEditor();
});

saveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveIcon();
});

copyButton.addEventListener("click", () => {
  copyEditor();
});

downloadButton.addEventListener("click", downloadEditor);

function syncClearName() {
  clearNameButton.hidden = nameInput.value.length === 0;
  const unnamed = nameInput.value.trim().length === 0;
  copyButton.disabled = unnamed;
  downloadButton.disabled = unnamed;
}

clearNameButton.addEventListener("click", () => {
  nameInput.value = "";
  syncClearName();
  nameInput.focus();
});

nameInput.addEventListener("input", syncClearName);

window.addEventListener("beforeunload", (event) => {
  if (!hasWork()) return;
  event.preventDefault();
  event.returnValue = "";
});

const restoreKey = "pixel-icons-restore";
const restoreRaw = sessionStorage.getItem(restoreKey);
if (restoreRaw) {
  sessionStorage.removeItem(restoreKey);
  const restore = JSON.parse(restoreRaw);
  if (validSize(restore.size) && restore.pixels?.length === restore.size * restore.size) {
    state.size = restore.size;
    state.pixels = Uint8Array.from(restore.pixels);
  }
  if (Array.isArray(restore.icons)) {
    state.icons = restore.icons
      .filter((icon) => validSize(icon.size) && icon.pixels?.length === icon.size * icon.size)
      .map((icon) => ({
        id: crypto.randomUUID(),
        name: String(icon.name || "Icon"),
        size: icon.size,
        pixels: icon.pixels,
      }));
  }
  if (typeof restore.name === "string") nameInput.value = restore.name;
  if (restore.tool === "auto" || restore.tool === "paint" || restore.tool === "erase") setTool(restore.tool);
}

syncClearName();

syncSizeControls();
drawEditor();
renderGallery();
