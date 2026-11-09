"use strict";

const Arcade = (() => {
  const movement = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  };
  const tones = {
    jump: [420, 680, 0.11, "square", 0.025],
    coin: [900, 1480, 0.17, "square", 0.03],
    hit: [240, 66, 0.23, "sawtooth", 0.045],
    pop: [240, 120, 0.13, "triangle", 0.055],
    shoot: [700, 280, 0.075, "triangle", 0.025],
    clear: [420, 1120, 0.36, "triangle", 0.07],
  };

  function mount({ keys, reset, update, draw, drag }) {
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const overlay = document.querySelector("[data-overlay]");
    const title = overlay.querySelector("[data-overlay-title]");
    const copy = overlay.querySelector("[data-overlay-copy]");
    const tag = overlay.querySelector("[data-overlay-tag]");
    const play = document.querySelector("[data-play]");
    const pause = document.querySelector("[data-pause]");
    const sound = document.querySelector("[data-sound]");
    const controls = [...document.querySelectorAll("[data-hold]")];
    const stats = Object.fromEntries([...document.querySelectorAll("[data-stat]")]
      .map((element) => [element.dataset.stat, element]));
    const keymap = { ...movement, ...keys };
    const heldKeys = new Set();
    const heldPointers = new Map();
    const pressed = new Set();
    let mode = "ready";
    let dragId = null;
    let audio;
    let soundOn = false;
    let frameId;
    let previous = 0;
    let lag = 0;
    const step = 1 / 60;
    canvas.tabIndex = -1;

    function held(action) {
      return [...heldKeys].some((code) => keymap[code] === action)
        || [...heldPointers.values()].some((button) => button.dataset.hold === action);
    }

    function clearInputs() {
      heldKeys.clear();
      heldPointers.clear();
      pressed.clear();
      dragId = null;
      controls.forEach((button) => delete button.dataset.active);
    }

    function effect(name) {
      if (!soundOn || audio?.state !== "running") return;
      const [start, end, duration, type, volume] = tones[name];
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const time = audio.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(start, time);
      oscillator.frequency.exponentialRampToValueAtTime(end, time + duration);
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(time);
      oscillator.stop(time + duration);
    }

    function stat(name, value) {
      const label = String(value);
      if (stats[name].textContent !== label) stats[name].textContent = label;
    }

    function show(nextMode, text) {
      mode = nextMode;
      cancelAnimationFrame(frameId);
      clearInputs();
      overlay.hidden = false;
      pause.disabled = mode !== "paused";
      pause.textContent = mode === "paused" ? "继续" : "暂停";
      tag.textContent = text.tag;
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.button;
      if (!document.hidden && document.hasFocus()) play.focus({ preventScroll: true });
    }

    function start(restart) {
      clearInputs();
      if (restart) reset();
      mode = "playing";
      lag = 0;
      previous = performance.now();
      overlay.hidden = true;
      pause.textContent = "暂停";
      pause.disabled = false;
      canvas.focus({ preventScroll: true });
      if (soundOn) audio.resume().catch(() => {});
      frameId = requestAnimationFrame(frame);
    }

    function stopForPause() {
      if (mode !== "playing") return;
      show("paused", { tag: "PAUSED", title: "游戏已暂停", copy: "准备好后，从当前位置继续。", button: "继续游戏" });
    }

    function togglePause() {
      if (mode === "paused") start(false);
      else stopForPause();
    }

    const game = {
      width: canvas.width,
      height: canvas.height,
      held,
      pressed: (action) => pressed.has(action),
      dragging: () => dragId !== null,
      effect,
      stat,
      finish: (text) => show("finished", { ...text, button: "再玩一次" }),
    };

    sound.addEventListener("click", () => {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ??= new Audio();
      soundOn = !soundOn;
      sound.setAttribute("aria-pressed", String(soundOn));
      sound.textContent = soundOn ? "音效开" : "音效关";
      if (soundOn) audio.resume().then(() => effect("coin")).catch(() => {});
      if (mode === "playing") canvas.focus({ preventScroll: true });
    });
    pause.addEventListener("click", togglePause);
    play.addEventListener("click", () => start(mode !== "paused"));
    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "KeyP" || event.code === "Escape") {
        if (!event.repeat) togglePause();
        return;
      }
      if (mode !== "playing" || !Object.hasOwn(keymap, event.code)) return;
      if (event.code === "Space" && event.target.closest?.("button, a")) return;
      event.preventDefault();
      const action = keymap[event.code];
      if (!event.repeat && !held(action)) pressed.add(action);
      heldKeys.add(event.code);
    });
    window.addEventListener("keyup", (event) => heldKeys.delete(event.code));
    window.addEventListener("blur", stopForPause);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopForPause();
    });

    controls.forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        if (mode !== "playing" || event.button !== 0) return;
        event.preventDefault();
        const action = button.dataset.hold;
        if (!held(action)) pressed.add(action);
        heldPointers.set(event.pointerId, button);
        button.dataset.active = "";
        button.setPointerCapture(event.pointerId);
      });
      const release = (event) => {
        heldPointers.delete(event.pointerId);
        if (![...heldPointers.values()].includes(button)) delete button.dataset.active;
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => button.addEventListener(type, release));
    });

    if (drag) {
      const move = (event) => {
        if (dragId !== event.pointerId) return;
        const rect = canvas.getBoundingClientRect();
        drag((event.clientX - rect.left) * canvas.width / rect.width,
          (event.clientY - rect.top) * canvas.height / rect.height);
      };
      canvas.addEventListener("pointerdown", (event) => {
        if (mode !== "playing" || dragId !== null || event.button !== 0) return;
        dragId = event.pointerId;
        canvas.setPointerCapture(dragId);
        move(event);
      });
      canvas.addEventListener("pointermove", move);
      const release = (event) => {
        if (dragId === event.pointerId) dragId = null;
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => canvas.addEventListener(type, release));
    }

    function frame(now) {
      lag += Math.min((now - previous) / 1000, 0.1);
      previous = now;
      while (lag >= step && mode === "playing") {
        update(step, game);
        lag -= step;
        pressed.clear();
      }
      draw(ctx);
      if (mode === "playing") frameId = requestAnimationFrame(frame);
    }

    if (!ctx) {
      play.disabled = true;
      copy.textContent = "当前浏览器无法绘制游戏画面。";
      return;
    }
    reset();
    draw(ctx);
    return game;
  }

  return { mount, clamp: (value, min, max) => Math.min(Math.max(value, min), max) };
})();
