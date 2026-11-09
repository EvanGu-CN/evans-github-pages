const picker = document.querySelector("#files");
const pickButton = document.querySelector("#pick");
const dropZone = document.querySelector("#drop-zone");
const settings = document.querySelector("#settings");
const format = document.querySelector("#format");
const maxEdge = document.querySelector("#max-edge");
const quality = document.querySelector("#quality");
const qualityValue = document.querySelector("#quality-value");
const formatNote = document.querySelector("#format-note");
const compressButton = document.querySelector("#compress");
const clearButton = document.querySelector("#clear");
const results = document.querySelector("#results");
const empty = document.querySelector("#empty");
const count = document.querySelector("#count");
const status = document.querySelector("#status");

const maxFiles = 25;
const maxBytes = 30_000_000;
const extensions = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const formatNotes = {
  "image/webp": "WebP 保留透明背景。",
  "image/jpeg": "JPEG 会将透明背景填充为白色。",
  "image/png": "PNG 保留透明背景，仅调整尺寸。",
};

const entries = [];
let busy = false;
const idleMessage = "可一次处理最多 25 张图片。";

function formatBytes(bytes) {
  if (bytes < 1000) return bytes + " B";
  if (bytes < 1_000_000) return (bytes / 1000).toFixed(1) + " KB";
  return (bytes / 1_000_000).toFixed(2) + " MB";
}

function updateControls() {
  const hasImages = entries.length > 0;
  count.textContent = entries.length;
  empty.hidden = hasImages;
  results.hidden = !hasImages;
  pickButton.disabled = busy;
  clearButton.disabled = busy || !hasImages;
  compressButton.disabled = busy || !hasImages;
  compressButton.textContent = busy ? "正在压缩…" : "开始压缩";
  format.disabled = busy;
  maxEdge.disabled = busy;
  quality.disabled = busy || format.value === "image/png";
  for (const entry of entries) entry.removeButton.disabled = busy;
}

function updateSettings() {
  qualityValue.textContent = format.value === "image/png" ? "无损" : quality.value + "%";
  formatNote.textContent = formatNotes[format.value] + "长边超出上限时等比缩小。";
  if (entries.some((entry) => entry.outputUrl)) {
    status.textContent = "设置已更新，点击「开始压缩」生成新结果。";
  }
  updateControls();
}

function clearResult(entry) {
  if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl);
  entry.outputUrl = null;
  entry.download.hidden = true;
  entry.download.removeAttribute("href");
  entry.thumbnail.textContent = entry.suffix.toUpperCase();
  entry.detail.classList.remove("failed");
  entry.detail.textContent = formatBytes(entry.file.size) + " · 等待压缩";
}

function createEntry(file, suffix) {
  const row = document.createElement("li");
  row.className = "image-row";
  const thumbnail = document.createElement("div");
  thumbnail.className = "thumbnail";
  thumbnail.setAttribute("aria-hidden", "true");
  const info = document.createElement("div");
  const name = document.createElement("strong");
  name.className = "image-name";
  name.textContent = file.name;
  const detail = document.createElement("p");
  detail.className = "image-detail";
  info.append(name, detail);

  const actions = document.createElement("div");
  actions.className = "image-actions";
  const download = document.createElement("a");
  download.className = "button quiet";
  download.textContent = "下载";
  download.setAttribute("aria-label", "下载压缩后的 " + file.name);
  const removeButton = document.createElement("button");
  removeButton.className = "button remove";
  removeButton.type = "button";
  removeButton.textContent = "移除";
  removeButton.setAttribute("aria-label", "移除 " + file.name);
  actions.append(download, removeButton);
  row.append(thumbnail, info, actions);

  const entry = { file, suffix, thumbnail, detail, download, removeButton, outputUrl: null };
  removeButton.addEventListener("click", () => {
    clearResult(entry);
    entries.splice(entries.indexOf(entry), 1);
    row.remove();
    updateControls();
    status.textContent = entries.length ? "已移除 " + file.name + "。" : idleMessage;
    (entries[0]?.removeButton ?? pickButton).focus();
  });
  clearResult(entry);
  results.append(row);
  return entry;
}

