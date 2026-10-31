/* ============================================================
   store.js — 状态、持久化、领域计算（多项目版）
   全局命名空间：window.SD.store
   约束：不使用 ES Module（保证 file:// 双击可用）

   多项目口径（1.1.0 起）：
   · habits[]   每个戒断项目一条，id 唯一
   · relapses[].habitId  指向所属项目
   · 所有领域函数都接受 hid：'all' = 全部项目合计，其余 = 某项目 id
     不传 hid 时默认当前活跃项目（第一个未归档项目）—— 保持旧调用可用
   · settings.scope  统计页 / 时间线的当前筛选（'all' 或 habit id）

   标签口径（1.2.0 起）：
   · 原因（REASONS）和场景（PLACES）都是内置表 + customXxx 自己加的，
     内置的可以删（记进 hiddenXxx，可恢复默认）
   · 删标签只动「可选项」，relapses 里已存的字符串永不改写
   ============================================================ */

(function (global) {
  'use strict';

  var KEY = 'selfdiscipline.v1';

  /* ---------------- 常量 ---------------- */

  var COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'pink', 'teal', 'indigo', 'yellow'];

  var REASONS = [
    '压力大', '无聊空虚', '失眠', '情绪低落', '孤独',
    '冲动/生理', '刷到触发内容', '喝了酒', '社交场合',
    '疲惫', '习惯性动作', '报复性放纵'
  ];

  var PLACES = ['床上', '洗手间', '独自在家', '深夜办公室', '通勤路上', '酒店', '其他'];

  var MOODS = [
    { v: 1, em: '😖', lb: '很难受' },
    { v: 2, em: '😞', lb: '低落' },
    { v: 3, em: '😐', lb: '一般' },
    { v: 4, em: '🙂', lb: '还行' },
    { v: 5, em: '😄', lb: '不错' }
  ];

  var MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365];

  var THEMES = [
    { v: 'auto', lb: '自动' },
    { v: 'light', lb: '浅色' },
    { v: 'dark', lb: '深色' }
  ];

  /* ---------------- 日期工具 ----------------
     全部以「本地日期键 YYYY-MM-DD」为准。
     绝不拿毫秒差除以 86400000 —— UTC 偏移与夏令时会算错一天。
     -------------------------------------------------- */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** Date -> 'YYYY-MM-DD'（本地） */
  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 'YYYY-MM-DD' -> Date（本地零点），手写解析避开 UTC 陷阱 */
  function parseKey(key) {
    var p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  /** 两个日期键之间相差的自然日数（b - a），用 round 抵消夏令时的 ±1h */
  function dayDiff(aKey, bKey) {
    var a = parseKey(aKey).getTime();
    var b = parseKey(bKey).getTime();
    return Math.round((b - a) / 86400000);
  }

  function todayKey() { return dateKey(new Date()); }

  function fmtClock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(total / 86400);
    var h = Math.floor((total % 86400) / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return {
      days: d,
      text: pad2(h) + ':' + pad2(m) + ':' + pad2(s),
      full: d > 0 ? (d + ' 天 ' + pad2(h) + ':' + pad2(m) + ':' + pad2(s))
                  : (pad2(h) + ':' + pad2(m) + ':' + pad2(s))
    };
  }

  function fmtDate(key) {
    var d = parseKey(key);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function fmtDateFull(key) {
    var d = parseKey(key);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** 任意输入 -> 合法 ISO 时间串；失败返回 null */
  function isoOrNull(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  /* ---------------- 默认状态 ---------------- */

  function defaultState() {
    var now = new Date();
    return {
      version: 1,
      habits: [{
        id: 'main',
        name: '戒断项目',
        color: 'blue',
        startedAt: startOfDay(now).toISOString(),
        archived: false,
        createdAt: now.toISOString()
      }],
      relapses: [],
      milestones: MILESTONES.slice(),
      // 标签（原因 / 场景）都可自由增删：
      // customXxx = 自己加的；hiddenXxx = 被删掉的内置标签（可「恢复默认」）
      customReasons: [],
      customPlaces: [],
      hiddenReasons: [],
      hiddenPlaces: [],
      settings: {
        theme: 'auto',
        onboarded: false,
        lastExportAt: null,
        scope: 'all'
      }
    };
  }

  /* ---------------- 读写 ---------------- */

  var state = null;

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  /* ---------------- 标签清洗 ----------------
     旧数据只有 customReasons，没有 customPlaces / hiddenXxx，
     所以这三项一定走「缺失就补默认」的路径，不会把老存档读坏。
     -------------------------------------------------- */

  /** 自定义标签：去空白、限长 24、去重、丢掉与内置重名的 */
  function cleanCustom(arr, base) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (t) {
      if (typeof t !== 'string') return;
      var v = t.trim().slice(0, 24);
      if (!v || base.indexOf(v) >= 0 || out.indexOf(v) >= 0) return;
      out.push(v);
    });
    return out;
  }

  /** 被隐藏的内置标签：只保留确实属于内置表的值 */
  function cleanHidden(arr, base) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (t) {
      if (typeof t !== 'string') return;
      var v = t.trim();
      if (base.indexOf(v) >= 0 && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  function normalize(raw) {
    var base = defaultState();
    if (!isObj(raw)) return base;

    /* 1) 项目先落地 —— 后面清洗记录要用它的 id */
    var seen = Object.create(null);
    var habits = (Array.isArray(raw.habits) ? raw.habits : []).filter(isObj).map(function (h) {
      var id = (typeof h.id === 'string' && h.id) ? h.id : uid();
      if (seen[id]) id = uid();
      seen[id] = 1;

      var name = typeof h.name === 'string' ? h.name.trim() : '';
      var color = COLORS.indexOf(h.color) >= 0 ? h.color : 'blue';
      var startedAt = isoOrNull(h.startedAt) || new Date().toISOString();

      return {
        id: id,
        name: name.slice(0, 24) || '戒断项目',
        color: color,
        startedAt: startedAt,
        archived: !!h.archived,
        createdAt: isoOrNull(h.createdAt) || startedAt
      };
    });

    if (!habits.length) habits = base.habits;

    var primaryId = habits[0].id;
    var known = Object.create(null);
    habits.forEach(function (h) { known[h.id] = 1; });

    /* 2) 记录 */
    var relapses = (Array.isArray(raw.relapses) ? raw.relapses : [])
      .filter(function (r) { return isObj(r) && r.at && !isNaN(new Date(r.at).getTime()); })
      .map(function (r) {
        // 指向已不存在的项目（例如删过文件、旧版 'main'）→ 归到第一个项目，绝不丢记录
        var hid = (typeof r.habitId === 'string' && known[r.habitId]) ? r.habitId : primaryId;
        return {
          id: r.id || uid(),
          habitId: hid,
          at: r.at,
          reasonTags: Array.isArray(r.reasonTags)
            ? r.reasonTags.filter(function (t) { return typeof t === 'string' && t; })
            : [],
          reasonNote: typeof r.reasonNote === 'string' ? r.reasonNote : '',
          mood: typeof r.mood === 'number' ? r.mood : null,
          place: typeof r.place === 'string' ? r.place : '',
          streakDays: typeof r.streakDays === 'number' ? r.streakDays : 0
        };
      })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

    var settings = Object.assign({}, base.settings, isObj(raw.settings) ? raw.settings : {});
    if (settings.scope !== 'all' && !known[settings.scope]) settings.scope = 'all';

    var milestones = (Array.isArray(raw.milestones) ? raw.milestones : base.milestones)
      .filter(function (m) { return typeof m === 'number' && m > 0; })
      .sort(function (a, b) { return a - b; });

    return {
      version: 1,
      habits: habits,
      relapses: relapses,
      milestones: milestones.length ? milestones : base.milestones,
      customReasons: cleanCustom(raw.customReasons, REASONS),
      customPlaces: cleanCustom(raw.customPlaces, PLACES),
      hiddenReasons: cleanHidden(raw.hiddenReasons, REASONS),
      hiddenPlaces: cleanHidden(raw.hiddenPlaces, PLACES),
      settings: settings
    };
  }

  function load() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (e) {
      // 隐私模式 / file:// 限制：降级为内存态
      raw = null;
    }
    if (!raw) { state = defaultState(); return state; }
    try {
      state = normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('[store] 数据损坏，已重置', e);
      state = defaultState();
    }
    return state;
  }

  var persistWarned = false;

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      if (!persistWarned) {
        persistWarned = true;
        console.warn('[store] 无法写入 localStorage', e);
        if (global.SD && global.SD.ui && global.SD.ui.toast) {
          global.SD.ui.toast('数据无法保存到本地存储');
        }
      }
    }
  }

  function get() {
    if (!state) load();
    return state;
  }

  function replace(next) {
    state = normalize(next);
    save();
    return state;
  }

  function resetAll() {
    state = defaultState();
    save();
    return state;
  }

  /* ---------------- 项目 ---------------- */

  function habits() { return get().habits.slice(); }

  function activeHabits() {
    return get().habits.filter(function (h) { return !h.archived; });
  }

  function archivedHabits() {
    return get().habits.filter(function (h) { return !!h.archived; });
  }

  function habitById(id) {
    if (typeof id !== 'string' || !id) return null;
    var hs = get().habits;
    for (var i = 0; i < hs.length; i++) if (hs[i].id === id) return hs[i];
    return null;
  }

  function activeHabit() {
    var a = activeHabits();
    if (a.length) return a[0];
    var all = get().habits;
    return all.length ? all[0] : null;
  }

  /** habit() / habit(id) —— 取不到时退回活跃项目，永远不会返回 undefined */
  function habit(id) {
    return habitById(id) || activeHabit();
  }

  /**
   * 把 hid 收束成 'all' 或一个真实存在的项目 id。
   * 传空 → 活跃项目；传了不存在的 id → 活跃项目（不让统计跑出 NaN）。
   */
  function resolveScope(hid) {
    if (hid === 'all') return 'all';
    if (typeof hid === 'string' && habitById(hid)) return hid;
    var a = activeHabit();
    return a ? a.id : 'main';
  }

  function scope() {
    return resolveScope(get().settings.scope);
  }

  function setScope(v) {
    var s = get();
    s.settings.scope = resolveScope(v);
    save();
    return s.settings.scope;
  }

  /** 当前统计范围里有哪些项目（'all' 时含已归档项目的记录） */
  function scopeHabits(hid) {
    var sc = resolveScope(hid);
    return sc === 'all' ? habits() : [habitById(sc)].filter(Boolean);
  }

  function nextColor() {
    var used = get().habits.map(function (h) { return h.color; });
    for (var i = 0; i < COLORS.length; i++) {
      if (used.indexOf(COLORS[i]) < 0) return COLORS[i];
    }
    return COLORS[used.length % COLORS.length];
  }

  function addHabit(opts) {
    opts = opts || {};
    var s = get();
    var name = String(opts.name || '').trim().slice(0, 24) || '新项目';
    var h = {
      id: uid(),
      name: name,
      color: COLORS.indexOf(opts.color) >= 0 ? opts.color : nextColor(),
      startedAt: isoOrNull(opts.startedAt) || startOfDay(new Date()).toISOString(),
      archived: false,
      createdAt: new Date().toISOString()
    };
    s.habits.push(h);
    save();
    return h;
  }

  function updateHabit(id, patch) {
    var h = habitById(id);
    if (!h) return null;
    patch = patch || {};

    if (typeof patch.name === 'string') {
      var name = patch.name.trim().slice(0, 24);
      if (name) h.name = name;
    }
    if (COLORS.indexOf(patch.color) >= 0) h.color = patch.color;
    var startedAt = isoOrNull(patch.startedAt);
    if (startedAt) h.startedAt = startedAt;
    if (typeof patch.archived === 'boolean') h.archived = patch.archived;

    save();
    return h;
  }

  /** 归档 / 取消归档；不允许把最后一个活跃项目归档掉 */
  function archiveHabit(id, flag) {
    var h = habitById(id);
    if (!h) return false;
    var next = flag === undefined ? !h.archived : !!flag;
    if (next && activeHabits().length <= 1) return false;
    h.archived = next;
    if (next && get().settings.scope === id) get().settings.scope = 'all';
    save();
    return true;
  }

  /** 删除项目连同它的所有记录，返回删掉的记录条数；最后一个项目不允许删 */
  function deleteHabit(id) {
    var s = get();
    if (!habitById(id)) return -1;
    if (s.habits.length <= 1) return -1;

    var before = s.relapses.length;
    s.relapses = s.relapses.filter(function (r) { return r.habitId !== id; });
    s.habits = s.habits.filter(function (h) { return h.id !== id; });
    if (s.settings.scope === id) s.settings.scope = 'all';
    save();
    return before - s.relapses.length;
  }

  /* ---------------- 领域计算（按项目作用域） ---------------- */

  /** 某个范围下的原始记录（未排序） */
  function listFor(hid) {
    var s = get();
    var sc = resolveScope(hid);
    if (sc === 'all') return s.relapses;
    return s.relapses.filter(function (r) { return r.habitId === sc; });
  }

  /** 升序的破戒记录 */
  function relapses(hid) {
    return listFor(hid).slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  function relapseCount(hid) { return listFor(hid).length; }

  function lastRelapse(hid) {
    var list = relapses(hid);
    return list.length ? list[list.length - 1] : null;
  }

  /** 该范围的计时起点：范围内项目里最早的那个开始日 */
  function startAtOf(hid) {
    var sc = resolveScope(hid);
    var hs = sc === 'all' ? get().habits : [habitById(sc)].filter(Boolean);
    var best = null;
    for (var i = 0; i < hs.length; i++) {
      var t = new Date(hs[i].startedAt).getTime();
      if (isNaN(t)) continue;
      if (best === null || t < best) best = t;
    }
    return best === null ? Date.now() : best;
  }

  /** 计时起点：最后一次破戒时刻；没有破戒则用开始时间 */
  function sinceMs(hid) {
    var last = lastRelapse(hid);
    if (last) return new Date(last.at).getTime();
    return startAtOf(hid);
  }

  /**
   * 「截止某个时刻」已经坚持了几天。
   * 取该时刻之前最后一次破戒的当天（没有则用开始日）到该时刻的自然日差。
   * 与 currentStreakDays 的区别：这个可以被指定任意时刻，补记/导入都不会算错。
   */
  function streakEndingAt(atIso, hid) {
    var key = dateKey(new Date(atIso));
    var best = dateKey(new Date(startAtOf(hid)));
    var list = listFor(hid);

    for (var i = 0; i < list.length; i++) {
      var k = dateKey(new Date(list[i].at));
      // 'YYYY-MM-DD' 直接按字典序比较即可
      if (k <= key && k > best) best = k;
    }

    return Math.max(0, dayDiff(best, key));
  }

  /** 当前连续天数（自然日）：从最后一次破戒「当天」到现在 */
  function currentStreakDays(hid) {
    return streakEndingAt(new Date().toISOString(), hid);
  }

  /**
   * 历史区间：从开始日到每一次破戒、以及最后一次破戒到现在。
   * 返回升序数组，最后一项 current = true。
   * 范围是 'all' 时，区间按「任意项目最近一次破戒」切分，口径统一。
   */
  function intervals(hid) {
    var list = relapses(hid);
    var out = [];
    var cursorKey = dateKey(new Date(startAtOf(hid)));

    for (var i = 0; i < list.length; i++) {
      var key = dateKey(new Date(list[i].at));
      out.push({
        fromKey: cursorKey,
        toKey: key,
        days: Math.max(0, dayDiff(cursorKey, key)),
        at: list[i].at,
        relapse: list[i],
        current: false
      });
      cursorKey = key;
    }

    out.push({
      fromKey: cursorKey,
      toKey: todayKey(),
      days: Math.max(0, dayDiff(cursorKey, todayKey())),
      at: null,
      relapse: null,
      current: true
    });

    return out;
  }

  /** 历史最佳坚持天数 */
  function bestStreakDays(hid) {
    var iv = intervals(hid);
    var best = 0;
    for (var i = 0; i < iv.length; i++) if (iv[i].days > best) best = iv[i].days;
    return best;
  }

  /** 平均坚持天数（已完成区间；没有已完成区间则用当前） */
  function averageStreakDays(hid) {
    var done = intervals(hid).filter(function (x) { return !x.current; });
    if (!done.length) return currentStreakDays(hid);
    var sum = 0;
    for (var i = 0; i < done.length; i++) sum += done[i].days;
    return Math.round((sum / done.length) * 10) / 10;
  }

  /** 该范围已追踪总天数 */
  function totalDays(hid) {
    return Math.max(0, dayDiff(dateKey(new Date(startAtOf(hid))), todayKey())) + 1;
  }

  /** 里程碑：已达成 / 下一个 / 进度 0~1 */
  function milestoneInfo(hid) {
    var streak = currentStreakDays(hid);
    var ms = get().milestones.slice().sort(function (a, b) { return a - b; });
    var reached = null;
    var next = null;
    for (var i = 0; i < ms.length; i++) {
      if (streak >= ms[i]) reached = ms[i];
    }
    for (var j = 0; j < ms.length; j++) {
      if (ms[j] > streak) { next = ms[j]; break; }
    }
    var base = reached === null ? 0 : reached;
    var progress = next === null ? 1 : (streak - base) / Math.max(1, next - base);
    return {
      streak: streak,
      reached: reached,
      next: next,
      remaining: next === null ? 0 : next - streak,
      progress: Math.max(0, Math.min(1, progress))
    };
  }

  /** 原因分布：拍平所有标签后计数，降序 */
  function reasonStats(limit, hid) {
    var counts = Object.create(null);
    var list = listFor(hid);
    for (var i = 0; i < list.length; i++) {
      var tags = list[i].reasonTags || [];
      for (var j = 0; j < tags.length; j++) {
        counts[tags[j]] = (counts[tags[j]] || 0) + 1;
      }
    }
    var arr = Object.keys(counts).map(function (k) { return { label: k, count: counts[k] }; });
    arr.sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });

    if (typeof limit === 'number' && arr.length > limit) {
      var head = arr.slice(0, limit);
      var restCount = arr.slice(limit).reduce(function (n, x) { return n + x.count; }, 0);
      if (restCount > 0) head.push({ label: '其他', count: restCount, merged: true });
      return head;
    }
    return arr;
  }

  /** 星期 × 小时 的破戒计数矩阵：matrix[0..6][0..23]，0 = 周日 */
  function hourMatrix(hid) {
    var m = [];
    for (var d = 0; d < 7; d++) {
      m.push(new Array(24).fill(0));
    }
    var list = listFor(hid);
    for (var i = 0; i < list.length; i++) {
      var dt = new Date(list[i].at);
      m[dt.getDay()][dt.getHours()] += 1;
    }
    return m;
  }

  /** 找出最高危的 星期 + 小时 */
  function peakHour(hid) {
    var m = hourMatrix(hid);
    var best = null;
    for (var d = 0; d < 7; d++) {
      for (var h = 0; h < 24; h++) {
        if (!best || m[d][h] > best.count) best = { day: d, hour: h, count: m[d][h] };
      }
    }
    return best && best.count > 0 ? best : null;
  }

  /** 每次破戒前坚持了多少天（折线图用），升序 */
  function streakSeries(hid) {
    var done = intervals(hid).filter(function (x) { return !x.current; });
    return done.map(function (x, i) {
      return { index: i + 1, days: x.days, at: x.at, key: dateKey(new Date(x.at)) };
    });
  }

  /**
   * 日历热力：返回 { year, cells: [...] }，cells 按自然日顺序。
   * level: -1 = 破戒, 0 = 追踪前空档, 1~4 = 连续梯度
   */
  function calendar(year, hid) {
    var y = year || new Date().getFullYear();
    var startKey = dateKey(new Date(startAtOf(hid)));
    var today = todayKey();

    var byDay = Object.create(null);
    var list = listFor(hid);
    for (var i = 0; i < list.length; i++) {
      var k = dateKey(new Date(list[i].at));
      byDay[k] = (byDay[k] || 0) + 1;
    }

    var cells = [];
    var cursor = new Date(y, 0, 1);
    var lastRelapseKey = null;

    // 先找出该年之前最后一次破戒，用于年头几天的 streak 计算
    var all = relapses(hid);
    for (var a = 0; a < all.length; a++) {
      var ak = dateKey(new Date(all[a].at));
      if (dayDiff(ak, dateKey(cursor)) > 0) lastRelapseKey = ak;
    }

    var guard = 0;
    while (cursor.getFullYear() === y && guard++ < 400) {
      var ck = dateKey(cursor);
      var cell = { key: ck, date: new Date(cursor.getTime()), count: byDay[ck] || 0, level: 0 };

      if (byDay[ck]) {
        cell.level = -1;
        lastRelapseKey = ck;
      } else if (dayDiff(startKey, ck) < 0 || dayDiff(ck, today) < 0) {
        cell.level = 0; // 追踪开始之前，或未来日期
      } else {
        var from = lastRelapseKey || startKey;
        var streak = Math.max(0, dayDiff(from, ck));
        cell.level = streak >= 14 ? 4 : streak >= 6 ? 3 : streak >= 2 ? 2 : 1;
      }

      cells.push(cell);
      cursor = addDays(cursor, 1);
    }

    return { year: y, cells: cells };
  }

  /* ---------------- 变更操作 ---------------- */

  function addRelapse(data) {
    var s = get();
    var at = (data && data.at) || new Date().toISOString();
    var hid = resolveScope(data && data.habitId);
    if (hid === 'all') {
      var a = activeHabit();
      hid = a ? a.id : 'main';
    }

    var entry = {
      id: uid(),
      habitId: hid,
      at: at,
      reasonTags: (data && data.reasonTags) || [],
      reasonNote: (data && data.reasonNote) || '',
      mood: data && typeof data.mood === 'number' ? data.mood : null,
      place: (data && data.place) || '',
      // 关键：快照「这一次坚持了多久」，必须在插入之前算，
      // 且按 at 时刻所在的那一段算 —— 补记过去的时间点也不会算错。
      streakDays: streakEndingAt(at, hid)
    };
    s.relapses.push(entry);
    s.relapses.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    save();
    return entry;
  }

  function removeRelapse(id) {
    var s = get();
    var before = s.relapses.length;
    s.relapses = s.relapses.filter(function (r) { return r.id !== id; });
    save();
    return s.relapses.length < before;
  }

  function updateRelapse(id, patch) {
    var s = get();
    for (var i = 0; i < s.relapses.length; i++) {
      if (s.relapses[i].id === id) {
        Object.assign(s.relapses[i], patch);
        save();
        return s.relapses[i];
      }
    }
    return null;
  }

  /* ---------------- 标签：原因 / 场景（可自由增删） ----------------
     · 内置标签删掉时不真删，收进 hiddenXxx —— 随时能「恢复默认」
     · 删除只影响「可选项」，已经存进 relapses 的字符串一律不动，
       所以历史记录、统计、时间线都照旧（统计只认记录里存下的文本）
     -------------------------------------------------------------- */

  var LABEL_FIELDS = {
    reason: { base: REASONS, custom: 'customReasons', hidden: 'hiddenReasons' },
    place: { base: PLACES, custom: 'customPlaces', hidden: 'hiddenPlaces' }
  };

  function labelFields(kind) {
    return LABEL_FIELDS[kind === 'place' ? 'place' : 'reason'];
  }

  /** 当前可选的原因标签 = 内置（未被删掉的）+ 自己加的 */
  function allReasons() {
    var s = get();
    return REASONS.filter(function (t) { return s.hiddenReasons.indexOf(t) < 0; })
      .concat(s.customReasons);
  }

  /** 当前可选的场景标签 = 内置（未被删掉的）+ 自己加的 */
  function allPlaces() {
    var s = get();
    return PLACES.filter(function (t) { return s.hiddenPlaces.indexOf(t) < 0; })
      .concat(s.customPlaces);
  }

  /**
   * kind: 'reason' | 'place'
   * 返回 ''（空输入）| 'exists'（已经有了）| 'restored'（内置被删过，放回来）| 'added'
   */
  function addLabel(kind, raw) {
    var f = labelFields(kind);
    var s = get();
    var v = String(raw || '').trim().slice(0, 24);
    if (!v) return '';

    if (f.base.indexOf(v) >= 0) {
      var hi = s[f.hidden].indexOf(v);
      if (hi < 0) return 'exists';
      s[f.hidden].splice(hi, 1);
      save();
      return 'restored';
    }
    if (s[f.custom].indexOf(v) >= 0) return 'exists';
    s[f.custom].push(v);
    save();
    return 'added';
  }

  /** 删掉一个可选项：内置的收进 hidden（可恢复），自定义的直接删。历史记录不受影响 */
  function removeLabel(kind, raw) {
    var f = labelFields(kind);
    var s = get();
    var v = String(raw || '').trim();
    if (!v) return false;

    if (f.base.indexOf(v) >= 0) {
      if (s[f.hidden].indexOf(v) >= 0) return false;
      s[f.hidden].push(v);
    } else {
      var ci = s[f.custom].indexOf(v);
      if (ci < 0) return false;
      s[f.custom].splice(ci, 1);
    }
    save();
    return true;
  }

  /** 恢复默认标签（自定义的不动），返回放回来的个数 */
  function resetLabels(kind) {
    var f = labelFields(kind);
    var s = get();
    var n = s[f.hidden].length;
    s[f.hidden] = [];
    save();
    return n;
  }

  /** 被删掉的内置标签 —— 界面据此决定要不要显示「恢复默认」 */
  function hiddenLabels(kind) {
    return get()[labelFields(kind).hidden].slice();
  }

  /** 旧接口：加一个自定义原因，返回是否新增 / 恢复成功 */
  function addCustomReason(tag) {
    var r = addLabel('reason', tag);
    return r === 'added' || r === 'restored';
  }

  function setTheme(theme) {
    var s = get();
    s.settings.theme = theme;
    save();
    apply();
  }

  /** 把主题写到 <html data-theme> */
  function apply() {
    var theme = get().settings.theme || 'auto';
    var root = global.document.documentElement;
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  /** 旧接口：改「当前活跃项目」。多项目下请用 updateHabit(id, patch) */
  function setHabit(patch) {
    var a = activeHabit();
    if (!a) return null;
    return updateHabit(a.id, patch);
  }

  /* ---------------- 导入导出 ---------------- */

  function exportJSON() {
    return JSON.stringify(get(), null, 2);
  }

  /** 记录一次导出动作 —— 用于「上次备份」提醒 */
  function markExported() {
    var s = get();
    s.settings.lastExportAt = new Date().toISOString();
    save();
  }

  /** 距离上次备份过了几天；从未备份返回 null */
  function daysSinceExport() {
    var t = get().settings.lastExportAt;
    if (!t) return null;
    var d = new Date(t);
    if (isNaN(d.getTime())) return null;
    return dayDiff(dateKey(d), todayKey());
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    replace(data);
    return state;
  }

  /* ---------------- 自检 ----------------
     在控制台执行 SD.store.selfTest() 可验证日期计算口径
     -------------------------------------------------- */

  function selfTest() {
    var out = [];
    function ok(name, cond) { out.push((cond ? '✓ ' : '✗ ') + name); if (!cond) out.failed = true; }

    ok('dayDiff 同日 = 0', dayDiff('2026-01-01', '2026-01-01') === 0);
    ok('dayDiff 跨月 = 31', dayDiff('2026-01-01', '2026-02-01') === 31);
    ok('dayDiff 闰年二月 = 29', dayDiff('2024-02-01', '2024-03-01') === 29);
    ok('dayDiff 跨年 = 365', dayDiff('2025-01-01', '2026-01-01') === 365);
    ok('dayDiff 反向 = -7', dayDiff('2026-03-08', '2026-03-01') === -7);
    ok('parseKey 本地零点', parseKey('2026-03-04').getDate() === 4);
    ok('addDays 跨月', dateKey(addDays(parseKey('2026-01-31'), 1)) === '2026-02-01');
    ok('fmtClock 天数', fmtClock(90061000).days === 1);

    if (global.console && console.log) {
      console.log('%c[store.selfTest]', 'font-weight:bold', '\n' + out.join('\n'));
    }
    return !out.failed;
  }

  /* ---------------- 导出 ---------------- */

  global.SD = global.SD || {};
  global.SD.store = {
    KEY: KEY,
    COLORS: COLORS,
    REASONS: REASONS,
    PLACES: PLACES,
    MOODS: MOODS,
    THEMES: THEMES,

    // 日期工具
    dateKey: dateKey,
    parseKey: parseKey,
    startOfDay: startOfDay,
    addDays: addDays,
    dayDiff: dayDiff,
    todayKey: todayKey,
    fmtClock: fmtClock,
    fmtDate: fmtDate,
    fmtDateFull: fmtDateFull,
    fmtTime: fmtTime,
    uid: uid,
    isoOrNull: isoOrNull,

    // 状态
    get: get,
    load: load,
    save: save,
    replace: replace,
    resetAll: resetAll,
    apply: apply,
    setTheme: setTheme,

    // 项目
    habits: habits,
    activeHabits: activeHabits,
    archivedHabits: archivedHabits,
    habitById: habitById,
    activeHabit: activeHabit,
    habit: habit,
    addHabit: addHabit,
    updateHabit: updateHabit,
    archiveHabit: archiveHabit,
    deleteHabit: deleteHabit,
    nextColor: nextColor,

    // 作用域
    scope: scope,
    setScope: setScope,
    resolveScope: resolveScope,
    scopeHabits: scopeHabits,

    // 领域（hid: 'all' 或项目 id，省略 = 活跃项目）
    setHabit: setHabit,
    relapses: relapses,
    relapseCount: relapseCount,
    lastRelapse: lastRelapse,
    startAtOf: startAtOf,
    sinceMs: sinceMs,
    currentStreakDays: currentStreakDays,
    streakEndingAt: streakEndingAt,
    intervals: intervals,
    bestStreakDays: bestStreakDays,
    averageStreakDays: averageStreakDays,
    totalDays: totalDays,
    milestoneInfo: milestoneInfo,
    reasonStats: reasonStats,
    hourMatrix: hourMatrix,
    peakHour: peakHour,
    streakSeries: streakSeries,
    calendar: calendar,

    // 变更
    addRelapse: addRelapse,
    removeRelapse: removeRelapse,
    updateRelapse: updateRelapse,
    addCustomReason: addCustomReason,
    allReasons: allReasons,
    allPlaces: allPlaces,
    addLabel: addLabel,
    removeLabel: removeLabel,
    resetLabels: resetLabels,
    hiddenLabels: hiddenLabels,

    // 导入导出
    exportJSON: exportJSON,
    importJSON: importJSON,
    markExported: markExported,
    daysSinceExport: daysSinceExport,

    selfTest: selfTest
  };

})(window);