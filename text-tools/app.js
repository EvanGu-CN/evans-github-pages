'use strict';

const byId = (id) => document.getElementById(id);
const value = (id) => byId(id).value;
const utf8 = new TextEncoder();
const decodeUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const copyButtons = [...document.querySelectorAll('[data-copy]')];

function showStatus(id, message = '', isError = false) {
  byId(id).textContent = message;
  byId(id).toggleAttribute('data-error', isError);
}

function writeOutput(id, text) {
  byId(id).value = text;
  for (const button of copyButtons) {
    if (button.dataset.copy === id) button.disabled = text === '';
  }
}

for (const button of copyButtons) {
  button.addEventListener('click', async () => {
    const output = byId(button.dataset.copy);
    const status = button.closest('section').querySelector('.tool-status');
    try {
      await navigator.clipboard.writeText(output.value);
      showStatus(status.id, '已复制。');
    } catch {
      output.focus();
      output.select();
      showStatus(status.id, '已选中结果，请手动复制。', true);
    }
  });
}

const toolLinks = [...document.querySelectorAll('.tool-nav a')];
function selectTool(hash) {
  const selected = toolLinks.find((link) => link.hash === hash) || toolLinks[0];
  for (const link of toolLinks) {
    const active = link === selected;
    byId(link.hash.slice(1)).hidden = !active;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

for (const link of toolLinks) {
  link.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    selectTool(link.hash);
  });
}
window.addEventListener('hashchange', () => selectTool(location.hash));
selectTool(location.hash);

// Ignore results from an earlier operation after the input changes or a new one starts.
function bindTool(formId, statusId, outputIds, run) {
  let revision = 0;
  const form = byId(formId);

  function reset() {
    revision += 1;
    for (const id of outputIds) writeOutput(id, '');
    showStatus(statusId);
    return revision;
  }

  form.addEventListener('input', (event) => {
    if (!event.target.readOnly) reset();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = reset();
    try {
      const results = await run(event.submitter?.value);
      if (current !== revision) return;
      for (const [index, id] of outputIds.entries()) writeOutput(id, results[index]);
      showStatus(statusId, '已完成。');
    } catch (error) {
      if (current === revision) showStatus(statusId, error.message, true);
    }
  });
}

function diffLines(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function renderDiff(parts, original, modified, onlyChanges) {
  const fragment = document.createDocumentFragment();
  let left = 0;
  let right = 0;
  let removed = 0;
  let added = 0;

  function addCell(row, lines, index, state) {
    const cell = row.insertCell();
    if (index === null) {
      cell.className = 'empty-cell';
      return;
    }
    cell.className = state;
    const number = document.createElement('span');
    number.className = 'line-number';
    const marker = state === 'added' ? '+' : state === 'removed' ? '−' : '';
    number.textContent = marker + (index + 1);
    cell.append(number, lines[index]);
  }

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part.added && !part.removed) {
      if (!onlyChanges) {
        for (let offset = 0; offset < part.count; offset += 1) {
          const row = fragment.appendChild(document.createElement('tr'));
          addCell(row, original, left + offset, '');
          addCell(row, modified, right + offset, '');
        }
      }
      left += part.count;
      right += part.count;
      continue;
    }

    // JsDiff lists deletions before adjacent insertions. Align them side by side.
    const deletions = part.removed ? part.count : 0;
    let insertions = part.added ? part.count : 0;
    if (deletions && parts[index + 1]?.added) {
      insertions = parts[++index].count;
    }
    for (let offset = 0; offset < Math.max(deletions, insertions); offset += 1) {
      const row = fragment.appendChild(document.createElement('tr'));
      addCell(row, original, offset < deletions ? left + offset : null, 'removed');
      addCell(row, modified, offset < insertions ? right + offset : null, 'added');
    }
    left += deletions;
    right += insertions;
    removed += deletions;
    added += insertions;
  }

  byId('diff-body').replaceChildren(fragment);
  byId('diff-results').hidden = !byId('diff-body').children.length;
  return { added, removed };
}

function clearDiff() {
  showStatus('diff-status');
  byId('diff-body').replaceChildren();
  byId('diff-results').hidden = true;
}

