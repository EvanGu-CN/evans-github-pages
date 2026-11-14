// Drive the CDP browser for native screenshots. Usage: node tools/cdp-screenshot.mjs <outPrefix> <evalJsFile>
const prefix = process.argv[2] || 'shot';
const evalFile = process.argv[3];
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = list.find(t => t.type === 'page') || await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
const url = process.env.SHOT_URL || 'http://127.0.0.1:8123/?debug';
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 30000)); // scene boot + stream-in
if (evalFile) {
  const js = (await import('node:fs')).readFileSync(evalFile, 'utf8');
  const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true });
  console.log('eval:', JSON.stringify(r.result?.value ?? r).slice(0, 400));
  await new Promise(r => setTimeout(r, 8000));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
(await import('node:fs')).writeFileSync(`.screenshots/${prefix}.png`, Buffer.from(shot.data, 'base64'));
console.log('saved', `.screenshots/${prefix}.png`);
ws.close();
process.exit(0);
