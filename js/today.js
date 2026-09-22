/**
 * today.js —— F2 每日锚点
 *
 * 流程：最小体检（睡眠 / 精力 / 情绪）→ 按结果生成早晚各 1 项锚点 → 勾选完成
 * 规则是固定模板，本期不接 AI（TECH_DESIGN 第七节：先验证循环转不转）。
 *
 * 为什么先看睡眠：状态是撑住行动的东西。状态不对，努力白费——
 * 方法再好，也执行不下去。所以一天的入口不是"做什么"，是"你现在什么状态"。
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

/* ---------- 锚点规则 ---------- */

/**
 * 按体检结果挑当天两项锚点
 * @param {{sleep:number, energy:number, mood:number}} c 三项 1–5
 * @returns {{morning:{text,reason}, evening:{text,reason}}}
 */
function buildAnchors(c) {
  var s = c.sleep, e = c.energy, m = c.mood;

  /* 早锚点：看睡眠 */
  var morning;
  if (s <= 2) {
    morning = {
      text: '起床后先喝一杯水，10 分钟内不碰手机',
      reason: '睡得太少。今天首要任务不是多做，是先别崩——不加任务，只稳住。'
    };
  } else if (s === 3) {
    morning = {
      text: '起床后 30 分钟内见一次自然光，哪怕只在窗边站 2 分钟',
      reason: '睡得不差但也不足。用光把生物钟校准，比补觉管用。'
    };
  } else {
    morning = {
      text: '起床后写下今天唯一一件必须做成的事',
      reason: '睡够了，今天有力气承担一件正经事——只写一件，别写清单。'
    };
  }

  /* 晚锚点：情绪低先处理情绪，其次看精力 */
  var evening;
  if (m <= 2) {
    evening = {
      text: '写一句今天没骂出口的话，写完就关掉，不复盘',
      reason: '情绪在低位，先把它倒出来。这时候逼自己复盘只会更糟。'
    };
  } else if (e <= 2) {
    evening = {
      text: '把明天最小的一件事写在纸上，写完今晚不再想它',
      reason: '精力见底，今晚做减法：只把明天要启动的那一下托住。'
    };
  } else {
    evening = {
      text: '睡前 30 分钟把手机放到手够不到的地方',
      reason: '今天状态不差，那就守住明天——睡前这一段决定你明早是什么状态。'
    };
  }

  return { morning: morning, evening: evening };
}

window.Today = {
  SLEEP_LABELS: SLEEP_LABELS,
  ENERGY_LABELS: ENERGY_LABELS,
  MOOD_LABELS: MOOD_LABELS,
  buildAnchors: buildAnchors
};
