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
 */

function buildRings(goalContent) {
  var g = (goalContent || '这件事').trim();

  return {
    state: {
      text: '状态是底座。状态不稳，方法再好也执行不下去——所以先确认你今晚几点睡。',
      adjustable: '今晚 23:30 前睡'
    },
    frequency: {
      text: '一天做几次，比一次做多久更重要。先定一个你闭着眼都能完成的最小次数。',
      adjustable: '每天 1 次，只求不断'
    },
    method: {
      text: '方法你自己找（不是产品发给你）。只挑一个今天就能做的，越小越好。',
      adjustable: '把「' + g + '」缩小成 3 分钟内能做完的第一步'
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
  RING_LABELS: RING_LABELS
};