byId('diff-form').addEventListener('input', clearDiff);
byId('diff-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearDiff();
  if (typeof Diff === 'undefined') {
    showStatus('diff-status', '对比组件加载失败，请刷新页面重试。', true);
    return;
  }
  const before = value('before');
  const after = value('after');
  const original = diffLines(before);
  const modified = diffLines(after);
  if (original.length > 5000 || modified.length > 5000) {
    showStatus('diff-status', '每侧最多可对比 5,000 行，请分段处理。', true);
    return;
  }
  const ignoreSpace = byId('ignore-space').checked;
  const options = { timeout: 450 };
  if (ignoreSpace) options.comparator = (left, right) => left.trim() === right.trim();
  const parts = Diff.diffArrays(original, modified, options);
  if (!parts) {
    showStatus('diff-status', '差异较多，请缩短文本或分段对比。', true);
    return;
  }
  const { added, removed } = renderDiff(parts, original, modified, byId('changes-only').checked);
  let message = added || removed ? '新增 ' + added + ' 行 · 删除 ' + removed + ' 行' : '未发现差异。';
  if (!ignoreSpace && before && after && before.endsWith('\n') !== after.endsWith('\n')) {
    if (!added && !removed) message = '行内容相同';
    message += before.endsWith('\n') ? ' · 修改后末行无换行' : ' · 修改后末行增加换行';
  }
  showStatus('diff-status', message);
});

function formatJson(text, indent) {
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error('JSON 无效。' + error.message);
  }
  // Format the tokens after validation to preserve large numbers and duplicate keys.
  const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:]+/g);
  if (!indent) return tokens.join('');

  let depth = 0;
  let previous = '';
  let size = 0;
  return tokens.map((token) => {
    const opens = token === '{' || token === '[';
    const closes = token === '}' || token === ']';
    const afterOpen = previous === '{' || previous === '[';
    if (closes) depth -= 1;
    let prefix = '';
    if (previous === ':') prefix = ' ';
    else if (previous === ',' || (afterOpen && !closes) || (closes && !afterOpen)) {
      prefix = '\n' + indent.repeat(depth);
    }
    if (opens) depth += 1;
    previous = token;
    size += prefix.length + token.length;
    if (size > 2_000_000) throw new Error('格式化后的 JSON 过长，请改用较少的缩进或分段处理。');
    return prefix + token;
  }).join('');
}

bindTool('json-form', 'json-status', ['json-output'], (action) => {
  const indent = value('indent') === 'tab' ? '\t' : ' '.repeat(Number(value('indent')));
  return [formatJson(value('json-input'), action === 'compact' ? '' : indent)];
});

function encodeBase64(text, urlSafe) {
  const bytes = utf8.encode(text);
  const chunks = [];
  for (let index = 0; index < bytes.length; index += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  }
  const encoded = btoa(chunks.join(''));
  return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded;
}

function decodeBase64(text, urlSafe) {
  const compact = text.replace(/[\t\n\f\r ]/g, '');
  const alphabet = urlSafe ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  if (!alphabet.test(compact)) throw new Error('输入包含当前 Base64 类型不支持的字符。');
  const standard = urlSafe ? compact.replace(/-/g, '+').replace(/_/g, '/') : compact;
  try {
    return decodeUtf8.decode(Uint8Array.from(atob(standard), (char) => char.charCodeAt(0)));
  } catch {
    throw new Error('输入不是有效的 Base64 编码，或解码后不是 UTF-8 文本。');
  }
}

bindTool('encoding-form', 'encoding-status', ['encoding-output'], (action) => {
  const input = value('encoding-input');
  const mode = value('encoding-mode');
  if (mode === 'url') {
    try {
      return [action === 'decode' ? decodeURIComponent(input) : encodeURIComponent(input)];
    } catch {
      throw new Error('URL 组件无法转换，请检查百分号转义或输入字符。');
    }
  }
  const urlSafe = mode === 'base64url';
  return [action === 'decode' ? decodeBase64(input, urlSafe) : encodeBase64(input, urlSafe)];
});

