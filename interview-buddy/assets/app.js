(function () {
  'use strict';

  var CATALOG = window.IB_CATALOG || { banks: [] };
  var BANKS = Array.isArray(CATALOG.banks) ? CATALOG.banks : [];
  var main = document.getElementById('main');
  var FILTER_KEY = 'ib.filters.v1';
  var DIFF_STD = ['简单', '中等', '困难'];

  var state = {
    bankData: {},
    filters: {},
    practice: null,
    setup: { bankId: '', category: '', difficulty: '' },
    lastBankId: '',
    routeSeq: 0,
    mermaidPromise: null
  };

  /* ---------------- 基础工具 ---------------- */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICONS = {
    layers:
      '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    shuffle:
      '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    chevronDown: '<path d="m5 9 7 7 7-7"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    eye:
      '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    zoom:
      '<circle cx="11" cy="11" r="6.5"/><path d="M11 8.5v5M8.5 11h5"/><path d="m20 20-3.8-3.8"/>',
    list: '<path d="M9 5h12"/><path d="M9 12h12"/><path d="M9 19h12"/><path d="M4 5h.01"/><path d="M4 12h.01"/><path d="M4 19h.01"/>',
    up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 5.5v16"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
    tag: '<path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8" cy="8" r="1.2"/>'
  };

  function icon(name, size) {
    var s = size || 18;
    return (
      '<svg class="icon" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') +
      '</svg>'
    );
  }

  function findBank(id) {
    for (var i = 0; i < BANKS.length; i += 1) {
      if (BANKS[i].id === id) return BANKS[i];
    }
    return null;
  }

  function firstBankId() {
    return BANKS.length ? BANKS[0].id : '';
  }

  function encodeId(id) {
    return encodeURIComponent(String(id));
  }

  function seqLabel(q) {
    if (q.seq != null) {
      var n = String(q.seq);
      while (n.length < 3) n = '0' + n;
      return '#' + n;
    }
    return '#' + q.id;
  }

  function questionTitle(q) {
    var raw = q && q.title != null ? String(q.title).trim() : '';
    var onlyNumber = /^#?\d+$/.test(raw) || (q && raw === String(q.id));
    if (!raw || onlyNumber) return { text: '题干整理中', missing: true };
    return { text: raw, missing: false };
  }

  function questionContent(q) {
    return q && typeof q.content === 'string' ? q.content.trim() : '';
  }

  function contentExcerpt(q, max) {
    var raw = questionContent(q).replace(/【(问题|回答)】/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    var limit = max || 110;
    return raw.length > limit ? raw.slice(0, limit) + '…' : raw;
  }

  var STEM_SAMPLE_LABELS = {
    '输入样例': true,
    '输出样例': true,
    '样例输入': true,
    '样例输出': true,
    '示例': true
  };
  var STEM_SECTION_LABELS = {
    '输入格式': true,
    '输出格式': true,
    '提示': true,
    '说明': true,
    '注意': true
  };

  function stemTextHtml(content) {
    var lines = content.split(/\r?\n/);
    var inSample = false;
    var html = [];
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      var trimmed = line.trim();
      if (STEM_SAMPLE_LABELS[trimmed]) {
        inSample = true;
        html.push('<span class="stem-label-line">' + esc(line) + '</span>');
        continue;
      }
      if (STEM_SECTION_LABELS[trimmed]) {
        inSample = false;
        html.push('<span class="stem-label-line">' + esc(line) + '</span>');
        continue;
      }
      if (!trimmed) {
        inSample = false;
        html.push('');
        continue;
      }
      if (inSample) {
        html.push('<span class="stem-code-line">' + esc(line) + '</span>');
        continue;
      }
      html.push(esc(line).replace(/^【(问题|回答)】/, '<span class="stem-mark">【$1】</span>'));
    }
    return html.join('\n');
  }

  function stemHtml(q, collapseLimit) {
    var content = questionContent(q);
    if (!content) return '';
    var limit = collapseLimit || 0;
    var long = limit > 0 && content.length > limit;
    return (
      '<div class="stem-block' + (long ? ' is-collapsed' : '') + '" data-stem>' +
        '<div class="stem-label">题干</div>' +
        '<div class="stem-text">' + stemTextHtml(content) + '</div>' +
        (long
          ? '<button class="stem-toggle" type="button" data-stem-toggle aria-expanded="false">' +
              '展开全部题干</button>'
          : '') +
      '</div>'
    );
  }

  function bindStemToggles(root) {
    var buttons = root.querySelectorAll('[data-stem-toggle]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var block = btn.closest ? btn.closest('[data-stem]') : null;
        if (!block) return;
        var collapsed = block.classList.toggle('is-collapsed');
        btn.textContent = collapsed ? '展开全部题干' : '收起题干';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    }
  }

  function diffClass(d) {
    if (d === '简单') return 'easy';
    if (d === '困难') return 'hard';
    return 'medium';
  }

  function diffBadge(d) {
    return (
      '<span class="diff diff-' + diffClass(d) + '"><i class="dot"></i>' + esc(d) + '</span>'
    );
  }

  function tagChips(tags) {
    if (!tags || !tags.length) return '';
    return (
      '<span class="tag-list">' +
      tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') +
      '</span>'
    );
  }

  function practiceHref() {
    var id = state.lastBankId || firstBankId();
    return id ? '#/practice/' + encodeId(id) : '#/practice';
  }

  function setNav(active) {
    var nodes = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < nodes.length; i += 1) {
      var on = nodes[i].getAttribute('data-nav') === active;
      nodes[i].classList.toggle('is-active', on);
      if (on) nodes[i].setAttribute('aria-current', 'page');
      else nodes[i].removeAttribute('aria-current');
    }
  }

  function updatePracticeLinks() {
    var href = practiceHref();
    var nodes = document.querySelectorAll('[data-practice-link]');
    for (var i = 0; i < nodes.length; i += 1) nodes[i].setAttribute('href', href);
  }

  /* ---------------- 路由 ---------------- */

  function currentRoute() {
    var raw = (location.hash || '').replace(/^#/, '');
    var queryIndex = raw.indexOf('?');
    var pathPart = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
    var query = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : '');
    var segs = pathPart.split('/').filter(Boolean).map(function (part) {
      try { return decodeURIComponent(part); } catch (e) { return part; }
    });
    return { segs: segs, query: query };
  }

  function route() {
    var token = ++state.routeSeq;
    var r = currentRoute();
    var segs = r.segs;
    closeDiagramViewer();
    clearDetailKeys();
    clearBackToTop();
    window.scrollTo(0, 0);

    if (!segs.length) {
      state.lastBankId = state.lastBankId || firstBankId();
      setNav('home');
      updatePracticeLinks();
      renderHome();
      return;
    }

    if (segs[0] === 'bank' && segs[1]) {
      state.lastBankId = segs[1];
      setNav('home');
      updatePracticeLinks();
      loadBank(segs[1]).then(function (bank) {
        if (token !== state.routeSeq) return;
        renderList(bank, findBank(bank.id));
      }).catch(function (err) {
        if (token === state.routeSeq) renderError(err);
      });
      return;
    }

    if (segs[0] === 'q' && segs[1] && segs[2]) {
      state.lastBankId = segs[1];
      setNav('home');
      updatePracticeLinks();
      loadBank(segs[1]).then(function (bank) {
        if (token !== state.routeSeq) return;
        renderDetail(bank, segs[2], findBank(bank.id));
      }).catch(function (err) {
        if (token === state.routeSeq) renderError(err);
      });
      return;
    }

    if (segs[0] === 'practice') {
      setNav('practice');
      var bankId = segs[1] || state.lastBankId || firstBankId();
      if (!bankId) {
        renderError(new Error('还没有可练习的题库。'));
        return;
      }
      state.lastBankId = bankId;
      updatePracticeLinks();
      loadBank(bankId).then(function (bank) {
        if (token !== state.routeSeq) return;
        if (segs[2] === 'run') {
          renderPracticeRun(bank, findBank(bank.id), r.query);
        } else {
          renderPracticeSetup(bank, findBank(bank.id));
        }
      }).catch(function (err) {
        if (token === state.routeSeq) renderError(err);
      });
      return;
    }

    renderError(new Error('页面不存在，可能链接已失效。'));
  }

  function attachBankIdentity(data, id) {
    if (!data.id) data.id = (data.meta && data.meta.id) || id;
    if (!data.name) data.name = (data.meta && data.meta.name) || id;
    return data;
  }

  function loadBank(id) {
    var entry = findBank(id);
    if (!entry) return Promise.reject(new Error('没有找到这个题库。'));
    if (window.IB_BANKS && window.IB_BANKS[id]) {
      state.bankData[id] = attachBankIdentity(window.IB_BANKS[id], id);
      return Promise.resolve(state.bankData[id]);
    }
    if (state.bankData[id]) return Promise.resolve(state.bankData[id]);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = entry.dataFile;
      script.onload = function () {
        var data = window.IB_BANKS && window.IB_BANKS[id];
        if (!data) {
          reject(new Error('题目数据暂时不可用，请稍后刷新页面重试。'));
          return;
        }
        state.bankData[id] = attachBankIdentity(data, id);
        resolve(state.bankData[id]);
      };
      script.onerror = function () {
        reject(new Error('题目数据暂时不可用，请稍后刷新页面重试。'));
      };
      document.head.appendChild(script);
    });
  }

  /* ---------------- 首页 ---------------- */

  function renderHome() {
    document.title = '题库 · InterviewBuddy';
    if (!BANKS.length) {
      renderError(
        new Error('题库数据暂时不可用，请稍后刷新页面重试。')
      );
      return;
    }

    var totalQuestions = 0;
    var totalAnswered = 0;
    for (var i = 0; i < BANKS.length; i += 1) {
      totalQuestions += BANKS[i].count || 0;
      totalAnswered += BANKS[i].answered || 0;
    }

    var cards = BANKS.map(function (bank) {
      var count = bank.count || 0;
      var answered = bank.answered || 0;
      var pct = count ? Math.round((answered / count) * 100) : 0;
      var answerLabel = answered ? '答案 ' + answered + '/' + count : '答案整理中';
      return (
        '<a class="bank-card" href="#/bank/' + encodeId(bank.id) + '">' +
          '<div class="bank-top">' +
            '<span class="bank-icon">' + icon('layers', 18) + '</span>' +
            '<span class="bank-count">' + icon('list', 13) + count + ' 题</span>' +
          '</div>' +
          '<h2 class="bank-name">' + esc(bank.name) + '</h2>' +
          '<p class="bank-desc">' + esc(bank.desc || '') + '</p>' +
          '<div class="bank-foot">' +
            '<span class="bank-progress"><i style="width:' + pct + '%"></i></span>' +
            '<span class="bank-answered">' + answerLabel + '</span>' +
            '<span class="bank-arrow">' + icon('chevronRight', 16) + '</span>' +
          '</div>' +
        '</a>'
      );
    }).join('');

    main.innerHTML =
      '<div class="page-head home-head">' +
        '<div>' +
          '<h1>题库</h1>' +
          '<p class="page-sub">选一个题库按分类刷题，或进入随机练习。</p>' +
        '</div>' +
        '<div class="home-actions">' +
          '<a class="btn" href="#/practice/' + encodeId(state.lastBankId || firstBankId()) + '">' +
            icon('shuffle', 16) + '开始练习' +
          '</a>' +
        '</div>' +
      '</div>' +
      '<div class="statline">' +
        '<span>' + icon('layers', 13) + BANKS.length + ' 个题库</span>' +
        '<span>' + icon('list', 13) + totalQuestions + ' 道题</span>' +
        '<span>' + icon('check', 13) + totalAnswered + ' 篇参考答案</span>' +
      '</div>' +
      '<div class="bank-grid">' + cards + '</div>';
  }

  /* ---------------- 筛选状态 ---------------- */

  function blankFilters() {
    return { q: '', category: '', difficulty: '', tag: '' };
  }

  function readFilterStore() {
    try {
      return JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function getFilters(bankId, entry) {
    if (!state.filters[bankId]) {
      var stored = readFilterStore()[bankId];
      var f = blankFilters();
      if (stored) {
        f.q = typeof stored.q === 'string' ? stored.q : '';
        f.category = typeof stored.category === 'string' ? stored.category : '';
        f.difficulty = typeof stored.difficulty === 'string' ? stored.difficulty : '';
        f.tag = typeof stored.tag === 'string' ? stored.tag : '';
      }
      state.filters[bankId] = f;
    }
    var f = state.filters[bankId];
    if (f.category && entry && !entry.categories.some(function (c) { return c.name === f.category; })) {
      f.category = '';
    }
    if (f.difficulty && entry && !entry.difficulties.some(function (d) { return d.name === f.difficulty; })) {
      f.difficulty = '';
    }
    if (f.tag && entry && !entry.tags.some(function (t) { return t.name === f.tag; })) {
      f.tag = '';
    }
    return f;
  }

  function persistFilters(bankId) {
    try {
      var all = readFilterStore();
      all[bankId] = state.filters[bankId];
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(all));
    } catch (e) {
      /* file:// 或隐私模式下不可用时，保留内存状态即可 */
    }
  }

  function hasActiveFilters(f) {
    return Boolean(f.q || f.category || f.difficulty || f.tag);
  }

  function matchQuestion(q, f) {
    if (f.category && q.category !== f.category) return false;
    if (f.difficulty && q.difficulty !== f.difficulty) return false;
    if (f.tag && (q.tags || []).indexOf(f.tag) === -1) return false;
    var needle = f.q.trim().toLowerCase();
    if (needle) {
      var hay = [
        questionTitle(q).text,
        questionContent(q),
        q.category,
        (q.tags || []).join(' '),
        q.id,
        '#' + q.seq
      ].join(' ').toLowerCase();
      if (hay.indexOf(needle) === -1) return false;
    }
    return true;
  }

  function optionHtml(value, label, selected) {
    return (
      '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' +
      esc(label) + '</option>'
    );
  }

  function orderedDifficulties(entry) {
    var list = entry.difficulties.slice();
    list.sort(function (a, b) {
      var ia = DIFF_STD.indexOf(a.name);
      var ib = DIFF_STD.indexOf(b.name);
      if (ia === -1) ia = 99;
      if (ib === -1) ib = 99;
      return ia - ib || a.name.localeCompare(b.name, 'zh');
    });
    return list;
  }

  /* ---------------- 题目列表 ---------------- */

  function renderList(bank, entry) {
    document.title = bank.meta.name + ' · InterviewBuddy';
    if (!entry) {
      renderError(new Error('题库信息不完整。'));
      return;
    }

    var f = getFilters(bank.id, entry);
    var categoryOptions = optionHtml('', '全部分类', !f.category) + entry.categories.map(function (c) {
      return optionHtml(c.name, c.name, f.category === c.name);
    }).join('');
    var difficultyOptions = optionHtml('', '全部难度', !f.difficulty) +
      orderedDifficulties(entry).map(function (d) {
        return optionHtml(d.name, d.name, f.difficulty === d.name);
      }).join('');
    var tagOptions = optionHtml('', '全部标签', !f.tag) + entry.tags.map(function (t) {
      return optionHtml(t.name, t.name, f.tag === t.name);
    }).join('');

    var answered = entry.answered || 0;
    var pendingNotice = '';
    if (answered < bank.questions.length) {
      pendingNotice =
        '<div class="bank-pending">' + icon('book', 14) + '<span>' +
          (answered
            ? '部分题目的答案还在整理中，可先浏览题目或练习。'
            : '本库答案正在整理中，题目可先浏览或直接练习。') +
        '</span></div>';
    }

    main.innerHTML =
      '<div class="page-head">' +
        '<a class="crumb-back" href="#/">' + icon('back', 15) + '全部题库</a>' +
        '<div class="title-line">' +
          '<h1 class="page-title">' + esc(bank.meta.name) + '</h1>' +
          '<span class="pill">' + bank.questions.length + ' 题</span>' +
        '</div>' +
        '<p class="page-sub">' + esc(entry.desc || '') + '</p>' +
        pendingNotice +
        '<div class="detail-actions">' +
          '<a class="btn" href="#/practice/' + encodeId(bank.id) + '">' +
            icon('shuffle', 15) + '练习本题库' +
          '</a>' +
        '</div>' +
      '</div>' +
      '<div class="filter-panel" role="search">' +
        '<div class="search-field">' +
          icon('search', 16) +
          '<input id="filter-q" type="text" inputmode="search" autocomplete="off" ' +
            'placeholder="搜索题干、标签或题号" value="' + esc(f.q) + '" aria-label="搜索题目">' +
          '<button class="btn-icon search-clear" id="filter-clear" type="button" aria-label="清空搜索"' +
            (f.q ? '' : ' hidden') + '>' + icon('close', 14) + '</button>' +
        '</div>' +
        '<div class="select-row">' +
          '<div class="select-wrap">' +
            '<select id="filter-category" aria-label="按分类筛选">' + categoryOptions + '</select>' +
            '<span class="caret">' + icon('chevronDown', 13) + '</span>' +
          '</div>' +
          '<div class="select-wrap">' +
            '<select id="filter-difficulty" aria-label="按难度筛选">' + difficultyOptions + '</select>' +
            '<span class="caret">' + icon('chevronDown', 13) + '</span>' +
          '</div>' +
          '<div class="select-wrap">' +
            '<select id="filter-tag" aria-label="按标签筛选">' + tagOptions + '</select>' +
            '<span class="caret">' + icon('chevronDown', 13) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="filter-foot">' +
          '<span id="filter-count" aria-live="polite" aria-atomic="true"></span>' +
          '<button class="btn-link" id="filter-reset" type="button"' +
            (hasActiveFilters(f) ? '' : ' hidden') + '>清除筛选</button>' +
        '</div>' +
      '</div>' +
      '<div id="question-list" class="q-list"></div>';

    var listEl = main.querySelector('#question-list');
    var countEl = main.querySelector('#filter-count');
    var clearBtn = main.querySelector('#filter-clear');
    var resetBtn = main.querySelector('#filter-reset');
    var searchInput = main.querySelector('#filter-q');

    function apply() {
      var rows = bank.questions.filter(function (q) { return matchQuestion(q, f); });
      if (rows.length) {
        listEl.innerHTML = rows.map(function (q) {
          var t = questionTitle(q);
          var excerpt = contentExcerpt(q, 110);
          return (
            '<a class="q-row" href="#/q/' + encodeId(bank.id) + '/' + encodeId(q.id) + '">' +
              '<span class="q-seq">' + seqLabel(q) + '</span>' +
              '<div class="q-main">' +
                '<h3 class="q-title' + (t.missing ? ' is-placeholder' : '') + '">' + esc(t.text) + '</h3>' +
                (excerpt ? '<p class="q-excerpt">' + esc(excerpt) + '</p>' : '') +
                '<div class="q-meta">' +
                  diffBadge(q.difficulty) +
                  '<span class="q-cat">' + esc(q.category) + '</span>' +
                  tagChips((q.tags || []).filter(function (t) { return t !== q.category; })) +
                '</div>' +
              '</div>' +
              '<span class="q-go">' + icon('chevronRight', 15) + '</span>' +
            '</a>'
          );
        }).join('');
      } else {
        listEl.innerHTML =
          '<div class="empty-state">' +
            '<span class="empty-icon">' + icon('search', 26) + '</span>' +
            '<h2>没有匹配的题目</h2>' +
            '<p>换一个关键词，或清除分类、难度与标签筛选。</p>' +
            '<button class="btn" type="button" data-empty-reset>清除筛选</button>' +
          '</div>';
      }
      countEl.textContent = hasActiveFilters(f)
        ? '筛选结果 ' + rows.length + ' / ' + bank.questions.length + ' 题'
        : '共 ' + rows.length + ' 题';
      resetBtn.hidden = !hasActiveFilters(f);
      clearBtn.hidden = !f.q;
      persistFilters(bank.id);
    }

    function resetAll() {
      var blank = blankFilters();
      f.q = blank.q;
      f.category = blank.category;
      f.difficulty = blank.difficulty;
      f.tag = blank.tag;
      searchInput.value = '';
      main.querySelector('#filter-category').value = '';
      main.querySelector('#filter-difficulty').value = '';
      main.querySelector('#filter-tag').value = '';
      apply();
      searchInput.focus();
    }

    searchInput.addEventListener('input', function () {
      f.q = searchInput.value;
      apply();
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!f.q) return;
        e.preventDefault();
        f.q = '';
        searchInput.value = '';
        apply();
        return;
      }
      if (e.key === 'Enter') {
        var first = listEl.querySelector('.q-row');
        if (!first) return;
        e.preventDefault();
        location.hash = first.getAttribute('href');
      }
    });
    clearBtn.addEventListener('click', function () {
      f.q = '';
      searchInput.value = '';
      apply();
      searchInput.focus();
    });
    main.querySelector('#filter-category').addEventListener('change', function (e) {
      f.category = e.target.value;
      apply();
    });
    main.querySelector('#filter-difficulty').addEventListener('change', function (e) {
      f.difficulty = e.target.value;
      apply();
    });
    main.querySelector('#filter-tag').addEventListener('change', function (e) {
      f.tag = e.target.value;
      apply();
    });
    resetBtn.addEventListener('click', resetAll);
    listEl.addEventListener('click', function (e) {
      var target = e.target.closest ? e.target.closest('[data-empty-reset]') : null;
      if (target) resetAll();
    });

    apply();
  }

  /* ---------------- 题目详情 ---------------- */

  function findQuestion(bank, qid) {
    for (var i = 0; i < bank.questions.length; i += 1) {
      if (bank.questions[i].id === qid) return { q: bank.questions[i], index: i };
    }
    return null;
  }

  function renderDetail(bank, qid, entry) {
    var found = findQuestion(bank, qid);
    if (!found) {
      renderError(new Error('这道题不在当前题库中，可能链接已失效。'));
      return;
    }
    var q = found.q;
    var index = found.index;
    var answer = bank.answers[q.id] || '';
    var qTitle = questionTitle(q);
    document.title = (qTitle.missing ? '题目详情' : qTitle.text) + ' · InterviewBuddy';

    var prev = bank.questions[index - 1];
    var next = bank.questions[index + 1];

    var prevNav = prev
      ? '<a class="prev" href="#/q/' + encodeId(bank.id) + '/' + encodeId(prev.id) + '">' +
          '<span class="dir">' + icon('back', 14) + '上一题</span>' +
          '<span class="label">' + esc(questionTitle(prev).text) + '</span>' +
        '</a>'
      : '<span class="q-nav-btn prev is-disabled" aria-disabled="true" title="已经是第一题">' +
          '<span class="dir">' + icon('back', 14) + '上一题</span>' +
          '<span class="label">已经是第一题</span>' +
        '</span>';
    var nextNav = next
      ? '<a class="next" href="#/q/' + encodeId(bank.id) + '/' + encodeId(next.id) + '">' +
          '<span class="dir">下一题' + icon('chevronRight', 14) + '</span>' +
          '<span class="label">' + esc(questionTitle(next).text) + '</span>' +
        '</a>'
      : '<span class="q-nav-btn next is-disabled" aria-disabled="true" title="已经是最后一题">' +
          '<span class="dir">下一题' + icon('chevronRight', 14) + '</span>' +
          '<span class="label">已经是最后一题</span>' +
        '</span>';

    var tagHtml = '';
    var detailTags = (q.tags || []).filter(function (t) { return t !== q.category; });
    if (detailTags.length) {
      tagHtml =
        '<div class="q-tags"><span class="tag-list">' +
        detailTags.map(function (t) {
          return '<button class="tag tag-btn" type="button" data-filter-tag="' + esc(t) + '">' +
            esc(t) + '</button>';
        }).join('') +
        '</span></div>';
    }

    main.innerHTML =
      '<div class="detail-page">' +
        '<a class="crumb-back" href="#/bank/' + encodeId(bank.id) + '">' +
          icon('back', 15) + '返回题目列表' +
        '</a>' +
        '<article class="question-card">' +
          '<div class="q-eyebrow">' +
            '<button class="btn-link crumb-link" type="button" data-filter-cat="' + esc(q.category) + '">' +
              esc(q.category) +
            '</button>' +
            diffBadge(q.difficulty) +
            '<span class="q-id">' + seqLabel(q) + ' · ' + esc(q.id) + '</span>' +
          '</div>' +
          '<h1 class="question-title' + (qTitle.missing ? ' is-placeholder' : '') + '">' + esc(qTitle.text) + '</h1>' +
          tagHtml +
          stemHtml(q, 900) +
        '</article>' +
        '<section class="answer-card">' +
          '<div class="answer-head">' +
            '<h2>参考答案</h2>' +
            '<span class="answer-note">' + icon('book', 13) +
              (answer ? '完整答案' : '整理中') +
            '</span>' +
          '</div>' +
          '<div class="answer-body md" id="answer-body">' +
            (answer
              ? renderMarkdown(answer)
              : '<div class="answer-empty">' +
                  '<span class="answer-empty-icon">' + icon('book', 20) + '</span>' +
                  '<strong>参考答案整理中</strong>' +
                  '<p>这道题已收录，答案正在整理，稍后再来看看。</p>' +
                '</div>') +
          '</div>' +
        '</section>' +
        '<nav class="q-nav" aria-label="上下题">' + prevNav + nextNav + '</nav>' +
        '<div class="detail-foot">' +
          '<a href="#/bank/' + encodeId(bank.id) + '">' + icon('back', 13) + '返回题目列表</a>' +
          '<span class="detail-pos">第 ' + (index + 1) + ' / ' + bank.questions.length + ' 题</span>' +
          '<span class="key-hint"><kbd>←</kbd> <kbd>→</kbd> 切换题目</span>' +
        '</div>' +
      '</div>';

    var answerBody = main.querySelector('#answer-body');
    if (answerBody) paintMermaid(answerBody);
    bindStemToggles(main);

    function applyFilterAndGo(key, value) {
      var f = getFilters(bank.id, entry);
      f[key] = value;
      persistFilters(bank.id);
      location.hash = '#/bank/' + encodeId(bank.id);
    }

    var catBtn = main.querySelector('[data-filter-cat]');
    if (catBtn) {
      catBtn.addEventListener('click', function () {
        applyFilterAndGo('category', catBtn.getAttribute('data-filter-cat'));
      });
    }
    var tagBtns = main.querySelectorAll('[data-filter-tag]');
    for (var i = 0; i < tagBtns.length; i += 1) {
      tagBtns[i].addEventListener('click', function (e) {
        applyFilterAndGo('tag', e.currentTarget.getAttribute('data-filter-tag'));
      });
    }

    bindDetailKeys(bank, prev, next);
    mountBackToTop();
  }

  /* ---------------- 练习 ---------------- */

  function scopeKey(bankId, category, difficulty) {
    return bankId + '::' + category + '::' + difficulty;
  }

  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function poolFor(bank, category, difficulty) {
    return bank.questions.filter(function (q) {
      if (category && q.category !== category) return false;
      if (difficulty && q.difficulty !== difficulty) return false;
      return true;
    });
  }

  function initPractice(bank, category, difficulty) {
    state.practice = {
      bankId: bank.id,
      category: category,
      difficulty: difficulty,
      sig: scopeKey(bank.id, category, difficulty),
      pool: shuffle(poolFor(bank, category, difficulty)),
      cursor: 0,
      revealed: false,
      done: false,
      viewed: 0,
      viewedIds: {}
    };
  }

  function practiceAnswer(bank, q) {
    var md = bank.answers[q.id];
    if (!md) return '';
    return renderMarkdown(md);
  }

  function renderPracticeSetup(bank, entry) {
    document.title = '练习 · InterviewBuddy';
    var setup = state.setup;
    if (setup.bankId !== bank.id) {
      setup.bankId = bank.id;
      setup.category = '';
      setup.difficulty = '';
    }
    if (setup.category && !entry.categories.some(function (c) { return c.name === setup.category; })) {
      setup.category = '';
    }
    if (setup.difficulty && !entry.difficulties.some(function (d) { return d.name === setup.difficulty; })) {
      setup.difficulty = '';
    }

    var bankOptions = BANKS.map(function (b) {
      return optionHtml(b.id, b.name + '（' + b.count + ' 题）', b.id === bank.id);
    }).join('');
    var categoryOptions = optionHtml('', '全部分类', !setup.category) + entry.categories.map(function (c) {
      return optionHtml(c.name, c.name + '（' + c.count + '）', setup.category === c.name);
    }).join('');
    var difficultyOptions = optionHtml('', '全部难度', !setup.difficulty) +
      orderedDifficulties(entry).map(function (d) {
        return optionHtml(d.name, d.name + '（' + d.count + '）', setup.difficulty === d.name);
      }).join('');

    main.innerHTML =
      '<div class="practice-page">' +
        '<a class="crumb-back" href="#/bank/' + encodeId(bank.id) + '">' +
          icon('back', 15) + '返回「' + esc(bank.name) + '」题目列表' +
        '</a>' +
        '<div class="page-head">' +
          '<h1 class="page-title">练习模式</h1>' +
          '<p class="page-sub">随机抽题，先自己讲一遍，再展开参考答案对照。</p>' +
        '</div>' +
        '<section class="setup-card">' +
          '<form class="setup-form" id="practice-form">' +
            '<label class="field field-bank">' +
              '<span>题库</span>' +
              '<span class="select-wrap">' +
                '<select id="setup-bank">' + bankOptions + '</select>' +
                '<span class="caret">' + icon('chevronDown', 13) + '</span>' +
              '</span>' +
            '</label>' +
            '<label class="field">' +
              '<span>分类</span>' +
              '<span class="select-wrap">' +
                '<select id="setup-category">' + categoryOptions + '</select>' +
                '<span class="caret">' + icon('chevronDown', 13) + '</span>' +
              '</span>' +
            '</label>' +
            '<label class="field">' +
              '<span>难度</span>' +
              '<span class="select-wrap">' +
                '<select id="setup-difficulty">' + difficultyOptions + '</select>' +
                '<span class="caret">' + icon('chevronDown', 13) + '</span>' +
              '</span>' +
            '</label>' +
            '<div class="setup-summary">' +
              '<span>本次范围 <strong id="setup-count">0</strong> 道题</span>' +
              '<span>随机顺序，逐步轮换</span>' +
            '</div>' +
            '<div class="setup-actions">' +
              '<button class="btn btn-primary" type="submit" id="setup-start">' +
                icon('shuffle', 16) + '开始练习' +
              '</button>' +
            '</div>' +
          '</form>' +
          '<div class="setup-tips">' +
            '<ul>' +
              '<li>抽题只在所选范围内轮换，本轮不会重复。</li>' +
              '<li>先口述结论、关键点和图示，再展开答案比对。</li>' +
              '<li>可随时通过「换一题」跳过，或结束后调整范围。</li>' +
            '</ul>' +
          '</div>' +
        '</section>' +
      '</div>';

    var categorySelect = main.querySelector('#setup-category');
    var difficultySelect = main.querySelector('#setup-difficulty');
    var countEl = main.querySelector('#setup-count');
    var startBtn = main.querySelector('#setup-start');

    function refreshCount() {
      var count = poolFor(bank, setup.category, setup.difficulty).length;
      countEl.textContent = String(count);
      startBtn.disabled = count === 0;
    }

    main.querySelector('#setup-bank').addEventListener('change', function (e) {
      state.setup = { bankId: e.target.value, category: '', difficulty: '' };
      state.practice = null;
      location.hash = '#/practice/' + encodeId(e.target.value);
    });
    categorySelect.addEventListener('change', function (e) {
      setup.category = e.target.value;
      refreshCount();
    });
    difficultySelect.addEventListener('change', function (e) {
      setup.difficulty = e.target.value;
      refreshCount();
    });
    main.querySelector('#practice-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (startBtn.disabled) return;
      initPractice(bank, setup.category, setup.difficulty);
      var params = new URLSearchParams();
      if (setup.category) params.set('c', setup.category);
      if (setup.difficulty) params.set('d', setup.difficulty);
      var qs = params.toString();
      location.hash = '#/practice/' + encodeId(bank.id) + '/run' + (qs ? '?' + qs : '');
    });

    refreshCount();
  }

  function renderPracticeRun(bank, entry, query) {
    var category = query.get('c') || '';
    var difficulty = query.get('d') || '';
    var sig = scopeKey(bank.id, category, difficulty);
    if (!state.practice || state.practice.bankId !== bank.id || state.practice.sig !== sig) {
      initPractice(bank, category, difficulty);
    }
    state.setup = { bankId: bank.id, category: category, difficulty: difficulty };
    document.title = '随机练习 · InterviewBuddy';
    renderSession(bank, entry);
  }

  function renderSession(bank, entry) {
    var p = state.practice;
    if (!p) {
      location.hash = '#/practice/' + encodeId(bank.id);
      return;
    }

    var backCrumb =
      '<a class="crumb-back" href="#/bank/' + encodeId(bank.id) + '">' +
        icon('back', 15) + '返回「' + esc(bank.name) + '」题目列表' +
      '</a>';

    if (!p.pool.length) {
      main.innerHTML =
        '<div class="practice-page">' +
          backCrumb +
          '<div class="empty-state">' +
            '<span class="empty-icon">' + icon('alert', 26) + '</span>' +
            '<h2>这个范围内还没有题目</h2>' +
            '<p>换一个分类或难度再试。</p>' +
            '<a class="btn" href="#/practice/' + encodeId(bank.id) + '">调整范围</a>' +
          '</div>' +
        '</div>';
      return;
    }

    if (p.done || p.cursor >= p.pool.length) {
      main.innerHTML =
        '<div class="practice-page">' +
          backCrumb +
          '<div class="practice-done">' +
            '<span class="done-icon">' + icon('check', 24) + '</span>' +
            '<h2>本轮练习完成</h2>' +
            '<p>共 ' + p.pool.length + ' 道题，展开参考答案 ' + p.viewed + ' 道。' +
              '换个范围可以继续巩固。</p>' +
            '<button class="btn btn-primary" type="button" data-action="restart">' +
              icon('refresh', 15) + '再来一轮' +
            '</button>' +
            '<a class="btn" href="#/practice/' + encodeId(bank.id) + '">调整范围</a>' +
          '</div>' +
        '</div>';
      bindPracticeActions(bank, entry);
      return;
    }

    var q = p.pool[p.cursor];
    var hasAnswer = Boolean(bank.answers[q.id]);
    var percent = Math.round(((p.cursor + 1) / p.pool.length) * 100);
    var actions = p.revealed
      ? '<button class="btn" type="button" data-action="reveal">' + icon('close', 15) + '收起答案</button>' +
        '<button class="btn btn-primary" type="button" data-action="next">下一题' + icon('arrowRight', 15) + '</button>' +
        '<button class="btn btn-ghost" type="button" data-action="skip">' + icon('refresh', 15) + '换一题</button>'
      : '<button class="btn btn-primary" type="button" data-action="reveal">' + icon('eye', 16) + '显示答案</button>' +
        '<button class="btn" type="button" data-action="skip">' + icon('refresh', 15) + '换一题</button>';

    var answerHtml = '';
    if (p.revealed) {
      answerHtml =
        '<div class="practice-answer md" id="practice-answer">' +
          '<span class="answer-note">' + icon('book', 13) + '参考答案</span>' +
          practiceAnswer(bank, q) +
        '</div>';
    }

    main.innerHTML =
      '<div class="practice-page">' +
        backCrumb +
        '<div class="practice-bar">' +
          '<span class="practice-count">第 <strong>' + (p.cursor + 1) + '</strong> / ' +
            p.pool.length + ' 题 · 已看答案 ' + p.viewed + ' 道</span>' +
          '<span class="practice-progress"><i style="width:' + percent + '%"></i></span>' +
          '<a class="practice-end" href="#/practice/' + encodeId(bank.id) + '">' +
            icon('back', 13) + '结束' +
          '</a>' +
        '</div>' +
        '<article class="practice-card">' +
          '<div class="practice-eyebrow">' +
            '<span>' + seqLabel(q) + '</span>' +
            '<span>' + esc(q.category) + '</span>' +
            diffBadge(q.difficulty) +
          '</div>' +
          '<h1 class="practice-title' + (questionTitle(q).missing ? ' is-placeholder' : '') + '">' +
            esc(questionTitle(q).text) +
          '</h1>' +
          stemHtml(q, 700) +
          (p.revealed ? '' :
            '<div class="practice-tip">' + icon('eye', 14) +
              '先自己讲一遍：结论、关键点、图示、可能的追问。' +
            '</div>') +
          '<div class="practice-actions">' + actions + '</div>' +
          answerHtml +
          (p.revealed && !hasAnswer
            ? '<div class="answer-empty">' +
                '<span class="answer-empty-icon">' + icon('book', 20) + '</span>' +
                '<strong>参考答案整理中</strong>' +
                '<p>这道题已收录，答案正在整理，先自己讲一遍再换一题。</p>' +
              '</div>'
            : '') +
        '</article>' +
      '</div>';

    var answerBody = main.querySelector('#practice-answer');
    if (answerBody) paintMermaid(answerBody);
    bindStemToggles(main);
    bindPracticeActions(bank, entry);
    mountBackToTop();
  }

  function bindPracticeActions(bank, entry) {
    var nodes = main.querySelectorAll('[data-action]');
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].addEventListener('click', function (e) {
        var action = e.currentTarget.getAttribute('data-action');
        handlePracticeAction(action, bank, entry);
      });
    }
  }

  function handlePracticeAction(action, bank, entry) {
    var p = state.practice;
    if (!p) return;

    if (action === 'reveal') {
      p.revealed = !p.revealed;
      if (p.revealed) {
        var q = p.pool[p.cursor];
        if (bank.answers[q.id] && !p.viewedIds[q.id]) {
          p.viewedIds[q.id] = true;
          p.viewed += 1;
        }
      }
      renderSession(bank, entry);
      return;
    }

    if (action === 'next' || action === 'skip') {
      p.cursor += 1;
      p.revealed = false;
      if (p.cursor >= p.pool.length) p.done = true;
      window.scrollTo(0, 0);
      renderSession(bank, entry);
      return;
    }

    if (action === 'restart') {
      p.pool = shuffle(p.pool);
      p.cursor = 0;
      p.revealed = false;
      p.done = false;
      p.viewed = 0;
      p.viewedIds = {};
      window.scrollTo(0, 0);
      renderSession(bank, entry);
    }
  }

  /* ---------------- 详情键盘 / 回到顶部 ---------------- */

  var detailKeyHandler = null;
  var backToTopEl = null;
  var backToTopScroll = null;

  function bindDetailKeys(bank, prev, next) {
    clearDetailKeys();
    detailKeyHandler = function (e) {
      if (diagramModal) return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var target = e.key === 'ArrowLeft' ? prev : next;
      if (!target) return;
      e.preventDefault();
      location.hash = '#/q/' + encodeId(bank.id) + '/' + encodeId(target.id);
    };
    document.addEventListener('keydown', detailKeyHandler);
  }

  function clearDetailKeys() {
    if (!detailKeyHandler) return;
    document.removeEventListener('keydown', detailKeyHandler);
    detailKeyHandler = null;
  }

  function mountBackToTop() {
    clearBackToTop();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'to-top';
    btn.hidden = true;
    btn.setAttribute('aria-label', '回到页面顶部');
    btn.innerHTML = icon('up', 14) + '<span>顶部</span>';
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      main.focus({ preventScroll: true });
    });
    document.body.appendChild(btn);
    backToTopEl = btn;
    backToTopScroll = function () {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      btn.hidden = y < 480;
    };
    window.addEventListener('scroll', backToTopScroll, { passive: true });
    backToTopScroll();
  }

  function clearBackToTop() {
    if (backToTopScroll) {
      window.removeEventListener('scroll', backToTopScroll);
      backToTopScroll = null;
    }
    if (backToTopEl && backToTopEl.parentNode) backToTopEl.parentNode.removeChild(backToTopEl);
    backToTopEl = null;
  }

  /* ---------------- 图示放大查看 ---------------- */

  var diagramModal = null;
  var diagramLastFocus = null;
  var diagramState = null;
  var diagramKeyHandler = null;

  function bindDiagramZoom(node) {
    if (!node || node.getAttribute('data-zoom-ready')) return;
    if (!node.querySelector('svg')) return;
    node.setAttribute('data-zoom-ready', '1');
    node.classList.add('is-zoomable');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', '放大查看图示');
    if (!node.querySelector('.mermaid-zoom-badge')) {
      var badge = document.createElement('span');
      badge.className = 'mermaid-zoom-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = icon('zoom', 12) + '放大';
      node.appendChild(badge);
    }
    node.addEventListener('click', function () { openDiagramViewer(node); });
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        openDiagramViewer(node);
      }
    });
  }

  function touchDistance(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  }

  function touchMid(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function diagramFitScale() {
    var ds = diagramState;
    if (!ds) return 1;
    var cs = window.getComputedStyle(ds.viewport);
    var pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var avail = Math.max(80, ds.viewport.clientWidth - pad);
    return Math.min(2, Math.max(0.15, avail / ds.naturalW));
  }

  function applyDiagramScale(next, clientX, clientY) {
    var ds = diagramState;
    if (!ds) return;
    next = Math.min(4, Math.max(0.1, next));
    var viewport = ds.viewport;
    var canvas = ds.canvas;
    var oldW = canvas.offsetWidth || 0;
    var oldH = canvas.offsetHeight || 0;
    var rect = viewport.getBoundingClientRect();
    var ax = clientX != null ? clientX - rect.left : viewport.clientWidth / 2;
    var ay = clientY != null ? clientY - rect.top : viewport.clientHeight / 2;
    var ratioX = oldW > 1 ? (viewport.scrollLeft + ax) / oldW : 0;
    var ratioY = oldH > 1 ? (viewport.scrollTop + ay) / oldH : 0;

    ds.scale = next;
    var w = Math.round(ds.naturalW * next);
    var h = Math.round(ds.naturalH * next);
    canvas.style.width = w + 'px';
    var svg = canvas.firstElementChild;
    if (svg) {
      svg.style.width = w + 'px';
      svg.style.height = h + 'px';
      svg.style.maxWidth = 'none';
    }
    if (ds.pctEl) ds.pctEl.textContent = Math.round(next * 100) + '%';

    if (oldW > 1) {
      viewport.scrollLeft = Math.max(0, ratioX * w - ax);
      viewport.scrollTop = Math.max(0, ratioY * h - ay);
    }
  }

  function openDiagramViewer(trigger) {
    if (diagramModal) return;
    var svg = trigger && trigger.querySelector('svg');
    if (!svg) return;
    diagramLastFocus = document.activeElement;

    var vb = svg.viewBox && svg.viewBox.baseVal;
    var rect = svg.getBoundingClientRect();
    var naturalW = vb && vb.width ? vb.width : (rect.width || 800);
    var naturalH = vb && vb.height ? vb.height : (rect.height || 500);

    var modal = document.createElement('div');
    modal.className = 'diagram-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '图示放大查看');
    modal.innerHTML =
      '<div class="diagram-dialog" tabindex="-1">' +
        '<div class="diagram-toolbar">' +
          '<span class="diagram-title">图示</span>' +
          '<div class="diagram-tools">' +
            '<button class="diagram-btn" type="button" data-zoom-action="out" aria-label="缩小">−</button>' +
            '<span class="zoom-pct" data-zoom-pct aria-live="polite">100%</span>' +
            '<button class="diagram-btn" type="button" data-zoom-action="in" aria-label="放大">＋</button>' +
            '<button class="diagram-btn" type="button" data-zoom-action="fit">适应宽度</button>' +
            '<button class="diagram-btn" type="button" data-zoom-action="one">原始大小</button>' +
            '<button class="diagram-btn" type="button" data-zoom-action="close" aria-label="关闭">' +
              icon('close', 14) +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="diagram-viewport">' +
          '<div class="diagram-canvas"></div>' +
        '</div>' +
        '<p class="diagram-hint">' +
          '<span class="hint-desktop">滚轮或双指缩放，点击遮罩或按 Esc 关闭</span>' +
          '<span class="hint-mobile">双指缩放或使用上方按钮，点右上角 × 关闭</span>' +
        '</p>' +
      '</div>';
    document.body.appendChild(modal);
    diagramModal = modal;

    var dialog = modal.querySelector('.diagram-dialog');
    var viewport = modal.querySelector('.diagram-viewport');
    var canvas = modal.querySelector('.diagram-canvas');
    var clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    canvas.appendChild(clone);
    diagramState = {
      naturalW: naturalW,
      naturalH: naturalH,
      canvas: canvas,
      viewport: viewport,
      pctEl: modal.querySelector('[data-zoom-pct]'),
      scale: 1
    };

    document.documentElement.classList.add('diagram-open');
    applyDiagramScale(diagramFitScale(), null, null);
    dialog.focus();

    modal.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-zoom-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-zoom-action');
      if (action === 'close') closeDiagramViewer();
      else if (action === 'in') applyDiagramScale(diagramState.scale * 1.25);
      else if (action === 'out') applyDiagramScale(diagramState.scale / 1.25);
      else if (action === 'fit') applyDiagramScale(diagramFitScale());
      else if (action === 'one') applyDiagramScale(1);
    });
    modal.addEventListener('mousedown', function (e) {
      if (e.target === modal) closeDiagramViewer();
    });

    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.12 : 0.89;
      applyDiagramScale(diagramState.scale * factor, e.clientX, e.clientY);
    }, { passive: false });

    var drag = null;
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.classList.add('is-dragging');
      try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!drag) return;
      viewport.scrollLeft = drag.left - (e.clientX - drag.x);
      viewport.scrollTop = drag.top - (e.clientY - drag.y);
    });
    function endDrag() {
      drag = null;
      viewport.classList.remove('is-dragging');
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    var pinch = null;
    viewport.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinch = { dist: touchDistance(e.touches), scale: diagramState.scale };
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var mid = touchMid(e.touches);
      applyDiagramScale(pinch.scale * (touchDistance(e.touches) / pinch.dist), mid.x, mid.y);
    }, { passive: false });
    viewport.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) pinch = null;
    }, { passive: true });

    diagramKeyHandler = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDiagramViewer();
        return;
      }
      if (e.key !== 'Tab' || !diagramModal) return;
      var nodes = [].slice.call(diagramModal.querySelectorAll('button'));
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', diagramKeyHandler, true);
  }

  function closeDiagramViewer() {
    if (!diagramModal) return;
    if (diagramKeyHandler) {
      document.removeEventListener('keydown', diagramKeyHandler, true);
      diagramKeyHandler = null;
    }
    if (diagramModal.parentNode) diagramModal.parentNode.removeChild(diagramModal);
    diagramModal = null;
    diagramState = null;
    document.documentElement.classList.remove('diagram-open');
    var focus = diagramLastFocus;
    diagramLastFocus = null;
    if (focus && typeof focus.focus === 'function') {
      try { focus.focus(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- Markdown 渲染 ---------------- */

  function inline(text) {
    return String(text).split(/(`[^`]+`)/g).map(function (part) {
      if (/^`[^`]+`$/.test(part)) {
        return '<code>' + esc(part.slice(1, -1)) + '</code>';
      }
      var s = esc(part);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
        if (!/^(https?:|#|\/)/i.test(href)) return m;
        return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      });
      return s;
    }).join('');
  }

  function renderMarkdown(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var i = 0;
    var firstBlock = true;

    function fence(s) { return /^\s*```/.test(s); }
    function heading(s) { return /^#{2,4}\s+/.test(s); }
    function hr(s) { return /^(-{3,}|\*{3,})\s*$/.test(s.trim()); }
    function listItem(s) { return /^[-*]\s+/.test(s) || /^\d+\.\s+/.test(s); }
    function tableRow(s) { return s.trim().charAt(0) === '|'; }
    function quote(s) { return /^>\s?/.test(s); }

    while (i < lines.length) {
      var raw = lines[i];
      if (!raw.trim()) { i += 1; continue; }

      if (fence(raw)) {
        var lang = raw.trim().slice(3).trim().split(/\s+/)[0].toLowerCase();
        i += 1;
        var buf = [];
        while (i < lines.length && !fence(lines[i])) {
          buf.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        var code = buf.join('\n');
        if (lang === 'mermaid') {
          out.push('<div class="mermaid">' + esc(code) + '</div>');
        } else {
          out.push('<pre><code>' + esc(code) + '</code></pre>');
        }
        firstBlock = false;
        continue;
      }

      var h = /^(#{2,4})\s+(.*)$/.exec(raw);
      if (h) {
        var level = h[1].length;
        out.push('<h' + level + '>' + inline(h[2].trim()) + '</h' + level + '>');
        i += 1;
        firstBlock = false;
        continue;
      }

      if (hr(raw)) {
        out.push('<hr>');
        i += 1;
        firstBlock = false;
        continue;
      }

      if (tableRow(raw)) {
        var rows = [];
        while (i < lines.length && tableRow(lines[i])) {
          rows.push(lines[i].trim());
          i += 1;
        }
        var cells = function (row) {
          return row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) {
            return c.trim();
          });
        };
        var hasHead = rows.length > 1 && /^\|?\s*:?-{2,}/.test(rows[1]);
        var head = hasHead ? cells(rows[0]) : null;
        var body = (hasHead ? rows.slice(2) : rows).map(cells);
        var headHtml = head
          ? '<thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead>'
          : '';
        var bodyHtml = '<tbody>' + body.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody>';
        out.push('<div class="table-wrap"><table>' + headHtml + bodyHtml + '</table></div>');
        firstBlock = false;
        continue;
      }

      if (quote(raw)) {
        var qbuf = [];
        while (i < lines.length && quote(lines[i])) {
          qbuf.push(lines[i].replace(/^>\s?/, ''));
          i += 1;
        }
        out.push('<blockquote><p>' + inline(qbuf.join(' ').trim()) + '</p></blockquote>');
        firstBlock = false;
        continue;
      }

      if (listItem(raw)) {
        var ordered = /^\d+\.\s+/.test(raw);
        var itemRe = ordered ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/;
        var items = [];
        while (i < lines.length) {
          var m = itemRe.exec(lines[i]);
          if (!m) break;
          items.push(m[1]);
          i += 1;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (t) {
          return '<li>' + inline(t) + '</li>';
        }).join('') + '</' + tag + '>');
        firstBlock = false;
        continue;
      }

      var pbuf = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !fence(lines[i]) && !heading(lines[i]) && !hr(lines[i]) &&
        !tableRow(lines[i]) && !quote(lines[i]) && !listItem(lines[i])
      ) {
        pbuf.push(lines[i].trim());
        i += 1;
      }
      if (!pbuf.length) { i += 1; continue; }
      var text = pbuf.join(' ');
      var verdict = firstBlock && /^\*\*一句话结论\*\*/.test(text);
      out.push('<p' + (verdict ? ' class="verdict"' : '') + '>' + inline(text) + '</p>');
      firstBlock = false;
    }

    return out.join('\n');
  }

  /* ---------------- Mermaid ---------------- */

  function ensureMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (state.mermaidPromise) return state.mermaidPromise;
    state.mermaidPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'vendor/mermaid.min.js';
      script.onload = function () {
        if (!window.mermaid) {
          reject(new Error('Mermaid 组件未正确加载'));
          return;
        }
        resolve(window.mermaid);
      };
      script.onerror = function () {
        reject(new Error('Mermaid 组件加载失败'));
      };
      document.head.appendChild(script);
    }).then(function (mermaid) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          flowchart: { useMaxWidth: true, htmlLabels: true },
          sequence: { useMaxWidth: true },
          class: { useMaxWidth: true },
          state: { useMaxWidth: true },
          er: { useMaxWidth: true },
          themeVariables: {
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            fontSize: '13px'
          }
        });
      } catch (e) {
        /* 初始化异常时仍尝试渲染 */
      }
      return mermaid;
    });
    return state.mermaidPromise;
  }

  function paintMermaid(root) {
    var nodes = [].slice.call(root.querySelectorAll('.mermaid'));
    if (!nodes.length) return;
    nodes.forEach(function (node) { node.classList.add('is-loading'); });

    ensureMermaid().then(function (mermaid) {
      var chain = Promise.resolve();
      nodes.forEach(function (node) {
        chain = chain.then(function () {
          node.classList.remove('is-loading');
          return mermaid.run({ nodes: [node] }).then(function () {
            bindDiagramZoom(node);
          }).catch(function (err) {
            showMermaidError(node, err);
          });
        });
      });
      return chain;
    }).catch(function (err) {
      nodes.forEach(function (node) { showMermaidError(node, err); });
    });
  }

  function showMermaidError(node, err) {
    node.classList.remove('is-loading');
    node.classList.add('mermaid-failed');
    node.innerHTML =
      '<div class="mermaid-error">图示渲染失败<span>' +
      esc(String((err && err.message) || err || '')) +
      '</span></div>';
  }

  /* ---------------- 错误 ---------------- */

  function renderError(err) {
    var message = (err && err.message) || String(err || '未知错误');
    document.title = '出错了 · InterviewBuddy';
    main.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-icon">' + icon('alert', 28) + '</span>' +
        '<h2>页面没有打开</h2>' +
        '<p>' + esc(message) + '</p>' +
        '<a class="btn" href="#/">返回题库首页</a>' +
        '<button class="btn" type="button" id="error-retry">重新加载</button>' +
      '</div>';
    var retry = main.querySelector('#error-retry');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
  }

  /* ---------------- 启动 ---------------- */

  window.addEventListener('hashchange', route);
  route();
})();
