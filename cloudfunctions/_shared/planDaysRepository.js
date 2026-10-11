'use strict';

/**
 * planDaysRepository.js —— plan_days 这张表的全部查询都在这里
 *
 * 它管什么：所有对 plan_days 表的读写知识——查哪些字段、筛选条件怎么翻译成
 *   网关的查询串、总数怎么拿、某一天存不存在。
 *
 * 它不管什么：不认识 HTTP 请求和响应，不知道接口要返回什么形状。
 *   这些属于入口层（index.js）的事。
 *
 * 为什么按「表」分文件而不是按「接口」分：
 *   plan_days 这张表现在有两个地方要用——plan-days 接口读它，checkins 接口
 *   写体检前也要确认这天有没有计划。如果按接口分，同一张表的查询就会散在
 *   两个文件里，将来给这张表加一个字段要改两处，改漏一处不会报错，只会
 *   悄悄变成一个接口读得到、另一个读不到的怪问题。按表分，就只有这一处。
 *
 * 这个文件里出现的所有字符串，都是「怎么查 plan_days」的知识，
 * 所以它们集中在这里是应该的——接口文件里不许再有第二份。
 */

var gw = require('./gatewayClient');

var TABLE = 'plan_days';

// 读哪些字段。加字段只改这一行，两个接口同时生效
var SELECT = 'date,morning_anchor,morning_done,evening_anchor,evening_done,review,is_deleted,deleted_at';

// 契约里 status 只有四档，翻译成网关认的查询串
var STATUS_FILTER = {
  all: null,
  some: 'or=(morning_done.eq.true,evening_done.eq.true)',
  all_done: 'and=(morning_done.eq.true,evening_done.eq.true)',
  none: 'and=(morning_done.eq.false,evening_done.eq.false)'
};

