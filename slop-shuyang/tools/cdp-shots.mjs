// Multiple CDP screenshots in one session. Steps JSON = [{prefix, js, waitMs}].
// Usage: node tools/cdp-shots.mjs [stepsFile] [url]
import { readFileSync, writeFileSync } from 'node:fs';
const stepsPath = process.argv[2] || '.screenshots/bayi-steps.json';
const startUrl = process.argv[3] || 'http://127.0.0.1:8123/?debug';
const steps = JSON.parse(readFileSync(stepsPath, 'utf8'));
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
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
await new Promise(r => setTimeout(r, 30000));
for (const step of steps) {
  const r = await send('Runtime.evaluate', { expression: step.js, awaitPromise: true });
  console.log(step.prefix, '→', JSON.stringify(r.result?.value ?? r).slice(0, 200));
  await new Promise(r => setTimeout(r, step.waitMs || 6000));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`.screenshots/${step.prefix}.png`, Buffer.from(shot.data, 'base64'));
  console.log('saved', step.prefix);
}
ws.close(); process.exit(0);
