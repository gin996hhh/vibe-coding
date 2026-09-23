/**
 * growth.js —— F4 累积展示（纯计算 + SVG 生成，不碰 DOM）
 *
 * 这里只有一个立场：**跟自己的过去比，不跟别人比**。
 * 所以页面上所有数字都是"你 vs 你自己"，没有任何排行榜、没有火苗、没有积分。
 *
 * 数据全部来自 Store.getRecords()，不额外存东西。
 */
(function () {

  /* ---------- 日期工具（用本地时间，避免 UTC 差一天） ---------- */

  function parseDate(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function fmt(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function shiftDay(s, delta) {
    var d = parseDate(s);
    d.setDate(d.getDate() + delta);
    return fmt(d);
  }

  /** b - a，单位天 */
  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }

  function shortDate(s) {
    var p = String(s).split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  }

  /* ---------- 什么算「这天有内容」 ---------- */

  function hasContent(r) {
    if (!r) return false;
    if (r.checkin) return true;
    if (r.morning_done || r.evening_done) return true;
    if (r.state_score !== null && r.state_score !== undefined) return true;
    if (r.method_text) return true;
    if (r.hard_start_text) return true;
    return false;
  }

  /** 去重 + 剔除空天 + 按日期升序 */
  function sortedActive(records) {
    var seen = {};
    var out = [];
    (records || []).forEach(function (r) {
      if (!r || !r.date || seen[r.date]) return;
      if (!hasContent(r)) return;
      seen[r.date] = true;
      out.push(r);
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return out;
  }

  /* ---------- 连续天数 ---------- */

  /**
   * 从今天往回数，断一天即停。
   * 今天还没做不算断（一天还没过完）——从昨天起算。
   */
  function computeStreak(records, today) {
    var set = {};
    sortedActive(records).forEach(function (r) { set[r.date] = true; });

    var d = today;
    if (!set[d]) {
      var y = shiftDay(today, -1);
      if (!set[y]) return 0;
      d = y;
    }
    var n = 0;
    while (set[d]) { n++; d = shiftDay(d, -1); }
    return n;
  }

  /* ---------- 累计仪式完成数 ---------- */

  function countAnchors(records) {
    var n = 0;
    (records || []).forEach(function (r) {
      if (!r) return;
      if (r.morning_done) n++;
      if (r.evening_done) n++;
    });
    return n;
  }

  /* ---------- 状态曲线 ---------- */

  function stateSeries(records) {
    var out = [];
    sortedActive(records).forEach(function (r) {
      if (r.state_score) out.push({ date: r.date, score: r.state_score });
    });
    return out;
  }

  function avg(list) {
    if (!list.length) return null;
    var s = 0;
    for (var i = 0; i < list.length; i++) s += list[i];
    return s / list.length;
  }

  /**
   * 前一半 vs 后一半（按时间顺序对切）——这就是「和自己过去比」的落点。
   * 少于 4 个点不给结论：样本太小，比出来是噪音不是信号。
   */
  function halvesCompare(series) {
    if (!series || series.length < 4) return null;
    var mid = Math.floor(series.length / 2);
    var first = series.slice(0, mid).map(function (p) { return p.score; });
    var second = series.slice(mid).map(function (p) { return p.score; });
    return {
      n: series.length,
      firstAvg: avg(first),
      secondAvg: avg(second),
      firstFrom: series[0].date,
      firstTo: series[mid - 1].date,
      secondFrom: series[mid].date,
      secondTo: series[series.length - 1].date
    };
  }

  /* ---------- 全部读数一次算完 ---------- */

  function computeStats(records, today) {
    var active = sortedActive(records);
    var series = stateSeries(records);

    var spanDays = active.length ? diffDays(active[0].date, today) + 1 : 0;
    var ratio = spanDays > 0 ? active.length / spanDays : 0;

    return {
      streak: computeStreak(records, today),
      totalAnchors: countAnchors(records),
      activeDays: active.length,
      spanDays: spanDays,
      ratio: ratio,
      firstDate: active.length ? active[0].date : null,
      series: series,
      compare: halvesCompare(series)
    };
  }

  /* ---------- 折线图（手写 SVG，不引第三方库） ---------- */

  function buildChartSvg(series) {
    var W = 640, H = 220;
    var padL = 30, padR = 14, padT = 14, padB = 30;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = series.length;

    function xAt(i) {
      if (n === 1) return padL + plotW / 2;
      return padL + plotW * i / (n - 1);
    }
    function yAt(v) {
      return padT + plotH * (5 - v) / 4;
    }

    var s = [];
    s.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="220" role="img" aria-label="状态曲线">');

    // 横向网格线 + 左侧刻度（1 在下，5 在上）
    for (var v = 1; v <= 5; v++) {
      var gy = yAt(v);
      s.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy +
        '" stroke="#2A3A5A" stroke-width="1"/>');
      s.push('<text x="' + (padL - 8) + '" y="' + (gy + 4) +
        '" font-size="11" fill="#7587A6" text-anchor="end">' + v + '</text>');
    }

    // 折线
    if (n >= 2) {
      var pts = series.map(function (p, i) { return xAt(i) + ',' + yAt(p.score); }).join(' ');
      s.push('<polyline points="' + pts + '" fill="none" stroke="#6E9BD6" stroke-width="2" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>');
    }

    // 数据点
    series.forEach(function (p, i) {
      s.push('<circle cx="' + xAt(i) + '" cy="' + yAt(p.score) + '" r="3.5" fill="#F0A65C"/>');
    });

    // 横轴日期：只标首 / 中 / 尾三个，免得挤成一团
    var marks = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
    var done = {};
    marks.forEach(function (i) {
      if (done[i]) return;
      done[i] = true;
      var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      s.push('<text x="' + xAt(i) + '" y="' + (H - 8) + '" font-size="11" fill="#7587A6" ' +
        'text-anchor="' + anchor + '">' + shortDate(series[i].date) + '</text>');
    });

    s.push('</svg>');
    return s.join('');
  }

  /** 前后两段的走向用一句中性的话说清——不做评价，只给事实 */
  function trendText(cmp) {
    if (!cmp) return '';
    var d = cmp.secondAvg - cmp.firstAvg;
    if (d >= 0.3) return '后半段比前半段高 ' + d.toFixed(1) + ' 格。';
    if (d <= -0.3) return '后半段比前半段低 ' + Math.abs(d).toFixed(1) + ' 格。';
    return '前后两段基本持平。';
  }

  window.Growth = {
    computeStats: computeStats,
    buildChartSvg: buildChartSvg,
    trendText: trendText,
    shiftDay: shiftDay,
    shortDate: shortDate
  };
})();
