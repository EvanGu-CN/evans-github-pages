'use strict';

const byId = (id) => document.getElementById(id);
const input = byId('qr-input');
const canvas = byId('qr-canvas');
const png = byId('qr-png');
const svg = byId('qr-svg');
const status = byId('qr-status');
const utf8 = new TextEncoder();
const maxBytes = 2000;
const pixelsPerModule = 8;
const margin = pixelsPerModule * 4;
let qr = null;

qrcode.stringToBytes = (text) => utf8.encode(text);
byId('qr-generate').disabled = false;

function showStatus(message = '', isError = false) {
  status.textContent = message;
  status.toggleAttribute('data-error', isError);
}

function resetPreview() {
  qr = null;
  canvas.hidden = true;
  byId('qr-placeholder').hidden = false;
  png.disabled = true;
  svg.disabled = true;
  showStatus();
}

input.addEventListener('input', () => {
  resetPreview();
  const size = utf8.encode(input.value).length;
  byId('qr-count').textContent = size.toLocaleString('zh-CN') + ' / 2,000 字节';
  if (size > maxBytes) showStatus('内容超过 2,000 字节，请缩短后生成。', true);
});

byId('qr-form').addEventListener('submit', (event) => {
  event.preventDefault();
  resetPreview();
  if (utf8.encode(input.value).length > maxBytes) {
    showStatus('内容超过 2,000 字节，请缩短后生成。', true);
    return;
  }

  try {
    const code = qrcode(0, 'M');
    code.addData(input.value, 'Byte');
    code.make();

    const modules = code.getModuleCount();
    const size = modules * pixelsPerModule + 2 * margin;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (code.isDark(row, column)) {
          ctx.fillRect(margin + column * pixelsPerModule, margin + row * pixelsPerModule, pixelsPerModule, pixelsPerModule);
        }
      }
    }

    qr = code;
    canvas.hidden = false;
    byId('qr-placeholder').hidden = true;
    png.disabled = false;
    svg.disabled = false;
    showStatus('已生成二维码 · PNG ' + size + ' × ' + size + ' 像素');
  } catch {
    showStatus('生成失败，请缩短内容后重试。', true);
  }
});

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

png.addEventListener('click', () => {
  const current = qr;
  if (!current) return;
  canvas.toBlob((blob) => {
    if (current !== qr) return;
    if (blob) download(blob, 'qrcode.png');
    else showStatus('PNG 导出失败，请重试。', true);
  }, 'image/png');
});

svg.addEventListener('click', () => {
  if (!qr) return;
  const markup = qr.createSvgTag({ cellSize: pixelsPerModule, margin, title: '二维码' });
  download(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), 'qrcode.svg');
});
