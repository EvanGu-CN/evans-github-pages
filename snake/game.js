"use strict";
(() => {
  const size = 20;
  const vectors = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
  };
  const record = arcadeRecord("evans-arcade-snake-best");
  const gates = [{ x: 2, y: 4 }, { x: 17, y: 15 }];
  const walls = [];
  for (const x of [5, 14]) {
    for (let y = 3; y <= 16; y++) {
      if (y !== 6 && y !== 13) walls.push({ x, y });
    }
  }
  const modePicker = document.querySelector("[data-mode]");
  const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y;
  let snake, direction, turns, food, gold, eaten, mode, score, timer, over, time, game;
  const speedLevel = () => Math.min(7, Math.floor(eaten / 4));
  function hud() {
    if (!game) return;
    game.stat("score", score);
    game.stat("length", snake.length);
    game.stat("speed", 1 + speedLevel());
    game.stat("best", record.value);
    game.stat("mode", mode === "portal" ? "传送门场" : "障碍场");
    game.stat("gold", gold ? `金果 ${Math.ceil(gold.until - time)} 秒` : "");
  }
  function emptyCell() {
    const empty = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const cell = { x, y };
        if (!snake.some((part) => sameCell(part, cell)) &&
            !walls.some((wall) => sameCell(wall, cell)) &&
            !(mode === "portal" && gates.some((gate) => sameCell(gate, cell))) &&
            !sameCell(food, cell) && !sameCell(gold, cell)) empty.push(cell);
      }
    return empty[Math.floor(Math.random() * empty.length)] ?? null;
  }
  function reset() {
    snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    direction = "right";
    turns = [];
    score = 0;
    eaten = 0;
    mode = modePicker.value;
    gold = null;
    food = null;
    timer = 0;
    time = 0;
    over = false;
    food = emptyCell();
    hud();
  }
  function step() {
    if (turns.length) direction = turns.shift();
    const v = vectors[direction];
    const entry = { x: snake[0].x + v.x, y: snake[0].y + v.y };
    let head = entry;
    if (mode === "portal") {
      const gate = gates.findIndex((cell) => sameCell(head, cell));
      if (gate >= 0) {
        head = { ...gates[1 - gate] };
        game.effect("pop");
      }
    }
    const eating = sameCell(food, head);
    const bonus = sameCell(gold, head);
    const body = eating || bonus ? snake : snake.slice(0, -1);
    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= size ||
      head.y >= size ||
      walls.some((wall) => sameCell(wall, head)) ||
      body.some((part) => sameCell(part, head) || sameCell(part, entry))
    ) {
      over = true;
      game.effect("hit");
      game.finish({
        tag: "GAME OVER",
        title: "这次到这里",
        copy: `得分 ${score}，长度 ${snake.length}。再来挑战最高分。`,
      });
      return;
    }
    snake.unshift(head);
    if (eating) {
      score += 10;
      eaten++;
      game.effect("coin");
      food = null;
      food = emptyCell();
      if (!food && gold) {
        food = { x: gold.x, y: gold.y };
        gold = null;
      }
      if (eaten % 4 === 0) {
        const cell = emptyCell();
        if (cell) gold = { ...cell, until: time + 5 };
      }
      if (!food) {
        over = true;
        game.finish({
          tag: "PERFECT",
          title: "果实全部吃完！",
          copy: `最终得分 ${score}，长度 ${snake.length}。`,
        });
      }
    } else if (bonus) {
      gold = null;
      score += 25;
      game.effect("clear");
    } else snake.pop();
    record.save(score);
    hud();
  }
  function update(dt) {
    if (over) return;
    time += dt;
    if (gold && time >= gold.until) {
      gold = null;
      hud();
    }
    for (const next of Object.keys(vectors)) {
      if (!game.pressed(next) || turns.length >= 2) continue;
      const current = vectors[turns.at(-1) || direction];
      const candidate = vectors[next];
      if (candidate.x === -current.x && candidate.y === -current.y) continue;
      if (next !== (turns.at(-1) || direction)) turns.push(next);
    }
    timer += dt;
    const interval = Math.max(0.06, 0.145 - speedLevel() * 0.013);
    if (timer >= interval) {
      timer -= interval;
      step();
    }
  }
  function draw(ctx) {
    ctx.fillStyle = "#122b23";
    ctx.fillRect(0, 0, 400, 400);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#19372b" : "#1c3b2e";
        ctx.fillRect(x * 20, y * 20, 20, 20);
      }
    for (const wall of walls) {
      ctx.fillStyle = "#789397";
      ctx.fillRect(wall.x * 20 + 1, wall.y * 20 + 1, 18, 18);
      ctx.fillStyle = "#b3c4bb";
      ctx.fillRect(wall.x * 20 + 3, wall.y * 20 + 3, 14, 3);
    }
    if (mode === "portal") {
      for (const gate of gates) {
        ctx.strokeStyle = "#c2a6ff";
        ctx.lineWidth = 3;
        ctx.strokeRect(gate.x * 20 + 3, gate.y * 20 + 3, 14, 14);
      }
    }
    for (const fruit of [food, gold]) {
      if (!fruit) continue;
      const x = fruit.x * 20 + 10, y = fruit.y * 20 + 10;
      ctx.fillStyle = fruit === gold ? "#ff8c39" : "#ffdc76";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 ? 4 : 8 + Math.sin(time * 4) * 0.6;
        ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
    }
    snake.forEach((part, i) => {
      ctx.fillStyle = i === 0 ? "#d3f69d" : i % 2 ? "#9ad375" : "#8cc669";
      ctx.fillRect(part.x * 20 + 1, part.y * 20 + 1, 18, 18);
      ctx.fillStyle = "#ffffff24";
      ctx.fillRect(part.x * 20 + 3, part.y * 20 + 3, 14, 3);
    });
    const head = snake[0],
      v = vectors[direction];
    ctx.fillStyle = over ? "#a24d53" : "#254831";
    for (const sign of [-1, 1]) {
      ctx.fillRect(
        head.x * 20 + 8 + v.x * 4 - v.y * sign * 4,
        head.y * 20 + 8 + v.y * 4 + v.x * sign * 4,
        4,
        4,
      );
    }
    ctx.strokeStyle = "#7eaf624d";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 398, 398);
  }
  game = Arcade.mount({ keys: {}, reset, update, draw });
  hud();
})();