bindTool('hash-form', 'hash-status', ['md5-output', 'sha256-output', 'sha512-output'], async () => {
  if (!crypto.subtle) throw new Error('请通过 HTTPS 或 localhost 打开页面以计算哈希。');
  if (typeof md5 !== 'function') throw new Error('MD5 组件加载失败，请刷新页面重试。');
  const bytes = utf8.encode(value('hash-input'));
  const hashes = await Promise.all(['SHA-256', 'SHA-512'].map(async (algorithm) => {
    const digest = await crypto.subtle.digest(algorithm, bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }));
  return [md5(decodeUtf8.decode(bytes)), ...hashes];
});

byId('lines-input').addEventListener('input', () => {
  const input = value('lines-input');
  let chars = 0;
  for (const char of input) chars += 1;
  const lines = diffLines(input).length;
  byId('lines-stats').textContent = chars + ' 字符 · ' + lines + ' 行 · ' + utf8.encode(input).length + ' 字节';
});

bindTool('lines-form', 'lines-status', ['lines-output'], () => {
  const input = value('lines-input');
  const lines = diffLines(input);
  let result;
  switch (value('lines-mode')) {
    case 'upper': return [input.toUpperCase()];
    case 'lower': return [input.toLowerCase()];
    case 'sort': result = lines.sort(new Intl.Collator('zh-CN', { numeric: true }).compare); break;
    case 'trim': result = lines.map((line) => line.trim()); break;
    case 'blank': result = lines.filter((line) => line.trim()); break;
    default: result = [...new Set(lines)];
  }
  return [result.join('\n') + (result.length && input.endsWith('\n') ? '\n' : '')];
});

bindTool('uuid-form', 'uuid-status', ['uuid-output'], () => {
  if (!crypto.randomUUID) throw new Error('请通过 HTTPS 或 localhost 使用支持 UUID 的浏览器。');
  const count = Number(value('uuid-count'));
  return [Array.from({ length: count }, () => crypto.randomUUID()).join('\n')];
});

const timeOutputs = ['seconds-output', 'millis-output', 'utc-output', 'beijing-output', 'local-output'];
const beijingOffset = 8 * 60 * 60 * 1000;
const localTime = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  hourCycle: 'h23', timeZoneName: 'shortOffset',
});

function readEpoch() {
  const text = value('epoch-input').trim();
  if (value('epoch-unit') === 'milliseconds') {
    if (!/^[+-]?\d+$/.test(text)) throw new Error('请输入整数毫秒时间戳。');
    return Number(text);
  }
  const match = /^([+-]?)(\d+)(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) throw new Error('请输入秒时间戳，最多保留 3 位小数。');
  const millis = Number(match[2]) * 1000 + Number((match[3] || '').padEnd(3, '0'));
  return match[1] === '-' ? -millis : millis;
}

function readDate() {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/.exec(value('date-input').trim());
  if (!match) throw new Error('请按 YYYY-MM-DD HH:mm:ss 输入日期时间，可附带毫秒。');
  const iso = match[1] + 'T' + match[2] + '.' + (match[3] || '').padEnd(3, '0') + 'Z';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== iso) {
    throw new Error('日期时间无效，请检查日期、时间和闰年。');
  }
  return date.getTime() - (value('date-zone') === '8' ? beijingOffset : 0);
}

function secondsText(millis) {
  const absolute = Math.abs(millis);
  const seconds = Math.floor(absolute / 1000);
  const fraction = String(absolute % 1000).padStart(3, '0').replace(/0+$/, '');
  return (millis < 0 ? '-' : '') + seconds + (fraction ? '.' + fraction : '');
}

function displayTime(millis) {
  const utc = new Date(millis);
  const beijing = new Date(millis + beijingOffset);
  if (!Number.isSafeInteger(millis) || !Number.isFinite(beijing.getTime())
      || utc.getUTCFullYear() < 1 || beijing.getUTCFullYear() > 9999) {
    throw new Error('日期超出范围。UTC 与北京时间须位于公元 0001–9999 年。');
  }
  const beijingText = beijing.toISOString().slice(0, -1).replace('T', ' ') + ' UTC+08:00';
  const results = [secondsText(millis), String(millis), utc.toISOString(), beijingText, localTime.format(utc)];
  for (const [index, id] of timeOutputs.entries()) writeOutput(id, results[index]);
  showStatus('timestamp-status', '已转换。');
}

function clearTime() {
  for (const id of timeOutputs) writeOutput(id, '');
  showStatus('timestamp-status');
}

for (const id of ['epoch-form', 'date-form']) {
  byId(id).addEventListener('input', clearTime);
  byId(id).addEventListener('submit', (event) => {
    event.preventDefault();
    clearTime();
    try {
      if (event.submitter?.value === 'now') {
        const now = Date.now();
        byId('epoch-input').value = value('epoch-unit') === 'seconds' ? secondsText(now) : String(now);
        displayTime(now);
      } else {
        displayTime(id === 'epoch-form' ? readEpoch() : readDate());
      }
    } catch (error) {
      showStatus('timestamp-status', error.message, true);
    }
  });
}

for (const button of document.querySelectorAll('button[type="submit"]')) button.disabled = false;
