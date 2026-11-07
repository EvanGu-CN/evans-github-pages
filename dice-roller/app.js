(() => {
  const PIPS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  const tray = document.getElementById('dice-tray');
  const countSelect = document.getElementById('count');
  const rollBtn = document.getElementById('roll');
  const totalOut = document.getElementById('total');

  let rolling = false;

  function dieEl() {
    const die = document.createElement('div');
    die.className = 'die';
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      die.appendChild(pip);
    }
    return die;
  }

  function paint(die, value) {
    const on = PIPS[value];
    [...die.children].forEach((pip, i) => {
      pip.classList.toggle('on', on.includes(i + 1));
    });
  }

  // Web Crypto，拒绝采样避免取模偏差
  function secureInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let n;
    do {
      crypto.getRandomValues(buf);
      n = buf[0];
    } while (n >= limit);
    return n % max;
  }

  function render(count) {
    tray.replaceChildren();
    for (let i = 0; i < count; i++) {
      const die = dieEl();
      paint(die, secureInt(6) + 1);
      tray.appendChild(die);
    }
  }

  function roll() {
    if (rolling) return;
    rolling = true;
    rollBtn.disabled = true;

    const count = Number(countSelect.value);
    if (tray.children.length !== count) render(count);

    const dice = [...tray.children];
    dice.forEach((die) => {
      die.classList.remove('settled');
      die.classList.add('rolling');
    });

    const spin = setInterval(() => {
      dice.forEach((die) => paint(die, secureInt(6) + 1));
    }, 70);

    setTimeout(() => {
      clearInterval(spin);
      const values = dice.map((die) => {
        const value = secureInt(6) + 1;
        die.classList.remove('rolling');
        paint(die, value);
        // 重启动画
        void die.offsetWidth;
        die.classList.add('settled');
        return value;
      });

      totalOut.textContent = values.reduce((a, b) => a + b, 0);
      rolling = false;
      rollBtn.disabled = false;
    }, 720);
  }

  countSelect.addEventListener('change', () => {
    const count = Number(countSelect.value);
    render(count);
    totalOut.textContent = '—';
  });

  rollBtn.addEventListener('click', roll);

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      const tag = document.activeElement.tagName;
      if (tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      roll();
    }
  });

  render(Number(countSelect.value));
})();
