"use strict";

const MarioView = (() => {
  const palettes = {
    field:  ["#6999ed", "#9ada78", "#48a061", "#b96338", "#753822", "#eaa564"],
    cave:   ["#191c37", "#323951", "#252942", "#547eb1", "#2c3b6a", "#9cc5d6"],
    cellar: ["#191c37", "#323951", "#252942", "#547eb1", "#2c3b6a", "#9cc5d6"],
    night:  ["#212654", "#5476a6", "#3b5388", "#9c5c56", "#563755", "#d69584"],
    sky:    ["#81abe8", "#adc5e9", "#819cc8", "#bc7251", "#774430", "#f4bb7e"],
    snow:   ["#8fa5c7", "#ebf0e7", "#a9c0d3", "#8194a9", "#465c80", "#e0e9e9"],
    bridge: ["#71ace9", "#8bd8e8", "#3094bf", "#c17d45", "#684023", "#f3bc69"],
    water:  ["#3478b9", "#4489c6", "#286398", "#3e968d", "#2a5b69", "#91ddad"],
    castle: ["#211c2e", "#3a2d42", "#2c2138", "#826778", "#4a354b", "#bf98a1"],
    wall:   ["#556ca5", "#727c98", "#4d5476", "#8e7d8d", "#53465f", "#c6b1ac"],
    cloud:  ["#70b8e8", "#f5f1e1", "#c3dbed", "#f5f1e1", "#c3dbed", "#ffffff"],
    warp:   ["#191c37", "#323951", "#252942", "#547eb1", "#2c3b6a", "#9cc5d6"],
  };
  const hero = [
    "   RRRR  ", "  RRRRRRR", "  DFFDF  ", " DFFFDDFF", "  FFFFF  ",
    " RRBRR   ", "RRRBBBRR ", "FFBBBBBFF", "  BB BB  ", "  DD DD  ",
  ];
  const mushroom = [
    "   CCCC   ", "  CCWWCC  ", " CCWWWWCC ", "CCCWWWWCCC", "CWCCCCCCWC",
    "WWWWWWWWWW", "  FFDFDF  ", "  FFFFFF  ",
  ];
  const shell = ["   CCCC   ", "  CCCCWC  ", " CCCWCCCC ", "CCCCWCCCCC", "CWWWWWWWWC"];
  const star = ["     C     ", "    CCC    ", " CCCCCCCCC ", "  CCWCWCC  ", "   CCCCC   ", "  CCC CCC  ", "  CC   CC  "];
  const rect = (ctx, color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  function pixels(ctx, pattern, colors, x, y, sx, sy = sx) {
    for (let row = 0; row < pattern.length; row++) {
      const line = pattern[row];
      for (let col = 0; col < line.length; col++) {
        const color = colors[line[col]];
        if (color) {
          const left = x + col * sx;
          const top = y + row * sy;
          rect(ctx, color, left, top, Math.round(left + sx) - Math.round(left), Math.round(top + sy) - Math.round(top));
        }
      }
    }
  }

  function text(ctx, copy, x, y, size, align = "left", color = "#fff4dc") {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.font = `bold ${size}px ui-monospace, Consolas, "Microsoft YaHei", monospace`;
    ctx.fillText(copy, x, y);
  }

  function cloud(ctx, x, y, color, shade) {
    rect(ctx, shade, x, y + 12, 66, 10);
    rect(ctx, color, x - 2, y + 11, 68, 8);
    rect(ctx, color, x + 9, y + 5, 47, 12);
    rect(ctx, color, x + 21, y, 22, 10);
  }

  function backdrop(ctx, room, camera, floor) {
    const { width, height } = ctx.canvas;
    const [sky, light, dark] = palettes[room.theme];
    rect(ctx, sky, 0, 0, width, height);
    if (["cave", "castle", "cellar", "warp"].includes(room.theme)) {
      for (let y = 30; y < floor; y += 19) {
        for (let x = (y % 2) * 21 - camera * .35 % 42; x < width; x += 42) {
          rect(ctx, dark, x, y, 40, 17);
          rect(ctx, light, x + 3, y + 2, 34, 1);
        }
      }
      if (room.theme !== "castle") rect(ctx, light, 0, 0, width, 14);
      return;
    }
    if (room.theme === "water") {
      rect(ctx, light, 0, 22, width, 8);
      for (let i = 0; i < 17; i++) {
        const x = ((i * 89 - camera * .45) % 430 + 430) % 430 - 8;
        const y = 39 + ((i * 29 - room.time * (8 + i % 3)) % 153 + 153) % 153;
        rect(ctx, "#76b9d5", x, y, 3, 3);
        rect(ctx, light, x + 1, y + 1, 1, 1);
      }
      return;
    }
    for (let i = 0; i < 5; i++) {
      const x = ((i * 119 - camera * .24) % 542 + 542) % 542 - 61;
      if (room.theme === "night") {
        rect(ctx, "#e4e5bf", x + 25, 36 + i * 11 % 43, 2, 2);
        rect(ctx, "#abbcd6", x + 68, 24 + i * 29 % 57, 2, 2);
      } else {
        cloud(ctx, x, 28 + i * 19 % 52, "#fff3db", "#cbdfee");
      }
      const hill = x - 24;
      if (room.theme === "bridge") {
        rect(ctx, light, 0, floor + 15, width, height - floor);
        rect(ctx, dark, 0, floor + 20, width, height - floor);
      } else if (room.theme !== "cloud") {
        const top = floor - 41 - i * 15 % 42;
        for (let step = 0; step < 6; step++) rect(ctx, light, hill + 42 - step * 8, top + step * 8, 12 + step * 16, 8);
        rect(ctx, dark, hill, top + 48, 100, Math.max(0, floor - top - 48));
      }
    }
  }

  function coin(ctx, x, y, clock) {
    const w = 4 + Math.round(3 * Math.abs(Math.sin(clock * 5 + x / 19)));
    rect(ctx, "#ad552b", x + (8 - w) / 2, y + 1, w, 11);
    rect(ctx, "#ffcf56", x + (8 - w) / 2, y, w - 1, 10);
    rect(ctx, "#fff0a0", x + 3, y + 2, 1, 6);
  }

  function block(ctx, item, floor, palette, camera) {
    if (item.broken || item.kind === "hidden") return;
    const { x, w, h, kind } = item;
    const y = item.y - Math.sin(item.bump / .17 * Math.PI) * 4;
    const [, , , body, edge, rim] = palette;
    if (kind === "ground" || kind === "wall" || kind === "reef" || kind === "shelf") {
      rect(ctx, edge, x, y, w, h);
      rect(ctx, body, x + 1, y + 1, w - 2, h - 2);
      rect(ctx, rim, x, y, w, kind === "ground" ? 3 : 2);
      for (let seam = Math.max(x, x + Math.floor((camera - x) / 16) * 16); seam < Math.min(x + w, camera + ctx.canvas.width); seam += 16) {
        rect(ctx, edge, seam, y + 6, 1, Math.min(9, h - 6));
        if (h > 16) {
          rect(ctx, edge, seam, y + 15, Math.min(16, x + w - seam), 1);
          if (seam + 8 < x + w) rect(ctx, edge, seam + 8, y + 16, 1, Math.min(13, h - 16));
        }
      }
    } else if (kind === "p") {
      rect(ctx, "#184732", x, y, w, h);
      rect(ctx, "#429e52", x + 2, y + 2, w - 4, h - 2);
      rect(ctx, "#9be480", x + 5, y + 2, 4, h - 2);
      rect(ctx, "#286643", x + w - 8, y + 2, 5, h - 2);
      rect(ctx, "#184732", x, y + 6, w, 2);
      rect(ctx, "#a9e589", x + 2, y + 1, w - 4, 2);
    } else if (kind === "gun") {
      rect(ctx, "#26243a", x, y, w, h);
      rect(ctx, "#595973", x + 2, y + 2, w - 4, h - 2);
      rect(ctx, "#211e2e", x, y, w, 11);
      rect(ctx, "#9e9aab", x + 1, y + 1, w - 2, 2);
      rect(ctx, "#403a50", x, y + 11, w, 2);
    } else if (kind === "spring") {
      rect(ctx, "#f05c57", x, y, w, 3);
      rect(ctx, "#f9dec2", x + 2, y + 3, w - 4, 2);
      rect(ctx, "#9f3c5f", x + 3, y + 5, w - 6, 2);
      rect(ctx, "#f05c57", x, floor - 3, w, 3);
    } else if (kind === "bossBridge") {
      rect(ctx, "#a35d49", x, y, w, h);
      for (let seam = x; seam < x + w; seam += 8) rect(ctx, "#f9ba79", seam, y, 5, 2);
    } else {
      rect(ctx, edge, x, y, w, h);
      rect(ctx, kind === "q" ? "#edab45" : kind === "used" ? "#886052" : body, x + 1, y + 1, w - 2, h - 2);
      rect(ctx, kind === "q" ? "#ffda79" : rim, x + 1, y + 1, w - 2, 2);
      if (kind === "q") text(ctx, "?", x + 8, y + 12, 12, "center", "#6a3f38");
      if (kind === "b") {
        rect(ctx, edge, x, y + 7, 16, 1);
        rect(ctx, edge, x + 7, y + 7, 1, 9);
      }
    }
  }

  function enemy(ctx, actor, clock) {
    const { type, x, y, w, h } = actor;
    if (h <= 0) return;
    const face = actor.vx > 0 ? 1 : -1;
    const pace = Math.floor(clock * 11) % 2;
    if (type === "g" || type === "beetle" || actor.shell) {
      const c = type === "beetle" ? "#42528b" : actor.shell ? actor.red ? "#f06b54" : "#67b66b" : "#ab623e";
      pixels(ctx, actor.shell || type === "beetle" ? shell : mushroom, { C: c, W: "#f9ddad", F: "#de9a61", D: "#422734" }, x, y + 1, w / 10, (h - 3) / (actor.shell || type === "beetle" ? 5 : 8));
      rect(ctx, "#412c35", x + (pace ? 0 : 2), y + h - 2, 5, 2);
      rect(ctx, "#412c35", x + (pace ? 8 : 6), y + h - 2, 5, 2);
    } else if (["k", "para", "hammer"].includes(type)) {
      const color = type === "hammer" ? "#556e57" : actor.red ? "#d55c4b" : "#59a65d";
      if (type === "para") {
        rect(ctx, "#fff4d9", x + 5, y + (pace ? 1 : 5), 10, 5);
        rect(ctx, "#e3cbd0", x + 8, y + (pace ? 5 : 10), 5, 3);
      }
      rect(ctx, color, x + 2, y + 9, w - 2, h - 12);
      rect(ctx, "#f9d48b", x + (face > 0 ? 7 : 0), y + 3, 7, 8);
      rect(ctx, color, x + (face > 0 ? 7 : 0), y + 1, 7, 4);
      rect(ctx, "#33283c", x + (face > 0 ? 11 : 2), y + 5, 2, 2);
      rect(ctx, "#e8ab60", x + (pace ? 0 : 3), y + h - 3, 5, 3);
      rect(ctx, "#e8ab60", x + (pace ? 8 : 7), y + h - 3, 5, 3);
    } else if (type === "boss") {
      rect(ctx, "#356844", x + 5, y + 9, 18, 15);
      rect(ctx, "#84b957", x + 8, y + 10, 13, 10);
      rect(ctx, "#e2a45c", x + 2, y + 16, 10, 9);
      rect(ctx, "#df8954", x + 2, y + 2, 15, 7);
      rect(ctx, "#548c50", x, y + 7, 16, 7);
      rect(ctx, "#fff1c8", x + 3, y + 8, 3, 3);
      rect(ctx, "#312533", x + 3, y + 9, 1, 2);
      rect(ctx, "#f2d3a0", x, y + 13, 6, 2);
      rect(ctx, "#f3d7a1", x + 8, y, 3, 5);
      rect(ctx, "#f3d7a1", x + 20, y + 5, 3, 5);
      rect(ctx, "#cf8a57", x + 3, y + 24, 7, 4);
      rect(ctx, "#cf8a57", x + 14, y + 24, 8, 4);
    } else if (type === "plant") {
      rect(ctx, "#48b96b", x + 5, y + Math.min(9, h), 4, Math.max(0, h - 9));
      rect(ctx, "#e86762", x + 1, y, 12, Math.min(10, h));
      rect(ctx, "#fbe1bc", x + 3, y + 2, 2, Math.min(3, h));
      rect(ctx, "#fbe1bc", x + 9, y + 4, 2, Math.min(3, h));
    } else if (type === "lakitu") {
      rect(ctx, "#e5ebee", x - 2, y + 9, 18, 8);
      rect(ctx, "#f6d483", x + 3, y + 2, 10, 9);
      rect(ctx, "#63a767", x + 1, y, 12, 4);
      rect(ctx, "#44374d", x + 3, y + 4, 9, 3);
    } else if (type === "squid") {
      rect(ctx, "#f5e9da", x + 2, y, 8, 12);
      rect(ctx, "#544f81", x + 2, y + 6, 8, 3);
      rect(ctx, "#f5e9da", x, y + 10, 3, h - 10);
      rect(ctx, "#f5e9da", x + 8, y + 10, 3, h - 10);
    } else if (type === "firejump") {
      fire(ctx, x, y, w, h);
    } else if (type === "spiny") {
      rect(ctx, "#f16e54", x + 2, y + 4, 11, 7);
      for (let i = 0; i < 3; i++) rect(ctx, "#fff0c1", x + i * 4 + 2, y + i % 2, 2, 4);
      rect(ctx, "#854132", x + 1, y + 10, 13, 2);
    } else {
      rect(ctx, type === "leaper" ? "#e76e62" : "#dba75c", x + 2, y + 2, w - 3, h - 4);
      rect(ctx, "#f6e1b1", x + 4, y + 5, 8, 4);
      rect(ctx, "#524057", x + 6, y + 3, 2, 3);
      rect(ctx, "#f7d978", x, y + 3 + pace, 3, 6);
    }
  }

  function fire(ctx, x, y, w, h) {
    rect(ctx, "#fa6249", x + 1, y, w - 2, h);
    rect(ctx, "#ffa84f", x, y + 2, w, h - 4);
    rect(ctx, "#ffe090", x + w / 3, y + 2, w / 3, h - 4);
  }

  function drawPlayer(ctx, player, turn, clock) {
    if (player.safe > 0 && Math.floor(clock * 17) % 2) return;
    ctx.save();
    ctx.translate(Math.round(player.x + player.w / 2), Math.round(player.y));
    ctx.scale(player.direction, 1);
    const color = player.star ? ["#ffe46b", "#9ff7b0", "#ef74a6", "#a9b6ff"][Math.floor(clock * 13) % 4]
      : player.power === 2 ? "#fff0d3" : turn === 1 ? "#65bf73" : "#e85049";
    const blues = player.power === 2 ? "#dc5e3b" : turn === 1 ? "#294b72" : "#345bb3";
    const stride = player.ground && Math.abs(player.vx) > 12 && Math.floor(clock * 14) % 2;
    const pose = stride ? [...hero.slice(0, -1), " DD   DD "] : hero;
    pixels(ctx, pose, { R: color, D: "#613544", F: "#ffd2a0", B: blues }, -7, 0, 1.55, player.h / 10);
    ctx.restore();
  }

  function draw(ctx, view) {
    const { room, player, camera, floor, phase, phaseTime, clock, flash, fireworks, finalClear, stage, name, lives, turn, secondQuest, firebar } = view;
    const { width, height } = ctx.canvas;
    const visible = actor => actor.x + actor.w > camera - 25 && actor.x < camera + width + 25;
    backdrop(ctx, room, camera, floor);
    ctx.save();
    ctx.translate(-Math.round(camera), 0);
    for (const lava of room.lava.filter(visible)) {
      rect(ctx, "#9b3a40", lava.x, floor + 7, lava.w, height - floor);
      for (let x = lava.x; x < lava.x + lava.w; x += 8) {
        const y = floor + 7 + Math.round(Math.sin(clock * 7 + x) * 2);
        rect(ctx, "#ed693e", x, y, 8, 5);
        rect(ctx, "#ffb254", x + 2, y, 4, 1);
      }
    }
    for (const solid of room.solids.filter(visible)) block(ctx, solid, floor, palettes[room.theme], camera);
    for (const ledge of room.platforms.filter(visible)) {
      if (ledge.partner && ledge.x < ledge.partner.x) {
        rect(ctx, "#d7b69c", ledge.x + ledge.w / 2, ledge.startY - 41, 1, ledge.y - ledge.startY + 41);
        rect(ctx, "#d7b69c", ledge.partner.x + ledge.partner.w / 2, ledge.startY - 41, 1, ledge.partner.y - ledge.startY + 41);
        rect(ctx, "#d7b69c", ledge.x + ledge.w / 2, ledge.startY - 41, ledge.partner.x - ledge.x, 2);
      }
      rect(ctx, "#65465a", ledge.x, ledge.y, ledge.w, ledge.h);
      rect(ctx, ledge.axis === "fall" ? "#f0a075" : "#f6cf78", ledge.x, ledge.y, ledge.w, 2);
    }
    if (room.flag && room.flag < camera + width + 15) {
      const flagY = phase === "clear" ? Math.min(180, 56 + (2 - phaseTime) * 112) : 56;
      rect(ctx, "#e6dfc0", room.flag, 54, 2, floor - 54);
      rect(ctx, "#f9d35e", room.flag - 2, 50, 6, 5);
      rect(ctx, "#ed6557", room.flag - 16, flagY, 16, 9);
      rect(ctx, "#ffdf97", room.flag - 13, flagY + 2, 5, 3);
      rect(ctx, "#9e7890", room.flag + 15, floor - 31, 31, 31);
      for (let i = 0; i < 3; i++) rect(ctx, "#cc98a2", room.flag + 15 + i * 11, floor - 36, 7, 10);
      rect(ctx, "#46354c", room.flag + 25, floor - 16, 10, 16);
    }
    if (room.boss && !room.boss.bridge.broken) {
      rect(ctx, "#a5785c", room.boss.axe + 6, floor - 14, 3, 13);
      rect(ctx, "#ffcf71", room.boss.axe, floor - 17, 8, 7);
      rect(ctx, "#ede0b3", room.boss.axe, floor - 17, 3, 7);
    }
    if (room.boss?.bridge.broken) {
      const x = room.boss.axe + 40;
      rect(ctx, "#f7dba9", x + 3, floor - 18, 9, 9);
      rect(ctx, finalClear ? "#e998b7" : "#f2e7d6", x, floor - 9, 14, 9);
      rect(ctx, finalClear ? "#ffd979" : "#e46a5d", x + 1, floor - 21, 12, 5);
    }
    if (room.theme === "warp") {
      text(ctx, "WARP ZONE", 228, 92, 15, "center");
      for (const pipe of room.pipes) text(ctx, String(pipe.destination), pipe.x + 16, pipe.y - 11, 12, "center", "#ffdb7f");
    }
    for (const vine of room.vines) {
      rect(ctx, "#2e8056", vine.x + 3, vine.y, 3, vine.bottom - vine.y);
      for (let y = vine.y; y < vine.bottom - 4; y += 9) rect(ctx, "#83ce6b", vine.x + (Math.round(y) % 2 ? 0 : 5), y, 4, 3);
    }
    for (const item of room.pickups.filter(visible)) {
      if (!item.dead) coin(ctx, item.x, item.y, clock);
    }
    for (const actor of room.enemies.filter(visible)) {
      if (!actor.dead && actor.y < floor + 6) enemy(ctx, actor, clock);
    }
    for (const item of room.items.filter(visible)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(item.x - 2, item.y - 2, 17, item.emerge > 0 ? item.blockY - item.y + 2 : 19);
      ctx.clip();
      if (item.type === "flower") {
        rect(ctx, "#7fc765", item.x + 5, item.y + 6, 2, 7);
        rect(ctx, "#f5754a", item.x + 1, item.y, 10, 7);
        rect(ctx, "#ffe291", item.x + 4, item.y + 2, 4, 3);
      } else if (item.type === "star") {
        pixels(ctx, star, { C: "#ffe06f", W: "#a86542" }, item.x, item.y + 1, 1.15, 1.6);
      } else {
        pixels(ctx, mushroom, { C: item.type === "life" ? "#71c476" : "#e66b56", W: "#fff0cd", D: "#7b4d4d", F: "#f3bf88" }, item.x, item.y, 1.2, 1.55);
      }
      ctx.restore();
    }
    for (const bar of room.bars) {
      for (const orb of firebar(bar).filter(visible)) fire(ctx, orb.x, orb.y, orb.w, orb.h);
    }
    for (const shot of room.shots.filter(visible)) {
      if (shot.type === "bullet") {
        rect(ctx, "#2b2636", shot.x, shot.y, shot.w, 8);
        rect(ctx, "#e4d9c8", shot.x + (shot.vx < 0 ? 2 : 9), shot.y + 2, 2, 2);
      } else if (shot.type === "hammer") {
        rect(ctx, "#e0bd90", shot.x + 3, shot.y, 2, 8);
        rect(ctx, "#887487", shot.x, shot.y, 7, 4);
      } else fire(ctx, shot.x, shot.y, shot.w, shot.h);
    }
    if (phase !== "pipe" || phaseTime > .2) drawPlayer(ctx, player, turn, clock);
    for (const effect of room.effects) {
      if (effect.disguise) enemy(ctx, { ...effect, type: effect.disguise, w: 14, h: 16, vx: -1 }, clock);
      else text(ctx, effect.text, effect.x, effect.y - (1 - effect.ttl) * 17, 8);
    }
    ctx.restore();

    if (phase === "intro" && clock > 0) {
      rect(ctx, "#1f1b30e6", width / 2 - 89, 63, 178, 80);
      text(ctx, `WORLD ${stage}${secondQuest ? "  ★" : ""}`, width / 2, 89, 17, "center", "#ffdb85");
      text(ctx, name, width / 2, 110, 13, "center");
      text(ctx, `${turn === 1 ? "LUIGI" : "MARIO"}  ×  ${lives}`, width / 2, 129, 10, "center");
    } else if (phase === "pipe") {
      ctx.fillStyle = `rgba(21, 17, 35, ${Math.sin(Math.PI * phaseTime / .46) * .77})`;
      ctx.fillRect(0, 0, width, height);
    } else if (phase === "clear") {
      if (flash === "axe") {
        rect(ctx, "#211b30ed", width / 2 - 129, 67, 258, 50);
        text(ctx, finalClear ? "终于找到你了，马力欧！" : "谢谢你！公主还在下一座城堡。", width / 2, 96, 12, "center");
      } else {
        text(ctx, "过关！", width / 2, 78, 17, "center", "#ffdb85");
        for (let i = 0; i < fireworks; i++) {
          const radius = Math.max(0, 22 - Math.abs((2 - phaseTime - i * .16) * 58 - 21));
          for (let ray = 0; ray < 8; ray++) {
            rect(ctx, i % 2 ? "#ffd46a" : "#ff7970", 58 + i * 44 + Math.cos(ray * Math.PI / 4) * radius, 37 + i * 17 % 49 + Math.sin(ray * Math.PI / 4) * radius, 3, 3);
          }
        }
      }
    }
  }

  return { draw };
})();
