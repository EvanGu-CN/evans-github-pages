"use strict";

(() => {
  const { stages, finalRooms, label } = MarioLevels;
  const tile = 16;
  const floor = 208;
  const width = 384;
  const gravity = 820;
  const clamp = Arcade.clamp;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const inColumn = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x;
  const heights = { g: 13, k: 20, para: 20, beetle: 13, spiny: 13, hammer: 22, squid: 16, fish: 12, leaper: 12, lakitu: 17, boss: 28 };
  const chainPoints = [100, 200, 400, 500, 800, 1000, 2000, 4000, 8000];
  const practice = document.querySelector("[data-practice]");
  const players = document.querySelector("[data-players]");
  for (const [index, [name]] of stages.entries()) {
    practice.append(new Option(`${label(index)} · ${name}`, index));
  }

  let stage, mode, secondQuest, turns, turn, record, level, rooms, room, area, player;
  let clock, timer, camera, phase, phaseTime, returnPoint, flash, fireworks, finalClear;

  function makeRoom(theme, length, layout) {
    const gaps = layout.filter(([kind]) => kind === "gap" || kind === "lava").sort((a, b) => a[1] - b[1]);
    const result = {
      theme, length: length * tile, solids: [], platforms: [], enemies: [], pickups: [], pipes: [],
      guns: [], bars: [], gates: [], vines: [], shots: [], items: [], effects: [], lava: [],
      exit: null, boss: null, flag: null, time: 0,
    };
    let groundStart = 0;
    const addBlock = (kind, x, y, w, h, item, extra, route) => {
      const block = { kind, x, y, w, h, item, extra, route, bump: 0 };
      result.solids.push(block);
      return block;
    };
    const addGround = (to) => {
      if (to > groundStart) addBlock("ground", groundStart * tile, floor, (to - groundStart) * tile, 36);
    };
    for (const [kind, x, count] of gaps) {
      addGround(x);
      if (kind === "lava") result.lava.push({ x: x * tile, w: count * tile });
      groundStart = x + count;
    }
    addGround(length);

    const coin = (x, y) => result.pickups.push({ x: x + 4, y, w: 8, h: 12 });
    const addPlatform = (x, elevation, span, axis, amplitude) => {
      const y = floor - elevation * tile;
      const platform = { x, y, startX: x, startY: y, w: span * tile, h: 6, axis, amplitude: amplitude * tile, speed: 0 };
      result.platforms.push(platform);
      return platform;
    };

    for (const [kind, column, a, b, c, d] of layout) {
      const x = column * tile;
      if (kind !== "boss" && Object.hasOwn(heights, kind)) {
        const water = kind === "squid" || kind === "fish";
        const type = secondQuest && kind === "g" ? "beetle" : kind;
        for (let i = 0; i < (water ? b ?? 1 : a ?? 1); i++) {
          const y = water ? floor - a * tile + (i % 2) * tile : floor - heights[type];
          result.enemies.push(makeEnemy(type, x + i * 24, y, i % 2 === 1));
        }
      } else if (kind === "b" || kind === "q" || kind === "hidden") {
        for (let i = 0; i < (kind === "b" ? b : 1); i++) {
          const bx = x + i * tile;
          const y = floor - a * tile;
          const existing = result.solids.findIndex(block => block.x === bx && block.y === y && block.kind === "b");
          if (existing >= 0) result.solids.splice(existing, 1);
          addBlock(kind, bx, y, tile, tile, kind === "b" ? null : b, c, d);
        }
      } else if (kind === "p" || kind === "gun") {
        const block = addBlock(kind, x, floor - a * tile, (kind === "p" ? 2 : 1) * tile, a * tile);
        if (kind === "p" && b) result.pipes.push({ ...block, to: b, destination: c });
        if (kind === "p" && !b && stage > 0) {
          result.enemies.push({ ...makeEnemy("plant", x + 10, block.y), pipeTop: block.y });
        }
        if (kind === "gun") result.guns.push({ x, y: block.y + 2, next: 1 + column % 3 * .3 });
      } else if (kind === "coin" || kind === "arc") {
        for (let i = 0; i < b; i++) {
          const rise = kind === "arc" ? Math.sin(i / Math.max(1, b - 1) * Math.PI) * 19 : 0;
          coin(x + i * tile, floor - a * tile - rise);
        }
      } else if (kind === "stairs") {
        for (let i = 0; i < a; i++) {
          addBlock("stone", x + i * tile, floor - (i + 1) * tile, tile, (i + 1) * tile);
        }
      } else if (kind === "shelf") {
        addBlock("shelf", x, floor - a * tile, b * tile, 8);
      } else if (kind === "reef" || kind === "wall") {
        addBlock(kind, x, floor - a * tile, (b ?? 2) * tile, a * tile);
      } else if (kind === "lift") {
        addPlatform(x, a, Math.max(2, b - Number(secondQuest)), c, d);
      } else if (kind === "balance") {
        const left = addPlatform(x, b, c, "balance", 0);
        const right = addPlatform(a * tile, b, c, "balance", 0);
        left.partner = right;
        right.partner = left;
      } else if (kind === "spring") {
        addBlock("spring", x + 2, floor - 10, 12, 10);
      } else if (kind === "bar") {
        result.bars.push({ x: x + 8, y: floor - a * tile + 4, size: b, spin: column % 2 ? 1 : -1 });
      } else if (kind === "firejump" || kind === "leaper") {
        result.enemies.push(makeEnemy(kind, x, floor + 12));
      } else if (kind === "maze") {
        result.gates.push({ x, back: a * tile, upper: b === "upper", passed: false });
      } else if (kind === "exit") {
        result.exit = { x, to: a, destination: b };
        addBlock("p", x + 10, floor - 24, 23, 24);
      } else if (kind === "boss") {
        const bridge = addBlock("bossBridge", x - 44, floor, 141, 5);
        result.boss = { bridge, axe: x + 115, x };
        const boss = makeEnemy("boss", x, floor - heights.boss);
        boss.hp = 5;
        result.enemies.push(boss);
      }
    }
    if (result.boss) {
      const { bridge } = result.boss;
      const ground = result.solids.find(block => block.kind === "ground" &&
        block.x <= bridge.x && block.x + block.w >= bridge.x + bridge.w);
      const right = ground.x + ground.w;
      ground.w = bridge.x - ground.x;
      addBlock("ground", bridge.x + bridge.w, floor, right - bridge.x - bridge.w, 36);
      result.lava.push({ x: bridge.x, w: bridge.w });
    } else if (!result.exit && !layout.some(([kind]) => kind === "wall") && !["cloud", "cellar", "warp"].includes(theme)) {
      result.flag = (length - 3) * tile;
    }
    return result;
  }

  function makeEnemy(type, x, y, red = false) {
    const w = type === "boss" ? 25 : type === "squid" ? 12 : 14;
    return {
      type, x, y, baseX: x, baseY: y, w, h: heights[type] ?? 13, vx: -36, vy: 0,
      red, next: 1.8, shell: "", chain: 0, awake: false, ground: false,
    };
  }

  function openRoom(key, destination, drop = false) {
    area = key;
    if (!rooms.has(key)) {
      const [theme, length, layout] = key === "main" ? [level[1], level[2], level[4]] : makeSideRoom(key);
      rooms.set(key, makeRoom(theme, length, layout));
    }
    room = rooms.get(key);
    player.x = destination * tile;
    player.y = floor - player.h - (room.theme === "water" || drop ? 45 : 0);
    player.vx = 0;
    player.vy = 0;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.ground = false;
    player.platform = null;
    player.vine = null;
    player.chain = 0;
    camera = clamp(player.x - 105, 0, room.length - width);
  }

  function makeSideRoom(key) {
    if (key === "cellar") return ["cellar", 31, [
      ["b", 10, 2, 10], ["coin", 10, 3, 10], ["coin", 12, 4, 6], ["q", 20, 4, "coins"], ["exit", 25, "return"],
    ]];
    if (key === "cloud") return ["cloud", 45, [
      ["arc", 7, 3, 11], ["arc", 21, 3, 9], ["coin", 30, 3, 5], ["exit", 39, "return"],
    ]];
    if (key === "shore") return ["field", 25, [
      ["p", 1, 2], ["stairs", 15, 4],
    ]];
    if (key === "warp") return ["warp", 32, level[5].map((world, i) => ["p", 8 + i * 7, 2, "world", world])];
    if (key === "warp5") return ["warp", 25, [["p", 12, 2, "world", 5]]];
    return finalRooms[key];
  }

  function enterLevel(index, checkpoint = false) {
    stage = index;
    level = stages[index];
    player = {
      x: 0, y: 0, w: 12, h: record.power ? 28 : 15, power: record.power, star: 0, safe: 0, direction: 1,
      crouch: false, coyote: 0, jumpBuffer: 0, chain: 0, ground: true, platform: null, vine: null,
    };
    rooms = new Map();
    returnPoint = null;
    fireworks = 0;
    flash = null;
    finalClear = false;
    timer = stage % 4 === 3 || index >= 28 ? 1200 : 900;
    openRoom("main", checkpoint ? level[3] || 3 : 3);
    setPhase("intro", .85);
    record.stage = stage;
  }

  function newRun(start, hard = false) {
    secondQuest = hard;
    turns = Array.from({ length: mode }, () => ({ lives: 3, score: 0, coins: 0, power: 0, stage: start, checkpoint: false }));
    turn = 0;
    record = turns[turn];
    enterLevel(start);
  }

  function reset() {
    clock = 0;
    mode = Number(players.value);
    newRun(Number(practice.value));
  }

  function setPhase(kind, duration) {
    phase = kind;
    phaseTime = duration;
  }

  function changeSize(height) {
    player.y += player.h - height;
    player.h = height;
  }

  function addLife(x, y, game) {
    record.lives++;
    room.effects.push({ x, y, text: "1 UP", ttl: .8 });
    game.effect("clear");
  }

  function points(amount, x, y) {
    record.score += amount;
    room.effects.push({ x, y, text: String(amount), ttl: .66 });
  }

  function addCoin(x, y, game) {
    if (++record.coins === 100) {
      record.coins = 0;
      addLife(x, y - 12, game);
    }
    points(200, x, y);
    game.effect("coin");
  }

  function combo(actor, enemy, game) {
    const value = chainPoints[actor.chain++];
    if (value) points(value, enemy.x, enemy.y);
    else addLife(enemy.x, enemy.y, game);
    game.effect("pop");
  }

  function hitPlayer(game, fatal = false) {
    if (phase !== "play" || (!fatal && (player.safe > 0 || player.star > 0))) return;
    game.effect("hit");
    if (player.power > 0 && !fatal) {
      player.power = 0;
      player.safe = 1.9;
      changeSize(15);
      return;
    }
    player.power = 0;
    player.star = 0;
    player.vy = -205;
    player.platform = null;
    changeSize(15);
    setPhase("death", 1.15);
  }

  function afterDeath(game) {
    record.lives--;
    record.power = 0;
    const next = (turn + 1) % mode;
    if (turns[next].lives > 0) {
      turn = next;
      record = turns[turn];
    }
    if (record.lives > 0) {
      enterLevel(record.stage, record.checkpoint);
      return;
    }
    const worldStart = stage - stage % 4;
    game.choose({
      tag: "GAME OVER", title: "冒险结束", copy: `到达 ${label(stage)}，得分 ${record.score}。`,
    }, [
      { id: "retry", label: `从世界 ${Math.floor(stage / 4) + 1} 继续` },
      { id: "restart", label: "重新开始" },
    ], id => {
      if (id === "retry") newRun(worldStart, secondQuest);
      else reset();
    });
  }

  function hitBlock(block, game) {
    if (block.kind !== "q" && block.kind !== "hidden" && block.kind !== "b") return;
    if (block.kind === "b" && player.power) {
      block.broken = true;
      points(50, block.x, block.y);
      game.effect("pop");
    } else {
      block.bump = .17;
    }
    for (const enemy of room.enemies) {
      if (!enemy.dead && inColumn(enemy, block) && Math.abs(enemy.y + enemy.h - block.y) < 5) {
        enemy.dead = true;
        points(100, enemy.x, enemy.y);
      }
    }
    const { item, x, y } = block;
    if (!item) return;
    if (item === "coin" || item === "coins") {
      addCoin(x + 4, y - 13, game);
      if (item === "coins") {
        block.until ??= room.time + 4.1;
        if (room.time < block.until) return;
      }
    } else if (item === "vine") {
      room.vines.push({ x: x + 4, y, bottom: y + tile, destination: block.extra, to: block.route ?? "cloud" });
      game.effect("coin");
    } else {
      const type = item === "power" ? (player.power ? "flower" : "mushroom") : item;
      room.items.push({ type, x: x + 2, y: y + 1, w: 12, h: 13, vx: 43, vy: 0, emerge: .42, blockY: y });
      game.effect("coin");
    }
    block.kind = "used";
    block.item = null;
  }

  function solid(block) {
    return !block.broken && block.kind !== "hidden";
  }

  function horizontal(actor, dx) {
    if (!dx) return false;
    const start = actor.x;
    actor.x += dx;
    for (const block of room.solids) {
      if (!solid(block) || !overlap(actor, block)) continue;
      if (block.kind === "spring" && actor === player && actor.ground && Math.abs(actor.y + actor.h - floor) < 1) {
        actor.y = block.y - actor.h;
        continue;
      }
      if (dx > 0 && start + actor.w <= block.x + .001) actor.x = block.x - actor.w;
      if (dx < 0 && start >= block.x + block.w - .001) actor.x = block.x + block.w;
    }
    return actor.x !== start + dx;
  }

  function vertical(actor, dy, isPlayer = false) {
    if (!dy) return null;
    const top = actor.y;
    const bottom = top + actor.h;
    let contact = null;
    for (const block of room.solids) {
      if (block.broken || !inColumn(actor, block)) continue;
      if (dy > 0 && block.kind !== "hidden" && bottom <= block.y + .001 && bottom + dy >= block.y &&
          (!contact || block.y < contact.y)) contact = block;
      const underside = block.y + block.h;
      if (dy < 0 && (isPlayer || block.kind !== "hidden") && top >= underside - .001 && top + dy <= underside &&
          (!contact || underside > contact.y + contact.h)) contact = block;
    }
    if (isPlayer && dy > 0) {
      for (const platform of room.platforms) {
        if (inColumn(actor, platform) && bottom <= platform.y + .001 && bottom + dy >= platform.y &&
            (!contact || platform.y < contact.y)) contact = platform;
      }
    }
    actor.y = contact ? (dy > 0 ? contact.y - actor.h : contact.y + contact.h) : top + dy;
    return contact;
  }

  function movePlatforms(dt) {
    for (const platform of room.platforms) {
      const { x, y, startX, startY, axis, amplitude, partner } = platform;
      const rider = player.platform === platform;
      if (axis === "x") platform.x = startX + Math.sin(room.time * 1.5) * amplitude;
      if (axis === "y") platform.y = startY + Math.sin(room.time * 1.65) * amplitude;
      if (axis === "fall") {
        if (rider || platform.speed) platform.speed += dt * 105;
        platform.y += platform.speed * dt;
        if (platform.y > floor + 95 && !rider) {
          platform.y = startY;
          platform.speed = 0;
        }
      }
      if (axis === "balance" && (rider || player.platform === partner)) {
        platform.y = clamp(y + (rider ? 1 : -1) * 27 * dt, startY - 30, floor + 13);
      }
      if (rider) {
        horizontal(player, platform.x - x);
        if (platform.y >= y) player.y += platform.y - y;
        else if (vertical(player, platform.y - y)) player.platform = null;
        if (!inColumn(player, platform)) player.platform = null;
      }
    }
  }

  function startWarp(to, destination, game) {
    game.effect("pop");
    flash = { to, destination };
    setPhase("pipe", .46);
  }

  function usePipe(pipe, game) {
    if (pipe.to === "cellar") returnPoint = { area, x: pipe.destination };
    startWarp(pipe.to, pipe.destination, game);
  }

  function arriveFromWarp() {
    const { to, destination } = flash;
    if (to === "world") {
      record.checkpoint = false;
      enterLevel((destination - 1) * 4);
    } else {
      if (to === "return") openRoom(returnPoint.area, returnPoint.x, true);
      else openRoom(to, ["cellar", "warp", "warp5", "cloud"].includes(to) ? 3 : destination);
      setPhase("play", 0);
    }
  }

  function movePlayer(dt, game) {
    const water = room.theme === "water";
    const left = game.held("left");
    const right = game.held("right");
    const down = game.held("down");
    const up = game.held("up") || game.held("jump");
    const running = game.held("run");
    const direction = Number(right) - Number(left);
    const vine = room.vines.find(item => Math.abs(player.x + player.w / 2 - item.x - 4) < 10 &&
      player.y + player.h >= item.y - 1 && player.y <= item.bottom + 1);
    if (vine && (up || down || (player.vine === vine && !direction))) {
      player.vine = vine;
      player.y = clamp(player.y + (Number(down) - Number(up)) * 69 * dt, vine.y - player.h + 1, vine.bottom);
      player.x = vine.x - 2;
      player.vx = 0;
      player.vy = 0;
      player.ground = false;
      player.coyote = 0;
      if (player.y + player.h <= vine.y + 1 && vine.y <= 10) {
        if (vine.to === "cloud") returnPoint = { area, x: vine.destination };
        startWarp(vine.to, 3, game);
      }
      return null;
    }
    player.vine = null;
    if (down && player.ground) {
      const pipe = room.pipes.find(p => Math.abs(player.y + player.h - p.y) < 1 &&
        Math.abs(player.x + player.w / 2 - p.x - p.w / 2) <= 9);
      if (pipe) {
        usePipe(pipe, game);
        return null;
      }
    }
    if (player.power) {
      const crouch = down && player.ground && !water;
      if (crouch) changeSize(15);
      else if (player.h === 15) {
        const grown = { ...player, y: player.y - 13, h: 28 };
        if (!room.solids.some(block => solid(block) && overlap(grown, block))) changeSize(28);
      }
      player.crouch = player.h === 15;
    } else {
      player.crouch = false;
    }
    const speed = water ? 69 : running ? 152 : 104;
    const target = direction * speed * (player.crouch ? .2 : 1);
    const accel = room.theme === "snow" && direction === 0 ? 170 : player.ground ? 690 : 430;
    player.vx += clamp(target - player.vx, -accel * dt, accel * dt);
    if (direction) player.direction = direction;
    player.coyote = player.ground ? .068 : player.coyote - dt;
    player.jumpBuffer = game.pressed("jump") ? .11 : player.jumpBuffer - dt;
    if (player.jumpBuffer > 0 && (water || player.coyote > 0)) {
      const onSpring = player.ground && room.solids.some(block => block.kind === "spring" &&
        inColumn(player, block) && Math.abs(player.y + player.h - block.y) < 1);
      const jump = onSpring ? 470 : Math.abs(player.vx) > 128 ? 365 : 340;
      player.vy = water ? -116 : -jump;
      player.jumpBuffer = 0;
      player.coyote = 0;
      player.ground = false;
      player.platform = null;
      game.effect("jump");
    }
    if (!water && !game.held("jump") && player.vy < -148) player.vy += 1050 * dt;
    const current = water && player.y > 150 && !room.solids.some(block => block.kind === "ground" && inColumn(player, block));
    const fallAcceleration = water ? 212 + (current ? 73 : 0) : gravity;
    const fallLimit = water ? 51 + (current ? 18 : 0) : 420;
    player.vy = Math.min(fallLimit, player.vy + fallAcceleration * dt);
    if (horizontal(player, player.vx * dt)) player.vx = 0;
    player.x = clamp(player.x, camera, room.length - player.w);
    const previous = { bottom: player.y + player.h, falling: player.vy >= 0 };
    const contact = vertical(player, player.vy * dt, true);
    player.ground = Boolean(contact && previous.falling);
    player.platform = player.ground && contact.axis ? contact : null;
    if (contact) {
      if (!previous.falling) hitBlock(contact, game);
      else player.chain = 0;
      player.vy = 0;
    }
    if (player.ground && contact.kind === "spring" && game.held("jump")) {
      player.vy = -470;
      player.ground = false;
      player.coyote = 0;
      game.effect("jump");
    }
    if (water && player.y < 30) {
      player.y = 30;
      player.vy = Math.max(0, player.vy);
    }
    if (player.power === 2 && game.pressed("run") && room.shots.filter(shot => shot.type === "fireball").length < 2) {
      shoot("fireball", player.x + (player.direction > 0 ? player.w : -7), player.y + 5, player.direction * 192, 32, 1.65);
      game.effect("shoot");
    }
    return previous;
  }

  function shoot(type, x, y, vx, vy, ttl) {
    room.shots.push({ type, x, y, vx, vy, ttl, w: type === "flame" ? 22 : type === "bullet" ? 14 : 7, h: 8 });
  }

  function physicsActor(actor, dt, speed) {
    if (horizontal(actor, actor.vx * dt)) actor.vx = Math.sign(-actor.vx) * speed;
    actor.vy += gravity * dt;
    const contact = vertical(actor, actor.vy * dt);
    actor.ground = Boolean(contact && actor.vy > 0);
    if (contact) actor.vy = 0;
  }

  function updateItems(dt, game) {
    for (const item of room.items) {
      if (item.dead) continue;
      if (item.emerge > 0) {
        item.emerge -= dt;
        item.y = item.blockY - (1 - Math.max(0, item.emerge) / .42) * item.h;
      } else if (item.type !== "flower") {
        physicsActor(item, dt, item.type === "star" ? 71 : 43);
        if (item.type === "star" && item.ground) {
          item.vy = -210;
          item.vx = Math.sign(item.vx) * 71;
        }
      }
      if (item.y > floor + 42 || item.x + item.w < camera - 40) item.dead = true;
      if (item.dead || !overlap(item, player)) continue;
      item.dead = true;
      if (item.type === "life") addLife(item.x, item.y, game);
      else {
        if (item.type === "star") player.star = 9.8;
        else {
          player.power = Math.max(player.power, item.type === "flower" ? 2 : 1);
          player.safe = Math.max(player.safe, .6);
          const grown = { ...player, y: player.y + player.h - 28, h: 28 };
          if (!room.solids.some(block => solid(block) && overlap(grown, block))) changeSize(28);
        }
        points(1000, item.x, item.y);
        game.effect("coin");
      }
    }
    room.items = room.items.filter(item => !item.dead);
    for (const coin of room.pickups) {
      if (!coin.dead && overlap(coin, player)) {
        coin.dead = true;
        addCoin(coin.x, coin.y, game);
      }
    }
  }

  function moveEnemy(enemy, dt) {
    const { type, x, baseX, baseY } = enemy;
    enemy.next -= dt;
    if (enemy.shell === "idle") {
      if (enemy.next <= 0) {
        enemy.shell = "";
        enemy.h = heights[type];
        enemy.y -= enemy.h - 12;
        enemy.vx = -36;
      }
      physicsActor(enemy, dt, 0);
    } else if (enemy.shell === "moving") {
      physicsActor(enemy, dt, 193);
    } else if (type === "plant") {
      const clear = Math.abs(player.x + player.w / 2 - x - enemy.w / 2) > 25;
      const cycle = (room.time + baseX / 37) % 3.9;
      const reveal = Math.max(0, Math.min(1, (cycle - .8) * 3, (3.55 - cycle) * 3));
      if (clear || enemy.y < enemy.pipeTop) enemy.y = enemy.pipeTop - 20 * reveal;
      enemy.h = Math.max(0, enemy.pipeTop - enemy.y);
    } else if (type === "firejump" || type === "leaper") {
      const cycle = (room.time + baseX / 49) % (type === "firejump" ? 2.6 : 3);
      if (type === "leaper") enemy.x = baseX + (cycle - 1.35) * 70;
      enemy.y = baseY - Math.max(0, Math.sin(cycle * Math.PI / 1.64)) * (type === "leaper" ? 106 : 64);
      if (cycle > 1.64) enemy.y = baseY;
    } else if (type === "fish") {
      enemy.x = baseX + Math.sin(room.time * 1.3 + baseX) * 44;
      enemy.y = baseY + Math.sin(room.time * 2.7) * 9;
    } else if (type === "squid") {
      enemy.x = clamp(x + Math.sign(player.x - x) * 29 * dt, baseX - 48, baseX + 48);
      enemy.y = clamp(baseY + Math.sin(room.time * 3.5) * 33 + (player.y - baseY) * .25, 30, floor - 20);
    } else if (type === "lakitu") {
      enemy.x = clamp(player.x + 96 + Math.sin(room.time * 1.3) * 57, baseX - 45, baseX + 340);
      enemy.y = 46 + Math.sin(room.time * 3) * 9;
      if (enemy.next <= 0 && Math.abs(player.x - enemy.x) < width / 2) {
        enemy.next = 2.35;
        const spiny = makeEnemy("spiny", enemy.x, enemy.y + 12);
        spiny.vx = -48;
        room.enemies.push(spiny);
      }
      if (player.x > baseX + 390) enemy.dead = true;
    } else if (type === "para" && enemy.red) {
      enemy.x = baseX + Math.sin(room.time * 1.8) * 25;
      enemy.y = baseY - 32 - Math.sin(room.time * 2.65) * 28;
    } else {
      const boss = type === "boss";
      const hammer = type === "hammer";
      const guard = boss || hammer;
      const range = boss ? 29 : 25;
      const speed = boss ? 32 : hammer ? 26 : type === "spiny" ? 41 : 37;
      if (guard && (x > baseX + range || x < baseX - range)) enemy.vx = Math.sign(baseX - x) * speed;
      if (guard && enemy.ground && enemy.next < .5) enemy.vy = boss ? -174 : -237;
      if (guard && enemy.next <= 0) {
        enemy.next = boss ? 1.75 : 1.5;
        const direction = player.x < x ? -1 : 1;
        const throwsHammer = hammer || (boss && stage >= 23 && Math.floor(room.time * 3) % 2 === 0);
        shoot(throwsHammer ? "hammer" : "flame", x, enemy.y + 6, direction * (throwsHammer ? 80 : 99), throwsHammer ? -145 : 0, 3.5);
      }
      if (type === "para" && enemy.ground) enemy.vy = -198;
      if (enemy.red && type === "k" && enemy.ground) {
        const front = enemy.vx < 0 ? x - 1 : x + enemy.w + 1;
        const supported = room.solids.some(block => solid(block) && front >= block.x && front <= block.x + block.w &&
          Math.abs(enemy.y + enemy.h - block.y) < 1);
        if (!supported) enemy.vx *= -1;
      }
      physicsActor(enemy, dt, speed);
    }
    if (enemy.y > floor + 50 && type !== "firejump" && type !== "leaper") enemy.dead = true;
  }

  function toggleShell(enemy, game, stomp) {
    if (enemy.type === "para") {
      enemy.type = "k";
      enemy.vx = -37;
      enemy.vy = 0;
    } else if (enemy.shell === "idle") {
      enemy.shell = "moving";
      enemy.chain = 0;
      enemy.vx = (player.x + player.w / 2 < enemy.x + enemy.w / 2 ? 1 : -1) * 193;
      enemy.grace = .16;
    } else {
      enemy.y += enemy.h - 12;
      enemy.h = 12;
      enemy.shell = "idle";
      enemy.next = 5.2;
      enemy.vx = 0;
    }
    if (stomp) combo(player, enemy, game);
    else {
      points(500, enemy.x, enemy.y);
      game.effect("pop");
    }
  }

  function updateEnemies(dt, previous, game) {
    for (const enemy of room.enemies) {
      if (enemy.dead) continue;
      enemy.awake ||= enemy.x < camera + width + 20;
      if (!enemy.awake) continue;
      enemy.grace = Math.max(0, (enemy.grace ?? 0) - dt);
      moveEnemy(enemy, dt);
      if (enemy.dead || enemy.h === 0 || !overlap(player, enemy)) continue;
      const safeStomp = !["plant", "spiny", "firejump", "boss", "squid", "fish"].includes(enemy.type);
      if (player.star && enemy.type !== "boss" && enemy.type !== "firejump") {
        enemy.dead = true;
        combo(player, enemy, game);
      } else if (safeStomp && previous.falling && previous.bottom <= enemy.y + 6) {
        player.y = enemy.y - player.h;
        player.vy = game.held("jump") ? -205 : -150;
        player.ground = false;
        if (["k", "para", "beetle"].includes(enemy.type)) toggleShell(enemy, game, true);
        else {
          enemy.dead = true;
          combo(player, enemy, game);
        }
      } else if (enemy.shell === "idle") {
        toggleShell(enemy, game, false);
      } else if (!enemy.grace) {
        hitPlayer(game);
      }
    }
    for (const shell of room.enemies) {
      if (shell.dead || shell.shell !== "moving") continue;
      for (const enemy of room.enemies) {
        if (enemy === shell || enemy.dead || enemy.type === "boss" || enemy.type === "firejump" || !overlap(shell, enemy)) continue;
        enemy.dead = true;
        combo(shell, enemy, game);
      }
    }
  }

  function updateHazards(dt, previous, game) {
    for (const gun of room.guns) {
      const distance = player.x - gun.x;
      if (Math.abs(distance) > width * .8) continue;
      gun.next -= dt;
      if (gun.next <= 0 && Math.abs(distance) > 26) {
        gun.next = 2.6;
        shoot("bullet", gun.x, gun.y, Math.sign(distance) * 105, 0, 4.5);
        game.effect("shoot");
      }
    }
    for (const bar of room.bars) {
      for (const orb of firebar(bar)) {
        if (overlap(player, orb)) hitPlayer(game);
      }
    }
    for (const shot of room.shots) {
      shot.ttl -= dt;
      if (shot.type === "fireball") {
        if (horizontal(shot, shot.vx * dt)) shot.ttl = 0;
        shot.vy += 480 * dt;
        if (vertical(shot, shot.vy * dt)) shot.vy = -113;
        for (const enemy of room.enemies) {
          if (shot.ttl <= 0 || enemy.dead || !enemy.h || !overlap(enemy, shot)) continue;
          shot.ttl = 0;
          if (["beetle", "firejump"].includes(enemy.type)) continue;
          if (enemy.type !== "boss" || --enemy.hp === 0) {
            enemy.dead = true;
            if (enemy.type === "boss" && stage < 31) {
              room.effects.push({ x: enemy.x, y: enemy.y, ttl: .7, disguise: ["g", "k", "beetle", "spiny", "lakitu", "squid", "hammer"][Math.floor(stage / 4)] });
            }
            points(enemy.type === "boss" ? 5000 : 200, enemy.x, enemy.y);
            game.effect("pop");
          }
        }
      } else {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        if (shot.type === "hammer") shot.vy += 325 * dt;
        if (!overlap(player, shot)) continue;
        if (shot.type === "bullet" && (player.star || (previous.falling && previous.bottom <= shot.y + 5))) {
          if (!player.star) {
            player.y = shot.y - player.h;
            player.vy = -165;
          }
          shot.ttl = 0;
          combo(player, shot, game);
        } else {
          hitPlayer(game);
        }
      }
    }
    room.shots = room.shots.filter(shot => shot.ttl > 0 && shot.y < floor + 45 && shot.x > camera - 60);
    room.enemies = room.enemies.filter(enemy => !enemy.dead);
  }

  function firebar(bar) {
    const angle = room.time * bar.spin * (secondQuest ? 2.65 : 2.05);
    return Array.from({ length: bar.size }, (_, i) => ({
      x: bar.x + Math.cos(angle) * i * 9 - 4, y: bar.y + Math.sin(angle) * i * 9 - 4, w: 8, h: 8,
    }));
  }

  function clearLevel(game, kind) {
    const remaining = Math.ceil(timer);
    const endDigit = remaining % 10;
    fireworks = kind === "flag" && [1, 3, 6].includes(endDigit) ? endDigit : 0;
    record.score += remaining * 50 + fireworks * 500;
    if (kind === "flag") {
      const height = clamp(Math.floor((floor - player.y) / 19), 0, 7);
      points([100, 100, 100, 400, 800, 2000, 5000, 5000][height], player.x, player.y - 8);
    }
    if (kind === "axe") {
      room.boss.bridge.broken = true;
      for (const enemy of room.enemies) {
        if (enemy.type === "boss") enemy.dead = true;
      }
      player.x = room.boss.axe + 2;
      finalClear = stage === stages.length - 1;
    }
    player.vx = 0;
    flash = kind;
    setPhase("clear", kind === "axe" ? 2.65 : 2);
    game.effect("clear");
  }

  function afterClear(game) {
    if (finalClear) {
      game.choose({
        tag: "ALL CLEAR", title: "救出公主！", copy: `完成世界 8-4，得分 ${record.score}。`,
      }, [
        { id: "hard", label: "挑战二周目" },
        { id: "restart", label: "重新开始" },
      ], id => {
        if (id === "hard") newRun(0, true);
        else reset();
      });
      return;
    }
    record.power = player.power;
    record.checkpoint = false;
    enterLevel(stage + 1);
  }

  function progress(game, oldX) {
    if (area === "main" && level[3] && player.x >= level[3] * tile) record.checkpoint = true;
    for (const gate of room.gates) {
      if (gate.passed || oldX >= gate.x || player.x < gate.x) continue;
      const upper = player.y + player.h < floor - 22;
      if (upper === gate.upper) {
        gate.passed = true;
        game.effect("coin");
      } else {
        for (const other of room.gates) {
          if (other.x > gate.back) other.passed = false;
        }
        openRoom(area, gate.back / tile);
        game.effect("hit");
        return;
      }
    }
    if (room.exit && player.x + player.w >= room.exit.x && player.y + player.h > floor - 27) {
      if (room.exit.to) startWarp(room.exit.to, room.exit.destination, game);
      else clearLevel(game, "exit");
    } else if (room.flag && player.x + player.w >= room.flag && player.y + player.h > 51) {
      clearLevel(game, "flag");
    } else if (room.boss && player.x + player.w >= room.boss.axe && player.y + player.h > floor - 38) {
      clearLevel(game, "axe");
    }
  }

  function hud(game) {
    game.stat("stage", label(stage));
    game.stat("coins", String(record.coins).padStart(2, "0"));
    game.stat("lives", record.lives);
    game.stat("time", Math.max(0, Math.ceil(timer)));
    game.stat("score", String(record.score).padStart(6, "0"));
    game.stat("player", turn === 1 ? "TRUMP 2" : "TRUMP");
  }

  function update(dt, game) {
    clock += dt;
    if (phase !== "play") {
      phaseTime -= dt;
      if (phase === "death") {
        player.vy += gravity * dt;
        player.y += player.vy * dt;
        if (phaseTime <= 0) afterDeath(game);
      } else if (phase === "pipe" && phaseTime <= 0) {
        arriveFromWarp();
      } else if (phase === "intro" && phaseTime <= 0) {
        setPhase("play", 0);
      } else if (phase === "clear") {
        if (flash === "flag") player.y = Math.min(floor - player.h, player.y + 97 * dt);
        if (flash === "axe") {
          player.y = Math.min(floor - player.h, player.y + 97 * dt);
          player.x = Math.min(room.boss.axe + 24, player.x + 39 * dt);
        }
        if (phaseTime <= 0) afterClear(game);
      }
      hud(game);
      return;
    }

    room.time += dt;
    timer -= dt * 2.5;
    player.star = Math.max(0, player.star - dt);
    player.safe = Math.max(0, player.safe - dt);
    for (const vine of room.vines) vine.y = Math.max(8, vine.y - 73 * dt);
    for (const block of room.solids) block.bump = Math.max(0, block.bump - dt);
    for (const effect of room.effects) effect.ttl -= dt;
    room.effects = room.effects.filter(effect => effect.ttl > 0);
    if (timer <= 0) {
      hitPlayer(game, true);
      return;
    }

    movePlatforms(dt);
    const oldX = player.x;
    const previous = movePlayer(dt, game);
    if (player.y + player.h > floor + (room.theme === "castle" ? 16 : 46)) hitPlayer(game, true);
    if (phase === "play" && previous) {
      updateItems(dt, game);
      updateEnemies(dt, previous, game);
      if (phase === "play") updateHazards(dt, previous, game);
      if (phase === "play") progress(game, oldX);
    }
    camera = Math.max(camera, clamp(player.x - 141, 0, room.length - width));
    hud(game);
  }

  function draw(ctx) {
    MarioView.draw(ctx, {
      room, player, camera, clock, floor, phase, phaseTime, flash, fireworks, finalClear, secondQuest, turn,
      stage: label(stage), name: level[0], lives: record.lives, firebar,
    });
  }

  Arcade.mount({
    keys: {
      ArrowUp: "jump", KeyW: "jump", KeyZ: "jump", Space: "jump",
      KeyX: "run", ShiftLeft: "run", ShiftRight: "run",
    },
    reset, update, draw,
  });
  document.querySelector("[data-play]").addEventListener("click", () => {
    document.querySelector("[data-start-options]").hidden = true;
  });
})();
