/**
 * decompose.js —— F1 三环拆解规则
 *
 * 本期是固定模板，不接 AI。
 * 理由（TECH_DESIGN 第七节）：先用固定规则验证"循环转不转"，
 * AI 拆解放到后续版本。
 *
 * 三环 = 结果 = 状态 × 频率 × 方法
 *   状态：你现在的底子撑不撑得住
 *   频率：一天做几次
 *   方法：具体怎么做
 *
 * 文案原则（Day 10 v3，反"喂养错位"）：
 *   1. 目标名只在页顶出现一次，环内用"它"指代，不复读。
 *   2. 不发同一个处方（如"23:30 睡"）——状态环改为判断机制：
 *      精力撑不住时，休息本身就是今天的正确动作（heart2：透支硬练
 *      效率极低、越练越沮丧；状态与精力管理本身是刻意练习对象）。
 *   3. 每环 = 一个今天能做的动作 + 一句为什么（一行以内）。
 *   版本号：改文案必须 +1，老用户浏览器里存的三环才会重建。
 */

/** 当前三环模板版本 */
var RINGS_VERSION = 3;

function buildRings(goalContent) {
  return {
    v: RINGS_VERSION,
    state: {
      text: '状态不稳时硬练，效率低，越练越沮丧。状态和精力管理本身是练习对象，不是背景。',
      adjustable: '开练前先问一句——现在的精力撑得住它吗？撑不住，今天的这一件就是休息'
    },
    frequency: {
      text: '它靠次数堆出来，不靠某一天猛冲——次数你自己定。',
      adjustable: '今天只做 1 次最小动作，做完就算数'
    },
    method: {
      text: '方法不从天降，从你的目标里长——只挑今天就能做的最小一件。',
      adjustable: '缩小成 3 分钟内能做完的第一步，现在就做'
    }
  };
}

/** 环名 → 中文标题 */
var RING_LABELS = {
  state: '状态',
  frequency: '频率',
  method: '方法'
};

window.Decompose = {
  buildRings: buildRings,
  RING_LABELS: RING_LABELS,
  RINGS_VERSION: RINGS_VERSION
};
