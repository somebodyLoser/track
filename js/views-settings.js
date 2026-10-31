/* ============================================================
   views-settings.js — 设置：项目 / 外观 / 数据 / 关于
   多项目管理：新增、改名、换色、改开始日、归档、删除
   ============================================================ */

(function (global) {
  'use strict';

  var SD = global.SD;
  var S = function () { return SD.store; };
  var U = function () { return SD.ui; };

  function rerender() {
    if (global.SD.app && global.SD.app.rerender) global.SD.app.rerender();
  }

  function row(opts) {
    var ui = U();
    var children = [];
    if (opts.main) children.push(ui.el('div', { class: 'row-main', text: opts.main }));
    if (opts.value !== undefined && opts.value !== null && opts.value !== '') {
      children.push(ui.el('span', { class: 'row-value', text: String(opts.value) }));
    }
    if (opts.chevron) children.push(ui.el('span', { class: 'chev', text: '›' }));
    if (opts.node) children.push(opts.node);

    return ui.el(opts.tappable ? 'button' : 'div', {
      class: 'row' + (opts.tappable ? ' tappable' : '') + (opts.danger ? ' danger' : ''),
      type: opts.tappable ? 'button' : null,
      on: opts.on || null
    }, children.length ? children : [ui.el('span', { class: 'row-main', text: opts.text || '' })]);
  }

  function group(children) {
    return U().el('div', { class: 'group' }, children);
  }

  /** 带色点的项目行 */
  function habitRow(h, valueText, onClick) {
    var ui = U();
    return ui.el('button', {
      class: 'row tappable' + (h.archived ? ' muted' : ''),
      type: 'button',
      on: { click: onClick }
    }, [
      ui.dot(h.color),
      ui.el('span', { class: 'row-main', text: h.name }),
      ui.el('span', { class: 'row-value', text: valueText }),
      ui.el('span', { class: 'chev', text: '›' })
    ]);
  }

  /* ============================================================
     项目编辑器（新增 / 编辑共用）
     habitId 为 null 时是新增
     ============================================================ */

  function openHabitEditor(habitId) {
    var st = S();
    var ui = U();

    var h = habitId ? st.habitById(habitId) : null;
    var isNew = !h;

    var draft = {
      name: isNew ? '' : h.name,
      color: isNew ? st.nextColor() : h.color,
      startedAt: isNew ? st.todayKey() : st.dateKey(new Date(h.startedAt))
    };

    var nameInput = ui.el('input', {
      class: 'input',
      type: 'text',
      placeholder: '比如：戒熬夜、戒短视频、戒夜宵',
      maxlength: '24'
    });
    nameInput.value = draft.name;

    var dateInput = ui.el('input', { class: 'input', type: 'date' });
    dateInput.value = draft.startedAt;

    // 颜色选择
    var colorWrap = ui.el('div', { class: 'color-pills' });
    st.COLORS.forEach(function (c) {
      var b = ui.el('button', {
        class: 'color-pill' + (c === draft.color ? ' on' : ''),
        type: 'button',
        'aria-label': ui.COLOR_LABELS[c] || c,
        style: { background: 'var(--' + c + ')' },
        on: {
          click: function () {
            draft.color = c;
            Array.prototype.forEach.call(colorWrap.children, function (node, i) {
              node.classList.toggle('on', st.COLORS[i] === c);
            });
          }
        }
      });
      colorWrap.appendChild(b);
    });

    var body = [
      ui.el('div', { class: 'sheet-label', text: '叫什么' }),
      nameInput,
      ui.el('div', { class: 'sheet-label', text: '颜色' }),
      colorWrap,
      ui.el('div', { class: 'sheet-label', text: '从哪一天开始算' }),
      dateInput
    ];

    if (!isNew) {
      var cnt = st.relapseCount(h.id);
      body.push(ui.el('div', {
        class: 'hint',
        text: '已有 ' + cnt + ' 条记录 · 改开始日期会重算这个项目的「坚持了多少天」。'
      }));
    } else {
      body.push(ui.el('div', {
        class: 'hint',
        text: '每个项目各自计时、各自记录原因，统计可以分开看，也可以合起来看。'
      }));
    }

    var footNodes = null;
    if (!isNew) {
      var archBtn = ui.el('button', {
        class: 'btn btn-block btn-soft',
        type: 'button',
        text: h.archived ? '恢复这个项目' : '归档这个项目',
        on: {
          click: function () {
            var ok = st.archiveHabit(h.id);
            if (!ok) { ui.toast('至少要留一个正在戒的项目'); return; }
            api.close();
            ui.toast(h.archived ? '已恢复' : '已归档，记录都还在');
            rerender();
          }
        }
      });

      var delBtn = ui.el('button', {
        class: 'btn btn-block btn-danger',
        type: 'button',
        text: '删除这个项目',
        style: { 'margin-top': '8px' },
        on: {
          click: function () {
            ui.confirm({
              title: '删除「' + h.name + '」？',
              message: '这个项目的 ' + st.relapseCount(h.id) + ' 条记录会一起删除，无法撤销。' +
                       (st.habits().length <= 1 ? '（最后一个项目不能删，至少留一个。）' : ''),
              okText: '删除',
              cancelText: '保留',
              danger: true
            }).then(function (yes) {
              if (!yes) return;
              var n = st.deleteHabit(h.id);
              if (n < 0) { ui.toast('至少要留一个项目'); return; }
              api.close();
              ui.toast('已删除');
              rerender();
            });
          }
        }
      });

      footNodes = ui.el('div', {}, [archBtn, delBtn]);
    }

    var api = ui.sheet({
      title: isNew ? '新增项目' : h.name,
      leftText: '取消',
      rightText: isNew ? '添加' : '保存',
      body: body,
      foot: footNodes,
      onRight: function () {
        var name = nameInput.value.trim();
        if (!name) { ui.toast('先起个名字'); return; }

        var d = dateInput.value ? st.parseKey(dateInput.value) : null;
        var startedAt = (d && !isNaN(d.getTime())) ? st.startOfDay(d).toISOString() : null;

        if (isNew) {
          st.addHabit({ name: name, color: draft.color, startedAt: startedAt });
          ui.toast('已添加「' + name + '」');
        } else {
          st.updateHabit(h.id, { name: name, color: draft.color, startedAt: startedAt });
          ui.toast('已更新');
        }
        api.close();
        rerender();
      }
    });

    if (isNew) {
      global.setTimeout(function () { nameInput.focus(); }, 380);
    }

    return api;
  }

  /* ============================================================
     标签管理 —— 原因 / 场景的选项都能自由增删
     点一下就是删掉，不设「恢复默认」；想再要回来自己打字加一个。
     删除只影响选项，已经记录在案的文字不受影响。
     ============================================================ */

  function openLabelManager(kind) {
    var st = S();
    var ui = U();
    var isPlace = kind === 'place';

    var body = ui.el('div');

    function paint() {
      ui.clear(body);

      var list = isPlace ? st.allPlaces() : st.allReasons();

      body.appendChild(ui.el('div', {
        class: 'hint',
        style: { 'text-align': 'left' },
        text: isPlace
          ? '这些是记录「当时在哪」时能点的选项。删掉就不再出现，以前记录里的场景照旧保留。'
          : '这些是记录「这次是怎么了」时能点的选项。删掉就不再出现，以前记录里的原因照旧保留。'
      }));

      body.appendChild(ui.el('div', { class: 'sheet-label', text: '现在能选的（' + list.length + '）' }));

      if (list.length) {
        var wrap = ui.el('div', { class: 'pills del' });
        list.forEach(function (label) {
          wrap.appendChild(ui.el('button', {
            class: 'pill',
            type: 'button',
            text: label,
            on: {
              click: function () {
                st.removeLabel(kind, label);
                paint();
                ui.toast('已删掉「' + label + '」');
              }
            }
          }));
        });
        body.appendChild(wrap);
      } else {
        body.appendChild(ui.el('div', { class: 'hint', text: '一个都不剩了，在下面加一个吧。' }));
      }

      body.appendChild(ui.el('div', { class: 'sheet-label', text: '自己加一个' }));

      var input = ui.el('input', {
        class: 'input',
        type: 'text',
        maxlength: '24',
        placeholder: isPlace ? '比如：卧室书桌、地铁上…' : '比如：加班到很晚、跟他吵完架…'
      });

      function submit() {
        var v = input.value.trim();
        if (!v) { input.focus(); return; }
        var r = st.addLabel(kind, v);
        if (!r) return;
        input.value = '';
        paint();
        ui.toast(r === 'exists' ? '「' + v + '」已经在了' : '已加上「' + v + '」');
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });

      body.appendChild(ui.el('div', { style: { display: 'flex', gap: '8px' } }, [
        input,
        ui.el('button', {
          class: 'btn btn-soft btn-sm',
          type: 'button',
          text: '添加',
          on: { click: submit }
        })
      ]));

    }

    paint();

    return ui.sheet({
      title: isPlace ? '场景标签' : '原因标签',
      leftText: null,
      rightText: '完成',
      body: body,
      onRight: function () {
        rerender();
      },
      onClose: function () {
        rerender();
      }
    });
  }

  /* ---------------- 数据 ---------------- */

  /** 「上次备份」那一行显示什么 */
  function backupText(st) {
    var d = st.daysSinceExport();
    if (d === null) return st.relapses('all').length ? '还没备份' : '—';
    if (d === 0) return '今天';
    return d + ' 天前';
  }

  function doExport() {
    var st = S();
    var ui = U();
    st.markExported(); // 先记时间，导出的文件里也带上这个字段
    var text = st.exportJSON();
    var name = '自律追踪-备份-' + st.todayKey() + '.json';

    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      global.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      ui.toast('已导出 ' + name);
    } catch (e) {
      console.warn(e);
      // 兜底：直接显示文本
      var pre = ui.el('pre', {
        text: text,
        style: {
          'white-space': 'pre-wrap',
          'word-break': 'break-all',
          'font-size': '12px',
          'max-height': '50vh',
          overflow: 'auto',
          'text-align': 'left',
          color: 'var(--text-2)'
        }
      });
      ui.sheet({ title: '复制以下内容', leftText: null, rightText: '关闭', body: pre });
    }
  }

  function doImport() {
    var st = S();
    var ui = U();

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function () {
        try {
          st.importJSON(String(reader.result));
          ui.toast('导入成功');
          rerender();
        } catch (e) {
          console.warn(e);
          ui.toast('文件格式不对，导入失败');
        }
      };
      reader.onerror = function () { ui.toast('读取文件失败'); };
      reader.readAsText(file);

      document.body.removeChild(input);
    });

    input.click();
  }

  function doClear() {
    var st = S();
    var ui = U();

    ui.confirm({
      title: '清空全部数据？',
      message: '所有记录、项目和设置都会被删除，无法撤销。建议先导出一份备份。',
      okText: '清空',
      cancelText: '取消',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      st.resetAll();
      ui.toast('已清空');
      rerender();
    });
  }

  /* ---------------- 外观 ---------------- */

  function themeControl() {
    var st = S();
    var ui = U();
    var cur = st.get().settings.theme || 'auto';

    var wrap = ui.el('div', { class: 'segmented' });

    st.THEMES.forEach(function (t) {
      var b = ui.el('button', {
        type: 'button',
        class: t.v === cur ? 'on' : '',
        text: t.lb,
        on: {
          click: function () {
            st.setTheme(t.v);
            Array.prototype.forEach.call(wrap.children, function (c, i) {
              c.classList.toggle('on', st.THEMES[i].v === t.v);
            });
          }
        }
      });
      wrap.appendChild(b);
    });

    return wrap;
  }

  /* ---------------- 视图入口 ---------------- */

  function render(container) {
    var st = S();
    var ui = U();
    var s = st.get();
    var active = st.activeHabits();
    var archived = st.archivedHabits();

    container.appendChild(ui.el('header', { class: 'page-head' }, [
      ui.el('div', { class: 'eyebrow', text: '配置' }),
      ui.el('h1', { text: '设置' }),
      ui.el('div', { class: 'sub', text: '数据只存在这台设备的浏览器里' })
    ]));

    var projectRows = active.map(function (h) {
      return habitRow(h, st.relapseCount(h.id) + ' 条', function () { openHabitEditor(h.id); });
    });

    projectRows.push(row({
      main: '＋ 新增项目',
      tappable: true,
      on: { click: function () { openHabitEditor(null); } }
    }));

    var projectSection = [
      ui.el('div', { class: 'section-label', text: '项目 · ' + active.length }),
      group(projectRows)
    ];

    var archivedSection = [];
    if (archived.length) {
      archivedSection = [
        ui.el('div', { class: 'section-label', text: '已归档' }),
        group(archived.map(function (h) {
          return habitRow(h, st.relapseCount(h.id) + ' 条', function () { openHabitEditor(h.id); });
        }))
      ];
    } else {
      archivedSection = [
        ui.el('div', {
          class: 'hint',
          text: '戒成了的项目可以归档：不再出现在首页，记录和统计都保留。'
        })
      ];
    }

    container.appendChild(ui.columns([
      projectSection.concat(archivedSection).concat([
        ui.el('div', { class: 'section-label', text: '外观' }),
        group([
          row({ main: '主题', node: ui.el('div', { style: { 'min-width': '168px' } }, [themeControl()]) })
        ])
      ]),

      [
        ui.el('div', { class: 'section-label', text: '数据' }),
        group([
          row({ main: '破戒记录', value: st.relapseCount('all') + ' 条' }),
          row({ main: '自定义原因', value: s.customReasons.length + ' 个', chevron: true, tappable: true, on: { click: function () { openLabelManager('reason'); } } }),
          row({ main: '自定义场景', value: s.customPlaces.length + ' 个', chevron: true, tappable: true, on: { click: function () { openLabelManager('place'); } } }),
          row({ main: '上次备份', value: backupText(st) }),
          row({ main: '导出备份', chevron: true, tappable: true, on: { click: doExport } }),
          row({ main: '导入备份', chevron: true, tappable: true, on: { click: doImport } }),
          row({ main: '清空全部数据', tappable: true, danger: true, on: { click: doClear } })
        ]),

        ui.el('div', { class: 'section-label', text: '关于' }),
        group([
          row({ main: '版本', value: '1.3.2' }),
          row({
            main: '日期计算自检',
            chevron: true,
            tappable: true,
            on: {
              click: function () {
                var ok = st.selfTest();
                ui.toast(ok ? '日期口径自检全部通过 ✓' : '有自检项失败，请查看控制台');
              }
            }
          }),
          row({
            main: '存储方式',
            value: '本机 localStorage'
          })
        ])
      ]
    ]));

    container.appendChild(ui.el('div', {
      class: 'hint',
      style: { 'margin-top': '22px' },
      text: '自律追踪 · 记录不是定罪，是采集样本'
    }));

    return null;
  }

  global.SD = global.SD || {};
  global.SD.views = global.SD.views || {};
  global.SD.views.settings = { render: render, openHabitEditor: openHabitEditor };

})(window);