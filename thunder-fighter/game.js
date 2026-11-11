"use strict";

(() => {
  const width = 420;
  const height = 570;
  const fullHeart = 2; // Health is counted in half hearts.
  const shieldDuration = 6;
  const maxWeaponLevel = 3;
  const sectors = [
    {
      name: "近地轨道",
      boss: "巡逻领航舰",
      hp: 55,
      patterns: ["fan"],
      top: "#0e1937",
      bottom: "#1a3d58",
      glow: "#5887cc",
    },
    {
      name: "陨石航道",
      boss: "碎星采矿舰",
      hp: 75,
      patterns: ["ring"],
      top: "#182b29",
      bottom: "#31554b",
      glow: "#74b995",
    },
    {
      name: "离子风暴",
      boss: "离子守卫",
      hp: 100,
      patterns: ["crossfire"],
      top: "#191732",
      bottom: "#443255",
      glow: "#916cdb",
    },
    {
      name: "赤焰防线",
      boss: "赤焰巡洋舰",
      hp: 130,
      patterns: ["fan"],
      top: "#321b23",
      bottom: "#693f3e",
      glow: "#ed9b65",
    },
    {
      name: "外环封锁",
      boss: "封锁指挥舰",
      hp: 170,
      patterns: ["ring", "fan", "fan"],
      top: "#252233",
      bottom: "#514d64",
      glow: "#ba9edb",
    },
    {
      name: "极光裂隙",
      boss: "极光双翼舰",
      hp: 190,
      patterns: ["crossfire", "sweep"],
      top: "#0e2837",
      bottom: "#21575a",
      glow: "#69e1c3",
    },
    {
      name: "熔星峡谷",
      boss: "熔核攻城舰",
      hp: 210,
      patterns: ["lanes", "fan"],
      top: "#30172b",
      bottom: "#643930",
      glow: "#ff9f6c",
    },
    {
      name: "幽影禁区",
      boss: "幽影旋刃舰",
      hp: 230,
      patterns: ["sweep", "ring"],
      top: "#14223c",
      bottom: "#322f5d",
      glow: "#9c94ff",
    },
    {
      name: "深空壁垒",
      boss: "壁垒歼星舰",
      hp: 250,
      patterns: ["lanes", "crossfire", "sweep"],
      top: "#142a2d",
      bottom: "#36564b",
      glow: "#b0e387",
    },
    {
      name: "旗舰决战",
      boss: "雷霆母舰",
      hp: 280,
      patterns: ["ring", "lanes", "sweep", "crossfire"],
      top: "#21192f",
      bottom: "#522b47",
      glow: "#e1738e",
    },
  ];
  const types = {
    scout: { speed: 98, hp: 1, radius: 15, points: 100, color: "#ff9f72" },
    wing: { speed: 72, hp: 2, radius: 18, points: 160, color: "#d49eff" },
    armor: { speed: 52, hp: 5, radius: 24, points: 350, color: "#fb789b" },
    interceptor: {
      speed: 155,
      hp: 2,
      radius: 16,
      points: 220,
      color: "#ffe08a",
    },
    asteroid: { speed: 64, hp: 7, radius: 26, points: 200, color: "#9babb8" },
    mine: { speed: 115, hp: 6, radius: 18, points: 280, color: "#ffa466" },
    cruiser: { speed: 42, hp: 16, radius: 27, points: 600, color: "#91edca" },
  };
  const weapons = {
    spread: { name: "散射炮", label: "1", color: "#91efff", cooldown: 0.17 },
    lance: { name: "穿透炮", label: "2", color: "#e1acff", cooldown: 0.24 },
    missile: { name: "追踪弹", label: "3", color: "#ffda86", cooldown: 0.3 },
  };
  const weaponTypes = Object.keys(weapons);
  const upgrades = [
    { id: "damage", label: "强化弹头 · 永久伤害 +20%" },
    { id: "cooling", label: "冷却改造 · 射速 +12%" },
    { id: "hull", label: "生命强化 · 上限增加 1 颗心，恢复 2 颗心" },
    { id: "drone", label: "护航僚机 · 增加一架自动射击僚机" },
    { id: "magnet", label: "补给牵引 · 扩大拾取范围，恢复 1 颗心" },
    { id: "reactor", label: "反应堆 · EMP 充能速度 +30%，立即充满" },
  ];
  const supplies = {
    ...weapons,
    power: { label: "P", color: "#f4fbff" },
    repair: { label: "+", color: "#a7ffb6" },
    shield: { label: "S", color: "#c6abff" },
    rapid: { label: "F", color: "#ffdf86" },
  };
  const supportSupplies = ["shield", "repair", "rapid", "shield", "power"];
  const stars = Array.from({ length: 94 }, (_, i) => ({
    x: (i * 169 + i * i * 7) % width,
    y: (i * 139 + i * i * 11) % height,
    size: i % 9 === 0 ? 2 : 1,
    speed: 24 + ((i * 11) % 72),
    opacity: 0.24 + ((i * 7) % 13) / 19,
  }));
  const recordKey = "evans-arcade-thunder-best";
  const digits = (value, count) => String(value).padStart(count, "0");
  const touches = (a, b) =>
    Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
  let best = 0;
  try {
    best = Number(localStorage.getItem(recordKey)) || 0;
  } catch {
    /* Storage may be disabled. */
  }

  let player,
    bullets,
    hostiles,
    enemies,
    drops,
    sparks,
    boss,
    sector,
    elapsed,
    clock,
    wave,
    nextWave,
    score,
    target;
  let lastBackground, backdrop;
  let round,
    weapon,
    weaponLevels,
    damage,
    cooling,
    drones,
    magnet,
    reactor,
    energy,
    combo,
    comboTime,
    lasers,
    hazardTimer,
    transition,
    pulse;

  function reset() {
    player = {
      x: width / 2,
      y: height - 75,
      radius: 8,
      health: 3 * fullHeart,
      maxHealth: 3 * fullHeart,
      cooldown: 0,
      shield: 0,
      rapid: 0,
      lean: 0,
    };
    round = 1;
    weapon = "spread";
    weaponLevels = { spread: 1, lance: 1, missile: 1 };
    damage = 1;
    cooling = 1;
    drones = 0;
    magnet = 30;
    reactor = 1;
    energy = 100;
    combo = 0;
    comboTime = 0;
    lasers = [];
    hazardTimer = 8;
    transition = false;
    pulse = 0;
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
    } catch {
      /* Keep the current session record if storage is disabled. */
    }
  }

  function updateHud(game) {
    game.stat("score", digits(score, 5));
    game.stat("best", digits(best, 5));
    game.stat("sector", `${round}轮 · ${sector + 1}/${sectors.length}`);
    const healthLabel = `血量 ${player.health / fullHeart} / ${player.maxHealth / fullHeart} 颗心`;
    if (hearts.getAttribute("aria-label") !== healthLabel) {
      hearts.setAttribute("aria-label", healthLabel);
      hearts.replaceChildren();
      for (let i = 0; i < player.maxHealth; i += fullHeart) {
        const remaining = player.health - i;
        const icon = document.createElement("span");
        icon.dataset.fill = remaining >= fullHeart ? "full" : remaining > 0 ? "half" : "empty";
        hearts.append(icon);
      }
    }
    game.stat("power", `Lv.${weaponLevels[weapon]}`);
    game.stat("shield", `${Math.ceil(player.shield)}s`);
    game.stat("rapid", `${Math.ceil(player.rapid)}s`);
    game.stat("weapon", weapons[weapon].name);
    for (const kind of weaponTypes)
      game.stat(kind, `${weapons[kind].label} Lv.${weaponLevels[kind]}`);
    for (const button of weaponButtons) {
      const active = button.dataset.hold === weapon;
      if (button.getAttribute("aria-pressed") !== String(active))
        button.setAttribute("aria-pressed", String(active));
    }
    const charge = Math.floor(energy);
    game.stat("energy", `${charge}%`);
    if (empMeter.value !== charge) empMeter.value = charge;
    game.stat(
      "combo",
      `${combo} 连击 · ×${(1 + Math.min(2, combo * 0.05)).toFixed(1)}`,
    );
    game.stat(
      "phase",
      boss
        ? `${sectors[sector].boss} · 阶段 ${boss.phase}`
        : `${sectors[sector].name} · ${encounter()} · 首领 ${Math.max(0, Math.ceil(stageDuration() - clock))}s`,
    );
  }

  function stageDuration() {
    return 55 + Math.min(sector, 4) * 6;
  }

  function difficulty() {
    return Math.min(sector, 4) + Math.max(0, sector - 4) * 0.55;
  }
  function encounter() {
    return ["编队突袭", "危险航道", "精英拦截"][
      Math.min(2, Math.floor(clock / (stageDuration() / 3)))
    ];
  }

  function spawnWave() {
    const center = 90 + Math.random() * 240;
    const phase = Math.min(2, Math.floor(clock / (stageDuration() / 3)));
    const formation = [
      ["scout", "wing", "interceptor", "wing"],
      ["mine", "asteroid", "armor", "interceptor"],
      ["cruiser", "interceptor", "armor", "wing"],
    ][phase];
    const kind = formation[wave % formation.length];
    const count = ["armor", "asteroid", "cruiser", "mine"].includes(kind)
      ? 1
      : 3 + Number(round > 1);
    for (let i = 0; i < count; i++) {
      const type = types[kind];
      const baseX = Arcade.clamp(
        center + (i - (count - 1) / 2) * 48,
        28,
        width - 28,
      );
      enemies.push({
        ...type,
        kind,
        x: baseX,
        baseX,
        y: -36 - i * 24,
        hp: type.hp * (1 + (round - 1) * 0.35 + difficulty() * 0.08),
        age: 0,
        phase: i * 0.46,
        cooldown: 1.35 + i * 0.24,
        barrier: kind === "armor" ? 5 : 0,
        supply:
          i === Math.floor(count / 2) && wave % 3 === 1
            ? supplyForWave()
            : null,
      });
    }
    wave++;
  }

  function supplyForWave() {
    const index = Math.floor(wave / 6);
    if (wave % 6 === 1) return weaponTypes[(sector + index) % weaponTypes.length];
    return supportSupplies[(sector + index) % supportSupplies.length];
  }

  function burst(x, y, color, count = 11) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + elapsed;
      const speed = 38 + (i % 5) * 30;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        color,
      });
    }
  }

  function hurt(game, amount) {
    if (player.shield > 0) return;
    player.health = Math.max(0, player.health - amount);
    combo = 0;
    comboTime = 0;
    player.shield = 1.05;
    game.effect("hit");
    burst(player.x, player.y, "#85eaff", 18);
    if (player.health === 0) {
      game.finish({
        tag: "SIGNAL LOST",
        title: "战机坠毁",
        copy: `第 ${round} 轮 · 第 ${sector + 1} 战区，得分 ${score}。飞行 ${Math.floor(elapsed / 60)} 分 ${Math.floor(elapsed % 60)} 秒。`,
      });
    }
  }

  function fire(x, y, angle, speed, radius = 5) {
    hostiles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
    });
  }

  function aim(x, y) {
    return Math.atan2(player.y - y, player.x - x);
  }

  function updatePlayer(dt, game) {
    for (const name of weaponTypes)
      if (game.pressed(name)) weapon = name;
    if (game.pressed("bomb") && energy >= 100) {
      energy = 0;
      pulse = 0.65;
      hostiles = [];
      lasers = [];
      player.shield = Math.max(player.shield, .75);
      for (const enemy of enemies) {
        enemy.barrier = 0;
        enemy.hp -= 12;
        if (enemy.hp <= 0) destroyEnemy(enemy, game);
      }
      if (boss && boss.y >= 72) boss.hp = Math.max(1, boss.hp - 40);
      game.effect("clear");
    }
    const dx = Number(game.held("right")) - Number(game.held("left"));
    const dy = Number(game.held("down")) - Number(game.held("up"));
    const oldX = player.x;
    if (game.dragging()) {
      player.x += (target.x - player.x) * Math.min(1, dt * 19);
      player.y += (target.y - player.y) * Math.min(1, dt * 19);
    } else {
      const speed =
        (game.held("focus") ? 145 : 285) / (Math.hypot(dx, dy) || 1);
      player.x += dx * speed * dt;
      player.y += dy * speed * dt;
    }
    player.x = Arcade.clamp(player.x, 18, width - 18);
    player.y = Arcade.clamp(player.y, 68, height - 22);
    player.lean +=
      (Arcade.clamp((player.x - oldX) * 0.037, -0.28, 0.28) - player.lean) *
      0.28;
    player.shield = player.shield <= dt + 1e-9 ? 0 : player.shield - dt;
    player.rapid = Math.max(0, player.rapid - dt);
    player.cooldown -= dt;
    if (player.cooldown <= 0) {
      const level = weaponLevels[weapon];
      player.cooldown =
        (weapons[weapon].cooldown / cooling) *
        (player.rapid > 0 ? 0.6 : 1);
      const shot = (x, vx, kind = weapon, rank = level) =>
        bullets.push({
          x,
          y: player.y - 17,
          vx,
          vy: kind === "missile" ? -310 : -525,
          radius: kind === "lance" ? 5 + rank : 4,
          kind,
          damage:
            damage * (kind === "lance" ? 2.3 + (rank - 1) * 0.8 : kind === "missile" ? 1.7 : 1),
          hits: new Set(),
          pierce: kind === "lance" ? 2 + rank : 1,
          age: 0,
          trail: kind === "missile" ? [] : null,
        });
      if (weapon === "missile") {
        for (let i = 0; i < level; i++) {
          const offset = i - (level - 1) / 2;
          shot(player.x + offset * 18, offset * 95);
        }
      } else {
        shot(player.x, 0);
        if (weapon === "spread" && level >= 2) {
          shot(player.x - 12, -72);
          shot(player.x + 12, 72);
        }
        if (weapon === "spread" && level >= 3) {
          shot(player.x - 20, -140);
          shot(player.x + 20, 140);
        }
      }
      for (let i = 0; i < drones; i++)
        shot(
          player.x + (i % 2 ? 1 : -1) * (28 + Math.floor(i / 2) * 10),
          0,
          "spread",
          1,
        );
      game.effect("shoot");
    }
  }

  function updateEnemies(dt) {
    const threat = difficulty();
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      enemy.age += dt;
      if (enemy.kind === "mine") {
        enemy.y = Math.min(230, enemy.y + enemy.speed * dt);
        if (enemy.y === 230) {
          enemy.fuse = (enemy.fuse ?? 1.3) - dt;
          if (enemy.fuse <= 0) {
            for (let i = 0; i < 14; i++)
              fire(enemy.x, enemy.y, i * Math.PI / 7 + enemy.phase, 155 + threat * 12, 5);
            burst(enemy.x, enemy.y, enemy.color, 18);
            enemy.hp = 0;
          }
        }
        continue;
      }
      if (enemy.kind === "interceptor" && enemy.y >= 68) {
        if (!enemy.dive) {
          enemy.dive = {
            warning: .65,
            vx: Arcade.clamp((player.x - enemy.x) * 1.3, -235, 235),
          };
        }
        enemy.dive.warning -= dt;
        if (enemy.dive.warning <= 0) {
          enemy.y += (300 + threat * 20) * dt;
          enemy.x = Arcade.clamp(enemy.x + enemy.dive.vx * dt, 16, width - 16);
        }
        continue;
      }
      const hovering =
        enemy.kind === "cruiser" && enemy.y >= 125 && enemy.age < 11;
      if (!hovering)
        enemy.y += (enemy.speed + threat * 7 + (round - 1) * 9) * dt;
      enemy.x = Arcade.clamp(
        enemy.baseX +
          Math.sin(enemy.age * 2.5 + enemy.phase) *
            (enemy.kind === "wing" ? 54 : 19),
        18,
        width - 18,
      );
      enemy.cooldown -= dt;
      if (enemy.kind === "asteroid") continue;
      if (enemy.cooldown > 0 || enemy.y < 30 || enemy.y > player.y - 75)
        continue;
      const angle = aim(enemy.x, enemy.y);
      if (enemy.kind === "armor" || enemy.kind === "cruiser") {
        for (const spread of [-0.24, 0, 0.24])
          fire(enemy.x, enemy.y + 15, angle + spread, 168 + threat * 17);
      } else if (enemy.kind === "wing" || sector > 0) {
        fire(enemy.x, enemy.y + 12, angle, 156 + threat * 18);
      }
      enemy.cooldown = enemy.kind === "armor" ? 1.5 : 2.3;
    }
  }

  function updateBoss(dt, game) {
    if (!boss) return;
    boss.age += dt;
    boss.y = Math.min(113, boss.y + 67 * dt);
    boss.x = width / 2 + Math.sin(boss.age * 0.95) * 105;
    boss.cooldown -= dt;
    const phase =
      boss.hp < boss.maxHp * 0.3 ? 3 : boss.hp < boss.maxHp * 0.65 ? 2 : 1;
    if (phase !== boss.phase) {
      boss.phase = phase;
      game.effect("clear");
      hazardTimer = Math.min(hazardTimer, 1.5);
      if (phase >= 2) spawnWave();
    }
    if (boss.cooldown > 0 || boss.y < 72) return;
    const angle = boss.salvo % 2 ? Math.PI / 2 : aim(boss.x, boss.y);
    const { patterns } = sectors[sector];
    const pattern = patterns[boss.salvo % patterns.length];
    if (pattern === "ring") {
      for (let i = 0; i < 12; i++)
        fire(boss.x, boss.y, (i * Math.PI) / 6 + boss.age * 0.2, 135 + difficulty() * 5, 5);
    } else if (pattern === "crossfire") {
      for (const offset of [-40, 40]) {
        for (const spread of [-0.18, 0, 0.18])
          fire(boss.x + offset, boss.y + 20, angle + spread, 174 + difficulty() * 4, 5);
      }
    } else if (pattern === "sweep") {
      const rotation = Math.sin(boss.salvo * 1.35) * 0.48;
      for (let i = -3; i <= 3; i++)
        fire(boss.x, boss.y + 29, Math.PI / 2 + rotation + i * 0.18, 213, 5);
    } else if (pattern === "lanes") {
      const gap = Math.floor(player.x / 60);
      for (let lane = 0; lane < 7; lane++) {
        if (lane === gap) continue;
        for (const offset of [-16, 0, 16])
          fire(30 + lane * 60 + offset, boss.y + 12, Math.PI / 2, 215, 7);
      }
    } else {
      const spreadCount = sector === 0 ? 1 : 2;
      for (let i = -spreadCount; i <= spreadCount; i++)
        fire(boss.x, boss.y + 29, angle + i * 0.235, 160 + difficulty() * 8, 6);
    }
    boss.salvo++;
    if (boss.phase >= 2) {
      for (let i = 0; i < 8; i++)
        fire(
          boss.x,
          boss.y,
          (i * Math.PI) / 4 + boss.age * 0.22,
          120 + round * 8,
          4,
        );
    }
    boss.cooldown = (1.5 - boss.phase * 0.23) / (1 + (round - 1) * 0.12);
  }

  function clearSector(game) {
    addScore(1500 + sector * 500);
    game.effect("clear");
    boss = null;
    hostiles = [];
    lasers = [];
    enemies = [];
    bullets = [];
    drops = [];
    transition = true;
    const pool = upgrades.filter(
      (item) =>
        !(item.id === "drone" && drones >= 4) &&
        !(item.id === "cooling" && cooling >= 2) &&
        !(item.id === "hull" && player.maxHealth >= 8 * fullHeart),
    ).map((item) => {
      if (item.id === "magnet" && magnet >= 180)
        return { ...item, label: "牵引维护 · 恢复 1 颗心（范围已满）" };
      if (item.id === "reactor" && reactor >= 3)
        return { ...item, label: "能量补给 · EMP 立即充满（充能速度已满）" };
      return item;
    });
    const options = [];
    while (options.length < 3)
      options.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const finalSector = sector === sectors.length - 1;
    if (finalSector)
      options.push({ id: "finish", label: "结算本局 · 结束远征" });
    game.choose(
      {
        tag: "HANGAR / UPGRADE",
        title: finalSector ? "本轮战役完成" : "进入战地机库",
        copy:
          finalSector
            ? `已打通全部 ${sectors.length} 关。选择改造进入下一轮，或结算成绩。`
            : "选择一项改造，带着当前血量进入下一战区。",
      },
      options,
      (id) => {
        if (id === "finish") {
          game.finish({
            tag: "MISSION COMPLETE",
            title: "远征完成",
            copy: `完成 ${round} 轮战役，总分 ${score}。`,
          });
          return false;
        }
        if (id === "damage") damage += 0.2;
        if (id === "cooling") cooling = Math.min(2, cooling + 0.12);
        if (id === "hull") {
          player.maxHealth += fullHeart;
          heal(2 * fullHeart);
        }
        if (id === "drone") drones++;
        if (id === "magnet") {
          magnet = Math.min(180, magnet + 40);
          heal(fullHeart);
        }
        if (id === "reactor") {
          reactor = Math.min(3, reactor + 0.3);
          energy = 100;
        }
        nextSector(game);
      },
    );
  }

  function nextSector(game) {
    sector++;
    if (sector === sectors.length) {
      sector = 0;
      round++;
    }
    clock = 0;
    wave = 0;
    nextWave = 2;
    enemies = [];
    bullets = [];
    drops = [];
    player.shield = Math.max(player.shield, .75);
    transition = false;
    hazardTimer = 8;
    updateHud(game);
  }

  function destroyEnemy(enemy, game) {
    combo = comboTime > 0 ? combo + 1 : 1;
    comboTime = 3;
    energy = Math.min(100, energy + 4);
    addScore(Math.round(enemy.points * (1 + Math.min(2, combo * 0.05))));
    burst(enemy.x, enemy.y, enemy.color);
    if (enemy.supply)
      drops.push({ x: enemy.x, y: enemy.y, kind: enemy.supply, radius: 12 });
    game.effect("pop");
  }

  function heal(amount) {
    player.health = Math.min(player.maxHealth, player.health + amount);
  }

  function collisions(game) {
    for (const bullet of bullets) {
      if (
        boss &&
        !bullet.hits.has(boss) &&
        boss.y >= 72 &&
        touches(bullet, boss)
      ) {
        bullet.spent = true;
        boss.hp -= bullet.damage;
        burst(bullet.x, bullet.y, weapons[bullet.kind].color, 5);
        if (boss.hp <= 0) {
          burst(boss.x, boss.y, "#ffe0aa", 55);
          clearSector(game);
          return;
        }
        continue;
      }
      const enemy = enemies.find(
        (candidate) =>
          candidate.hp > 0 &&
          !bullet.hits.has(candidate) &&
          touches(bullet, candidate),
      );
      if (!enemy) continue;
      bullet.hits.add(enemy);
      bullet.pierce--;
      bullet.spent = bullet.pierce <= 0;
      if (enemy.barrier > 0 && bullet.kind !== "lance" &&
          bullet.y >= enemy.y && Math.abs(bullet.x - enemy.x) < enemy.radius * .72) {
        enemy.barrier--;
        burst(bullet.x, bullet.y, "#8be8ff", 3);
        continue;
      }
      enemy.hp -= bullet.damage;
      burst(bullet.x, bullet.y, weapons[bullet.kind].color, bullet.kind === "missile" ? 8 : 3);
      if (enemy.hp > 0) continue;
      destroyEnemy(enemy, game);
    }

    for (const drop of drops) {
      if (!touches(player, drop)) continue;
      if (Object.hasOwn(weapons, drop.kind) || drop.kind === "power") {
        if (drop.kind !== "power") weapon = drop.kind;
        weaponLevels[weapon] = Math.min(maxWeaponLevel, weaponLevels[weapon] + 1);
      } else if (drop.kind === "repair") heal(fullHeart);
      else if (drop.kind === "shield") player.shield = shieldDuration;
      else if (drop.kind === "rapid") player.rapid = 10;
      addScore(50);
      drop.taken = true;
      game.effect("coin");
    }
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || !touches(player, enemy)) continue;
      enemy.hp = 0;
      burst(enemy.x, enemy.y, enemy.color);
      hurt(game, fullHeart);
      if (player.health === 0) return;
    }
    if (boss && touches(player, boss)) hurt(game, fullHeart);
    if (player.health === 0) return;
    for (const shot of hostiles) {
      const distance = Math.hypot(player.x - shot.x, player.y - shot.y);
      if (
        !shot.grazed &&
        distance < player.radius + shot.radius + 14 &&
        distance >= player.radius + shot.radius &&
        player.shield <= 0
      ) {
        shot.grazed = true;
        energy = Math.min(100, energy + 3);
        addScore(10);
      }
      if (!touches(player, shot)) continue;
      shot.spent = true;
      hurt(game, 1);
      if (player.health === 0) return;
    }
  }

  function update(dt, game) {
    if (transition) return;
    elapsed += dt;
    clock += dt;
    comboTime = Math.max(0, comboTime - dt);
    if (!comboTime) combo = 0;
    energy = Math.min(100, energy + dt * 2.5 * reactor);
    pulse = Math.max(0, pulse - dt);
    hazardTimer -= dt;
    if (hazardTimer <= 0 && (encounter() === "危险航道" || boss?.phase >= 2)) {
      lasers.push({
        x: Arcade.clamp(player.x + (Math.random() - 0.5) * 130, 35, width - 35),
        age: 0,
      });
      hazardTimer = boss ? 4.5 : 7;
    }
    lasers.forEach((laser) => (laser.age += dt));
    lasers = lasers.filter((laser) => laser.age < 1.8);
    if (clock >= nextWave && !boss) {
      if (clock >= stageDuration()) {
        if (enemies.length === 0) {
          const hp = sectors[sector].hp * 3 * (1 + (round - 1) * 0.5);
          boss = {
            x: width / 2,
            y: -65,
            radius: 53,
            hp,
            maxHp: hp,
            age: 0,
            salvo: 0,
            cooldown: 2,
            phase: 1,
          };
          game.effect("clear");
        }
      } else {
        spawnWave();
        nextWave += Math.max(1.65, 2.55 - difficulty() * 0.16);
      }
    }
    updatePlayer(dt, game);
    updateEnemies(dt);
    updateBoss(dt, game);
    for (const bullet of bullets) {
      bullet.age += dt;
      if (bullet.kind === "missile") {
        bullet.trail.push([bullet.x, bullet.y]);
        if (bullet.trail.length > 9) bullet.trail.shift();
        const target =
          boss?.y >= 72 ? boss : enemies.find((enemy) => enemy.hp > 0 && enemy.y > 0);
        if (target) {
          const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
          bullet.vx += (Math.cos(angle) * 340 - bullet.vx) * dt * 5;
          bullet.vy += (Math.sin(angle) * 340 - bullet.vy) * dt * 5;
        }
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
    }
    for (const shot of hostiles) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
    }
    for (const drop of drops) {
      const distance = Math.hypot(player.x - drop.x, player.y - drop.y);
      if (distance < magnet) {
        drop.x += (player.x - drop.x) * dt * 8;
        drop.y += (player.y - drop.y) * dt * 8;
      } else drop.y += 81 * dt;
    }
    for (const spark of sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.age += dt;
    }
    collisions(game);
    if (!transition && player.health > 0) {
      for (const laser of lasers)
        if (
          laser.age >= 1.15 &&
          Math.abs(player.x - laser.x) < 16 + player.radius
        )
          hurt(game, fullHeart);
    }
    bullets = bullets.filter(
      ({ spent, y, x, age }) =>
        !spent &&
        age < 4 &&
        y > -10 &&
        y < height + 20 &&
        x > -10 &&
        x < width + 10,
    );
    hostiles = hostiles.filter(
      ({ spent, y, x }) =>
        !spent && y < height + 15 && y > -20 && x > -20 && x < width + 20,
    );
    enemies = enemies.filter(({ hp, y }) => hp > 0 && y < height + 36);
    drops = drops.filter(({ taken, y }) => !taken && y < height + 14);
    sparks = sparks.filter(({ age }) => age < 0.5);
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
    ctx.globalAlpha = 0.17;
    for (let i = 0; i < 3; i++) {
      const y = ((elapsed * (12 + i * 6) + i * 247) % 840) - 180;
      poly(ctx, zone.glow, [
        [0, y + 65],
        [width, y],
        [width, y + 58],
        [0, y + 155],
      ]);
    }
    for (const star of stars) {
      ctx.globalAlpha = star.opacity;
      rect(
        ctx,
        "#dcf1ff",
        star.x,
        (star.y + elapsed * star.speed) % height,
        star.size,
        star.size * 2,
      );
    }
    ctx.globalAlpha = 1;
    for (const x of [18, width - 19]) {
      for (let y = ((elapsed * 64) % 36) - 18; y < height; y += 36)
        rect(ctx, "#b8deff42", x, y, 1, 15);
    }
  }

  function drawShip(ctx, enemy) {
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    const r = enemy.radius;
    if (enemy.kind === "mine") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "#352337";
      ctx.fill();
      ctx.strokeStyle = enemy.fuse !== undefined && Math.floor(enemy.fuse * 10) % 2 ? "#fff4b1" : enemy.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      if (enemy.fuse !== undefined) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - enemy.fuse / 1.3));
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (enemy.kind === "asteroid") {
      ctx.rotate(enemy.age * 0.6);
      poly(ctx, "#465669", [
        [-r, -8],
        [-15, -r],
        [11, -r],
        [r, -5],
        [18, 19],
        [-7, r],
        [-r, 9],
      ]);
      poly(ctx, enemy.color, [
        [-r + 4, -6],
        [-13, -r + 4],
        [9, -r + 4],
        [r - 4, -4],
        [15, 15],
        [-6, r - 4],
        [-r + 4, 7],
      ]);
      rect(ctx, "#65778b", -10, -10, 12, 10);
      rect(ctx, "#65778b", 5, 5, 8, 8);
      ctx.restore();
      return;
    }
    if (enemy.kind === "interceptor") ctx.scale(0.8, 1.35);
    poly(ctx, "#221934", [
      [-r, -r * 0.7],
      [0, -r * 0.39],
      [r, -r * 0.7],
      [r * 0.76, r * 0.52],
      [0, r],
      [-r * 0.76, r * 0.52],
    ]);
    poly(ctx, enemy.color, [
      [-r + 3, -r * 0.5],
      [-r * 0.28, -r * 0.2],
      [0, -r * 0.65],
      [r * 0.28, -r * 0.2],
      [r - 3, -r * 0.5],
      [r * 0.58, r * 0.45],
      [0, r * 0.72],
      [-r * 0.58, r * 0.45],
    ]);
    poly(ctx, "#6c385b", [
      [0, -r * 0.45],
      [r * 0.34, r * 0.1],
      [0, r * 0.54],
      [-r * 0.34, r * 0.1],
    ]);
    rect(ctx, "#fff1c5", -3, 2, 6, 5);
    if (enemy.barrier > 0) {
      ctx.strokeStyle = "#8be8ff";
      ctx.lineWidth = 2 + enemy.barrier * .6;
      ctx.beginPath();
      ctx.arc(0, 1, r + 5, Math.PI * .24, Math.PI * .76);
      ctx.stroke();
    }
    if (enemy.dive?.warning > 0) {
      ctx.fillStyle = "#ffea9a";
      ctx.font = "bold 15px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("!", 0, -r - 6);
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(enemy.dive.vx * .22, r + 65);
      ctx.strokeStyle = "#ffca7588";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoss(ctx) {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    poly(ctx, "#24142c", [
      [-76, -22],
      [-47, -11],
      [-21, -48],
      [21, -48],
      [47, -11],
      [76, -22],
      [67, 25],
      [0, 49],
      [-67, 25],
    ]);
    poly(ctx, sectors[sector].bottom, [
      [-70, -16],
      [-44, -4],
      [-17, -41],
      [17, -41],
      [44, -4],
      [70, -16],
      [60, 19],
      [0, 41],
      [-60, 19],
    ]);
    poly(ctx, sectors[sector].glow, [
      [-49, 2],
      [-15, -33],
      [15, -33],
      [49, 2],
      [21, 15],
      [0, 27],
      [-21, 15],
    ]);
    poly(ctx, "#462653", [
      [0, -26],
      [16, -1],
      [0, 20],
      [-16, -1],
    ]);
    rect(ctx, "#ffeab3", -5, -3, 10, 10);
    rect(ctx, "#ffb296", -53, 7, 14, 6);
    rect(ctx, "#ffb296", 39, 7, 14, 6);
    ctx.restore();
    rect(ctx, "#2a1932", 66, 63, width - 132, 6);
    rect(ctx, "#ff8fac", 66, 63, ((width - 132) * boss.hp) / boss.maxHp, 6);
    ctx.fillStyle = "#ffe1ea";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(sectors[sector].boss, width / 2, 58);
  }

  function drawPlayer(ctx) {
    if (player.health === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.lean);
    if (player.shield > 0) {
      ctx.strokeStyle =
        player.shield >= 1 || Math.floor(elapsed * 15) % 2 ? "#8cf4ffb0" : "#8cf4ff36";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    poly(ctx, "#54c5ff", [
      [-7, 12],
      [7, 12],
      [3, 24 + Math.sin(elapsed * 72) * 5],
      [0, 28],
      [-3, 24],
    ]);
    poly(ctx, "#223d65", [
      [0, -23],
      [7, -5],
      [22, 14],
      [19, 20],
      [0, 13],
      [-19, 20],
      [-22, 14],
      [-7, -5],
    ]);
    poly(ctx, "#87e2fa", [
      [0, -20],
      [6, -3],
      [19, 13],
      [16, 15],
      [0, 9],
      [-16, 15],
      [-19, 13],
      [-6, -3],
    ]);
    poly(ctx, "#f4fbff", [
      [0, -19],
      [5, -3],
      [4, 10],
      [-4, 10],
      [-5, -3],
    ]);
    rect(ctx, "#4278be", -3, -5, 6, 9);
    ctx.restore();
  }

  function drawBullet(ctx, bullet) {
    const { x, y, vx, vy, kind, radius, age, trail } = bullet;
    ctx.save();
    if (trail?.length > 1) {
      ctx.beginPath();
      ctx.moveTo(...trail[0]);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(...trail[i]);
      ctx.lineTo(x, y);
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.strokeStyle = "#ff9d4855";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = "#ffc779aa";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.translate(x, y);
    ctx.rotate(Math.atan2(vy, vx) + Math.PI / 2);
    if (kind === "missile") {
      const flame = 14 + Math.sin(age * 43) * 4;
      poly(ctx, "#ff9d48", [[-3, 5], [3, 5], [0, flame]]);
      poly(ctx, "#fff5b8", [[-1.6, 5], [1.6, 5], [0, flame - 4]]);
      poly(ctx, "#eaa65d", [[-3, -2], [-6, 7], [0, 5], [6, 7], [3, -2]]);
      poly(ctx, "#ffebb4", [[0, -9], [3, -3], [3, 5], [-3, 5], [-3, -3]]);
    } else if (kind === "lance") {
      const tail = 25 + radius * 2;
      poly(ctx, "#b16cff44", [[0, -14], [radius + 4, 1], [0, tail], [-radius - 4, 1]]);
      poly(ctx, "#d9a5ff", [[0, -11], [radius - 1, 0], [0, tail - 4], [1 - radius, 0]]);
      poly(ctx, "#fff4ff", [[0, -9], [2, 0], [0, tail - 9], [-2, 0]]);
    } else {
      poly(ctx, "#62e5ff44", [[0, -10], [6, -1], [0, 23], [-6, -1]]);
      poly(ctx, "#91efff", [[0, -8], [3.5, -2], [0, 17], [-3.5, -2]]);
      poly(ctx, "#ecfdff", [[0, -6], [1.5, -2], [0, 7], [-1.5, -2]]);
    }
    ctx.restore();
  }

  function draw(ctx) {
    drawBackground(ctx);
    for (const laser of lasers) {
      const active = laser.age >= 1.15;
      rect(
        ctx,
        active ? "#ff6783b0" : "#ffd27828",
        laser.x - 16,
        0,
        32,
        height,
      );
      rect(ctx, active ? "#fff2d9" : "#ffd278", laser.x - 1, 0, 2, height);
      ctx.fillStyle = "#fff0c4";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(active ? "!" : "预警", laser.x, height - 25);
    }
    enemies.forEach((enemy) => drawShip(ctx, enemy));
    if (boss) drawBoss(ctx);
    for (const drop of drops) {
      rect(ctx, supplies[drop.kind].color, drop.x - 11, drop.y - 11, 22, 22);
      ctx.fillStyle = "#18253e";
      ctx.font = "bold 17px monospace";
      ctx.textAlign = "center";
      ctx.fillText(supplies[drop.kind].label, drop.x, drop.y + 6);
    }
    for (const bullet of bullets) drawBullet(ctx, bullet);
    for (const shot of hostiles) {
      const r = shot.radius;
      poly(ctx, "#fb718d", [
        [shot.x, shot.y - r],
        [shot.x + r, shot.y],
        [shot.x, shot.y + r],
        [shot.x - r, shot.y],
      ]);
      rect(ctx, "#ffddc2", shot.x - 1, shot.y - 1, 2, 2);
    }
    drawPlayer(ctx);
    for (let i = 0; i < drones; i++) {
      const x = player.x + (i % 2 ? 1 : -1) * (28 + Math.floor(i / 2) * 10);
      poly(ctx, "#b3f1db", [
        [x, player.y - 9],
        [x + 6, player.y + 5],
        [x, player.y + 2],
        [x - 6, player.y + 5],
      ]);
    }
    if (player.health > 0)
      rect(ctx, "#ffffff", player.x - 2, player.y - 2, 4, 4);
    if (pulse > 0) {
      ctx.strokeStyle = "#9bf5ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, (1 - pulse / 0.65) * 720, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const spark of sparks) {
      ctx.globalAlpha = 1 - spark.age / 0.5;
      rect(ctx, spark.color, spark.x, spark.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    if (clock < 2.4 && elapsed > 0) {
      ctx.fillStyle = "#eef5ff";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${digits(sector + 1, 2)}  /  ${sectors[sector].name}`, width / 2, 85);
    }
  }

  const hearts = document.querySelector("[data-health]");
  const empMeter = document.querySelector("[data-emp-meter]");
  const weaponButtons = [...document.querySelectorAll(".combat-controls [aria-pressed]")];
  const game = Arcade.mount({
    keys: {
      Space: "bomb",
      KeyX: "bomb",
      KeyB: "bomb",
      Digit1: "spread",
      Digit2: "lance",
      Digit3: "missile",
      ShiftLeft: "focus",
      ShiftRight: "focus",
    },
    reset,
    update,
    draw,
    drag(x, y) {
      target.x = Arcade.clamp(x, 18, width - 18);
      target.y = Arcade.clamp(y - 25, 68, height - 22);
    },
  });
  if (game) updateHud(game);
})();