function addFiles(files) {
  if (busy) return;
  let added = 0;
  let invalid = 0;
  let tooLarge = 0;
  let full = 0;
  for (const file of files) {
    const suffix = extensions[file.type] ?? file.name.match(/\.(jpe?g|png|webp)$/i)?.[1];
    if (!suffix || !file.size) {
      invalid++;
    } else if (file.size > maxBytes) {
      tooLarge++;
    } else if (entries.length >= maxFiles) {
      full++;
    } else {
      entries.push(createEntry(file, suffix));
      added++;
    }
  }
  const messages = [];
  if (added) messages.push(`已添加 ${added} 张，点击「开始压缩」处理列表中的图片`);
  if (invalid) messages.push(`${invalid} 个文件格式不支持或为空`);
  if (tooLarge) messages.push(`${tooLarge} 个文件超过 30 MB`);
  if (full) messages.push(`列表已满，${full} 个文件未添加`);
  if (messages.length) status.textContent = messages.join("。") + "。";
  updateControls();
}

async function encodeImage(file, options) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = sourceUrl;
    try {
      await image.decode();
    } catch {
      throw new Error("无法读取图片，文件可能已损坏。");
    }

    const originalWidth = image.naturalWidth;
    const originalHeight = image.naturalHeight;
    const scale = Math.min(1, options.maxEdge / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理这张图片。");
    if (options.format === "image/jpeg") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, options.format, options.quality));
    if (!blob?.size) throw new Error("图片编码失败。");
    if (blob.type !== options.format) throw new Error("浏览器不支持所选输出格式，请更换格式后重试。");
    return { blob, originalWidth, originalHeight, width, height };
  } finally {
    URL.revokeObjectURL(sourceUrl);
    image.removeAttribute("src");
    canvas.width = canvas.height = 0;
  }
}

function showResult(entry, result) {
  const { blob, originalWidth, originalHeight, width, height } = result;
  entry.outputUrl = URL.createObjectURL(blob);
  const preview = new Image();
  preview.alt = "";
  preview.loading = "lazy";
  preview.src = entry.outputUrl;
  entry.thumbnail.replaceChildren(preview);

  const delta = blob.size - entry.file.size;
  const percentage = (Math.abs(delta) / entry.file.size * 100).toFixed(1);
  const change = document.createElement("span");
  if (delta !== 0) {
    change.className = delta < 0 ? "smaller" : "larger";
    const direction = delta < 0 ? "减小" : "增大";
    change.textContent = percentage === "0.0" ? direction + "不到 0.1%" : direction + " " + percentage + "%";
  } else {
    change.textContent = "体积相同";
  }
  const dimensions = `${width} × ${height}`;
  const size = width === originalWidth && height === originalHeight
    ? dimensions
    : `${originalWidth} × ${originalHeight} → ${dimensions}`;
  entry.detail.replaceChildren(
    formatBytes(entry.file.size) + " → " + formatBytes(blob.size) + " · ",
    change,
    " · " + size + " px",
  );
  const base = entry.file.name.replace(/\.[^.]+$/, "") || "image";
  entry.download.download = base + "-compressed." + extensions[blob.type];
  entry.download.href = entry.outputUrl;
  entry.download.hidden = false;
}

settings.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !entries.length) return;
  const options = { format: format.value, maxEdge: Number(maxEdge.value), quality: Number(quality.value) / 100 };
  busy = true;
  updateControls();
  let succeeded = 0;
  try {
    for (const entry of entries) clearResult(entry);
    for (const [index, entry] of entries.entries()) {
      status.textContent = `正在处理第 ${index + 1} / ${entries.length} 张…`;
      try {
        showResult(entry, await encodeImage(entry.file, options));
        succeeded++;
      } catch (error) {
        entry.detail.textContent = formatBytes(entry.file.size) + " · " + error.message;
        entry.detail.classList.add("failed");
      }
    }
  } finally {
    busy = false;
    updateControls();
    const failed = entries.length - succeeded;
    status.textContent = failed
      ? `处理结束，已完成 ${succeeded} 张，${failed} 张失败。`
      : `已完成 ${succeeded} 张，可逐张下载。`;
  }
});

settings.addEventListener("input", updateSettings);
pickButton.addEventListener("click", () => picker.click());
picker.addEventListener("change", () => {
  addFiles(picker.files);
  picker.value = "";
});
clearButton.addEventListener("click", () => {
  for (const entry of entries) clearResult(entry);
  entries.length = 0;
  results.replaceChildren();
  status.textContent = idleMessage;
  updateControls();
  pickButton.focus();
});

window.addEventListener("dragover", (event) => {
  if (!event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  const overZone = !busy && dropZone.contains(event.target);
  event.dataTransfer.dropEffect = overZone ? "copy" : "none";
  dropZone.classList.toggle("is-dragging", overZone);
});
window.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget || !dropZone.contains(event.relatedTarget)) dropZone.classList.remove("is-dragging");
});
window.addEventListener("drop", (event) => {
  if (!event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  if (dropZone.contains(event.target)) addFiles(event.dataTransfer.files);
});

updateSettings();
