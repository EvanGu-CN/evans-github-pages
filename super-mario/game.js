"use strict";

(() => {
  const floor = 366;
  const levels = [
    {
      name: "蘑菇原野", sky: ["#68b6ec", "#d5f4ff"], hills: ["#83bf9e", "#519c74"],
      land: [[0, 680], [780, 1350], [1460, 2240], [2340, 2840]],
      bricks: [[285, 266, 3], [565, 280, 2], [875, 266, 4], [1150, 265, 3], [1540, 250, 3], [1840, 266, 4], [2440, 260, 3]],
      pipes: [[450, 54], [1060, 64], [1680, 76], [2130, 42]],
      trails: [[126, 317, 4], [686, 251, 3], [1225, 204, 3], [1360, 241, 3], [1960, 202, 3], [2243, 243, 3]],
      patrols: [[545, 650], [885, 1030], [1180, 1304], [1740, 1980], [2375, 2550]],
    },
    {
      name: "余晖峡谷", sky: ["#ad7bb4", "#ffc792"], hills: ["#bb8b8d", "#8f6387"],
      land: [[0, 550], [666, 1170], [1305, 1760], [1880, 2340], [2475, 3100]],
      bricks: [[230, 255, 4], [457, 229, 2], [780, 248, 3], [1025, 246, 3], [1340, 274, 3], [1590, 254, 3], [1950, 267, 4], [2240, 222, 2], [2600, 253, 4]],
      pipes: [[395, 63], [926, 79], [1480, 82], [2130, 74], [2740, 86]],
      trails: [[105, 313, 3], [554, 247, 3], [800, 197, 3], [1186, 238, 4], [1760, 240, 4], [2344, 230, 4], [2820, 307, 4]],
      patrols: [[267, 374], [720, 885], [1000, 1140], [1550, 1730], [1930, 2100], [2510, 2690], [2810, 2865]],
    },
    {
      name: "月下城堡", sky: ["#25294f", "#63538c"], hills: ["#554e78", "#3a3e64"],
      land: [[0, 510], [646, 1065], [1196, 1695], [1830, 2230], [2370, 2800], [2930, 3490]],
      bricks: [[232, 258, 2], [400, 225, 2], [690, 254, 2], [906, 268, 3], [1250, 250, 2], [1490, 260, 3], [1900, 262, 2], [2090, 232, 3], [2430, 260, 3], [2680, 226, 2], [2960, 245, 2], [3220, 247, 3]],
      pipes: [[337, 81], [823, 90], [1380, 83], [2020, 90], [2592, 91], [3100, 95]],
      trails: [[106, 311, 3], [516, 229, 4], [1070, 232, 4], [1699, 231, 4], [2238, 225, 4], [2803, 231, 4], [3330, 299, 3]],
      patrols: [[207, 310], [684, 790], [900, 1035], [1230, 1346], [1455, 1660], [1870, 1990], [2090, 2200], [2420, 2556], [2680, 2774], [2970, 3070], [3170, 3318]],
    },
  ];
  const spikeLayouts = [
    [[197, 46], [1998, 54]],
    [[143, 56], [1720, 36], [2910, 64]],
    [[141, 60], [1610, 54], [2724, 48], [3048, 44]],
  ];
  const hero = [
    "   RRRR  ", "  RRRRRRR", "  DFFDF  ", " DFFFDDFF", "  FFFFF  ",
    " RRBRR   ", "RRRBBBRR ", "FFBBBBBFF", "  BB BB  ", "  DD DD  ",
  ];
  const palette = { R: "#f04a41", D: "#512b30", F: "#ffd3a0", B: "#255dc6" };
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const number = (value) => String(value).padStart(2, "0");
  let stage, coins, lives, level, player, camera, time, banner, solids, pickups, enemies, effects, flag, platforms, spikes;

  function spawn() {
    player = { x: 78, y: floor - 39, w: 32, h: 39, vx: 0, vy: 0, grounded: true, coyote: 0, buffer: 0, facing: 1, platform: null };
    camera = 0;
    effects = [];
    for (const platform of platforms) platform.crumble = null;
    enemies = level.patrols.map(([min, max], i) => ({
      x: (min + max) / 2, y: floor - 26, w: 30, h: 26, min, max,
      direction: -1, alive: true, hopper: i % 3 === 1 || (stage === 2 && i % 3 === 2),
    }));
  }

  function load() {
    level = levels[stage];
    banner = 2.35;
    const end = level.land.at(-1)[1];
    flag = end - 154;
    solids = level.land.map(([start, stop]) => ({ x: start, y: floor, w: stop - start, h: 100, kind: "land" }));
    platforms = level.land.slice(1).map(([start], i) => {
      const edge = level.land[i][1];
      return { x: (edge + start) / 2 - 23, y: 320, w: 46, h: 12, fragile: stage > 0 || i > 0, crumble: null };
    });
    spikes = spikeLayouts[stage].flatMap(([start, width]) =>
      Array.from({ length: Math.ceil(width / 12) }, (_, i) => {
        const x = start + i * 12;
        const right = Math.min(x + 12, start + width);
        return { x, right, tip: Math.min(x + 6, right), y: floor - 14 };
      }));
    for (const [x, height] of level.pipes) solids.push({ x, y: floor - height, w: 54, h: height, kind: "pipe" });
    for (const [x, y, count] of level.bricks) {
      for (let i = 0; i < count; i++) {
        solids.push({ x: x + i * 34, y, w: 34, h: 30, kind: i === 1 ? "bonus" : "brick" });
      }
    }
    pickups = level.trails.flatMap(([x, y, count]) =>
      Array.from({ length: count }, (_, i) => ({ x: x + i * 34, y: y - Math.sin(i / (count - 1) * Math.PI) * 17, w: 18, h: 23 })));
    spawn();
  }

  function reset() {
    stage = 0;
    coins = 0;
    lives = 2;
    time = 0;
    load();
  }

  function updateHud(game) {
    game.stat("stage", `${stage + 1} / ${levels.length}`);
    game.stat("coins", number(coins));
    game.stat("lives", number(lives));
  }

  function addCoin(x, y, game) {
    coins++;
    game.effect("coin");
    effects.push({ x, y, age: 0 });
  }

  function loseLife(game) {
    game.effect("hit");
    lives--;
    if (lives) {
      spawn();
      banner = 1.5;
    } else {
      game.finish({ tag: "GAME OVER", title: "冒险结束", copy: `到达第 ${stage + 1} 关，收集了 ${coins} 枚金币。` });
    }
    updateHud(game);
  }

  function touchesSpike(spike) {
    const depth = Math.min(1, (player.y + player.h - spike.y) / (floor - spike.y));
    if (depth <= 0 || player.y >= floor) return false;
    const left = spike.tip + (spike.x - spike.tip) * depth;
    const right = spike.tip + (spike.right - spike.tip) * depth;
    // The sprite's feet are inset from the sides of its movement box.
    const footInset = 6;
    return player.x + player.w - footInset > left && player.x + footInset < right;
  }

  function update(dt, game) {
    time += dt;
    banner = Math.max(0, banner - dt);
    for (const platform of platforms) {
      if (platform.crumble !== null) {
        platform.crumble -= dt;
        if (platform.crumble <= -2 && Math.abs(player.x - platform.x) > 60) platform.crumble = null;
      }
      const nextY = 323 + 28 * Math.sin(time * 1.85 + platform.x);
      if (player.platform === platform) {
        if (platform.crumble === null || platform.crumble > 0) player.y += nextY - platform.y;
        else player.grounded = false;
      }
      platform.y = nextY;
    }
    const direction = Number(game.held("right")) - Number(game.held("left"));
    if (direction) player.facing = direction;
    const target = direction * 264;
    player.vx += Arcade.clamp(target - player.vx, -1850 * dt, 1850 * dt);
    player.coyote = player.grounded ? 0.085 : player.coyote - dt;
    player.buffer = game.pressed("jump") ? 0.12 : player.buffer - dt;
    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = -615;
      player.buffer = 0;
      player.coyote = 0;
      game.effect("jump");
    }
    if (!game.held("jump") && player.vy < -270) player.vy += 1550 * dt;
    player.vy = Math.min(900, player.vy + 1280 * dt);

    player.x = Math.max(0, player.x + player.vx * dt);
    for (const block of solids) {
      if (!overlaps(player, block)) continue;
      if (player.vx > 0) player.x = block.x - player.w;
      if (player.vx < 0) player.x = block.x + block.w;
      player.vx = 0;
    }

    const oldBottom = player.y + player.h;
    player.y += player.vy * dt;
    player.grounded = false;
    player.platform = null;
    for (const block of solids) {
      if (!overlaps(player, block)) continue;
      if (player.vy > 0) {
        player.y = block.y - player.h;
        player.grounded = true;
      } else if (player.vy < 0) {
        player.y = block.y + block.h;
        if (block.kind === "bonus") {
          block.kind = "used";
          addCoin(block.x + block.w / 2, block.y, game);
        }
      }
      player.vy = 0;
    }
    for (const platform of platforms) {
      if (platform.crumble !== null && platform.crumble <= 0) continue;
      if (player.vy >= 0 && oldBottom <= platform.y + 1 &&
          player.y + player.h >= platform.y && player.x + player.w > platform.x && player.x < platform.x + platform.w) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.platform = platform;
        if (platform.fragile && platform.crumble === null) platform.crumble = .35;
      }
    }
    if (spikes.some(touchesSpike)) {
      loseLife(game);
      return;
    }

    for (const coin of pickups) {
      if (!coin.collected && overlaps(player, coin)) {
        coin.collected = true;
        addCoin(coin.x + coin.w / 2, coin.y, game);
      }
    }
    for (const effect of effects) effect.age += dt;
    effects = effects.filter(({ age }) => age < 0.55);

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.x += enemy.direction * (65 + 13 * stage) * dt;
      if (enemy.x < enemy.min || enemy.x > enemy.max) enemy.direction *= -1;
      if (enemy.hopper) enemy.y = floor - enemy.h - 47 * Math.max(0, Math.sin(time * 3.1 + enemy.min));
      if (!overlaps(player, enemy)) continue;
      if (player.vy > 0 && oldBottom <= enemy.y + 6) {
        enemy.alive = false;
        player.y = enemy.y - player.h;
        player.vy = -365;
        game.effect("pop");
      } else {
        loseLife(game);
        return;
      }
    }
    if (player.y > game.height + 80) {
      loseLife(game);
      return;
    }
    if (player.x >= flag && player.y + player.h >= 162) {
      game.effect("clear");
      if (stage === levels.length - 1) {
        game.finish({ tag: "ALL CLEAR", title: "三关全通！", copy: `抵达终点，共收集 ${coins} 枚金币，剩余 ${lives} 条命。` });
      } else {
        stage++;
        load();
      }
    }
    const end = level.land.at(-1)[1];
    camera = Arcade.clamp(player.x - 264, 0, end - game.width);
    updateHud(game);
  }

  function fill(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function background(ctx, width, height) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, level.sky[0]);
    sky.addColorStop(1, level.sky[1]);
    fill(ctx, sky, 0, 0, width, height);
    const orb = stage === 2 ? "#e5e5f5" : "#ffe0a1";
    fill(ctx, orb, 620, 48, 48, 56);
    fill(ctx, orb, 612, 56, 64, 40);
    for (let i = 0; i < 8; i++) {
      const x = ((i * 137 + 50 - camera * .13) % 1040 + 1040) % 1040 - 100;
      const y = 57 + (i * 29) % 84;
      if (stage === 2) {
        fill(ctx, "#e5d7ff", x, y, 3, 3);
        fill(ctx, "#b3b7f2", x + 67, y - 22, 2, 2);
      } else {
        fill(ctx, "#fff8e9b8", x, y + 10, 67, 12);
        fill(ctx, "#fff8e9b8", x + 13, y, 37, 10);
      }
    }
    level.hills.forEach((color, layer) => {
      const shift = (camera * (layer ? .32 : .18)) % 300;
      for (let i = -1; i < 4; i++) {
        const x = i * 300 - shift + layer * 77;
        const y = 238 + layer * 33 + (i % 2) * 22;
        for (let step = 0; step < 5; step++) fill(ctx, color, x + 78 - step * 19, y + step * 18, 48 + step * 38, 18);
        fill(ctx, color, x - 17, y + 90, 238, height - y - 90);
      }
    });
  }

  function drawBlock(ctx, block) {
    const { x, y, w, h, kind } = block;
    if (kind === "land") {
      fill(ctx, "#805039", x, y, w, h);
      fill(ctx, "#553a35", x, y + 12, w, 4);
      fill(ctx, stage === 2 ? "#779998" : "#539c57", x, y, w, 11);
      fill(ctx, stage === 2 ? "#a2b5b0" : "#8bcb68", x, y, w, 4);
      for (let tile = Math.max(x + 8, x + Math.floor((camera - x) / 35) * 35 + 8); tile < Math.min(x + w - 13, camera + 820); tile += 35) {
        fill(ctx, "#ad6e4d", tile, y + 26, 13, 4);
        fill(ctx, "#663f36", tile + 7, y + 45, 10, 3);
      }
    } else if (kind === "pipe") {
      fill(ctx, "#134d45", x, y, w, h);
      fill(ctx, "#278b57", x + 3, y + 3, w - 7, h - 3);
      fill(ctx, "#82ce6f", x + 8, y + 4, 8, h - 4);
      fill(ctx, "#17634b", x + w - 15, y + 4, 11, h - 4);
      fill(ctx, "#134d45", x, y, w, 15);
      fill(ctx, "#63c568", x + 3, y + 3, w - 6, 8);
    } else {
      fill(ctx, "#4b302b", x, y, w, h);
      fill(ctx, kind === "bonus" ? "#ffb745" : kind === "used" ? "#a47753" : "#c97149", x + 2, y + 2, w - 4, h - 5);
      if (kind === "bonus") {
        ctx.fillStyle = "#593921";
        ctx.font = "bold 23px monospace";
        ctx.textAlign = "center";
        ctx.fillText("?", x + w / 2, y + 22);
      } else if (kind === "brick") {
        fill(ctx, "#92523d", x, y + 13, w, 3);
        fill(ctx, "#92523d", x + 15, y, 3, 13);
        fill(ctx, "#ed9867", x + 3, y + 3, w - 6, 2);
      }
    }
  }

  function drawCoin(ctx, x, y, width) {
    fill(ctx, "#9e5a27", x - width / 2, y + 2, width, 19);
    fill(ctx, "#ffcc55", x - width / 2 + 2, y, width - 4, 20);
    fill(ctx, "#fff0a1", x - 1, y + 4, 2, 10);
  }

  function draw(ctx) {
    const { width, height } = ctx.canvas;
    background(ctx, width, height);
    ctx.save();
    ctx.translate(-Math.round(camera), 0);
    for (const block of solids) {
      if (block.x < camera + width && block.x + block.w > camera) drawBlock(ctx, block);
    }
    for (const platform of platforms) {
      if (platform.crumble !== null && platform.crumble <= 0) continue;
      fill(ctx, "#24485e", platform.x, platform.y, platform.w, platform.h);
      const warning = platform.crumble !== null && Math.floor(time * 20) % 2;
      fill(ctx, warning ? "#fff2a3" : platform.fragile ? "#d291be" : "#8ce6dc", platform.x + 2, platform.y, platform.w - 4, 4);
    }
    for (const spike of spikes) {
      ctx.beginPath();
      ctx.moveTo(spike.x, floor);
      ctx.lineTo(spike.tip, spike.y);
      ctx.lineTo(spike.right, floor);
      ctx.fillStyle = "#f6796b";
      ctx.fill();
    }
    fill(ctx, "#e4ddc4", flag + 5, 159, 5, floor - 159);
    fill(ctx, "#f9d56e", flag + 2, 153, 11, 8);
    fill(ctx, "#f06251", flag + 10, 169, 39, 25);
    fill(ctx, "#ffe7a3", flag + 18, 176, 11, 10);
    fill(ctx, "#927587", flag + 64, 282, 68, 84);
    for (let i = 0; i < 3; i++) fill(ctx, "#aa91a1", flag + 64 + i * 26, 268, 16, 23);
    fill(ctx, "#422e45", flag + 88, 329, 20, 37);
    fill(ctx, "#53374b", flag + 75, 298, 9, 12);
    fill(ctx, "#53374b", flag + 112, 298, 9, 12);
    for (const coin of pickups) {
      if (!coin.collected && coin.x > camera - 25 && coin.x < camera + width) {
        drawCoin(ctx, coin.x + 9, coin.y + Math.sin(time * 4 + coin.x) * 3, 10 + Math.abs(Math.sin(time * 5 + coin.x / 45)) * 8);
      }
    }
    for (const effect of effects) {
      ctx.globalAlpha = 1 - effect.age / .55;
      drawCoin(ctx, effect.x, effect.y - 25 - effect.age * 95, 15);
    }
    ctx.globalAlpha = 1;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.x + 32 < camera || enemy.x > camera + width) continue;
      const x = Math.round(enemy.x);
      const y = enemy.y;
      fill(ctx, "#4e312e", x + 4, y, 22, 20);
      fill(ctx, enemy.hopper ? "#9963b7" : "#ab5a3d", x, y + 5, 30, 15);
      fill(ctx, "#efab6c", x + 6, y + 13, 18, 8);
      fill(ctx, "#fdf4d1", x + 7, y + 6, 5, 6);
      fill(ctx, "#fdf4d1", x + 18, y + 6, 5, 6);
      fill(ctx, "#35262c", x + 2, y + 21, 10, 5);
      fill(ctx, "#35262c", x + 18, y + 21, 10, 5);
    }
    ctx.save();
    ctx.translate(Math.round(player.x + player.w / 2), Math.round(player.y + player.h));
    ctx.scale(player.facing, 1);
    hero.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel === " ") return;
      const stride = y === hero.length - 1 && player.grounded && Math.abs(player.vx) > 20
        ? Math.floor(time * 18) % 2 * (x < 5 ? -2 : 2) : 0;
      fill(ctx, palette[pixel], x * 4 - 18 + stride, y * 4 - 40, 4, 4);
    }));
    ctx.restore();
    ctx.restore();
    if (banner > 0 && time > 0) {
      fill(ctx, "#16251ecf", 18, 18, 177, 38);
      ctx.fillStyle = "#fff4d5";
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`0${stage + 1}  /  ${level.name}`, 30, 43);
    }
  }

  Arcade.mount({ keys: { ArrowUp: "jump", KeyW: "jump", Space: "jump" }, reset, update, draw });
})();
