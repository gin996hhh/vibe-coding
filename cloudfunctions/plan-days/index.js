'use strict';

/**
 * GET /api/plan-days —— Day 17 第一个真正读到数据库内容的接口
 *
 * 做什么：把 plan_days 表里的数据读出来给记录台用，支持三个可选筛选：
 *   q      关键词，匹配早晚锚点和复盘文字
 *   status all（默认）/ some（有完成）/ all_done（全完成）/ none（都没做）
 *   days   只要最近 N 天
 *
 * 为什么不用 pg 驱动直连、改走平台的 PG HTTP 网关：
 *   这个环境是共享集群（个人版那档），CloudBase 在该档位下不开外网地址、
 *   也不支持内网互联/VPC，所以 TCP 直连在部署后必然超时。网关是平台自己
 *   的数据通道，云函数发一个 HTTP 请求就能读到同一张真表，不需要数据库
 *   密码，也不需要配网络。
 *
 * 为什么响应统一成 { ok, data, error }：
 *   前端以后只认这一个形状——成功看 data，失败看 error。
 *   任何接口都不例外，前端就不用为每个接口写一套判断。
 *
 * 为什么筛选条件要一项项拼进查询串、而不是拼成一句话：
 *   用户输入的关键词里如果带 & = * 这类符号，直接拼会改变查询含义。
 *   每一项都用 encodeURIComponent 转义，它就只能被当成"值"。
 */

const http = require('node:http');

const PORT = process.env.PORT || 9000;

/* ---------- 连接信息：全部从环境变量读，不写死在代码里 ---------- */

function pick() {
  for (var i = 0; i < arguments.length; i++) {
    var v = process.env[arguments[i]];
    if (v) return String(v).trim();
  }
  return null;
}

// 环境 ID：控制台「环境 → 环境信息」里有；这里给个兜底值，避免漏配直接 404
var ENV_ID = pick('TCB_ENV_ID', 'CLOUDBASE_ENV_ID') || 'victor-1a2b3c4d-d5fmr5rn115087c8';
var TOKEN = pick('TCB_ACCESS_TOKEN', 'CLOUDBASE_ACCESS_TOKEN', 'TCB_API_KEY', 'CLOUDBASE_API_KEY');

var BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';
var SELECT = 'date,morning_anchor,morning_done,evening_anchor,evening_done,review';

/* ---------- 把筛选条件翻译成网关的查询串 ---------- */

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

/* ---------- 向网关发一次请求 ---------- */

async function rdb(params, wantCount) {
  var url = BASE + '/plan_days?' + params;
  var headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + TOKEN,
    apikey: TOKEN
  };
  // 要计数就带上这个头，网关会在 Content-Range 里回总数
  if (wantCount) headers.Prefer = 'count=exact';

  var res = await fetch(url, { method: 'GET', headers: headers, body: null });
  var text = await res.text();

  if (!res.ok) {
    var msg = text;
    try {
      var j = JSON.parse(text);
      msg = j.message || j.code || text;
    } catch (e) { /* 不是 JSON 就用原文 */ }
    var err = new Error('网关返回 ' + res.status + '：' + msg);
    err.status = res.status;
    throw err;
  }

  var rows = [];
  try {
    rows = JSON.parse(text);
  } catch (e) { /* 空响应按空数组处理 */ }

  var matched = null;
  if (wantCount) {
    var range = res.headers.get('content-range'); // 形如 0-5/6
    if (range && range.indexOf('/') > -1) matched = Number(range.split('/')[1]);
    if (matched === null || isNaN(matched)) matched = rows.length;
  }

  return { rows: rows, matched: matched };
}

function toDate(v) {
  if (!v) return null;
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().slice(0, 10);
}

/* ---------- HTTP 服务 ---------- */

// 失败统一形状：契约要求 error 是 { code, message } 对象，不是一句话
function fail(res, status, code, message) {
  send(res, status, { ok: false, error: { code: code, message: message } });
}

function send(res, code, body) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = code;
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  // 只接受 GET，别的明确挡掉，别让它悄悄走成功分支
  if (req.method !== 'GET') {
    fail(res, 405, 'METHOD_NOT_ALLOWED', '这个接口只接受 GET，你发的是 ' + req.method);
    return;
  }

  var u = new URL(req.url, 'http://localhost');
  var q = u.searchParams.get('q');
  var status = u.searchParams.get('status') || 'all';
  var days = u.searchParams.get('days');
  var limit = u.searchParams.get('limit');

  // 契约里 status 只有四档，给了别的值要挡掉并说清楚
  if (!(status in STATUS_FILTER)) {
    fail(res, 400, 'INVALID_STATUS',
      'status 只能是 all / some / all_done / none 这四个，你给的是「' + status + '」');
    return;
  }

  // limit 是加练项：只收 1 到 100，防止一次要几十万条把接口拖垮
  if (limit) {
    var ln = Number(limit);
    if (!Number.isInteger(ln) || ln < 1 || ln > 100) {
      fail(res, 400, 'INVALID_LIMIT', 'limit 只能是 1 到 100 的整数，你给的是「' + limit + '」');
      return;
    }
  }

  if (!TOKEN) {
    fail(res, 500, 'MISSING_TOKEN',
      '服务端没配访问凭证。到 CloudBase 控制台 → 环境 → 访问凭证复制 API 密钥，填进本函数的环境变量 TCB_ACCESS_TOKEN。');
    return;
  }

  try {
    // 表里一共多少天（不带筛选，只取计数不取数据，省流量）
    var totalRes = await rdb('select=date&limit=1', true);
    // 命中多少天 + 具体条目（带筛选）
    var listRes = await rdb(buildParams(q, status, days, limit), true);

    send(res, 200, {
      ok: true,
      data: {
        total: totalRes.matched,
        matched: listRes.matched,
        items: listRes.rows.map(function (r) {
          return {
            date: toDate(r.date),
            morning_anchor: r.morning_anchor,
            morning_done: r.morning_done,
            evening_anchor: r.evening_anchor,
            evening_done: r.evening_done,
            review: r.review
          };
        })
      }
    });
  } catch (e) {
    // 服务端日志（余力加练）：原始报错可能是英文，留在这里方便以后排查
    console.error('[plan-days] 读库失败：', e && e.message ? e.message : String(e));
    // 给前端的必须是人能看懂的中文，不能把英文堆栈原样甩出去
    var why = e && e.status === 404
      ? '数据库里找不到要读的那张表（表名写错了，或者这张表还没建）'
      : '数据通道暂时连不上，或者返回了看不懂的结果';
    fail(res, 500, 'PLAN_DAYS_READ_FAILED', '读计划数据失败：' + why + '。原因已记在云函数日志里。');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('plan-days listening on 0.0.0.0:' + PORT);
});