function daysAgo(n) {
  var d = new Date(Date.now() - Number(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * 把筛选条件翻译成网关的查询串。
 * 每一项都用 encodeURIComponent 转义：用户输入的关键词里如果带 & = * 这类
 * 符号，直接拼会改变查询的含义，转义之后它就只能被当成"一个值"。
 */
function buildParams(q, status, days, limit, deletedOnly) {
  var parts = ['select=' + SELECT, 'order=date.desc'];

  // 默认只看没删的；deletedOnly 为 true 时只列回收站里的
  parts.push('is_deleted=eq.' + (deletedOnly ? 'true' : 'false'));

  if (q) {
    var kw = encodeURIComponent(q);
    parts.push('or=(morning_anchor.ilike.*' + kw + '*' +
      ',evening_anchor.ilike.*' + kw + '*' +
      ',review.ilike.*' + kw + '*)');
  }

  var st = STATUS_FILTER[status];
  if (st) parts.push(st);

  if (days) {
    var n = Number(days);
    if (!isNaN(n) && n > 0) parts.push('date=gte.' + daysAgo(n));
  }

  if (limit) parts.push('limit=' + Number(limit));

  return parts.join('&');
}

/** 表里一共多少天（不带任何筛选，只取计数不取数据，省流量） */
async function countAll() {
  var r = await gw.getRows({
    table: TABLE,
    params: 'select=date&is_deleted=eq.false&limit=1',
    wantCount: true
  });
  return r.matched;
}

/** 按条件列出计划，返回 { rows, matched }。deletedOnly 为 true 时列回收站里的 */
async function list(options) {
  var o = options || {};
  return await gw.getRows({
    table: TABLE,
    params: buildParams(o.q, o.status, o.days, o.limit, o.deletedOnly),
    wantCount: true
  });
}

/** 查某一天（只查没删的），没有就返回 null */
async function findByDate(date) {
  var r = await gw.getRows({
    table: TABLE,
    params: 'select=' + SELECT + '&date=eq.' + encodeURIComponent(date) + '&is_deleted=eq.false',
    wantCount: false
  });
  return r.rows.length ? r.rows[0] : null;
}

/** 查某一天（不管删没删）。回收站还原、以及重复新建时对冲突做判断要用 */
async function findAnyByDate(date) {
  var r = await gw.getRows({
    table: TABLE,
    params: 'select=' + SELECT + '&date=eq.' + encodeURIComponent(date),
    wantCount: false
  });
  return r.rows.length ? r.rows[0] : null;
}

/**
 * 某一天有没有计划（checkins 写体检前用它确认这天挂得上，
 * 免得数据库抛一句英文外键错误、前端只能拿到 500 白屏）
 * 只认没删的：删掉的那天不算"已有计划"，但它仍在表里，重复新建会撞主键，
 * 那种情况由 insertByDate 处理成"从回收站拿回来"。
 */
async function existsByDate(date) {
  var r = await gw.getRows({
    table: TABLE,
    params: 'select=date&date=eq.' + encodeURIComponent(date) + '&is_deleted=eq.false',
    wantCount: false
  });
  return Boolean(r.rows && r.rows.length);
}

/**
 * 删某一天：先确认这天存在（不存在返回 false，让接口层报 404）。
 * 默认是软删除——打个标记，数据还在，能从回收站原样拿回来。
 * hard 为 true 才是真删（回收站里点「彻底删除」走这条），删了就找不回来。
 */
async function deleteByDate(date, hard) {
  var exists = await findAnyByDate(date);
  if (!exists) return false;
  if (hard) {
    await gw.deleteRows({ table: TABLE, params: 'date=eq.' + encodeURIComponent(date) });
    return true;
  }
  await updateRaw(date, { is_deleted: true, deleted_at: new Date().toISOString() });
  return true;
}

/** 从回收站拿回来：把标记去掉，deleted_at 归零 */
async function restoreByDate(date) {
  var updated = await updateRaw(date, { is_deleted: false, deleted_at: null });
  return updated;
}

/** 列回收站里的那些天 */
async function listDeleted() {
  var r = await list({ deletedOnly: true });
  return r.rows || [];
}

/** 底层更新：不走字段白名单，只给本文件内部的软删、还原用 */
async function updateRaw(date, patch) {
  var r = await gw.send({
    table: TABLE,
    params: 'select=' + SELECT + '&date=eq.' + encodeURIComponent(date),
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch
  });
  if (!r.ok) {
    throw new Error('更新失败（网关返回 ' + r.status + '）：' + String(gw.reasonFrom(r.text)).slice(0, 200));
  }
  var rows;
  try {
    rows = JSON.parse(r.text);
  } catch (e) {
    rows = [];
  }
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * 新建某一天的计划（Day 24，契约第 4 条 POST）。
 * fields 只认 morning_anchor / evening_anchor 两个文字字段，
 * 完成状态和复盘不在这里给——新建的一天当然是没做、没复盘。
 * 已存在时网关会报唯一键冲突，由入口层转成中文提示，这里只管发和解析。
 */
async function insertByDate(date, fields) {
  var row = { date: date };
  if (fields) {
    if (typeof fields.morning_anchor === 'string') row.morning_anchor = fields.morning_anchor;
    if (typeof fields.evening_anchor === 'string') row.evening_anchor = fields.evening_anchor;
  }
  var r = await gw.send({
    table: TABLE,
    params: 'select=' + SELECT,
    method: 'POST',
    prefer: 'return=representation',
    body: row
  });
  if (!r.ok) {
    // 撞主键：这天在表里已经有行了。如果那行是被软删的，就当成"重新记这一天"，
    // 直接把它从回收站拿回来，而不是报一个死的 409。
    var already = await findAnyByDate(date);
    if (already && already.is_deleted) {
      var back = await updateRaw(date, {
        is_deleted: false,
        deleted_at: null,
        morning_anchor: row.morning_anchor !== undefined ? row.morning_anchor : null,
        evening_anchor: row.evening_anchor !== undefined ? row.evening_anchor : null,
        morning_done: false,
        evening_done: false,
        review: null
      });
      return back || already;
    }
    throw new Error('新建失败（网关返回 ' + r.status + '）：' + String(gw.reasonFrom(r.text)).slice(0, 200));
  }
  var rows;
  try {
    rows = JSON.parse(r.text);
  } catch (e) {
    rows = [];
  }
  return Array.isArray(rows) && rows.length ? rows[0] : row;
}

/**
 * 改某一天（Day 22，契约第 5 条 PATCH）。
 * 只改传进来的那几个字段，没传的字段不动——这是 PATCH 和「整条覆盖」的区别。
 * 返回改完之后的那一行；网关没改到任何一行就返回 null，让接口层报 404。
 */
async function updateByDate(date, patch) {
  var r = await gw.send({
    table: TABLE,
    // 只改没删的那天：回收站里的行不该被日常改动碰到
    params: 'select=' + SELECT + '&date=eq.' + encodeURIComponent(date) + '&is_deleted=eq.false',
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch
  });
  if (!r.ok) {
    throw new Error('更新失败（网关返回 ' + r.status + '）：' + String(gw.reasonFrom(r.text)).slice(0, 200));
  }
  var rows;
  try {
    rows = JSON.parse(r.text);
  } catch (e) {
    rows = [];
  }
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = {
  TABLE: TABLE,
  SELECT: SELECT,
  STATUS_FILTER: STATUS_FILTER,
  buildParams: buildParams,
  countAll: countAll,
  list: list,
  findByDate: findByDate,
  findAnyByDate: findAnyByDate,
  existsByDate: existsByDate,
  insertByDate: insertByDate,
  updateByDate: updateByDate,
  deleteByDate: deleteByDate,
  restoreByDate: restoreByDate,
  listDeleted: listDeleted
};
