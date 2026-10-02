/**
 * protocols.js —— 操作手册的计算层
 *
 * 规矩：这个文件不碰 DOM、不碰 localStorage，可以脱离浏览器用 node 直接跑。
 * 页面(protocols.html)只负责把这里算出来的东西画出来。
 *
 * 数据来自 js/protocols-data.js：47 条，每条两个字段——
 *   action    该做的动作（可以勾选"做没做"）
 *   mechanism 这条为什么管用（只是参考，不能勾、不打分）
 *
 * 流程按 Victor 定的顺序：
 *   先看你各项目是什么情况 → 按情况给能落地的一点点进步建议 → 做的时候动作可勾，机制挂在后面看
 */

(function (root) {
  var DATA = root.ProtocolsData || { meta: {}, entries: [] };
  var ENTRIES = DATA.entries || [];

  /* ---------- 1. 按章分组 ---------- */

  function chapters() {
    var out = [];
    var map = {};
    for (var i = 0; i < ENTRIES.length; i++) {
      var e = ENTRIES[i];
      if (!map[e.ch]) {
        map[e.ch] = { ch: e.ch, chTitle: e.chTitle, items: [] };
        out.push(map[e.ch]);
      }
      map[e.ch].items.push(e);
    }
    out.sort(function (a, b) { return a.ch - b.ch; });
    return out;
  }

  /* ---------- 2. 勾选状态 ---------- */
  /* state 的样子：{ "2026-10-02": ["P-1-01","P-1-02"], "2026-10-01": [...] }
     一天一组，哪天做了哪几条，一眼能查。 */

  function emptyState() { return {}; }

  function isDone(state, date, ref) {
    var arr = (state && state[date]) || [];
    return arr.indexOf(ref) !== -1;
  }

  /** 勾上 / 取消，返回新的某天数组（不改原对象） */
  function toggle(state, date, ref) {
    var arr = ((state && state[date]) || []).slice();
    var at = arr.indexOf(ref);
    if (at === -1) arr.push(ref); else arr.splice(at, 1);
    return arr;
  }

  /* ---------- 3. 统计：各项目现在什么情况 ---------- */

  /**
   * @param {object} state 勾选状态
   * @param {string} today YYYY-MM-DD
   * @param {array}  recent 最近若干天（含今天），算平均用
   * @returns {array} 每章一行 { ch, chTitle, total, todayDone, avg7, pct }
   */
  function stats(state, today, recent) {
    var days = recent && recent.length ? recent : [today];
    var list = chapters();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var refs = [];
      for (var j = 0; j < c.items.length; j++) refs.push(c.items[j].ref);

      var todayDone = 0;
      var todayArr = (state && state[today]) || [];
      for (var k = 0; k < todayArr.length; k++) {
        if (refs.indexOf(todayArr[k]) !== -1) todayDone++;
      }

      // 近 N 天平均完成率：把每天完成数加起来，除以（总条数 × 天数）
      var sum = 0;
      for (var d = 0; d < days.length; d++) {
        var arr = (state && state[days[d]]) || [];
        for (var m = 0; m < arr.length; m++) {
          if (refs.indexOf(arr[m]) !== -1) sum++;
        }
      }
      var avg = Math.round((sum / (c.items.length * days.length)) * 100);

      out.push({
        ch: c.ch,
        chTitle: c.chTitle,
        total: c.items.length,
        todayDone: todayDone,
        avg: avg,
        pct: avg
      });
    }
    return out;
  }

  /* ---------- 4. 建议：只给一点点，不给一堆 ---------- */

  /**
   * 从做得最差的那一项里，挑序号最靠前（也就是最基础）的一条还没做的。
   * 一次只推一条——多了等于没推。
   * @returns {object|null} { ref, chTitle, no, title, action, mechanism, because }
   */
  function suggest(state, today) {
    var rows = stats(state, today, [today]);
    /* 按 20% 一档比较，不比精确百分点。
       否则你刚勾完睡眠 1 条，睡眠就不是"最低"了，建议立刻跳去下一章——
       来回跳的结果是每一项都浅尝辄止。同档时章序小的优先（睡眠是地基，先补地基）。 */
    rows.sort(function (a, b) {
      var ba = Math.floor(a.pct / 20);
      var bb = Math.floor(b.pct / 20);
      if (ba !== bb) return ba - bb;
      return a.ch - b.ch;
    });

    var done = (state && state[today]) || [];
    for (var i = 0; i < rows.length; i++) {
      var c = null;
      var list = chapters();
      for (var j = 0; j < list.length; j++) {
        if (list[j].ch === rows[i].ch) c = list[j];
      }
      if (!c) continue;
      for (var k = 0; k < c.items.length; k++) {
        var e = c.items[k];
        if (done.indexOf(e.ref) === -1) {
          return {
            ref: e.ref,
            ch: e.ch,
            chTitle: e.chTitle,
            no: e.no,
            title: e.title,
            action: e.action,
            mechanism: e.mechanism,
            kind: e.kind,
            because: '「' + e.chTitle + '」这一项目前完成度偏低（' +
              rows[i].pct + '%），先补这里面最基础的第 ' + e.no + ' 条。补上来之前，建议不会跳去别的项。'
          };
        }
      }
    }
    return null; // 47 条全勾完：今天没有要补的了
  }

  /* ---------- 5. 最近 N 天日期 ---------- */

  function recentDays(today, n) {
    var out = [];
    var d = today ? new Date(today + 'T00:00:00') : new Date();
    for (var i = 0; i < (n || 7); i++) {
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      out.push(y + '-' + m + '-' + day);
      d.setDate(d.getDate() - 1);
    }
    return out;
  }

  root.ProtocolEngine = {
    entries: ENTRIES,
    chapters: chapters,
    emptyState: emptyState,
    isDone: isDone,
    toggle: toggle,
    stats: stats,
    suggest: suggest,
    recentDays: recentDays
  };
})(typeof window !== 'undefined' ? window : global);
