/* ============================================================
   views-timeline.js — 时间线 + 记录详情
   ============================================================ */

(function (global) {
  'use strict';

  var SD = global.SD;
  var S = function () { return SD.store; };
  var U = function () { return SD.ui; };

  function monthLabel(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
  }

  function rerender() {
    if (global.SD.app && global.SD.app.rerender) global.SD.app.rerender();
  }

  /* ---------------- 详情 ---------------- */

  function openDetail(relapse) {
    var st = S();
    var ui = U();

    var rows = [];

    function infoRow(label, value) {
      if (!value) return;
      rows.push(ui.el('div', { class: 'row' }, [
        ui.el('span', { class: 'row-main', text: label }),
        ui.el('span', { class: 'row-value', text: String(value) })
      ]));
    }

    var d = new Date(relapse.at);
    infoRow('时间', st.fmtDateFull(st.dateKey(d)) + ' ' + st.fmtTime(relapse.at));
    if (st.habits().length > 1) {
      var owner = st.habitById(relapse.habitId);
      infoRow('项目', owner ? owner.name : '');
    }
    infoRow('坚持了', relapse.streakDays + ' 天');
    infoRow('场景', relapse.place);

    var moodObj = null;
    st.MOODS.forEach(function (m) { if (m.v === relapse.mood) moodObj = m; });
    infoRow('心情', moodObj ? moodObj.em + ' ' + moodObj.lb : '');

    var body = ui.el('div');

    if (relapse.reasonTags && relapse.reasonTags.length) {
      body.appendChild(ui.el('div', { class: 'sheet-label', text: '原因' }));
      var pills = ui.el('div', { class: 'pills' });
      relapse.reasonTags.forEach(function (t) {
        pills.appendChild(ui.el('span', { class: 'chip accent', text: t }));
      });
      body.appendChild(pills);
    }

    body.appendChild(ui.el('div', { class: 'sheet-label', text: '记录' }));
    var group = ui.el('div', { class: 'group' }, rows);
    body.appendChild(group);

    if (relapse.reasonNote) {
      body.appendChild(ui.el('div', { class: 'sheet-label', text: '当时写的' }));
      body.appendChild(ui.el('div', {
        class: 'card-flat',
        text: relapse.reasonNote,
        style: { 'font-size': '15px', 'line-height': '1.55', color: 'var(--text)' }
      }));
    }

    var deleteBtn = ui.el('button', {
      class: 'btn btn-block btn-danger',
      type: 'button',
      text: '删除这条记录',
      on: {
        click: function () {
          ui.confirm({
            title: '删除这条记录？',
            message: '删除后统计会重新计算，且无法撤销。',
            okText: '删除',
            cancelText: '保留',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            st.removeRelapse(relapse.id);
            api.close();
            ui.toast('已删除');
            rerender();
          });
        }
      }
    });

    var api = ui.sheet({
      title: '记录详情',
      leftText: null,
      rightText: '关闭',
      body: body,
      foot: deleteBtn
    });

    return api;
  }

  /* ---------------- 条目 ---------------- */

  function buildItem(r) {
    var st = S();
    var ui = U();
    var multi = st.habits().length > 1;
    var owner = st.habitById(r.habitId);

    var tags = ui.el('div', { class: 'tl-tags' });
    (r.reasonTags || []).slice(0, 5).forEach(function (t) {
      tags.appendChild(ui.el('span', { class: 'chip', text: t }));
    });

    return ui.el('div', {
      class: 'tl-item',
      on: { click: function () { openDetail(r); } }
    }, [
      ui.el('div', {
        class: 'tl-rail',
        style: { background: owner ? 'var(--' + owner.color + ')' : 'var(--fill-3)' }
      }),
      ui.el('div', { class: 'tl-body' }, [
        ui.el('div', { class: 'tl-top' }, [
          (multi && owner) ? ui.el('span', {
            class: 'tl-habit',
            style: { background: 'color-mix(in srgb, var(--' + owner.color + ') 14%, transparent)' }
          }, [
            ui.dot(owner.color, 'sm'),
            ui.el('span', { text: owner.name })
          ]) : null,
          ui.el('span', { class: 'tl-date', text: st.fmtDate(st.dateKey(new Date(r.at))) }),
          ui.el('span', { class: 'tl-time', text: st.fmtTime(r.at) }),
          ui.el('span', { class: 'tl-survive', text: '坚持 ' + r.streakDays + ' 天' })
        ]),
        (r.reasonTags && r.reasonTags.length) ? tags : null,
        r.reasonNote ? ui.el('div', { class: 'tl-note', text: r.reasonNote }) : null
      ])
    ]);
  }

  /* ---------------- 视图入口 ---------------- */

  function render(container) {
    var st = S();
    var ui = U();
    var cur = st.scope();
    var list = st.relapses(cur).slice().reverse(); // 最新在上
    var scopeName = cur === 'all'
      ? (st.habits().length > 1 ? '全部项目' : '当前项目')
      : ((st.habitById(cur) || {}).name || '当前项目');

    container.appendChild(ui.el('header', { class: 'page-head' }, [
      ui.el('div', { class: 'eyebrow', text: '复盘' }),
      ui.el('h1', { text: '时间线' }),
      ui.el('div', {
        class: 'sub',
        text: list.length
          ? scopeName + ' · 共 ' + list.length + ' 次记录 · 点开任意一条查看或删除'
          : '每次记录都会出现在这里'
      })
    ]));

    // 只有一个项目时不需要范围切换
    if (st.habits().length > 1) {
      container.appendChild(ui.chipBar(scopeItems(), cur, function (id) {
        st.setScope(id);
        rerender();
      }));
    }

    if (!list.length) {
      container.appendChild(ui.el('div', { class: 'empty reveal desk-single' }, [
        ui.el('div', { class: 'em-icon', text: '✓' }),
        ui.el('h3', { text: '还没有记录' }),
        ui.el('p', { text: '首页的计时器正在跑。如果哪天没忍住，点「我没忍住」记一笔，比什么都不记要好。' })
      ]));
      return null;
    }

    var wrap = ui.el('div', { class: 'desk-single' });
    container.appendChild(wrap);

    var currentMonth = null;

    list.forEach(function (r) {
      var m = monthLabel(r.at);
      if (m !== currentMonth) {
        currentMonth = m;
        wrap.appendChild(ui.el('div', { class: 'tl-month', text: m }));
      }
      wrap.appendChild(buildItem(r));
    });

    return null;
  }

  /** 时间线的范围切换项：全部 + 各活跃项目（选中的归档项目也列出来） */
  function scopeItems() {
    var st = S();
    var cur = st.scope();
    var items = [{ id: 'all', label: '全部' }];
    st.activeHabits().forEach(function (h) {
      items.push({ id: h.id, label: h.name, color: h.color });
    });
    st.archivedHabits().forEach(function (h) {
      if (h.id === cur) items.push({ id: h.id, label: h.name, color: h.color });
    });
    return items;
  }

  global.SD = global.SD || {};
  global.SD.views = global.SD.views || {};
  global.SD.views.timeline = { render: render, openDetail: openDetail };

})(window);