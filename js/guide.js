/**
 * guide.js —— 参考手册的计算层（纯计算，不碰 DOM）
 *
 * 立场：这本书是**参考物**，不是标准答案。
 * 所以这一层只做三件事：筛选、排序、编号。不做推荐、不打分、不判定用户做没做。
 * 页面上也不给勾选框——产品不替用户对书里的任何一条负责。
 *
 * 档位算法照原作者在仓库 index.html 里写的那套搬过来，一个数不改：
 *   成本分 = 钱 + 时间 + 毅力（各 0/1/2，合计 0–6）
 *   收益=大：0→极高，≤2→高，其余→一般
 *   收益=中：0→高，其余→一般
 *   收益=小：一律一般
 * 不同口径之间不排序（换钱的和换寿命的不在一把尺子上）。
 *
 * 数据来源 window.GuideData，由 tools/parse-guide.py 从正文机械生成。
 */
(function () {

  /* ---------- 作者定义的成本权重（原样搬） ---------- */
  var COST_W = {
    money: { '0': 0, '少': 1, '多': 2 },
    time:  { '少': 0, '中': 1, '多': 2 },
    will:  { '否': 0, '些': 1, '是': 2 }
  };

  var GRADE_RANK = { 'A': 0, 'B': 1, 'C': 2 };
  var RATIO_RANK = { '极高': 0, '高': 1, '一般': 2 };

  var SCOPES = ['金钱', '死亡率', '时间', '自由'];
  var WILLS  = ['否', '些', '是'];
  var GRADES = ['A', 'B', 'C'];

  /**
   * 正文里有少量条目写成「A（争议）」「B（指南强推荐，但底层证据等级低）」。
   * 括号是说明，不是另一个等级——取首字母才是它的证据档。
   * 不处理的话这 5 条会被筛掉，也会排到列表最后面。
   */
  function gradeBase(g) {
    return String(g || '').charAt(0).toUpperCase();
  }

  function all() {
    return (window.GuideData && window.GuideData.entries) || [];
  }

  function meta() {
    return (window.GuideData && window.GuideData.meta) || {};
  }

  /** 成本分 0–6 */
  function costScore(e) {
    return (COST_W.money[e.money] || 0)
         + (COST_W.time[e.time] || 0)
         + (COST_W.will[e.will] || 0);
  }

  /** 性价比档位 */
  function ratio(e) {
    var cs = costScore(e);
    if (e.level === '大') return cs === 0 ? '极高' : (cs <= 2 ? '高' : '一般');
    if (e.level === '中') return cs === 0 ? '高' : '一般';
    return '一般';
  }

  /** 作者规定的出处格式：「第 8 节第 17 条」 */
  function cite(e) {
    return '第 ' + e.sec + ' 节第 ' + e.no + ' 条';
  }

  /* ---------- 筛选 + 排序 ---------- */

  /**
   * opts: { scope, will, grade, sec, q }
   * 排序：先性价比档位 → 同档按证据等级 A>B>C → 再按节号条号，保证结果稳定可复现。
   */
  function filter(opts) {
    opts = opts || {};
    var q = (opts.q || '').trim().toLowerCase();

    var out = all().filter(function (e) {
      if (opts.scope && e.scope !== opts.scope) return false;
      if (opts.will && e.will !== opts.will) return false;
      if (opts.grade && gradeBase(e.grade) !== opts.grade) return false;
      if (opts.sec && String(e.sec) !== String(opts.sec)) return false;
      if (q) {
        var hay = (e.title + ' ' + e.human + ' ' + e.gain + ' ' + e.note + ' ' + e.cost)
                  .toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    out.sort(function (a, b) {
      var d = RATIO_RANK[ratio(a)] - RATIO_RANK[ratio(b)];
      if (d) return d;
      var g = (GRADE_RANK[gradeBase(a.grade)] === undefined ? 9 : GRADE_RANK[gradeBase(a.grade)])
            - (GRADE_RANK[gradeBase(b.grade)] === undefined ? 9 : GRADE_RANK[gradeBase(b.grade)]);
      if (g) return g;
      if (a.sec !== b.sec) return a.sec - b.sec;
      return a.no - b.no;
    });

    return out;
  }

  /** 节列表（给下拉框用） */
  function sections() {
    var seen = {};
    var out = [];
    all().forEach(function (e) {
      if (seen[e.sec]) return;
      seen[e.sec] = true;
      out.push({ sec: e.sec, title: e.secTitle });
    });
    out.sort(function (a, b) { return a.sec - b.sec; });
    return out;
  }

  /** 总数统计，用于页面顶部的概览 */
  function stats() {
    var es = all();
    var byScope = {}, byWill = {}, byGrade = {};
    es.forEach(function (e) {
      byScope[e.scope] = (byScope[e.scope] || 0) + 1;
      byWill[e.will]   = (byWill[e.will]   || 0) + 1;
      var gb = gradeBase(e.grade);
      byGrade[gb] = (byGrade[gb] || 0) + 1;
    });
    return { total: es.length, byScope: byScope, byWill: byWill, byGrade: byGrade };
  }

  window.Guide = {
    SCOPES: SCOPES,
    WILLS: WILLS,
    GRADES: GRADES,
    all: all,
    meta: meta,
    costScore: costScore,
    ratio: ratio,
    cite: cite,
    gradeBase: gradeBase,
    filter: filter,
    sections: sections,
    stats: stats
  };
})();
