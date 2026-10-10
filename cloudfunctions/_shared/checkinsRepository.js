'use strict';

/**
 * checkinsRepository.js —— checkins 这张表的全部读写都在这里
 *
 * 它管什么：所有对 checkins 表的读写知识——读哪些字段、按日期查一条、
 *   新增一条、更新某一天。
 *
 * 它不管什么：不认识 HTTP 请求和响应，不做参数校验（那是业务规则，
 *   属于入口层），不知道写完之后接口要返回什么形状。
 *
 * 为什么抛错的中文文案要原样保留：
 *   这些话最后进的是云函数日志，排查问题时靠它定位是哪一步失败的。
 *   重构只搬家不改话，日志里看到的内容应该和重构前一模一样。
 */

var gw = require('./gatewayClient');

var TABLE = 'checkins';

// 读哪些字段。加字段只改这一行
var SELECT = 'date,sleep,energy,mood,created_at';

/** 查某一天的体检记录，没有就返回 null */
async function findByDate(date) {
  var r;
  try {
    r = await gw.getRows({
      table: TABLE,
      params: 'select=' + SELECT + '&date=eq.' + encodeURIComponent(date),
      wantCount: false
    });
  } catch (e) {
    throw new Error('查询当天记录失败（网关返回 ' + e.status + '）');
  }
  return r.rows && r.rows.length ? r.rows[0] : null;
}

/** 新增一条（同一天已有记录时会失败，所以调用前要先查一次） */
async function insert(row) {
  row.created_at = new Date().toISOString();
  var r = await gw.send({
    table: TABLE,
    params: 'select=' + SELECT,
    method: 'POST',
    prefer: 'return=representation',
    body: row
  });
  if (!r.ok) throw new Error('新增失败（网关返回 ' + r.status + '）：' + r.text.slice(0, 200));
  var rows = parse(r.text);
  return rows && rows.length ? rows[0] : row;
}

/** 更新某一天 */
async function update(date, row) {
  var r = await gw.send({
    table: TABLE,
    params: 'select=' + SELECT + '&date=eq.' + encodeURIComponent(date),
    method: 'PATCH',
    prefer: 'return=representation',
    body: row
  });
  if (!r.ok) throw new Error('更新失败（网关返回 ' + r.status + '）：' + r.text.slice(0, 200));
  var rows = parse(r.text);
  return rows && rows.length ? rows[0] : row;
}

/**
 * 删某一天的体检（Day 22）。
 * 只删 checkins 这一行，plan_days 那天的计划留着——跟「删整天」是两回事：
 * 删整天会把计划一起带走，这里只当天的打卡作废，计划行还在。
 * 返回 false 表示这天本来就没有体检，让接口层报 404。
 */
async function deleteByDate(date) {
  var exists = await findByDate(date);
  if (!exists) return false;
  await gw.deleteRows({ table: TABLE, params: 'date=eq.' + encodeURIComponent(date) });
  return true;
}

function parse(text) {
  try {
    var rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

/**
 * 拉一批体检记录（供 plan-days 列表把体检并进每一天）
 *
 * 为什么不一天一天查：列表有几十天时，一天一次请求要发几十次，
 * 慢而且容易把网关限流打满。这里一次拉回来，上层自己按日期配。
 */
async function listAll(limit) {
  var n = Number(limit) || 100;
  if (n < 1) n = 1;
  if (n > 500) n = 500;
  var r = await gw.getRows({ table: TABLE, params: 'select=' + SELECT + '&limit=' + n });
  return r.rows || [];
}

module.exports = {
  TABLE: TABLE,
  SELECT: SELECT,
  findByDate: findByDate,
  listAll: listAll,
  insert: insert,
  update: update,
  deleteByDate: deleteByDate
};
