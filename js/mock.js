/**
 * mock.js —— 示例数据（假数据）
 *
 * Day 8 板块③ 的产物。为什么要有这个文件：
 *   界面必须先能看。第 3 周才接真数据，但今天就要把「列表和卡片能渲染出来」验证掉。
 *   所以先塞一份编的记录进去，只验证界面本身长什么样、四种状态切得对不对。
 *
 * 三条纪律：
 *   1. 假数据只住这一个文件 —— 第 3 周接真数据时删掉它、改 store.js，界面一行都不用动
 *   2. 只在「你自己一条记录都没有」时自动出现，页头必须明确标出「示例」
 *   3. 示例模式下所有写操作都不落盘 —— 假数据永远污染不了你的真实记录
 */
(function () {

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /** 相对 today 偏移 offset 天（负数往前），返回本地日期 YYYY-MM-DD */
  function shift(today, offset) {
    var p = String(today).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* 锚点文字直接用 today.js 里的模板，不另编一套 —— 示例看起来要跟真的一样 */
  var M = [
    { t: '起床后先喝一杯水，10 分钟内不碰手机',
      w: '睡得太少。今天首要任务不是多做，是先别崩——不加任务，只稳住。' },
    { t: '起床后 30 分钟内见一次自然光，哪怕只在窗边站 2 分钟',
      w: '睡得不差但也不足。用光把生物钟校准，比补觉管用。' },
    { t: '起床后写下今天唯一一件必须做成的事',
      w: '睡够了，今天有力气承担一件正经事——只写一件，别写清单。' }
  ];

  var E = [
    { t: '写一句今天没骂出口的话，写完就关掉，不复盘',
      w: '情绪在低位，先把它倒出来。这时候逼自己复盘只会更糟。' },
    { t: '把明天最小的一件事写在纸上，写完今晚不再想它',
      w: '精力见底，今晚做减法：只把明天要启动的那一下托住。' },
    { t: '睡前 30 分钟把手机放到手够不到的地方',
      w: '今天状态不差，那就守住明天——睡前这一段决定你明早是什么状态。' }
  ];

  /* 七天。每行：
     几天前 / 睡 / 精力 / 情绪 / 早锚点序号 / 早完成 / 晚锚点序号 / 晚完成 /
     状态分 / 方法原文 / 方法分 / 硬启动
     第 5 行（4 天前）两项都没做，且没有复盘 —— 示例也要是真的，不美化。 */
  /* 列：0 距今天数 ｜ 1-3 体检 ｜ 4 早锚点 ｜ 5 早完成 ｜ 6 晚锚点 ｜ 7 晚完成
         8 状态分 ｜ 9 实际方法 ｜ 10 卡在哪一下 ｜ 11 硬启动
     第 10 列原来是"方法对上几格"的自我评分，已换成"卡在哪一下"（问事实，不问自评）。 */
  var PLAN = [
    [0, 3, 3, 3, 1, true,  2, false, null, '', '', ''],
    [1, 4, 4, 4, 2, true,  2, true,  4, '睡前把手机放到客厅，连着做到了第 3 天', '不是不想做，是到家已经十点半，包一放下就不动了', '不想动但还是把手机拿过去了'],
    [2, 3, 2, 3, 1, true,  1, false, 3, '早上在窗边站了两分钟，比昨天早了一点', '早上做到了，晚上那条拖到睡前才想起来', ''],
    [3, 2, 2, 2, 0, true,  0, true,  2, '昨晚没睡好，只做了最小的那一下', '只睡了两格，撑到下午就空了', ''],
    [4, 4, 3, 4, 2, false, 2, false, null, '', '', ''],
    [5, 4, 4, 3, 2, true,  2, true,  3, '把手机放客厅这件事，找到位置了', '位置找对了，但走过去那一步还要犹豫一下', ''],
    [6, 3, 3, 2, 1, true,  1, true,  2, '写完了那句没骂出口的话，写的时候很烦', '写的时候很烦，写到一半差点删掉', '']
  ];

  function build(today) {
    var records = PLAN.map(function (row) {
      return {
        date: shift(today, -row[0]),
        checkin: { sleep: row[1], energy: row[2], mood: row[3] },
        anchors: {
          morning: { text: M[row[4]].t, reason: M[row[4]].w },
          evening: { text: E[row[6]].t, reason: E[row[6]].w }
        },
        morning_done: row[5],
        evening_done: row[7],
        ritual_count: (row[5] ? 1 : 0) + (row[7] ? 1 : 0),
        state_score: row[8],
        method_text: row[9],
        stuck_text: row[10],
        hard_start_text: row[11]
      };
    });

    return {
      goal: {
        id: 'g_demo',
        content: '半年内能上台讲一次完整的产品方案',
        created_at: shift(today, -6),
        status: 'active',
        three_rings: null
      },
      records: records
    };
  }

  window.Mock = { build: build, shift: shift };
})();
