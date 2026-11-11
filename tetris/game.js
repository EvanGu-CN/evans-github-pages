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
    "#40cce7",
    "#6285f6",
    "#f4a24f",
    "#f4d050",
    "#71cf70",
    "#b786ee",
    "#ec6378",
  ];
  const columns = 10;
  const rows = 20;
  const tile = 52;
  const linePoints = [0, 100, 300, 500, 800];
  const nextPreview = document.querySelector("[data-next]").getContext("2d");
  const holdPreview = document.querySelector("[data-reserve]").getContext("2d");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const record = arcadeRecord("evans-arcade-tetris-best");
  let board,
    piece,
    upcoming,
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
    flashingRows,
    flashTime,
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
            px + x < columns &&
            py + y < rows &&
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
  function spawn(type) {
    if (type === undefined) {
      type = upcoming;
      upcoming = nextType();
    }
    piece = { type, matrix: shapes[type].map((row) => [...row]), x: 3, y: -1 };
    gravityTime = 0;
    lockTime = 0;
    resets = 0;
    drawPreview(nextPreview, upcoming, "下一块");
    drawPreview(holdPreview, reserve, "暂存");
    holdPreview.canvas.dataset.used = String(swapped);
    if (!fits(piece.matrix, piece.x, piece.y)) end();
  }
  function reset() {
    board = Array.from({ length: rows }, () => Array(columns).fill(0));
    bag = [];
    upcoming = nextType();
    score = 0;
    lines = 0;
    repeatTime = 0;
    previousMove = 0;
    over = false;
    reserve = null;
    swapped = false;
    flashingRows = [];
    flashTime = 0;
    spawn();
    hud();
  }
  function move(dx) {
    if (!fits(piece.matrix, piece.x + dx, piece.y)) return;
    piece.x += dx;
    if (resets < 8) {
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
      if (resets < 8) {
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
    const clearedRows = [];
    const remaining = board.filter((row, index) => {
      if (row.includes(0)) return true;
      clearedRows.push(index);
      return false;
    });
    const cleared = clearedRows.length;
    if (cleared) {
      score += linePoints[cleared] * level();
      lines += cleared;
      board = [
        ...Array.from({ length: cleared }, () => Array(columns).fill(0)),
        ...remaining,
      ];
      flashingRows = clearedRows;
      flashTime = 0.18;
    }
    record.save(score);
    game.effect(cleared ? "clear" : "pop");
    swapped = false;
    spawn();
    hud();
  }
  function update(dt) {
    if (over) return;
    flashTime = Math.max(0, flashTime - dt);
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
      : Math.max(0.06, 0.62 * 0.8 ** (level() - 1));
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
      if (lockTime >= 0.35) lock();
    }
    record.save(score);
    hud();
  }
  function drawCell(ctx, x, y, size, color, ghost = false) {
    if (ghost) {
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 6, y + 6, size - 12, size - 12);
      ctx.globalAlpha = 1;
      return;
    }
    const inset = Math.round(size / 8);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.fillStyle = "#0005";
    ctx.fillRect(x + size - inset, y + 2, inset - 2, size - 4);
    ctx.fillRect(x + 2, y + size - inset, size - 4, inset - 2);
    ctx.fillStyle = "#fff7";
    ctx.fillRect(x + 2, y + 2, size - inset - 2, inset - 2);
    ctx.fillStyle = "#fff3";
    ctx.fillRect(x + 2, y + inset, inset - 2, size - 2 * inset);
    ctx.strokeStyle = "#fff2";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, size - 2 * inset - 1, size - 2 * inset - 1);
  }
  function drawPreview(ctx, type, label) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    if (type === null) {
      ctx.canvas.setAttribute("aria-label", `${label}为空`);
      ctx.fillStyle = "#6f687c";
      ctx.fillRect(width / 2 - 9, height / 2 - 1, 18, 2);
      return;
    }
    ctx.canvas.setAttribute("aria-label", `${label}，${"IJLOSTZ"[type]} 形`);
    const cells = shapes[type].flatMap((row, y) =>
      row.flatMap((value, x) => (value ? [[x, y]] : [])),
    );
    const size = 34;
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const left = (width - (Math.min(...xs) + Math.max(...xs) + 1) * size) / 2;
    const top = (height - (Math.min(...ys) + Math.max(...ys) + 1) * size) / 2;
    for (const [x, y] of cells) {
      drawCell(ctx, left + x * size, top + y * size, size, colors[type]);
    }
  }
  function draw(ctx) {
    ctx.fillStyle = "#211f2d";
    ctx.fillRect(0, 0, columns * tile, rows * tile);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#15141e" : "#171621";
        ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
        if (board[y][x]) {
          drawCell(ctx, x * tile, y * tile, tile, colors[board[y][x] - 1]);
        }
      }
    }
    if (flashTime > 0 && !reducedMotion.matches) {
      ctx.fillStyle = "#fff0cc";
      ctx.globalAlpha = flashTime * 2;
      for (const y of flashingRows) {
        ctx.fillRect(0, y * tile + 2, columns * tile, tile - 4);
      }
      ctx.globalAlpha = 1;
    }
    if (over) return;
    let ghostY = piece.y;
    while (fits(piece.matrix, piece.x, ghostY + 1)) ghostY++;
    for (const [py, ghost] of [
      [ghostY, true],
      [piece.y, false],
    ]) {
      piece.matrix.forEach((row, y) =>
        row.forEach((value, x) => {
          if (value && py + y >= 0)
            drawCell(
              ctx,
              (piece.x + x) * tile,
              (py + y) * tile,
              tile,
              colors[piece.type],
              ghost,
            );
        }),
      );
    }
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
