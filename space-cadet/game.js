"use strict";
(() => {
  const record = arcadeRecord("evans-arcade-space-cadet-best");
  const bumpers = [
    { x: 125, y: 219, r: 23 },
    { x: 255, y: 219, r: 23 },
    { x: 190, y: 285, r: 25 },
  ];
  const targets = [
    { x: 77, y: 143, r: 12 },
    { x: 190, y: 105, r: 12 },
    { x: 303, y: 143, r: 12 },
  ];
  const walls = [
    [20, 100, 82, 32],
    [82, 32, 298, 32],
    [298, 32, 350, 100],
    [20, 100, 20, 546],
    [350, 100, 350, 546],
    [35, 376, 98, 466],
    [345, 376, 292, 466],
    [40, 450, 110, 500],
    [340, 450, 280, 500],
  ];
  const slings = [
    [
      [53, 376],
      [109, 430],
      [80, 449],
    ],
    [
      [327, 376],
      [281, 430],
      [310, 449],
    ],
  ];
  const scoop = { x: 190, y: 414, r: 12 };
  const skillTarget = { x: 190, y: 49, r: 15 };
  const flipperLength = 59;
  let ball,
    balls,
    score,
    multiplier,
    mission,
    lit,
    flashes,
    flippers,
    charge,
    charging,
    skillShot,
    scoopTime,
    nudgeTime,
    nudges,
    orbitReady,
    time,
    over,
    game;
  function hud() {
    if (!game) return;
    game.stat("score", score);
    game.stat("balls", balls);
    game.stat("multiplier", `×${multiplier}`);
    game.stat("best", record.value);
    const message = ball.ready
      ? charging
        ? `发射蓄力 ${Math.round(charge * 100)}% · 松开发射`
        : "按住空格或发射按钮蓄力，松手发射"
      : `任务 ${mission} · 点亮目标 ${lit.filter(Boolean).length}/3 · 完成奖励 ${2000 * multiplier}`;
    game.stat("mission", message);
  }
  function newBall() {
    ball = { x: 382, y: 549, vx: 0, vy: 0, r: 8, ready: true, inLane: true };
    charging = false;
    charge = 0;
    orbitReady = true;
    skillShot = false;
    scoopTime = 0;
    nudgeTime = 0;
    nudges = 2;
  }
  function reset() {
    balls = 3;
    score = 0;
    multiplier = 1;
    mission = 1;
    lit = [false, false, false];
    flashes = Array(8).fill(0);
    time = 0;
    over = false;
    flippers = [
      { x: 110, y: 500, angle: 0.35, omega: 0, side: "left" },
      { x: 280, y: 500, angle: Math.PI - 0.35, omega: 0, side: "right" },
    ];
    newBall();
    hud();
  }
  function points(value) {
    score += value * multiplier;
    record.save(score);
  }
  function lineCollision(
    ax,
    ay,
    bx,
    by,
    radius = 3,
    surfaceX = 0,
    surfaceY = 0,
    bounce = 0.85,
  ) {
    const dx = bx - ax,
      dy = by - ay;
    const fraction = Arcade.clamp(
      ((ball.x - ax) * dx + (ball.y - ay) * dy) / (dx * dx + dy * dy),
      0,
      1,
    );
    const px = ax + dx * fraction,
      py = ay + dy * fraction;
    const offsetX = ball.x - px,
      offsetY = ball.y - py;
    const distance = Math.hypot(offsetX, offsetY);
    const limit = ball.r + radius;
    if (distance >= limit) return false;
    const nx = distance > 0 ? offsetX / distance : dy / Math.hypot(dx, dy);
    const ny = distance > 0 ? offsetY / distance : -dx / Math.hypot(dx, dy);
    ball.x = px + nx * (limit + 0.2);
    ball.y = py + ny * (limit + 0.2);
    const incoming = (ball.vx - surfaceX) * nx + (ball.vy - surfaceY) * ny;
    if (incoming >= 0) return false;
    ball.vx -= (1 + bounce) * incoming * nx;
    ball.vy -= (1 + bounce) * incoming * ny;
    return true;
  }
  function circleCollision(item, kick) {
    const dx = ball.x - item.x,
      dy = ball.y - item.y;
    const length = Math.hypot(dx, dy);
    if (length >= ball.r + item.r) return false;
    const nx = length ? dx / length : 0,
      ny = length ? dy / length : -1;
    ball.x = item.x + nx * (item.r + ball.r + 0.2);
    ball.y = item.y + ny * (item.r + ball.r + 0.2);
    const incoming = ball.vx * nx + ball.vy * ny;
    if (incoming >= 0) return false;
    ball.vx -= 2 * incoming * nx;
    ball.vy -= 2 * incoming * ny;
    ball.vx += kick * nx;
    ball.vy += kick * ny;
    return true;
  }
  function updateFlippers(dt) {
    for (const f of flippers) {
      const active = game.held(f.side);
      const target =
        f.side === "left"
          ? active
            ? -0.48
            : 0.35
          : Math.PI + (active ? 0.48 : -0.35);
      const change = Arcade.clamp(target - f.angle, -18 * dt, 18 * dt);
      f.angle += change;
      f.omega = change / dt;
    }
  }
  function physics(dt) {
    ball.vy += 490 * dt;
    ball.vx *= Math.exp(-0.055 * dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.inLane) {
      ball.x = 382;
      if (ball.y < 96) {
        ball.inLane = false;
        ball.x = 333;
        ball.y = 90;
        ball.vx = skillShot ? -485 : -260 - charge * 120;
        ball.vy = skillShot ? -200 : -105 - charge * 115;
        game.effect("coin");
      }
      return;
    }
    for (const wall of walls) lineCollision(...wall);
    if (skillShot && Math.hypot(ball.x - skillTarget.x, ball.y - skillTarget.y) <= ball.r + skillTarget.r) {
      skillShot = false;
      points(1250);
      game.effect("clear");
    }
    if (ball.y > 190) skillShot = false;
    if (ball.vy < -150 && Math.hypot(ball.x - scoop.x, ball.y - scoop.y) < scoop.r) {
      ball.x = scoop.x;
      ball.y = scoop.y;
      ball.vx = 0;
      ball.vy = 0;
      scoopTime = .35;
      points(350);
      game.effect("coin");
      return;
    }
    bumpers.forEach((bumper, i) => {
      if (circleCollision(bumper, 135) && flashes[i] <= 0) {
        points(100);
        flashes[i] = 0.16;
        game.effect("pop");
      }
    });
    targets.forEach((target, i) => {
      if (!circleCollision(target, 80) || flashes[3 + i] > 0) return;
      points(250);
      lit[i] = true;
      flashes[3 + i] = 0.25;
      game.effect("coin");
      if (lit.every(Boolean)) {
        points(2000);
        mission++;
        multiplier = Math.min(5, multiplier + 1);
        lit = [false, false, false];
        game.effect("clear");
      }
    });
    slings.forEach((triangle, i) => {
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge],
          b = triangle[(edge + 1) % 3];
        if (lineCollision(...a, ...b, 3, 0, 0, 1.12) && flashes[6 + i] <= 0) {
          ball.vy -= 120;
          ball.vx += i ? -80 : 80;
          points(50);
          flashes[6 + i] = 0.16;
          game.effect("pop");
        }
      }
    });
    for (const f of flippers) {
      const dx = Math.cos(f.angle) * flipperLength,
        dy = Math.sin(f.angle) * flipperLength;
      if (
        lineCollision(
          f.x,
          f.y,
          f.x + dx,
          f.y + dy,
          7,
          -f.omega * dy * 0.65,
          f.omega * dx * 0.65,
        )
      ) {
        if (game.held(f.side) && Math.abs(f.omega) > 1) {
          ball.vy = Math.min(ball.vy, -440);
          ball.vx += (195 - ball.x) * 2;
          game.effect("jump");
        }
      }
    }
    if (ball.y > 145) orbitReady = true;
    if (orbitReady && ball.y < 70 && ball.x > 100 && ball.x < 280) {
      points(500);
      orbitReady = false;
      game.effect("coin");
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 900) {
      ball.vx *= 900 / speed;
      ball.vy *= 900 / speed;
    }
  }
  function update(dt) {
    if (over) return;
    time += dt;
    nudgeTime = Math.max(0, nudgeTime - dt);
    flashes = flashes.map((value) => Math.max(0, value - dt));
    updateFlippers(dt);
    if (ball.ready) {
      if (game.pressed("launch") || game.held("launch")) charging = true;
      if (charging) {
        charge = Math.min(1, charge + dt);
        if (!game.held("launch")) {
          ball.ready = false;
          ball.vy = -830 - charge * 230;
          skillShot = charge >= .55 && charge <= .75;
          charging = false;
          game.effect("shoot");
        }
      }
    } else if (scoopTime > 0) {
      scoopTime -= dt;
      if (scoopTime <= 0) {
        ball.vx = 170 * (game.held("right") ? 1 : -1);
        ball.vy = -565;
        game.effect("shoot");
      }
    } else {
      if (!ball.inLane && nudges > 0 && nudgeTime <= 0 && game.pressed("nudge")) {
        ball.vx += ball.x < 190 ? 115 : -115;
        ball.vy -= 165;
        nudges--;
        nudgeTime = .9;
        game.effect("pop");
      }
      // Small substeps keep fast balls from crossing thin rails or flippers.
      for (let i = 0; i < 6 && scoopTime <= 0; i++) physics(dt / 6);
      if (ball.y > 620 || ball.x < -40 || ball.x > 460) {
        balls--;
        game.effect("hit");
        if (balls === 0) {
          over = true;
          game.finish({
            tag: "MISSION COMPLETE",
            title: "航行结束",
            copy: `总分 ${score}，完成 ${mission - 1} 个任务。`,
          });
        } else newBall();
      }
    }
    hud();
  }
  function line(ctx, points, color, width) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  function disk(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function draw(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 420, 620);
    bg.addColorStop(0, "#111c38");
    bg.addColorStop(1, "#342747");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 420, 620);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = i % 3 ? "#afc8ff66" : "#ffdc9d99";
      ctx.fillRect(
        25 + ((i * 137) % 322),
        40 + ((i * 193) % 480),
        i % 7 ? 1 : 2,
        i % 7 ? 1 : 2,
      );
    }
    ctx.strokeStyle = "#51618e66";
    ctx.lineWidth = 2;
    for (const r of [75, 112, 149]) {
      ctx.beginPath();
      ctx.ellipse(190, 260, r, r * 0.7, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#0c132a";
    ctx.fillRect(361, 28, 42, 562);
    line(
      ctx,
      [
        [362, 130],
        [362, 589],
      ],
      "#a1b7d3",
      5,
    );
    line(
      ctx,
      [
        [404, 40],
        [404, 589],
      ],
      "#6885a4",
      5,
    );
    for (let y = 567; y < 596; y += 5)
      line(
        ctx,
        [
          [370, y],
          [394, y],
        ],
        "#e9bb78",
        2,
      );
    for (const wall of walls) {
      const [ax, ay, bx, by] = wall;
      line(
        ctx,
        [
          [ax + 3, ay + 5],
          [bx + 3, by + 5],
        ],
        "#050b1e",
        10,
      );
      line(
        ctx,
        [
          [ax, ay],
          [bx, by],
        ],
        "#627c9e",
        7,
      );
      line(
        ctx,
        [
          [ax - 1, ay - 1],
          [bx - 1, by - 1],
        ],
        "#bdd4ec",
        2,
      );
    }
    slings.forEach((points, i) => {
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      points.slice(1).forEach((p) => ctx.lineTo(...p));
      ctx.closePath();
      ctx.fillStyle = flashes[6 + i] > 0 ? "#ffddb0" : "#a8496e";
      ctx.fill();
      ctx.strokeStyle = "#ffb98d";
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    bumpers.forEach((b, i) => {
      disk(ctx, b.x + 4, b.y + 9, b.r + 4, "#050c1d");
      disk(ctx, b.x, b.y, b.r + 3, "#729ab6");
      disk(ctx, b.x, b.y - 3, b.r, flashes[i] > 0 ? "#fff4bc" : "#be5b93");
      disk(ctx, b.x, b.y - 6, b.r - 6, "#f3bd84");
      disk(ctx, b.x - 2, b.y - 9, b.r - 11, "#ffe6ae");
      ctx.fillStyle = "#6c4364";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("100", b.x, b.y - 1);
    });
    targets.forEach((t, i) => {
      disk(ctx, t.x + 2, t.y + 4, 15, "#071023");
      disk(ctx, t.x, t.y, 13, lit[i] ? "#fff1aa" : "#64cfe9");
      disk(ctx, t.x, t.y, 8, lit[i] ? "#e8aa54" : "#315f8e");
      ctx.fillStyle = "#f3faff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), t.x, t.y + 3);
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "#b2c5e7";
    ctx.font = "bold 15px monospace";
    ctx.fillText("SPACE CADET", 190, 350);
    ctx.fillStyle = "#f0c98c";
    ctx.font = "11px system-ui";
    ctx.fillText("ORBIT 500  ·  TARGETS 250", 190, 369);
    disk(ctx, scoop.x, scoop.y, scoop.r + 4, scoopTime > 0 ? "#ffe3a1" : "#7a6ba3");
    disk(ctx, scoop.x, scoop.y, scoop.r, "#0b1025");
    disk(ctx, skillTarget.x, skillTarget.y, skillTarget.r, skillShot ? "#ffd878" : "#514c7e");
    ctx.fillStyle = "#f7dc9d";
    ctx.fillText("★", skillTarget.x, skillTarget.y + 4);
    ctx.fillText(`推台剩余 ${nudges}/2`, 190, 470);
    ctx.fillStyle = "#4d3652";
    ctx.fillRect(130, 566, 130, 22);
    ctx.fillStyle = "#eaa78d";
    ctx.fillText("DRAIN", 195, 581);
    for (const f of flippers) {
      const tip = [f.x + Math.cos(f.angle) * flipperLength, f.y + Math.sin(f.angle) * flipperLength];
      line(
        ctx,
        [
          [f.x + 2, f.y + 5],
          [tip[0] + 2, tip[1] + 5],
        ],
        "#070d20",
        17,
      );
      line(
        ctx,
        [[f.x, f.y], tip],
        game?.held(f.side) ? "#ffe8a5" : "#f0a776",
        14,
      );
      line(
        ctx,
        [
          [f.x, f.y - 3],
          [tip[0], tip[1] - 3],
        ],
        "#fff1cd",
        3,
      );
      disk(ctx, f.x, f.y, 5, "#694e65");
    }
    disk(ctx, ball.x + 3, ball.y + 5, ball.r, "#00000066");
    const steel = ctx.createRadialGradient(
      ball.x - 3,
      ball.y - 4,
      1,
      ball.x,
      ball.y,
      ball.r,
    );
    steel.addColorStop(0, "#ffffff");
    steel.addColorStop(0.35, "#d2e1f2");
    steel.addColorStop(1, "#52627c");
    disk(ctx, ball.x, ball.y, ball.r, steel);
    if (ball.ready) {
      ctx.fillStyle = "#72e4ad";
      ctx.fillRect(371, 555 - .75 * 35, 22, .2 * 35);
      ctx.fillStyle = "#ffe0a2";
      ctx.fillRect(375, 555 - charge * 35, 14, 3);
      ctx.textAlign = "center";
      ctx.font = "bold 13px system-ui";
      ctx.fillText("按住空格蓄力 · 松手发射", 190, 603);
    }
  }
  game = Arcade.mount({
    keys: { KeyZ: "left", Slash: "right", Space: "launch", KeyX: "nudge" },
    reset,
    update,
    draw,
  });
  hud();
})();
