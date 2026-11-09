"use strict";

(() => {
  const width = 420;
  const height = 570;
  const sectors = [
    { name: "近地轨道", top: "#0e1937", bottom: "#1a3d58", glow: "#5887cc" },
    { name: "离子风暴", top: "#191732", bottom: "#443255", glow: "#916cdb" },
    { name: "旗舰封锁", top: "#21192f", bottom: "#522b47", glow: "#e1738e" },
  ];
  const types = {
    scout: { speed: 98, hp: 1, radius: 15, points: 100, color: "#ff9f72" },
    wing: { speed: 72, hp: 2, radius: 18, points: 160, color: "#d49eff" },
    armor: { speed: 52, hp: 5, radius: 24, points: 350, color: "#fb789b" },
  };
  const stars = Array.from({ length: 94 }, (_, i) => ({
    x: (i * 169 + i * i * 7) % width,
    y: (i * 139 + i * i * 11) % height,
    size: i % 9 === 0 ? 2 : 1,
    speed: 24 + (i * 11) % 72,
    opacity: .24 + (i * 7 % 13) / 19,
  }));
  const recordKey = "evans-arcade-thunder-best";
  const digits = (value, count) => String(value).padStart(count, "0");
  const touches = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
  let best = 0;
  try {
    best = Number(localStorage.getItem(recordKey)) || 0;
  } catch { /* Storage may be disabled. */ }

  let player, bullets, hostiles, enemies, drops, sparks, boss, sector, elapsed, clock, wave, nextWave, score, target;
  let lastBackground, backdrop;

  function reset() {
    player = { x: width / 2, y: height - 75, radius: 12, lives: 3, power: 1, cooldown: 0, shield: 0, lean: 0 };
    bullets = [];
    hostiles = [];
    enemies = [];
    drops = [];
    sparks = [];
    boss = null;
    sector = 0;
    elapsed = 0;
    clock = 0;
    wave = 0;
    nextWave = 1.1;
    score = 0;
    target = { x: player.x, y: player.y };
  }

  function addScore(points) {
    score += points;
    if (score <= best) return;
    best = score;
    try {
      localStorage.setItem(recordKey, String(best));
    } catch { /* Keep the current session record if storage is disabled. */ }
  }

  function updateHud(game) {
    game.stat("score", digits(score, 5));
    game.stat("best", digits(best, 5));
    game.stat("sector", `${sector + 1} / ${sectors.length}`);
    game.stat("lives", digits(player.lives, 2));
  }

  function spawnWave() {
    const center = 103 + (wave * 73 + sector * 47) % 214;
    const kind = wave % 5 === 4 ? "armor" : wave % 2 === 0 ? "scout" : "wing";
    const count = kind === "armor" ? 1 : kind === "wing" ? 3 : 3 + Number(sector > 0);
    for (let i = 0; i < count; i++) {
      const type = types[kind];
      const baseX = Arcade.clamp(center + (i - (count - 1) / 2) * 48, 28, width - 28);
      enemies.push({
        ...type, kind, x: baseX, baseX, y: -36 - i * 24,
        age: 0, phase: i * .46, cooldown: 1.35 + i * .24,
        supply: i === Math.floor(count / 2) && (wave % 4 === 1 || kind === "armor")
          ? (wave % 10 === 4 ? "repair" : "power") : null,
      });
    }
    wave++;
  }

  function burst(x, y, color, count = 11) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + elapsed;
      const speed = 38 + i % 5 * 30;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, color });
    }
  }

  function hurt(game) {
    if (player.shield > 0) return;
    player.lives--;
    player.shield = 1.55;
    player.power = Math.max(1, player.power - 1);
    game.effect("hit");
    burst(player.x, player.y, "#85eaff", 18);
    if (player.lives <= 0) {
      game.finish({ tag: "SIGNAL LOST", title: "战机坠毁", copy: `到达第 ${sector + 1} 段战区，得分 ${score}。` });
    }
  }

  function fire(x, y, angle, speed, radius = 5) {
    hostiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius });
  }

  function aim(x, y) {
    return Math.atan2(player.y - y, player.x - x);
  }

  function updatePlayer(dt, game) {
    const dx = Number(game.held("right")) - Number(game.held("left"));
    const dy = Number(game.held("down")) - Number(game.held("up"));
    const oldX = player.x;
    if (game.dragging()) {
      player.x += (target.x - player.x) * Math.min(1, dt * 19);
      player.y += (target.y - player.y) * Math.min(1, dt * 19);
    } else {
      const speed = 285 / (Math.hypot(dx, dy) || 1);
      player.x += dx * speed * dt;
      player.y += dy * speed * dt;
    }
    player.x = Arcade.clamp(player.x, 18, width - 18);
    player.y = Arcade.clamp(player.y, 68, height - 22);
    player.lean += (Arcade.clamp((player.x - oldX) * .037, -.28, .28) - player.lean) * .28;
    player.shield = Math.max(0, player.shield - dt);
    player.cooldown -= dt;
    if ((game.dragging() || game.held("fire")) && player.cooldown <= 0) {
      player.cooldown = .135;
      bullets.push({ x: player.x, y: player.y - 17, vx: 0, radius: 4 });
      if (player.power >= 2) {
        const spread = player.power === 3 ? 94 : 36;
        bullets.push({ x: player.x - 12, y: player.y - 6, vx: -spread, radius: 4 });
        bullets.push({ x: player.x + 12, y: player.y - 6, vx: spread, radius: 4 });
      }
      game.effect("shoot");
    }
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      enemy.age += dt;
      enemy.y += (enemy.speed + sector * 9) * dt;
      enemy.x = Arcade.clamp(enemy.baseX + Math.sin(enemy.age * 2.5 + enemy.phase) * (enemy.kind === "wing" ? 54 : 19), 18, width - 18);
      enemy.cooldown -= dt;
      if (enemy.cooldown > 0 || enemy.y < 30 || enemy.y > player.y - 75) continue;
      const angle = aim(enemy.x, enemy.y);
      if (enemy.kind === "armor") {
        for (const spread of [-.24, 0, .24]) fire(enemy.x, enemy.y + 15, angle + spread, 168 + sector * 17);
      } else if (enemy.kind === "wing" || sector > 0) {
        fire(enemy.x, enemy.y + 12, angle, 156 + sector * 18);
      }
      enemy.cooldown = enemy.kind === "armor" ? 1.5 : 2.3;
    }
  }

  function updateBoss(dt) {
    if (!boss) return;
    boss.age += dt;
    boss.y = Math.min(113, boss.y + 67 * dt);
    boss.x = width / 2 + Math.sin(boss.age * .95) * 105;
    boss.cooldown -= dt;
    if (boss.cooldown > 0 || boss.y < 72) return;
    const angle = boss.salvo % 2 ? Math.PI / 2 : aim(boss.x, boss.y);
    for (let i = -2; i <= 2; i++) fire(boss.x, boss.y + 29, angle + i * .235, 186, 6);
    boss.salvo++;
    boss.cooldown = boss.hp < boss.maxHp / 2 ? .66 : .98;
  }

  function collisions(game) {
    for (const bullet of bullets) {
      if (boss && touches(bullet, boss)) {
        bullet.spent = true;
        boss.hp--;
        burst(bullet.x, bullet.y, "#fc9cba", 3);
        if (boss.hp <= 0) {
          burst(boss.x, boss.y, "#ffe0aa", 55);
          addScore(3500);
          game.effect("clear");
          game.finish({ tag: "MISSION COMPLETE", title: "旗舰已击破", copy: `三段战区全部突破，最终得分 ${score}。` });
          boss = null;
          return;
        }
        continue;
      }
      const enemy = enemies.find((candidate) => candidate.hp > 0 && touches(bullet, candidate));
      if (!enemy) continue;
      bullet.spent = true;
      enemy.hp--;
      if (enemy.hp > 0) continue;
      addScore(enemy.points);
      burst(enemy.x, enemy.y, enemy.color);
      if (enemy.supply) drops.push({ x: enemy.x, y: enemy.y, kind: enemy.supply, radius: 12 });
      game.effect("pop");
    }

    for (const drop of drops) {
      if (!touches(player, drop)) continue;
      if (drop.kind === "power") player.power = Math.min(3, player.power + 1);
      else player.lives = Math.min(3, player.lives + 1);
      addScore(50);
      drop.taken = true;
      game.effect("coin");
    }
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || !touches(player, enemy)) continue;
      enemy.hp = 0;
      burst(enemy.x, enemy.y, enemy.color);
      hurt(game);
      if (player.lives <= 0) return;
    }
    if (boss && touches(player, boss)) hurt(game);
    if (player.lives <= 0) return;
    for (const shot of hostiles) {
      if (!touches(player, shot)) continue;
      shot.spent = true;
      hurt(game);
      if (player.lives <= 0) return;
    }
  }

  function update(dt, game) {
    elapsed += dt;
    clock += dt;
    if (sector < 2 && clock >= 23) {
      sector++;
      clock = 0;
      wave = 0;
      nextWave = 1.6;
      game.effect("clear");
    }
    if (clock >= nextWave && !boss) {
      if (sector === 2 && clock >= 17) {
        if (enemies.length === 0) {
          boss = { x: width / 2, y: -65, radius: 53, hp: 115, maxHp: 115, age: 0, salvo: 0, cooldown: 2 };
          game.effect("clear");
        }
      } else {
        spawnWave();
        nextWave += 2.55 - sector * .25;
      }
    }
    updatePlayer(dt, game);
    updateEnemies(dt);
    updateBoss(dt);
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y -= 525 * dt;
    }
    for (const shot of hostiles) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
    }
    for (const drop of drops) drop.y += 81 * dt;
    for (const spark of sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.age += dt;
    }
    collisions(game);
    bullets = bullets.filter(({ spent, y, x }) => !spent && y > -10 && x > -10 && x < width + 10);
    hostiles = hostiles.filter(({ spent, y, x }) => !spent && y < height + 15 && y > -20 && x > -20 && x < width + 20);
    enemies = enemies.filter(({ hp, y }) => hp > 0 && y < height + 36);
    drops = drops.filter(({ taken, y }) => !taken && y < height + 14);
    sparks = sparks.filter(({ age }) => age < .5);
    updateHud(game);
  }

  function poly(ctx, color, points) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function rect(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function drawBackground(ctx) {
    const zone = sectors[sector];
    if (lastBackground !== sector) {
      lastBackground = sector;
      backdrop = ctx.createLinearGradient(0, 0, width, height);
      backdrop.addColorStop(0, zone.top);
      backdrop.addColorStop(1, zone.bottom);
    }
    rect(ctx, backdrop, 0, 0, width, height);
    ctx.globalAlpha = .17;
    for (let i = 0; i < 3; i++) {
      const y = (elapsed * (12 + i * 6) + i * 247) % 840 - 180;
      poly(ctx, zone.glow, [[0, y + 65], [width, y], [width, y + 58], [0, y + 155]]);
    }
    for (const star of stars) {
      ctx.globalAlpha = star.opacity;
      rect(ctx, "#dcf1ff", star.x, (star.y + elapsed * star.speed) % height, star.size, star.size * 2);
    }
    ctx.globalAlpha = 1;
    for (const x of [18, width - 19]) {
      for (let y = elapsed * 64 % 36 - 18; y < height; y += 36) rect(ctx, "#b8deff42", x, y, 1, 15);
    }
  }

  function drawShip(ctx, enemy) {
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    const r = enemy.radius;
    poly(ctx, "#221934", [[-r, -r * .7], [0, -r * .39], [r, -r * .7], [r * .76, r * .52], [0, r], [-r * .76, r * .52]]);
    poly(ctx, enemy.color, [[-r + 3, -r * .5], [-r * .28, -r * .2], [0, -r * .65], [r * .28, -r * .2], [r - 3, -r * .5], [r * .58, r * .45], [0, r * .72], [-r * .58, r * .45]]);
    poly(ctx, "#6c385b", [[0, -r * .45], [r * .34, r * .1], [0, r * .54], [-r * .34, r * .1]]);
    rect(ctx, "#fff1c5", -3, 2, 6, 5);
    ctx.restore();
  }

  function drawBoss(ctx) {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    poly(ctx, "#24142c", [[-76, -22], [-47, -11], [-21, -48], [21, -48], [47, -11], [76, -22], [67, 25], [0, 49], [-67, 25]]);
    poly(ctx, "#b7466d", [[-70, -16], [-44, -4], [-17, -41], [17, -41], [44, -4], [70, -16], [60, 19], [0, 41], [-60, 19]]);
    poly(ctx, "#f696a6", [[-49, 2], [-15, -33], [15, -33], [49, 2], [21, 15], [0, 27], [-21, 15]]);
    poly(ctx, "#462653", [[0, -26], [16, -1], [0, 20], [-16, -1]]);
    rect(ctx, "#ffeab3", -5, -3, 10, 10);
    rect(ctx, "#ffb296", -53, 7, 14, 6);
    rect(ctx, "#ffb296", 39, 7, 14, 6);
    ctx.restore();
    rect(ctx, "#2a1932", 66, 24, width - 132, 8);
    rect(ctx, "#ff8fac", 66, 24, (width - 132) * boss.hp / boss.maxHp, 8);
    ctx.fillStyle = "#ffe1ea";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FLAGSHIP", width / 2, 18);
  }

  function drawPlayer(ctx) {
    if (player.lives === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.lean);
    if (player.shield > 0) {
      ctx.strokeStyle = Math.floor(elapsed * 15) % 2 ? "#8cf4ffb0" : "#8cf4ff36";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    poly(ctx, "#54c5ff", [[-7, 12], [7, 12], [3, 24 + Math.sin(elapsed * 72) * 5], [0, 28], [-3, 24]]);
    poly(ctx, "#223d65", [[0, -23], [7, -5], [22, 14], [19, 20], [0, 13], [-19, 20], [-22, 14], [-7, -5]]);
    poly(ctx, "#87e2fa", [[0, -20], [6, -3], [19, 13], [16, 15], [0, 9], [-16, 15], [-19, 13], [-6, -3]]);
    poly(ctx, "#f4fbff", [[0, -19], [5, -3], [4, 10], [-4, 10], [-5, -3]]);
    rect(ctx, "#4278be", -3, -5, 6, 9);
    ctx.restore();
  }

  function draw(ctx) {
    drawBackground(ctx);
    enemies.forEach((enemy) => drawShip(ctx, enemy));
    if (boss) drawBoss(ctx);
    for (const drop of drops) {
      rect(ctx, drop.kind === "power" ? "#91efff" : "#a7ffb6", drop.x - 11, drop.y - 11, 22, 22);
      ctx.fillStyle = "#18253e";
      ctx.font = "bold 17px monospace";
      ctx.textAlign = "center";
      ctx.fillText(drop.kind === "power" ? "P" : "+", drop.x, drop.y + 6);
    }
    for (const bullet of bullets) {
      rect(ctx, "#4dcfff8c", bullet.x - 4, bullet.y - 9, 8, 20);
      rect(ctx, "#d8fdff", bullet.x - 1.5, bullet.y - 7, 3, 13);
    }
    for (const shot of hostiles) {
      const r = shot.radius;
      poly(ctx, "#fb718d", [[shot.x, shot.y - r], [shot.x + r, shot.y], [shot.x, shot.y + r], [shot.x - r, shot.y]]);
      rect(ctx, "#ffddc2", shot.x - 1, shot.y - 1, 2, 2);
    }
    drawPlayer(ctx);
    for (const spark of sparks) {
      ctx.globalAlpha = 1 - spark.age / .5;
      rect(ctx, spark.color, spark.x, spark.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    if (clock < 2.4 && elapsed > 0) {
      ctx.fillStyle = "#eef5ff";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`0${sector + 1}  /  ${sectors[sector].name}`, width / 2, 85);
    }
  }

  const game = Arcade.mount({
    keys: { Space: "fire", KeyX: "fire" }, reset, update, draw,
    drag(x, y) {
      target.x = Arcade.clamp(x, 18, width - 18);
      target.y = Arcade.clamp(y - 25, 68, height - 22);
    },
  });
  if (game) updateHud(game);
})();
