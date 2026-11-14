// Single-shot CDP capture with screenshot retry (SwiftShader occasionally hangs).
// Usage: node tools/cdp-shot1.mjs <stepJsonFile> <url> [navWaitMs]
import { readFileSync, writeFileSync } from 'node:fs';
const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const step = Array.isArray(steps) ? steps[0] : steps;
const startUrl = process.argv[3] || 'http://127.0.0.1:8123/?debug';
const navWait = Number(process.argv[4] || 12000);
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  const timer = setTimeout(() => { pending.delete(mid); rej(new Error('cdp timeout ' + method)); }, 45000);
  pending.set(mid, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: startUrl });
// 轮询等待调试接口就绪（场景加载时间不定）
{
  const deadline = Date.now() + navWait + 40000;
  for (;;) {
    const r = await send('Runtime.evaluate', { expression: '!!(window.__debug && window.__debug.controllerManager)', returnByValue: true }).catch(() => null);
    if (r?.result?.value) break;
    if (Date.now() > deadline) { console.log('warn: __debug never ready'); break; }
    await new Promise(r => setTimeout(r, 1500));
  }
}
const r = await send('Runtime.evaluate', { expression: step.js, awaitPromise: true });
console.log(step.prefix, '→', JSON.stringify(r.result?.value ?? r).slice(0, 160));
await new Promise(r => setTimeout(r, step.waitMs || 5000));
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`.screenshots/${step.prefix}.jpg`, Buffer.from(shot.data, 'base64'));
    console.log('saved', step.prefix, 'attempt', attempt);
    break;
  } catch (e) {
    console.log('shot retry', attempt, e.message.slice(0, 60));
    await new Promise(r => setTimeout(r, 2000));
  }
}
ws.close(); process.exit(0);
