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
  let snake, direction, turns, food, score, timer, over, time, game;
  function hud() {
    if (!game) return;
    game.stat("score", score);
    game.stat("length", snake.length);
    game.stat("speed", 1 + Math.floor(score / 50));
    game.stat("best", record.value);
  }
  function placeFood() {
    const empty = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (!snake.some((part) => part.x === x && part.y === y))
          empty.push({ x, y });
      }
    food = empty[Math.floor(Math.random() * empty.length)] || null;
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
    timer = 0;
    time = 0;
    over = false;
    placeFood();
    hud();
  }
  function step() {
    if (turns.length) direction = turns.shift();
    const v = vectors[direction];
    const head = { x: snake[0].x + v.x, y: snake[0].y + v.y };
    const eating = food && head.x === food.x && head.y === food.y;
    const body = eating ? snake : snake.slice(0, -1);
    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= size ||
      head.y >= size ||
      body.some((part) => part.x === head.x && part.y === head.y)
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
      record.save(score);
      game.effect("coin");
      placeFood();
      if (!food) {
        over = true;
        game.finish({
          tag: "PERFECT",
          title: "占满整个棋盘！",
          copy: `最终得分 ${score}，你完成了满屏挑战。`,
        });
      }
    } else snake.pop();
    hud();
  }
  function update(dt) {
    if (over) return;
    time += dt;
    for (const next of Object.keys(vectors)) {
      if (!game.pressed(next) || turns.length >= 2) continue;
      const current = vectors[turns.at(-1) || direction];
      const candidate = vectors[next];
      if (candidate.x === -current.x && candidate.y === -current.y) continue;
      if (next !== (turns.at(-1) || direction)) turns.push(next);
    }
    timer += dt;
    const interval = Math.max(0.065, 0.17 - Math.floor(score / 50) * 0.012);
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
    if (food) {
      const x = food.x * 20 + 10,
        y = food.y * 20 + 10;
      ctx.fillStyle = "#ffdc76";
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
