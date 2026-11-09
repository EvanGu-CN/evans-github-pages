"use strict";

(() => {
  const width = 400;
  const height = 560;
  const ground = 492;
  const birdX = 118;
  const pipeWidth = 62;
  const pipeSpacing = 230;
  const gravity = 1050;
  const flapSpeed = -325;
  const recordKey = "evans-arcade-flappy-best";
  const digits = (value) => String(value).padStart(2, "0");
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(recordKey));
    if (Number.isSafeInteger(saved) && saved > 0) best = saved;
  } catch { /* Keep scores in memory when browser storage is unavailable. */ }

  let bird, pipes, score, time, distance, flying, crashed, startingBest, game;

  function updateHud() {
    if (!game) return;
    game.stat("score", digits(score));
    game.stat("best", digits(best));
  }

  function reset() {
    bird = { y: 252, vy: 0, radius: 12 };
    pipes = [{ x: width + 90, center: 252, gap: 162, scored: false }];
    score = 0;
    time = 0;
    distance = 0;
    flying = false;
    crashed = false;
    startingBest = best;
    updateHud();
  }

  function hitRectangle(x, y, w, h) {
    const closestX = Arcade.clamp(birdX, x, x + w);
    const closestY = Arcade.clamp(bird.y, y, y + h);
    return (birdX - closestX) ** 2 + (bird.y - closestY) ** 2 <= bird.radius ** 2;
  }

  function hitPipe(pipe) {
    const top = pipe.center - pipe.gap / 2;
    const bottom = pipe.center + pipe.gap / 2;
    return hitRectangle(pipe.x, 0, pipeWidth, top)
      || hitRectangle(pipe.x - 4, top - 25, pipeWidth + 8, 25)
      || hitRectangle(pipe.x, bottom, pipeWidth, ground - bottom)
      || hitRectangle(pipe.x - 4, bottom, pipeWidth + 8, 25);
  }

  function endFlight() {
    crashed = true;
    game.effect("hit");
    game.finish({
      tag: score > startingBest ? "NEW BEST" : "ONE MORE TRY",
      title: score > startingBest ? "新的最高分！" : "再飞一次？",
      copy: `本局 ${score} 分 · 最高 ${best} 分。轻点“再玩一次”，重新出发。`,
    });
  }

  function update(dt) {
    time += dt;
    if (game.pressed("flap")) {
      flying = true;
      bird.vy = flapSpeed;
      game.effect("jump");
    }
    if (!flying) return;
    const travel = (150 + Math.min(45, score * 1.5)) * dt;
    distance += travel;
    bird.vy = Math.min(460, bird.vy + gravity * dt);
    bird.y += bird.vy * dt;
    for (const pipe of pipes) pipe.x -= travel;

    if (bird.y - bird.radius <= 0 || bird.y + bird.radius >= ground || pipes.some(hitPipe)) {
      bird.y = Arcade.clamp(bird.y, bird.radius, ground - bird.radius);
      endFlight();
      return;
    }
    for (const pipe of pipes) {
      if (pipe.scored || pipe.x + pipeWidth + 4 >= birdX - bird.radius) continue;
      pipe.scored = true;
      score++;
      if (score > best) {
        best = score;
        try {
          localStorage.setItem(recordKey, String(best));
        } catch { /* The session record still works without storage. */ }
      }
      game.effect("coin");
      updateHud();
    }
    const last = pipes.at(-1);
    if (last.x < width + 30) {
      pipes.push({
        x: last.x + pipeSpacing,
        center: Arcade.clamp(last.center + (Math.random() - .5) * 150, 128, ground - 126),
        gap: 162 - Math.min(20, score * .8),
        scored: false,
      });
    }
    pipes = pipes.filter((pipe) => pipe.x + pipeWidth + 4 > -10);
  }

  function rect(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function cloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    rect(ctx, "#fff9df", 0, 10, 70, 14);
    rect(ctx, "#fff9df", 10, 2, 22, 12);
    rect(ctx, "#fff9df", 29, -6, 24, 20);
    rect(ctx, "#e7f0d9", 4, 24, 62, 4);
    ctx.restore();
  }

  function background(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#85ced4");
    sky.addColorStop(1, "#d9ecd0");
    rect(ctx, sky, 0, 0, width, height);
    rect(ctx, "#fff3bd", 302, 56, 39, 47);
    rect(ctx, "#fff3bd", 298, 63, 47, 33);
    cloud(ctx, 28 - distance * .12 % 500, 87, 1);
    cloud(ctx, 270 - distance * .12 % 500, 176, .75);
    cloud(ctx, 528 - distance * .12 % 500, 87, 1);
    cloud(ctx, 770 - distance * .12 % 500, 176, .75);

    const offset = distance * .22 % 116;
    for (let i = -1; i < 5; i++) {
      const x = i * 116 - offset;
      rect(ctx, "#bedbc5", x, 378, 50, ground - 378);
      rect(ctx, "#bedbc5", x + 9, 365, 31, 15);
      rect(ctx, "#b2d4be", x + 53, 411, 54, ground - 411);
      rect(ctx, "#d4e7cc", x + 8, 389, 8, 9);
      rect(ctx, "#d4e7cc", x + 27, 389, 8, 9);
    }
    for (let i = -1; i < 9; i++) {
      const x = i * 62 - distance * .4 % 62;
      rect(ctx, "#8fc6a2", x, 459, 62, 33);
      rect(ctx, "#8fc6a2", x + 8, 446, 46, 15);
      rect(ctx, "#8fc6a2", x + 19, 438, 23, 9);
      rect(ctx, "#a8d7ac", x + 12, 448, 30, 4);
    }
  }

  function pipeBody(ctx, x, y, h) {
    rect(ctx, "#355c43", x, y, pipeWidth, h);
    rect(ctx, "#80bc56", x + 3, y, pipeWidth - 6, h);
    rect(ctx, "#b8db70", x + 7, y, 9, h);
    rect(ctx, "#94c761", x + 18, y, 22, h);
    rect(ctx, "#579849", x + pipeWidth - 13, y, 10, h);
  }

  function pipeCap(ctx, x, y) {
    rect(ctx, "#355c43", x - 4, y, pipeWidth + 8, 25);
    rect(ctx, "#8fc45a", x - 1, y + 3, pipeWidth + 2, 19);
    rect(ctx, "#c3e582", x + 3, y + 4, 11, 17);
    rect(ctx, "#599a46", x + pipeWidth - 10, y + 4, 10, 18);
    rect(ctx, "#c3e582", x + 3, y + 4, pipeWidth - 14, 3);
  }

  function drawBird(ctx) {
    const bob = flying ? 0 : Math.sin(time * 4) * 5;
    const angle = flying ? Arcade.clamp(bird.vy / 500, -.42, 1.1) : -.08;
    ctx.save();
    ctx.translate(birdX, bird.y + bob);
    ctx.rotate(angle);
    rect(ctx, "#59482e", -13, -13, 27, 26);
    rect(ctx, "#59482e", -18, -7, 36, 15);
    rect(ctx, "#ffce55", -12, -10, 25, 21);
    rect(ctx, "#ffce55", -15, -5, 30, 11);
    rect(ctx, "#ffe7a0", -8, -10, 18, 4);
    rect(ctx, "#fff1bf", -9, 3, 24, 7);
    const wingY = crashed ? 2 : Math.sin(time * 22) > 0 ? -1 : 4;
    rect(ctx, "#a67537", -19, wingY - 3, 17, 10);
    rect(ctx, "#fff0b5", -17, wingY - 2, 13, 6);
    rect(ctx, "#59482e", 3, -12, 14, 15);
    rect(ctx, "#fffbed", 5, -10, 10, 11);
    rect(ctx, "#343d35", 11, -6, 4, 5);
    if (crashed) {
      rect(ctx, "#fffbed", 7, -8, 8, 7);
      rect(ctx, "#343d35", 8, -7, 3, 3);
      rect(ctx, "#343d35", 11, -4, 3, 3);
      rect(ctx, "#343d35", 11, -7, 3, 3);
      rect(ctx, "#343d35", 8, -4, 3, 3);
    }
    rect(ctx, "#59482e", 9, 2, 18, 8);
    rect(ctx, "#f0804c", 12, 3, 14, 5);
    rect(ctx, "#ffd49a", 12, 3, 12, 2);
    ctx.restore();
  }

  function draw(ctx) {
    background(ctx);
    for (const pipe of pipes) {
      const top = pipe.center - pipe.gap / 2;
      const bottom = pipe.center + pipe.gap / 2;
      pipeBody(ctx, pipe.x, 0, top);
      pipeBody(ctx, pipe.x, bottom, ground - bottom);
      pipeCap(ctx, pipe.x, top - 25);
      pipeCap(ctx, pipe.x, bottom);
    }
    rect(ctx, "#3f7650", 0, ground, width, 4);
    rect(ctx, "#c6df8c", 0, ground + 4, width, 14);
    const grassOffset = distance % 24;
    for (let x = -24 - grassOffset; x < width; x += 24) {
      rect(ctx, "#82b76b", x, ground + 7, 12, 4);
      rect(ctx, "#82b76b", x + 4, ground + 11, 12, 4);
    }
    rect(ctx, "#8c965d", 0, ground + 18, width, 4);
    rect(ctx, "#e8d6a1", 0, ground + 22, width, height - ground - 22);
    rect(ctx, "#f7e6b5", 0, ground + 22, width, 5);
    for (let x = -24 - grassOffset; x < width; x += 36) {
      rect(ctx, "#ccbb8b", x + 8, ground + 39, 5, 3);
      rect(ctx, "#ccbb8b", x + 22, ground + 53, 4, 3);
    }
    drawBird(ctx);
    ctx.textAlign = "center";
    if (flying) {
      ctx.font = "bold 46px ui-monospace, monospace";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#38605b";
      ctx.strokeText(String(score), width / 2, 68);
      ctx.fillStyle = "#fff8df";
      ctx.fillText(String(score), width / 2, 68);
    } else {
      rect(ctx, "#244a4acc", 82, 323, 236, 43);
      ctx.fillStyle = "#fff8df";
      ctx.font = "bold 17px system-ui";
      ctx.fillText("轻点画面或按空格起飞", width / 2, 350);
    }
  }

  game = Arcade.mount({
    keys: { Space: "flap", ArrowUp: "flap", KeyW: "flap" },
    reset, update, draw,
  });
  updateHud();
})();
