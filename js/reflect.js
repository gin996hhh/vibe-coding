/**
 * reflect.js —— F3 每日复盘卡（标签与规则）
 *
 * 复盘卡 ≠ 日记。
 *   日记记的是「今天发生了什么」；
 *   复盘卡记的是「今天的做法，对不对得上我的方法」。
 *
 * 所以四问全是读数：三处量表 + 两处开放填空，都不预置标准答案。
 * 方法是你自己去网上找、自己判断的——产品只提供"记录 + 前后对照"的格子，
 * 不告诉你什么算对。判断权在你。
 */
(function () {

  /* Q1 状态几格：读的是撑不撑得住行动的bodily感受，不是心情好坏 */
  var STATE_LABELS = ['很差', '偏低', '一般', '还不错', '很好'];

  /* Q3 方法自评：只问"今天的做法对不对得上你定的方法"，不评判方法本身好不好 */
  var METHOD_LABELS = ['没对上', '偏了', '一半一半', '基本对上', '完全对上'];

  /* Q4 的提示例子——只是例子，不是答案 */
  var HARD_START_HINT = '例：不想动但还是出门走了 10 分钟';

  /**
   * 从当天记录里推仪式完成数（0–2），作为 Q2 的默认值。
   * 今天没生成过锚点 → 数不出来，返回 null（让用户自己选）。
   */
  function autoRitualCount(rec) {
    if (!rec) return null;
    if (rec.ritual_count !== null && rec.ritual_count !== undefined) return rec.ritual_count;
    if (!rec.anchors) return null;
    return (rec.morning_done ? 1 : 0) + (rec.evening_done ? 1 : 0);
  }

  window.Reflect = {
    STATE_LABELS: STATE_LABELS,
    METHOD_LABELS: METHOD_LABELS,
    HARD_START_HINT: HARD_START_HINT,
    autoRitualCount: autoRitualCount
  };
})();
