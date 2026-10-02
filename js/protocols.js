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

  /* ---------- 6. 关键词检索 ----------
     想得起来一个词（"喝水""动一动""咖啡"），但记不住它在第几章，就搜它。
     搜的是：标题 / 动作 / 机制 / 章名 / 编号。中英文都能搜，忽略大小写和首尾空格。
     多个词用空格分开，全部命中才算（越搜越窄）。 */

  function norm(s) {
    return String(s || '').toLowerCase().trim();
  }

  function haystack(e) {
    return norm(e.title + ' ' + e.action + ' ' + e.mechanism + ' ' + e.chTitle + ' ' + e.ref);
  }

  /* 口语词 → 原文里实际用的词。
     人说"动一动""起床"，原文写的是"活动""醒来"，不映射就搜不到。 */
  var ALIAS = {
    '动一动': '活动 运动 走 拉伸 散步',
    '活动一下': '活动 运动 走',
    '起床': '醒来 醒后 早上 起床',
    '早起': '醒来 早上 天光',
    '喝水': '水 水分 补水 喝',
    '睡觉': '睡眠 入睡 睡',
    '睡不着': '入睡 失眠 睡眠',
    '锻炼': '运动 训练 活动',
    '减肥': '体重 脂肪 代谢 热量',
    '提神': '咖啡因 咖啡 清醒 警觉',
    '眼睛': '眼 视觉 视网膜',
    '晒太阳': '阳光 天光 光照 亮光',
    '心情': '情绪 压力 心情 焦虑',
    '记不住': '记忆 学习 巩固',
    '学东西': '学习 记忆 技能'
  };

  function termMatch(hay, word) {
    if (hay.indexOf(word) !== -1) return true;
    var alias = ALIAS[word];
    if (!alias) return false;
    var alts = alias.split(/\s+/);
    for (var i = 0; i < alts.length; i++) {
      if (hay.indexOf(alts[i]) !== -1) return true;
    }
    return false;
  }

  function search(list, keyword) {
    var words = norm(keyword).split(/\s+/).filter(function (w) { return w.length > 0; });
    if (!words.length) return list.slice();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var hay = haystack(e);
      var all = true;
      var score = 0;
      for (var j = 0; j < words.length; j++) {
        if (!termMatch(hay, words[j])) { all = false; break; }
        // 标题里命中最相关（3），动作次之（2），机制里顺带提一句最弱（1）
        if (termMatch(norm(e.title), words[j])) score += 3;
        else if (termMatch(norm(e.action), words[j])) score += 2;
        else score += 1;
      }
      if (all) out.push({ e: e, s: score });
    }
    // 分高的在前；同分按编号排，保证每次搜出来顺序一样
    out.sort(function (a, b) {
      if (a.s !== b.s) return b.s - a.s;
      return a.e.ref < b.e.ref ? -1 : (a.e.ref > b.e.ref ? 1 : 0);
    });
    return out.map(function (x) { return x.e; });
  }

  root.ProtocolEngine = {
    entries: ENTRIES,
    chapters: chapters,
    emptyState: emptyState,
    isDone: isDone,
    toggle: toggle,
    stats: stats,
    suggest: suggest,
    recentDays: recentDays,
    search: search
  };
})(typeof window !== 'undefined' ? window : global);
