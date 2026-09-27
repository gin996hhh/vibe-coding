/**
 * today.js —— F2 每日锚点
 *
 * 流程：最小体检（睡眠 / 精力 / 情绪）→ 按结果生成早晚各 1 项锚点 → 勾选完成
 * 规则是固定模板，本期不接 AI（TECH_DESIGN 第七节：先验证循环转不转）。
 *
 * 为什么先看睡眠：状态是撑住行动的东西。状态不对，努力白费——
 * 方法再好，也执行不下去。所以一天的入口不是"做什么"，是"你现在什么状态"。
 *
 * Day 13 修订（反"天天一样"）：
 *   1. 早锚点看 睡眠+精力 组合，晚锚点看 情绪+精力 组合 —— 组合多了，输出才不同
 *   2. 每个组合给多个写法，靠 utc 日期 + 上次那条做轮换
 *   3. 避开昨天那条：抽到跟上一次一模一样就换下一个
 *   改模板必须动 ANCHORS_VERSION，否则旧记录看不到新文案。
 */

/* ---------- 量表刻度 ---------- */

var SLEEP_LABELS = [
  '不到 4 小时',
  '4–5 小时',
  '6 小时左右',
  '7 小时左右',
  '7.5–8.5 小时，充足'
];

var ENERGY_LABELS = ['完全没劲', '比较沉', '一般', '还行', '很足'];
var MOOD_LABELS   = ['很糟', '偏低', '一般', '还行', '挺好'];

/** 锚点模板版本：改动这里的文字就要 +1 */
var ANCHORS_VERSION = 2;

/* ---------- 锚点候选池 ---------- */
/* 每个分组 2–3 条。同一组合不重复给同一条。 */

/* 早锚点：按「精力＝低/中/高」分组（睡眠决定当天的底子，把它并进精力判断） */
var MORNING_POOL = {
  low: [
    { text: '起床后先喝一杯水，10 分钟内不碰手机', reason: '睡得太少。今天首要任务不是多做，是先别崩——不加任务，只稳住。' },
    { text: '今天只在起床后把窗打开站 1 分钟，别的都不加', reason: '底子薄的日子，能做的就是别再往下掉。撑住就行。' },
    { text: '把今天要动的那一件事写在手背上，今天只认这一件', reason: '状态低时清单只会变成负担——留一件，做完就算赢。' }
  ],
  mid: [
    { text: '起床后 30 分钟内见一次自然光，哪怕只在窗边站 2 分钟', reason: '睡得不差但也不足。用光把生物钟校准，比补觉管用。' },
    { text: '起床后先动身体 3 分钟（拉伸或走动），再决定做什么', reason: '身体先转起来，脑子才跟得上——不用运动量，只要有流。' },
    { text: '早饭前写下今天唯一一件必须做成的事', reason: '中等状态最容易被杂事吃掉，先把那件事钉住。' }
  ],
  high: [
    { text: '起床后写下今天唯一一件必须做成的事', reason: '睡够了，今天有力气承担一件正经事——只写一件，别写清单。' },
    { text: '趁着状态好，把最难的那件事放到上午第一个做', reason: '好状态是消耗品，先给它最硬的活。' },
    { text: '起床后开一次"不难但需要耐心"的事，给它 20 分钟', reason: '精力足的时候，耐心成本最低——今天适合啃硬骨头。' }
  ]
};

/* 晚锚点：按「情绪低 / 精力低 / 其余」分组 */
var EVENING_POOL = {
  down: [
    { text: '写一句今天没骂出口的话，写完就关掉，不复盘', reason: '情绪在低位，先把它倒出来。这时候逼自己复盘只会更糟。' },
    { text: '写下今天一件"没做错但很累"的事，写完把它划掉', reason: '有些累是被看见才消的。写下来，今晚就不用再想它。' },
    { text: '睡前只做一件让自己舒服的小事（热水、袜子、关灯）', reason: '情绪低时别讲道理，先让身体舒服一点。' }
  ],
  tired: [
    { text: '把明天最小的一件事写在纸上，写完今晚不再想它', reason: '精力见底，今晚做减法：只把明天要启动的那一下托住。' },
    { text: '今晚不做任何补救，只把手机放到手够不到的地方', reason: '越累越容易报复性熬夜。今晚唯一任务是断电。' },
    { text: '收拾明天要用的东西，摆到出门顺手的位置', reason: '明早少一个决定，就等于多撑住一格。' }
  ],
  good: [
    { text: '睡前 30 分钟把手机放到手够不到的地方', reason: '今天状态不差，那就守住明天——睡前这一段决定你明早是什么状态。' },
    { text: '今晚写一句"今天做到了什么"，明天早起先看它', reason: '状态好的时候，把这份感觉存起来，留着状态差那天用。' },
    { text: '给明天的自己留一句提醒，写在手机锁屏能看见的地方', reason: '好状态的尾巴上给明天留一句话，比什么规划都顶用。' }
  ]
};

/** 分组：早看精力（把睡眠并入），晚看情绪优先、其次精力 */
function groupOfMorning(s, e) { return e <= 2 || s <= 2 ? 'low' : (e >= 4 && s >= 4 ? 'high' : 'mid'); }
function groupOfEvening(e, m) { return m <= 2 ? 'down' : (e <= 2 ? 'tired' : 'good'); }

/** 由日期算一个稳定的抽取序号，保证同一天刷新不变、不同天会轮到不同的那条 */
function pickIndex(poolLen, dateStr, seed) {
  var h = 0;
  var str = String(dateStr) + '|' + String(seed || '');
  for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) % 100003; }
  return h % poolLen;
}

/**
 * 按体检结果挑当天两项锚点
 * @param {{sleep:number, energy:number, mood:number}} c 三项 1–5
 * @param {string} dateStr 当天的日期 YYYY-MM-DD（用于稳定轮换）
 * @param {{morning?:string, evening?:string}} [avoid] 上一次写过的早/晚锚点文字，撞上就换一条
 * @returns {{morning:{text,reason}, evening:{text,reason}}}
 */
function buildAnchors(c, dateStr, avoid) {
  var s = c.sleep, e = c.energy, m = c.mood;
  avoid = avoid || {};

  function choose(poolName, seed, avoidText) {
    var pool = poolName;
    var start = pickIndex(pool.length, dateStr, seed);
    for (var k = 0; k < pool.length; k++) {
      var cand = pool[(start + k) % pool.length];
      if (cand.text !== avoidText) return cand;
    }
    return pool[start];
  }

  return {
    morning: choose(MORNING_POOL[groupOfMorning(s, e)], 'morning', avoid.morning),
    evening: choose(EVENING_POOL[groupOfEvening(e, m)], 'evening', avoid.evening)
  };
}

window.Today = {
  SLEEP_LABELS: SLEEP_LABELS,
  ENERGY_LABELS: ENERGY_LABELS,
  MOOD_LABELS: MOOD_LABELS,
  buildAnchors: buildAnchors,
  ANCHORS_VERSION: ANCHORS_VERSION
};
