'use strict';

/**
 * gatewayClient.js —— 数据访问层最底下的一层
 *
 * 它管什么：只管「怎么把请求发给平台的数据网关、怎么把返回解析回来」。
 * 具体说是四件事：拼出完整的请求地址、带上访问凭证、发出请求、把返回的
 * 文本解析成 JSON（或保留原文）。它不知道业务上要查哪张表、查什么条件。
 *
 * 它不管什么：不认识 plan_days / checkins 这些业务表，不做任何业务判断。
 * 表相关的东西都在上一层 repository 里。
 *
 * 为什么单独拆它：
 *   两个云函数（plan-days、checkins）都要连同一个网关、用同一套凭证、
 *   用同一种方式处理出错。以前这段是各抄一份，凭证读法一改要改两处。
 *   现在只有这一份，改一次两边同时生效。
 *
 * 为什么要保留 status / text 挂在抛出的错误上：
 *   上层要区分「数据库里没有这张表」和「通道连不上」两种情况，靠的就是
 *   网关返回的 HTTP 状态码。丢了状态码，上层就只能说一句笼统的"失败了"。
 */

function pick() {
  for (var i = 0; i < arguments.length; i++) {
    var v = process.env[arguments[i]];
    if (v) return String(v).trim();
  }
  return null;
}

var ENV_ID = pick('TCB_ENV_ID', 'CLOUDBASE_ENV_ID') || 'victor-1a2b3c4d-d5fmr5rn115087c8';
var TOKEN = pick('TCB_ACCESS_TOKEN', 'CLOUDBASE_ACCESS_TOKEN', 'TCB_API_KEY', 'CLOUDBASE_API_KEY');

var BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

function authHeaders(extra) {
  var h = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + TOKEN,
    apikey: TOKEN
  };
  if (extra) Object.assign(h, extra);
  return h;
}

/**
 * 发一次请求，不做任何业务判断，原样返回结果。
 * 上层需要看状态码、需要看原始文本时就用这个（例如写库失败要把原因带进日志）。
 */
async function send(opts) {
  var url = BASE + '/' + opts.table + '?' + opts.params;
  var headers = authHeaders();

  if (opts.prefer) headers.Prefer = opts.prefer;
  else if (opts.wantCount) headers.Prefer = 'count=exact'; // 要总数：网关会在 Content-Range 里回

  var init = { method: opts.method || 'GET', headers: headers };
  if (opts.body !== undefined && opts.body !== null) init.body = JSON.stringify(opts.body);

  var res = await fetch(url, init);
  var text = await res.text();

  return { ok: res.ok, status: res.status, headers: res.headers, text: text };
}

/** 从网关返回里取出人能看的一句原因（优先用 JSON 里的 message / code） */
function reasonFrom(text) {
  try {
    var j = JSON.parse(text);
    return j.message || j.code || text;
  } catch (e) {
    return text; // 不是 JSON 就用原文
  }
}

/** 总数：网关放在 Content-Range 头里，形如 0-5/6 */
function countFrom(headers, rowsLength) {
  var range = headers && headers.get ? headers.get('content-range') : null;
  if (range && range.indexOf('/') > -1) {
    var n = Number(range.split('/')[1]);
    if (!isNaN(n)) return n;
  }
  return rowsLength;
}

function parseRows(text) {
  try {
    var rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return []; // 空响应按空数组处理，和重构前一致
  }
}

/**
 * 读：发 GET，解析成 { rows, matched }。
 * 网关没返回成功就抛错，错上带 status / text，方便上层分辨原因。
 */
async function getRows(opts) {
  var r = await send({
    table: opts.table,
    params: opts.params,
    method: 'GET',
    wantCount: opts.wantCount
  });

  if (!r.ok) {
    var err = new Error('网关返回 ' + r.status + '：' + reasonFrom(r.text));
    err.status = r.status;
    err.text = r.text;
    throw err;
  }

  var rows = parseRows(r.text);
  return {
    rows: rows,
    matched: opts.wantCount ? countFrom(r.headers, rows.length) : null
  };
}

/** 供上层判断有没有配凭证（接口层要在没配的时候给一句中文提示） */
function hasToken() {
  return Boolean(TOKEN);
}

/**
 * 删：发 DELETE。网关没返回成功就抛错（同 getRows 的错误风格，
 * 错上带 status / text，方便上层分辨原因）。
 * PostgREST 风格的网关用筛选条件指删除对象，例如 date=eq.2026-10-02。
 */
async function deleteRows(opts) {
  var r = await send({
    table: opts.table,
    params: opts.params,
    method: 'DELETE'
  });

  if (!r.ok) {
    var err = new Error('网关返回 ' + r.status + '：' + reasonFrom(r.text));
    err.status = r.status;
    err.text = r.text;
    throw err;
  }

  return true;
}

module.exports = {
  getRows: getRows,
  deleteRows: deleteRows,
  send: send,
  hasToken: hasToken,
  reasonFrom: reasonFrom
};
