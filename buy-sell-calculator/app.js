(function () {
  'use strict';
  function roundPrice(price) {
    const step = price > 100 ? 1 : price > 30 ? 0.5 : 0.1;
    return Math.round((price + Number.EPSILON * Math.max(1, price)) / step) * step;
  }
  function update(side) {
    const priceInput = document.getElementById(side + '-price');
    const rateInput = document.getElementById(side + '-rate');
    const count = Number(document.getElementById(side + '-count').value);
    const result = document.getElementById(side + '-results');
    const error = document.getElementById(side + '-error');
    const price = Number(priceInput.value), rate = Number(rateInput.value);
    result.replaceChildren(); error.textContent = '';
    if (priceInput.value === '') { result.innerHTML = '<p class="empty">输入首档价格后，结果将显示在这里。</p>'; return; }
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(rate) || rateInput.value === '' || rate < 0 || (side === 'buy' && rate >= 100)) {
      error.textContent = '请输入大于 0 的价格及有效比例' + (side === 'buy' ? '（0% 至小于 100%）。' : '。'); return;
    }
    let current = price;
    for (let i = 2; i <= count; i++) {
      current = roundPrice(current * (side === 'buy' ? 1 - rate / 100 : 1 + rate / 100));
      if (!Number.isFinite(current)) { error.textContent = '计算结果超出范围，请调整输入。'; result.replaceChildren(); return; }
      const row = document.createElement('div'); row.className = 'row';
      const label = document.createElement('span'); label.className = 'row-label'; label.textContent = (side === 'buy' ? '买 ' : '卖 ') + i + ' 价';
      const value = document.createElement('span'); value.className = 'row-value'; value.textContent = current.toFixed(1);
      row.append(label, value); result.append(row);
    }
  }
  for (const side of ['buy', 'sell']) {
    for (const key of ['price', 'rate', 'count']) document.getElementById(side + '-' + key).addEventListener('input', () => update(side));
    update(side);
  }
  if (typeof module !== 'undefined') module.exports = { roundPrice };
}());
