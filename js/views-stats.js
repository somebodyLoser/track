/* ============================================================
   views-stats.js — 统计页：4 个图表 + 汇总 + 洞察
   顶部有「全部 / 各项目」切换条，页内所有图表跟着当前范围走
   ============================================================ */

(function (global) {
  'use strict';

  var SD = global.SD;
  var S = function () { return SD.store; };
  var U = function () { return SD.ui; };
  var C = function () { return SD.charts; };

  var DAY_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function rerender() {
    if (global.SD.app && global.SD.app.rerender) global.SD.app.rerender();
  }

  function card(opts) {
    var ui = U();
    var children = [];

    if (opts.title) {
      children.push(ui.el('div', { class: 'card-head' }, [
        ui.el('h2', { class: 'card-title', text: opts.title }),
        opts.note ? ui.el('div', { class: 'card-note', text: opts.note }) : null
      ]));
    }

    if (opts.body) {
      var arr = Array.isArray(opts.body) ? opts.body : [opts.body];
      arr.forEach(function (n) { if (n) children.push(n); });
    }

    return ui.el('div', { class: 'card reveal' }, children);
  }

  function emptyCard(title, text) {
    var ui = U();
    return ui.el('div', { class: 'empty reveal' }, [
      ui.el('div', { class: 'em-icon', text: '✦' }),
      ui.el('h3', { text: title }),
      ui.el('p', { text: text })
    ]);
  }

  /* ---------------- 范围切换条 ---------------- */

  function scopeTitle(hid) {
    var st = S();
    if (hid === 'all') return st.habits().length > 1 ? '全部项目' : '当前项目';
    var h = st.habitById(hid);
    return h ? h.name : '当前项目';
  }

  function buildScopeBar() {
    var st = S();
    var ui = U();
    var cur = st.scope();

    var items = [{ id: 'all', label: '全部' }];
    var active = st.activeHabits();
    var archived = st.archivedHabits();

    active.forEach(function (h) {
      items.push({ id: h.id, label: h.name, color: h.color });
    });
    archived.forEach(function (h) {
      // 归档项目只在它被选中时才出现，避免平时占位置
      if (h.id === cur) items.push({ id: h.id, label: h.name, color: h.color });
    });
    // 选中的是已归档项目时，把「全部」放最后更自然 —— 保持顺序即可

    return ui.chipBar(items, cur, function (id) {
      st.setScope(id);
      rerender();
    });
  }

  /* ---------------- 汇总 ---------------- */

  function buildSummary(hid) {
    var st = S();
    var ui = U();

    // 多个项目 + 全部范围：列出每个项目的现状（比堆 4 个混合数字有用）
    if (hid === 'all' && st.habits().length > 1) {
      var total = st.relapseCount('all');
      var rows = st.habits().map(function (h) {
        var streak = st.currentStreakDays(h.id);
        var cnt = st.relapseCount(h.id);
        return ui.el('div', {
          class: 'sc-row' + (h.archived ? ' muted' : ''),
          on: {
            click: function () {
              st.setScope(h.id);
              rerender();
            }
          }
        }, [
          ui.dot(h.color, 'sm'),
          ui.el('span', { class: 'sc-name', text: h.name + (h.archived ? '（已归档）' : '') }),
          ui.el('span', { class: 'sc-val tnum', text: streak + ' 天 · ' + cnt + ' 次' })
        ]);
      });

      return card({
        title: '总览',
        note: st.habits().length + ' 个项目 · 共 ' + total + ' 次',
        body: rows
      });
    }

    function cell(v, k) {
      return ui.el('div', { style: { padding: '4px 0' } }, [
        ui.el('div', {
          class: 'tnum',
          text: String(v),
          style: { 'font-size': '26px', 'font-weight': '700', 'letter-spacing': '-0.9px', 'line-height': '1.1' }
        }),
        ui.el('div', {
          text: k,
          style: { 'font-size': '12.5px', 'color': 'var(--text-2)', 'font-weight': '530', 'margin-top': '4px' }
        })
      ]);
    }

    return card({
      title: '总览',
      note: '已追踪 ' + st.totalDays(hid) + ' 天',
      body: ui.el('div', {
        style: { display: 'grid', 'grid-template-columns': '1fr 1fr', 'row-gap': '16px' }
      }, [
        cell(st.currentStreakDays(hid), '当前连续（天）'),
        cell(st.bestStreakDays(hid), '历史最佳（天）'),
        cell(st.averageStreakDays(hid), '平均坚持（天）'),
        cell(st.relapseCount(hid), '破戒次数')
      ])
    });
  }

  /* ---------------- 原因分布 ---------------- */

  function buildReasons(hid) {
    var st = S();
    var ui = U();
    var stats = st.reasonStats(8, hid);

    if (!stats.length) {
      return card({
        title: '原因分布',
        body: ui.el('div', { class: 'card-note', text: '还没有记录过原因。下次破戒时选几个标签，这里就会亮起来。' })
      });
    }

    var top = stats[0];

    return card({
      title: '原因分布',
      note: '最多：' + top.label,
      body: C().hbars(stats)
    });
  }

  /* ---------------- 高危时段 ---------------- */

  function buildHourHeat(hid) {
    var st = S();
    var ui = U();

    if (st.relapseCount(hid) === 0) {
      return card({
        title: '高危时段',
        body: ui.el('div', { class: 'card-note', text: '记录足够多之后，这里会显示星期 × 小时的分布，帮你找出最危险的时段。' })
      });
    }

    var peak = st.peakHour(hid);
    var peakText = peak
      ? DAY_FULL[peak.day] + ' ' + peak.hour + ':00 前后最容易破戒 · 共 ' + peak.count + ' 次'
      : '数据还不够看出规律';

    return card({
      title: '高危时段',
      note: '星期 × 小时',
      body: [
        C().hourHeat(st.hourMatrix(hid)),
        ui.el('div', {
          class: 'card-note',
          text: peakText,
          style: { 'margin-top': '14px' }
        })
      ]
    });
  }

  /* ---------------- 坚持时长趋势 ---------------- */

  function buildTrend(hid) {
    var st = S();
    var ui = U();
    var series = st.streakSeries(hid);

    if (!series.length) {
      return card({
        title: '坚持时长趋势',
        body: ui.el('div', { class: 'card-note', text: '每一次破戒都会在这里留下一个点：破戒前你坚持了多久。看趋势，不看单次。' })
      });
    }

    var svg = C().line(series);

    var last = series[series.length - 1];
    var insight;
    if (series.length === 1) {
      insight = '目前只有一次记录：坚持了 ' + last.days + ' 天。';
    } else {
      var prev = series[series.length - 2];
      var diff = last.days - prev.days;
      if (diff > 0) insight = '最近一次比上次多坚持了 ' + diff + ' 天，在变好。';
      else if (diff < 0) insight = '最近一次比上次少了 ' + (-diff) + ' 天。看看上次和这次的原因有没有重合。';
      else insight = '最近两次坚持的天数一样：' + last.days + ' 天，可能撞上了同一个模式。';
    }

    return card({
      title: '坚持时长趋势',
      note: series.length + ' 次记录',
      body: [
        svg,
        ui.el('div', { class: 'card-note', text: insight, style: { 'margin-top': '12px' } })
      ]
    });
  }

  /* ---------------- 日历热力 ---------------- */

  function buildCalendar(hid) {
    var st = S();
    var ui = U();
    var year = new Date().getFullYear();
    var cal = st.calendar(year, hid);

    return card({
      title: '日历热力 · ' + year,
      note: '越深 = 连续越久',
      body: [
        C().calendar(cal),
        C().calendarLegend()
      ]
    });
  }

  /* ---------------- 视图入口 ---------------- */

  function render(container) {
    var st = S();
    var ui = U();
    var hid = st.scope();
    var count = st.relapseCount(hid);
    var title = scopeTitle(hid);

    container.appendChild(ui.el('header', { class: 'page-head' }, [
      ui.el('div', { class: 'eyebrow', text: '数据' }),
      ui.el('h1', { text: '统计' }),
      ui.el('div', {
        class: 'sub',
        text: count === 0
          ? '还没有数据 —— 这在戒断追踪里是好事'
          : '从 ' + count + ' 次记录里找规律，而不是找罪名'
      })
    ]));

    // 只有一个项目时范围条没有意义，直接不显示
    if (st.habits().length > 1) container.appendChild(buildScopeBar());

    if (count === 0) {
      container.appendChild(ui.el('div', { class: 'desk-single' }, [
        emptyCard(
          title + ' 目前零破戒',
          '计时器一直在跑。等你第一次记录时，这里会自动长出四张图：原因分布、高危时段、坚持趋势、日历热力。'
        ),
        U().el('div', { class: 'spacer-16' }),
        buildSummary(hid)
      ]));
      return null;
    }

    container.appendChild(ui.columns([
      [buildSummary(hid), buildReasons(hid)],
      [buildHourHeat(hid), buildTrend(hid), buildCalendar(hid)]
    ]));

    return null;
  }

  global.SD = global.SD || {};
  global.SD.views = global.SD.views || {};
  global.SD.views.stats = { render: render };

})(window);