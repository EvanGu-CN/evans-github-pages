"use strict";
(() => {
  const shapes = [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [1, 1],
      [1, 1],
    ],
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  ];
  const colors = [
    "#6de1ed",
    "#7198ff",
    "#f5ae65",
    "#f6da7a",
    "#91db9d",
    "#cba0ff",
    "#f7839c",
  ];
  const record = arcadeRecord("evans-arcade-tetris-best");
  let board,
    piece,
    queue,
    bag,
    score,
    lines,
    gravityTime,
    lockTime,
    resets,
    repeatTime,
    previousMove,
    reserve,
    swapped,
    combo,
    backToBack,
    clearLabel,
    over,
    game;
  const level = () => 1 + Math.floor(lines / 10);

  function hud() {
    if (!game) return;
    game.stat("score", score);
    game.stat("lines", lines);
    game.stat("level", level());
    game.stat("best", record.value);
  }
  function nextType() {
    if (!bag.length) {
      bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }
  function fits(matrix, px, py) {
    return matrix.every((row, y) =>
      row.every(
        (cell, x) =>
          !cell ||
          (px + x >= 0 &&
            px + x < 10 &&
            py + y < 20 &&
            (py + y < 0 || !board[py + y][px + x])),
      ),
    );
  }
  function end() {
    over = true;
    game.finish({
      tag: "GAME OVER",
      title: "方块到顶了",
      copy: `得分 ${score}，共消除 ${lines} 行。`,
    });
  }
  function spawn(type = queue.shift()) {
    if (queue.length < 4) queue.push(nextType());
    piece = { type, matrix: shapes[type].map((row) => [...row]), x: 3, y: -1 };
    gravityTime = 0;
    lockTime = 0;
    resets = 0;
    if (!fits(piece.matrix, piece.x, piece.y)) end();
  }
  function reset() {
    board = Array.from({ length: 20 }, () => Array(10).fill(0));
    bag = [];
    queue = Array.from({ length: 4 }, nextType);
    score = 0;
    lines = 0;
    repeatTime = 0;
    previousMove = 0;
    over = false;
    reserve = null;
    swapped = false;
    combo = 0;
    backToBack = false;
    clearLabel = "";
    spawn();
    hud();
  }
  function move(dx) {
    if (!fits(piece.matrix, piece.x + dx, piece.y)) return;
    piece.x += dx;
    if (resets < 15) {
      lockTime = 0;
      resets++;
    }
  }
  function rotate(reverse) {
    const old = piece.matrix;
    const size = old.length;
    const rotated = old.map((row, y) =>
      row.map((_, x) =>
        reverse ? old[x][size - 1 - y] : old[size - 1 - x][y],
      ),
    );
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, -1],
      [0, -2],
    ]) {
      if (!fits(rotated, piece.x + dx, piece.y + dy)) continue;
      piece.matrix = rotated;
      piece.x += dx;
      piece.y += dy;
      if (resets < 15) {
        lockTime = 0;
        resets++;
      }
      game.effect("pop");
      break;
    }
  }
  function lock() {
    if (
      piece.matrix.some((row, y) => row.some((cell) => cell && piece.y + y < 0))
    ) {
      end();
      return;
    }
    piece.matrix.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell) board[piece.y + y][piece.x + x] = piece.type + 1;
      }),
    );
    const remaining = board.filter((row) => row.some((cell) => cell === 0));
    const cleared = 20 - remaining.length;
    combo = cleared ? combo + 1 : 0;
    const quadBonus = cleared === 4 && backToBack;
    if (cleared) backToBack = cleared === 4;
    score += ([0, 100, 300, 500, 800][cleared] + (quadBonus ? 400 : 0) + Math.max(0, combo - 1) * 50) * level();
    clearLabel = quadBonus ? "连续四消！" : cleared === 4 ? "四行消除！" : combo > 1 ? `${combo} 连消` : "";
    lines += cleared;
    board = [
      ...Array.from({ length: cleared }, () => Array(10).fill(0)),
      ...remaining,
    ];
    record.save(score);
    game.effect(cleared ? "clear" : "pop");
    swapped = false;
    spawn();
    hud();
  }
  function update(dt) {
    if (over) return;
    if (game.pressed("hold") && !swapped) {
      const previous = reserve;
      reserve = piece.type;
      swapped = true;
      spawn(previous ?? undefined);
      return;
    }
    const dx = Number(game.held("right")) - Number(game.held("left"));
    if (game.pressed("left")) move(-1);
    if (game.pressed("right")) move(1);
    if (dx !== previousMove) {
      repeatTime = 0.2;
      previousMove = dx;
    }
    if (dx) {
      repeatTime -= dt;
      if (repeatTime <= 0) {
        move(dx);
        repeatTime = 0.065;
      }
    }
    if (game.pressed("rotate")) rotate(false);
    if (game.pressed("reverse")) rotate(true);
    if (game.pressed("drop")) {
      while (fits(piece.matrix, piece.x, piece.y + 1)) {
        piece.y++;
        score += 2;
      }
      lock();
      return;
    }
    gravityTime += dt;
    const interval = game.held("down")
      ? 0.04
      : Math.max(0.07, 0.75 * 0.82 ** (level() - 1));
    if (gravityTime >= interval) {
      gravityTime = 0;
      if (fits(piece.matrix, piece.x, piece.y + 1)) {
        piece.y++;
        lockTime = 0;
        if (game.held("down")) score++;
      }
    }
    if (!fits(piece.matrix, piece.x, piece.y + 1)) {
      lockTime += dt;
      if (lockTime >= 0.45) lock();
    }
    record.save(score);
    hud();
  }
  function cell(ctx, x, y, size, color, ghost = false) {
    ctx.fillStyle = color;
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 3, y + 3, size - 6, size - 6);
      return;
    }
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = "#ffffff55";
    ctx.fillRect(x + 3, y + 3, size - 6, 3);
    ctx.fillStyle = "#00000024";
    ctx.fillRect(x + 3, y + size - 6, size - 6, 3);
  }
  function draw(ctx) {
    ctx.fillStyle = "#0b1523";
    ctx.fillRect(0, 0, 420, 600);
    ctx.fillStyle = "#142437";
    ctx.fillRect(15, 19, 272, 542);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 10; x++) {
        ctx.fillStyle = "#0c1929";
        ctx.fillRect(16 + x * 27, 20 + y * 27, 26, 26);
        if (board[y][x])
          cell(ctx, 16 + x * 27, 20 + y * 27, 27, colors[board[y][x] - 1]);
      }
    let ghostY = piece.y;
    while (fits(piece.matrix, piece.x, ghostY + 1)) ghostY++;
    for (const [py, ghost] of [
      [ghostY, true],
      [piece.y, false],
    ]) {
      piece.matrix.forEach((row, y) =>
        row.forEach((value, x) => {
          if (value && py + y >= 0)
            cell(
              ctx,
              16 + (piece.x + x) * 27,
              20 + (py + y) * 27,
              27,
              colors[piece.type],
              ghost,
            );
        }),
      );
    }
    ctx.font = "bold 14px system-ui";
    ctx.fillStyle = "#abc4d7";
    ctx.fillText("接下来", 307, 44);
    queue.slice(0, 3).forEach((type, i) => {
      shapes[type].forEach((row, y) =>
        row.forEach((v, x) => {
          if (v)
            cell(ctx, 301 + x * 22, 67 + i * 92 + y * 22, 22, colors[type]);
        }),
      );
    });
    ctx.fillStyle = "#8be5d3";
    ctx.font = "bold 20px monospace";
    ctx.fillText(`LV ${level()}`, 306, 398);
    ctx.fillStyle = "#9bb3c8";
    ctx.font = "12px system-ui";
    ctx.fillText(`再消 ${10 - (lines % 10)} 行升级`, 301, 426);
    ctx.fillText(swapped ? "暂存已用" : "C · 暂存", 301, 454);
    if (reserve !== null) {
      shapes[reserve].forEach((row, y) => row.forEach((value, x) => {
        if (value) cell(ctx, 301 + x * 22, 463 + y * 22, 22, colors[reserve]);
      }));
    }
    ctx.fillStyle = "#ffda9b";
    ctx.fillText(clearLabel, 301, 555);
    ctx.fillText("空格 · 直接落底", 22, 584);
  }
  game = Arcade.mount({
    keys: {
      ArrowUp: "rotate",
      KeyW: "rotate",
      KeyX: "rotate",
      KeyZ: "reverse",
      Space: "drop",
      KeyC: "hold",
    },
    reset,
    update,
    draw,
  });
  hud();
})();
