/**
 * records.js —— 记录台：把一堆散记录整理成「一天一块」
 *
 * 这个文件只做计算，不碰 DOM（跟 growth.js 一样）。
 * 好处是：界面还没写好也能用 node 单独跑一遍，先确认数据对不对。
 *
 * 一天一块的结构：
 *   { date, label, weekday, doneCount, total, anchors: [{tag,text,done}], checkin, review }
 */
(function () {

  /* ---------- 日期工具（用本地时间，避免 UTC 差一天） ---------- */

  function parseDate(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /** 「今天 / 昨天 / 9月21日」——人话优先，日期兜底 */
  function labelFor(date, today) {
    if (date === today) return '今天';
    var d = daysBetween(date, today);
    if (d === 1) return '昨天';
    if (d === 2) return '前天';
    var p = String(date).split('-');
    return Number(p[1]) + '月' + Number(p[2]) + '日';
  }

  /**
   * 什么算「这天有内容」
   * 一次都没填的空壳（只有日期）不进列表——否则会被自己的空数据吓到。
   */
  function hasContent(r) {
    if (!r || !r.date) return false;
    if (r.checkin) return true;
    if (r.morning_done || r.evening_done) return true;
    if (r.state_score !== null && r.state_score !== undefined) return true;
    if (r.method_text || r.hard_start_text) return true;
    // Day 27 修：写了锚点就算有内容。以前只看「勾没勾完成」，
    // 导致用户新建一天、填了锚点却看不见它，以为没建成。
    if (r.morning_anchor || r.evening_anchor) return true;
    // Day 27 修：用户主动新建的空行也让它出现。以前会被过滤掉，
    // 用户点了「新建」等于什么都没发生。
    if (r.source === 'manual') return true;
    // Day 27 补：兜底。plan_days 里的每一行都是用户主动点「新建」才产生的，
    // 后端不会凭空插行，所以「有这一行」本身就等于「用户想看见它」。
    // 云端已有一条 2026-10-14 的空行（两个锚点都是 null，没勾完成），
    // 不兜底的话它会永远隐身，用户会以为那天的东西丢了。
    if (!r.is_deleted) return true;
    return false;
  }

  /* ---------- 主函数：拆成天块，按日期倒序（最近的在上） ---------- */

  function buildDays(records, today) {
    var seen = {};
    var days = [];

    (records || []).forEach(function (r) {
      if (!hasContent(r)) return;
      if (seen[r.date]) return;          // 同一天只留一条
      seen[r.date] = true;

      var anchors = [];
      if (r.anchors) {
        if (r.anchors.morning) anchors.push({ tag: '早', text: r.anchors.morning.text, done: !!r.morning_done });
        if (r.anchors.evening) anchors.push({ tag: '晚', text: r.anchors.evening.text, done: !!r.evening_done });
      }

      var doneCount = (r.morning_done ? 1 : 0) + (r.evening_done ? 1 : 0);

      days.push({
        date: r.date,
        label: labelFor(r.date, today),
        weekday: WEEK[parseDate(r.date).getDay()],
        anchors: anchors,
        total: anchors.length,
        doneCount: doneCount,
        checkin: r.checkin || null,
        review: {
          state_score: (r.state_score === undefined ? null : r.state_score),
          ritual_count: (r.ritual_count === undefined ? null : r.ritual_count),
          method_text: r.method_text || '',
          stuck_text: r.stuck_text || '',
          hard_start_text: r.hard_start_text || ''
        }
      });
    });

    days.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return days;
  }

  /* ---------- 筛选（Day 12） ----------
     只做判断，不碰 DOM，跟 buildDays 一样能用 node 单独跑。
     完成状态四档：
       all       —— 不过滤
       some      —— 那天至少完成了一条
       all_done  —— 那天有锚点，且全部完成
       none      —— 那天一条都没完成
     关键词 q 匹配范围：日期、星期、锚点文字、体检数值、复盘文字。 */

  function dayText(d) {
    var parts = [d.date, d.label, d.weekday];
    (d.anchors || []).forEach(function (a) { parts.push(a.tag, a.text); });
    if (d.checkin) parts.push('体检', d.checkin.sleep, d.checkin.energy, d.checkin.mood);
    var r = d.review || {};
    parts.push(r.method_text, r.stuck_text, r.hard_start_text, r.state_score);
    return parts.join(' ').toLowerCase();
  }

  function matchDone(d, mode) {
    if (!mode || mode === 'all') return true;
    if (mode === 'some') return d.doneCount > 0;
    if (mode === 'all_done') return d.total > 0 && d.doneCount === d.total;
    if (mode === 'none') return d.doneCount === 0;
    return true;
  }

  function filterDays(days, opt) {
    opt = opt || {};
    var q = String(opt.q === undefined || opt.q === null ? '' : opt.q).trim().toLowerCase();
    var mode = opt.done || 'all';
    return (days || []).filter(function (d) {
      if (!matchDone(d, mode)) return false;
      if (!q) return true;
      return dayText(d).indexOf(q) > -1;
    });
  }

  /* ---------- 顶部三个数 ---------- */

  function summary(records, today) {
    var days = buildDays(records, today);
    var totalAnchors = 0;
    days.forEach(function (d) { totalAnchors += d.doneCount; });
    return {
      recordedDays: days.length,
      totalAnchors: totalAnchors,
      firstDate: days.length ? days[days.length - 1].date : null,
      spanDays: days.length ? daysBetween(days[days.length - 1].date, today) + 1 : 0
    };
  }

  window.Records = {
    buildDays: buildDays,
    filterDays: filterDays,
    summary: summary,
    hasContent: hasContent,
    labelFor: labelFor,
    daysBetween: daysBetween
  };
})();
