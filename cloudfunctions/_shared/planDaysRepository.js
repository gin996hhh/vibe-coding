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
var SELECT = 'date,morning_anchor,morning_done,evening_anchor,evening_done,review';

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
function buildParams(q, status, days, limit) {
  var parts = ['select=' + SELECT, 'order=date.desc'];

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
  var r = await gw.getRows({ table: TABLE, params: 'select=date&limit=1', wantCount: true });
  return r.matched;
}

/** 按条件列出计划，返回 { rows, matched } */
async function list(options) {
  var o = options || {};
  return await gw.getRows({
    table: TABLE,
    params: buildParams(o.q, o.status, o.days, o.limit),
    wantCount: true
  });
}

/** 查某一天，没有就返回 null */
async function findByDate(date) {
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
 */
async function existsByDate(date) {
  var r = await gw.getRows({
    table: TABLE,
    params: 'select=date&date=eq.' + encodeURIComponent(date),
    wantCount: false
  });
  return Boolean(r.rows && r.rows.length);
}

/**
 * 删某一天：先确认这天存在（不存在返回 false，让接口层报 404），
 * 存在才真正发删除。
 * 是硬删除，不是软删——删了就找不回来，接口层的确认提示要说清这一点。
 */
async function deleteByDate(date) {
  var exists = await existsByDate(date);
  if (!exists) return false;
  await gw.deleteRows({ table: TABLE, params: 'date=eq.' + encodeURIComponent(date) });
  return true;
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

module.exports = {
  TABLE: TABLE,
  SELECT: SELECT,
  STATUS_FILTER: STATUS_FILTER,
  buildParams: buildParams,
  countAll: countAll,
  list: list,
  findByDate: findByDate,
  existsByDate: existsByDate,
  insertByDate: insertByDate,
  updateByDate: updateByDate,
  deleteByDate: deleteByDate
};
