/* ============================================================
   views-home.js — 首页 + 破戒记录 Sheet
   单项目：一个大计时环（和 1.0 一样）
   多项目：每个项目一张卡片，各自计时、各自「我没忍住」
   ============================================================ */

(function (global) {
  'use strict';

  var SD = global.SD;
  var S = function () { return SD.store; };
  var U = function () { return SD.ui; };
  var C = function () { return SD.charts; };

  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function go(name) {
    if (global.SD.app && global.SD.app.go) global.SD.app.go(name);
  }

  function openStats(habitId) {
    var st = S();
    st.setScope(habitId);
    go('stats');
  }

  /* ---------------- 页头 ---------------- */

  function buildHead(multi, activeList) {
    var now = new Date();
    var st = S();
    var eyebrow = (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEKDAYS[now.getDay()];

    if (!multi) {
      var h = st.habit();
      return U().el('header', { class: 'page-head' }, [
        U().el('div', { class: 'eyebrow', text: eyebrow }),
        U().el('h1', { text: h.name }),
        U().el('div', {
          class: 'sub',
          text: '自 ' + st.fmtDateFull(st.dateKey(new Date(h.startedAt))) + ' 起追踪 · 第 ' + st.totalDays(h.id) + ' 天'
        })
      ]);
    }

    var ids = activeList.map(function (x) { return x.id; });
    var total = 0;
    ids.forEach(function (id) { total += st.relapseCount(id); });

    return U().el('header', { class: 'page-head' }, [
      U().el('div', { class: 'eyebrow', text: eyebrow }),
      U().el('h1', { text: '我的项目' }),
      U().el('div', {
        class: 'sub',
        text: activeList.length + ' 个正在戒 · 累计 ' + total + ' 次记录'
      })
    ]);
  }

  /* ---------------- 单项目 Hero ---------------- */

  function buildHero(tickRefs) {
    var st = S();
    var hid = st.activeHabit().id;
    var ms = st.milestoneInfo(hid);

    var ringNode = C().ring({ size: 196, stroke: 13, progress: ms.progress });

    var daysNode = U().el('div', { class: 'ring-days tnum', text: String(ms.streak) });
    var unitNode = U().el('div', { class: 'ring-unit', text: '天 · 连续' });

    var ringWrap = U().el('div', { class: 'ring-wrap' }, [
      ringNode,
      U().el('div', { class: 'ring-center' }, [daysNode, unitNode])
    ]);

    var last = st.lastRelapse(hid);
    var timerNode = U().el('div', { class: 'timer-line' });
    var timerB = U().el('b', { class: 'tnum', text: '' });
    timerNode.appendChild(document.createTextNode(last ? '距离上次破戒 ' : '自开始以来 '));
    timerNode.appendChild(timerB);

    tickRefs.push(function () {
      var now = Date.now();
      timerB.textContent = st.fmtClock(now - st.sinceMs(hid)).full;
      var s2 = st.currentStreakDays(hid);
      if (daysNode.textContent !== String(s2)) daysNode.textContent = String(s2);
    });

    var parts = [
      U().el('div', { class: 'hero-ring' }, [ringWrap]),
      timerNode
    ];

    if (!last) {
      parts.push(U().el('div', { class: 'hint', text: '还没有任何破戒记录 —— 继续保持' }));
    }

    return U().el('div', { class: 'hero reveal' }, parts);
  }

  /* ---------------- 单项目里程碑 ---------------- */

  function buildMilestone() {
    var st = S();
    var ms = st.milestoneInfo(st.activeHabit().id);

    var badgeText = ms.next === null ? '✓' : String(ms.next);
    var title, sub;

    if (ms.next === null) {
      title = '全部里程碑已达成';
      sub = '当前 ' + ms.streak + ' 天';
    } else {
      title = '下一个里程碑 ' + ms.next + ' 天';
      sub = ms.reached ? '已达成 ' + ms.reached + ' 天 · 还差 ' + ms.remaining + ' 天'
                       : '还差 ' + ms.remaining + ' 天';
    }

    return U().el('div', { class: 'card milestone reveal' }, [
      U().el('div', { class: 'ms-badge', text: badgeText }),
      U().el('div', { class: 'ms-body' }, [
        U().el('div', { class: 'ms-title' }, [
          U().el('span', { text: title }),
          U().el('span', { class: 'ms-left', text: '' })
        ]),
        U().el('div', { class: 'progress' }, [
          U().el('i', { style: { width: (ms.progress * 100).toFixed(1) + '%' } })
        ]),
        U().el('div', { class: 'card-note', text: sub, style: { 'margin-top': '8px' } })
      ])
    ]);
  }

  /* ---------------- 三格小统计（单项目：当前项目） ---------------- */

  function buildMinis() {
    var st = S();
    var hid = st.activeHabit().id;
    return U().el('div', { class: 'mini-stats reveal' }, [
      U().el('div', { class: 'mini' }, [
        U().el('div', { class: 'v tnum', text: String(st.bestStreakDays(hid)) }),
        U().el('div', { class: 'k', text: '历史最佳' })
      ]),
      U().el('div', { class: 'mini' }, [
        U().el('div', { class: 'v tnum', text: String(st.averageStreakDays(hid)) }),
        U().el('div', { class: 'k', text: '平均坚持' })
      ]),
      U().el('div', { class: 'mini' }, [
        U().el('div', { class: 'v tnum', text: String(st.relapseCount(hid)) }),
        U().el('div', { class: 'k', text: '破戒次数' })
      ])
    ]);
  }

  /* ---------------- 三格小统计（多项目：全部合计） ---------------- */

  function buildTotals(activeList) {
    var st = S();
    var best = 0;
    var total = 0;
    activeList.forEach(function (h) {
      total += st.relapseCount(h.id);
      var b = st.bestStreakDays(h.id);
      if (b > best) best = b;
    });

    return U().el('div', { class: 'mini-stats reveal' }, [
      U().el('div', { class: 'mini' }, [
        U().el('div', { class: 'v tnum', text: String(activeList.length) }),
        U().el('div', { class: 'k', text: '正在戒' })
      ]),
      U().el('div', { class: 'mini' }, [
        U().el('div', { class: 'v tnum', text: String(best) }),
        U().el('div', { class: 'k', text: '最长坚持' })
      ]),
      U().el('div', { class: 'mini' }, [
        U().el('div', { class: 'v tnum', text: String(total) }),
        U().el('div', { class: 'k', text: '总记录' })
      ])
    ]);
  }

  /* ---------------- 单项目主按钮 ---------------- */

  function buildActions(onSaved) {
    var st = S();
    var hid = st.activeHabit().id;
    return U().el('div', { class: 'home-actions' }, [
      U().el('button', {
        class: 'btn btn-primary btn-block btn-lg',
        type: 'button',
        text: '我没忍住',
        on: { click: function () { openRelapseSheet(onSaved, hid); } }
      }),
      U().el('div', {
        class: 'hint',
        text: '记录不是定罪，是采集一次样本。写得越具体，越能看出规律。'
      })
    ]);
  }

  /* ---------------- 项目卡片 ---------------- */

  function buildHabitCard(h, tickRefs, onSaved) {
    var st = S();
    var ui = U();

    var ms = st.milestoneInfo(h.id);
    var count = st.relapseCount(h.id);
    var last = st.lastRelapse(h.id);

    var ringNode = C().ring({
      size: 72,
      stroke: 8,
      progress: ms.progress,
      color: 'var(--' + h.color + ')'
    });
    var numNode = ui.el('div', { class: 'h-ring-num tnum', text: String(ms.streak) });

    var timerNode = ui.el('div', { class: 'h-timer tnum', text: '' });
    var nextNode = ui.el('div', {
      class: 'h-next',
      text: ms.next === null
        ? '全部里程碑已达成'
        : '还差 ' + ms.remaining + ' 天到 ' + ms.next + ' 天'
    });

    tickRefs.push(function () {
      timerNode.textContent = st.fmtClock(Date.now() - st.sinceMs(h.id)).full;
      var s2 = st.currentStreakDays(h.id);
      if (numNode.textContent !== String(s2)) numNode.textContent = String(s2);
    });

    var relapseBtn = ui.el('button', {
      class: 'btn btn-soft btn-sm',
      type: 'button',
      text: '我没忍住',
      on: {
        click: function (e) {
          e.stopPropagation();
          openRelapseSheet(onSaved, h.id);
        }
      }
    });

    return ui.el('div', {
      class: 'card habit-card reveal',
      on: { click: function () { openStats(h.id); } }
    }, [
      ui.el('div', { class: 'h-top' }, [
        ui.dot(h.color),
        ui.el('span', { class: 'h-name', text: h.name }),
        ui.el('span', { class: 'h-badge', text: count + ' 次' })
      ]),
      ui.el('div', { class: 'h-mid' }, [
        ui.el('div', { class: 'h-ring' }, [ringNode, numNode]),
        ui.el('div', { class: 'h-text' }, [
          timerNode,
          nextNode,
          ui.el('div', { class: 'progress h-progress' }, [
            ui.el('i', {
              style: {
                width: (ms.progress * 100).toFixed(1) + '%',
                background: 'var(--' + h.color + ')'
              }
            })
          ]),
          last
            ? ui.el('div', {
                class: 'h-last',
                text: '上次 ' + st.fmtDate(st.dateKey(new Date(last.at))) +
                      ' · 当时坚持 ' + last.streakDays + ' 天'
              })
            : ui.el('div', { class: 'h-last', text: '还没有记录' })
        ])
      ]),
      ui.el('div', { class: 'h-foot' }, [relapseBtn])
    ]);
  }

  function buildHabitList(activeList, tickRefs, onSaved) {
    var ui = U();
    var list = ui.el('div', { class: 'habit-list' }, activeList.map(function (h) {
      return buildHabitCard(h, tickRefs, onSaved);
    }));
    return list;
  }

  function buildAddBtn() {
    var ui = U();
    return ui.el('button', {
      class: 'btn btn-ghost btn-block add-habit',
      type: 'button',
      text: '+ 新增项目',
      on: {
        click: function () {
          if (SD.views.settings && SD.views.settings.openHabitEditor) {
            SD.views.settings.openHabitEditor(null);
          }
        }
      }
    });
  }

  /* ---------------- 最近三次（仅宽屏显示） ---------------- */

  function buildRecentDesk() {
    var st = S();
    var ui = U();
    var list = st.relapses('all').slice().reverse().slice(0, 3);
    var multi = st.habits().length > 1;

    var body;
    if (!list.length) {
      body = ui.el('div', { class: 'card-note', text: '还没有记录 —— 这本身是个好数字。' });
    } else {
      body = ui.el('div', { class: 'recent-list' }, list.map(function (r) {
        var tags = (r.reasonTags || []).slice(0, 2).join(' · ');
        var h = st.habitById(r.habitId);
        return ui.el('div', { class: 'recent-item' }, [
          ui.el('div', { class: 'recent-main' }, [
            (multi && h) ? ui.el('span', { class: 'recent-habit' }, [
              ui.dot(h.color, 'sm'),
              ui.el('span', { text: h.name })
            ]) : null,
            ui.el('span', { class: 'recent-date tnum', text: st.fmtDate(st.dateKey(new Date(r.at))) }),
            tags ? ui.el('span', { class: 'recent-tag', text: tags }) : null
          ]),
          ui.el('span', { class: 'recent-streak tnum', text: '坚持 ' + r.streakDays + ' 天' })
        ]);
      }));
    }

    return ui.el('div', { class: 'card desk-only' }, [
      ui.el('div', { class: 'card-title', text: '最近三次' }),
      body,
      ui.el('div', {
        class: 'recent-more',
        text: '查看全部 →',
        on: {
          click: function () {
            if (st.scope() !== 'all') st.setScope('all');
            go('timeline');
          }
        }
      })
    ]);
  }

  /* ---------------- 备份提醒 ---------------- */

  function backupNudge() {
    var st = S();
    var ui = U();
    if (!st.relapses('all').length) return null;

    var d = st.daysSinceExport();
    if (d !== null && d < 14) return null;

    return ui.el('div', {
      class: 'hint backup-nudge',
      text: d === null
        ? '还没导出过备份。数据只在这台设备的浏览器里，导一份 JSON 更安心。'
        : '距离上次备份 ' + d + ' 天。数据只在这台设备的浏览器里，导一份 JSON 更安心。'
    });
  }

  /* ============================================================
     破戒记录 Sheet —— 两屏渐进，避免一上来就让人填一堆
     habitId：这一笔算在哪个项目上（多项目时由卡片按钮传入）
     ============================================================ */

  function openRelapseSheet(onSaved, habitId) {
    var st = S();
    var ui = U();

    var target = st.habit(habitId);
    var hid = target ? target.id : st.activeHabit().id;
    var multi = st.habits().length > 1;

    var draft = {
      reasonTags: [],
      place: '',
      mood: null,
      note: ''
    };

    var step = 1;
    /* 每一步各自的「管理」开关：管理模式下点标签 = 删掉它 */
    var manage = { reason: false, place: false };
    var streakBefore = st.currentStreakDays(hid);

    var bodyNode = ui.el('div');
    var sheetApi;

    function handleLeft() {
      if (step === 2) {
        step = 1;
        paint();
      } else {
        sheetApi.close();
      }
    }

    sheetApi = ui.sheet({
      title: '这次是怎么了？',
      leftText: '取消',
      rightText: '下一步',
      body: bodyNode,
      onLeft: handleLeft,
      onRight: function () {
        if (step === 1) {
          step = 2;
          paint();
        } else {
          commit();
        }
      }
    });

    function paint() {
      ui.clear(bodyNode);

      if (step === 1) {
        sheetApi.title.textContent = '这次是怎么了？';
        sheetApi.rightBtn.textContent = '下一步';
        sheetApi.leftBtn.textContent = '取消';
        bodyNode.appendChild(buildStepReasons());
      } else {
        sheetApi.title.textContent = '当时的情况';
        sheetApi.rightBtn.textContent = '保存';
        sheetApi.leftBtn.textContent = '上一步';
        bodyNode.appendChild(buildStepContext());
      }

      if (bodyNode.parentNode) bodyNode.parentNode.scrollTop = 0;
    }

    /* ---- 标签区的公共零件（原因 / 场景共用） ---- */

    /** 标题行：左边一句说明，右边「恢复默认 / 管理」 */
    function labelHeadRow(text, kind) {
      var acts = ui.el('div', { class: 'label-acts' });

      if (st.hiddenLabels(kind).length) {
        acts.appendChild(ui.el('button', {
          class: 'link-btn',
          type: 'button',
          text: '恢复默认',
          on: {
            click: function () {
              st.resetLabels(kind);
              paint();
              ui.toast('内置标签都放回来了');
            }
          }
        }));
      }

      acts.appendChild(ui.el('button', {
        class: 'link-btn' + (manage[kind] ? ' on' : ''),
        type: 'button',
        text: manage[kind] ? '完成' : '管理',
        on: {
          click: function () {
            manage[kind] = !manage[kind];
            paint();
          }
        }
      }));

      return ui.el('div', { class: 'label-row' }, [
        ui.el('div', { class: 'sheet-label', text: text }),
        acts
      ]);
    }

    /** 管理模式下的一句提示，避免误删了不知道发生了什么 */
    function manageHint(kind) {
      if (!manage[kind]) return null;
      return ui.el('div', {
        class: 'hint',
        style: { 'text-align': 'left', 'margin-top': '10px' },
        text: '现在点一下标签就是把它删掉。以前的记录里已经存下的标签不会跟着变。'
      });
    }

    /** 加一个标签的输入行 */
    function labelAddRow(kind, placeholder) {
      var input = ui.el('input', {
        class: 'input',
        type: 'text',
        placeholder: placeholder,
        maxlength: '24'
      });

      var addBtn = ui.el('button', {
        class: 'btn btn-soft btn-sm',
        type: 'button',
        text: '添加',
        on: { click: function () { submit(); } }
      });

      function submit() {
        var v = input.value.trim();
        if (!v) { input.focus(); return; }

        var r = st.addLabel(kind, v);
        if (!r) return;

        if (kind === 'reason') {
          if (draft.reasonTags.indexOf(v) < 0) draft.reasonTags.push(v);
        } else {
          draft.place = v;
        }

        input.value = '';
        paint();
        ui.toast(r === 'exists' ? '「' + v + '」已经在了'
          : r === 'restored' ? '已放回「' + v + '」'
          : '已加上「' + v + '」');
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });

      return ui.el('div', { style: { display: 'flex', gap: '8px' } }, [input, addBtn]);
    }

    /* ---- 第一屏：原因标签 ---- */

    function buildStepReasons() {
      var wrap = ui.el('div');

      if (multi && target) {
        wrap.appendChild(ui.el('div', { class: 'chip-row' }, [
          ui.el('span', { class: 'chip accent' }, [
            ui.dot(target.color, 'sm'),
            ui.el('span', { text: target.name })
          ])
        ]));
      }

      wrap.appendChild(labelHeadRow('可以多选。哪几个是真的？', 'reason'));

      var pills = ui.el('div', { class: 'pills' + (manage.reason ? ' del' : '') });

      st.allReasons().forEach(function (tag) {
        var p = ui.el('button', {
          class: 'pill' + (draft.reasonTags.indexOf(tag) >= 0 ? ' on' : ''),
          type: 'button',
          text: tag,
          on: {
            click: function () {
              if (manage.reason) {
                st.removeLabel('reason', tag);
                draft.reasonTags = draft.reasonTags.filter(function (t) { return t !== tag; });
                paint();
                ui.toast('已删掉「' + tag + '」');
                return;
              }
              var i = draft.reasonTags.indexOf(tag);
              if (i >= 0) {
                draft.reasonTags.splice(i, 1);
                p.classList.remove('on');
              } else {
                draft.reasonTags.push(tag);
                p.classList.add('on');
              }
            }
          }
        });
        pills.appendChild(p);
      });

      if (!pills.children.length) {
        pills.appendChild(ui.el('div', {
          class: 'hint',
          text: '一个都不剩了 —— 在下面加一个，或者点上面的「恢复默认」。'
        }));
      }

      wrap.appendChild(pills);

      var rHint = manageHint('reason');
      if (rHint) wrap.appendChild(rHint);

      wrap.appendChild(ui.el('div', { class: 'sheet-label', text: '都不贴切？自己写一个' }));
      wrap.appendChild(labelAddRow('reason', '比如：加班到很晚、跟他吵完架…'));

      wrap.appendChild(ui.el('div', {
        class: 'hint',
        style: { 'text-align': 'left', 'margin-top': '18px' },
        text: '不选也可以继续 —— 直接点「下一步」记录时间就行。'
      }));

      return wrap;
    }

    /* ---- 第二屏：场景 / 情绪 / 一句话 ---- */

    function buildStepContext() {
      var wrap = ui.el('div');

      wrap.appendChild(ui.el('div', {
        class: 'chip accent',
        style: { 'margin-bottom': '4px' },
        text: (multi && target ? target.name + ' · ' : '') + '这一次你坚持了 ' + streakBefore + ' 天'
      }));

      wrap.appendChild(labelHeadRow('当时在哪', 'place'));

      var placePills = ui.el('div', { class: 'pills' + (manage.place ? ' del' : '') });
      st.allPlaces().forEach(function (pl) {
        var p = ui.el('button', {
          class: 'pill' + (draft.place === pl ? ' on' : ''),
          type: 'button',
          text: pl,
          on: {
            click: function () {
              if (manage.place) {
                if (draft.place === pl) draft.place = '';
                st.removeLabel('place', pl);
                paint();
                ui.toast('已删掉「' + pl + '」');
                return;
              }
              draft.place = draft.place === pl ? '' : pl;
              Array.prototype.forEach.call(placePills.children, function (c) {
                c.classList.toggle('on', c.textContent === draft.place);
              });
            }
          }
        });
        placePills.appendChild(p);
      });
      if (!placePills.children.length) {
        placePills.appendChild(ui.el('div', {
          class: 'hint',
          text: '一个都不剩了 —— 在下面加一个，或者点上面的「恢复默认」。'
        }));
      }
      wrap.appendChild(placePills);

      var pHint = manageHint('place');
      if (pHint) wrap.appendChild(pHint);

      wrap.appendChild(labelAddRow('place', '比如：卧室书桌、地铁上、朋友家…'));

      wrap.appendChild(ui.el('div', { class: 'sheet-label', text: '当时的心情' }));

      var moodGrid = ui.el('div', { class: 'moods' });
      st.MOODS.forEach(function (m) {
        var b = ui.el('button', {
          class: 'mood-btn' + (draft.mood === m.v ? ' on' : ''),
          type: 'button',
          on: {
            click: function () {
              draft.mood = draft.mood === m.v ? null : m.v;
              Array.prototype.forEach.call(moodGrid.children, function (c, idx) {
                c.classList.toggle('on', st.MOODS[idx].v === draft.mood);
              });
            }
          }
        }, [
          ui.el('span', { class: 'em', text: m.em }),
          ui.el('span', { class: 'lb', text: m.lb })
        ]);
        moodGrid.appendChild(b);
      });
      wrap.appendChild(moodGrid);

      wrap.appendChild(ui.el('div', { class: 'sheet-label', text: '一句话复盘（可跳过）' }));

      var textarea = ui.el('textarea', {
        class: 'textarea',
        placeholder: '当时在想什么？如果不这样，本来可以做什么？',
        maxlength: '240'
      });
      textarea.value = draft.note;
      textarea.addEventListener('input', function () { draft.note = textarea.value; });
      wrap.appendChild(textarea);

      return wrap;
    }

    /* ---- 保存 ---- */

    function commit() {
      var entry = st.addRelapse({
        habitId: hid,
        at: new Date().toISOString(),
        reasonTags: draft.reasonTags.slice(),
        reasonNote: draft.note.trim(),
        mood: draft.mood,
        place: draft.place
      });

      sheetApi.close();

      var msg = entry.streakDays > 0
        ? '已记录。坚持了 ' + entry.streakDays + ' 天，这 ' + entry.streakDays + ' 天是真的。'
        : '已记录。从今天重新开始。';
      ui.toast(msg, 3200);

      if (onSaved) onSaved(entry);
    }

    paint();
    return sheetApi;
  }

  /* ---------------- 视图入口 ---------------- */

  function render(container) {
    var tickRefs = [];
    var st = S();
    var ui = U();

    function onSaved() {
      // 重新渲染当前视图
      if (global.SD.app && global.SD.app.rerender) global.SD.app.rerender();
    }

    var activeList = st.activeHabits();
    var multi = st.habits().length > 1;

    container.appendChild(buildHead(multi, activeList));

    if (!multi) {
      // 手机：单列，顺序 = 左栏 → 右栏；宽屏：分成两栏
      container.appendChild(ui.columns([
        [buildHero(tickRefs), buildMilestone()],
        [buildMinis(), buildActions(onSaved), backupNudge(), buildRecentDesk()]
      ]));
    } else {
      var extra = [];
      if (st.archivedHabits().length) {
        extra.push(ui.el('div', {
          class: 'hint',
          text: '另有 ' + st.archivedHabits().length + ' 个已归档项目，可在设置里恢复。'
        }));
      }
      container.appendChild(ui.columns([
        [buildHabitList(activeList, tickRefs, onSaved), buildAddBtn()].concat(extra),
        [buildTotals(activeList), backupNudge(), buildRecentDesk()]
      ]));
    }

    // 立即跑一次，避免首帧空白
    tickRefs.forEach(function (f) { f(); });

    return function tick() {
      tickRefs.forEach(function (f) { f(); });
    };
  }

  global.SD = global.SD || {};
  global.SD.views = global.SD.views || {};
  global.SD.views.home = { render: render, openRelapseSheet: openRelapseSheet, openStats: openStats };

})(window);