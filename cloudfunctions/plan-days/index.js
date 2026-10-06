'use strict';

/**
 * GET /api/plan-days —— Day 17 第一个真正读到数据库内容的接口
 * Day 19 重构：把「怎么查数据库」搬走了，这个文件只剩三件事
 *
 * 这个文件现在管什么（入口层 + 业务组装）：
 *   1. 接 HTTP 请求、判断方法和参数合不合规
 *   2. 调数据访问层拿数据（planDaysRepository / checkinsRepository）
 *   3. 把数据拼成契约规定的响应形状返回
 *
 * 这个文件现在不管什么（数据访问层的事）：
 *   请求发给哪个地址、带什么凭证、查哪张表、筛选条件怎么翻译成查询串、
 *   返回的错误码怎么解析——这些都在 _shared 里的 repository 和 gatewayClient。
 *
 * 为什么接口文件里不许出现表名和查询串：
 *   以前这些知识直接写在这里。能跑，但每加一个接口就要抄一遍，而且
 *   plan_days 这张表的查询会散在多个文件里——将来给表加一个字段要改 N 处，
 *   改漏一处不会报错，只会表现为某个接口读得到、另一个读不到。
 *   集中到 repository 之后，一张表的知识只有一份。
 *
 * 重构的硬要求（Day 19）：响应形状、HTTP 状态码、错误文案一律不变，
 * 不新增任何功能。今天的活是搬家，不是添家具。
 */

const http = require('node:http');

const planDaysRepo = require('./planDaysRepository');
const checkinsRepo = require('./checkinsRepository');
const gw = require('./gatewayClient');

const PORT = process.env.PORT || 9000;

var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- 业务层：把两张表的数据拼成契约第 7 条规定的形状 ---------- */

function toDate(v) {
  if (!v) return null;
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().slice(0, 10);
}

/**
 * 读某一天：这天没排计划就返回 null，有就把当天的体检一起带上。
 * 这里只做「拼装」，不碰任何查询细节——查计划问 planDaysRepository，
 * 查体检问 checkinsRepository。
 */
async function readOneDay(date) {
  var plan = await planDaysRepo.findByDate(date);
  if (!plan) return null;

  // 体检是另一张表，同一天最多一条；没有就给 null，前端自己判断
  var c = await checkinsRepo.findByDate(date);

  return {
    date: toDate(plan.date),
    morning_anchor: plan.morning_anchor,
    morning_done: plan.morning_done,
    evening_anchor: plan.evening_anchor,
    evening_done: plan.evening_done,
    review: plan.review,
    checkin: c ? { sleep: c.sleep, energy: c.energy, mood: c.mood } : null
  };
}

/* ---------- HTTP 入口 ---------- */

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

  // 单天模式：/api/plan-days/2026-10-03（契约第 7 条的路径形式），
  // 也接受 ?date=2026-10-03，省得网关不支持路径参数时没法用
  var oneDate = u.searchParams.get('date');
  var m = u.pathname.replace(/\/+$/, '').match(/\/api\/plan-days\/(\d{4}-\d{2}-\d{2})$/);
  if (m) oneDate = m[1];

  if (oneDate) {
    if (!DATE_RE.test(oneDate)) {
      fail(res, 400, 'INVALID_DATE', 'date 必须是 YYYY-MM-DD 这样的日期，你给的是「' + oneDate + '」');
      return;
    }
    if (!gw.hasToken()) {
      fail(res, 500, 'MISSING_TOKEN', '服务端没配访问凭证（环境变量 TCB_ACCESS_TOKEN）。');
      return;
    }
    try {
      var day = await readOneDay(oneDate);
      if (!day) {
        fail(res, 404, 'DATE_NOT_FOUND', oneDate + ' 这天还没有计划，plan_days 表里没有这一天的记录。');
        return;
      }
      send(res, 200, { ok: true, data: day });
    } catch (e) {
      console.error('[plan-days] 读单天失败：', e && e.message ? e.message : String(e));
      fail(res, 500, 'PLAN_DAYS_READ_FAILED', '读这一天的记录失败，原因已记在云函数日志里。');
    }
    return;
  }

  var q = u.searchParams.get('q');
  var status = u.searchParams.get('status') || 'all';
  var days = u.searchParams.get('days');
  var limit = u.searchParams.get('limit');

  // 契约里 status 只有四档，给了别的值要挡掉并说清楚
  if (!(status in planDaysRepo.STATUS_FILTER)) {
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

  if (!gw.hasToken()) {
    fail(res, 500, 'MISSING_TOKEN',
      '服务端没配访问凭证。到 CloudBase 控制台 → 环境 → 访问凭证复制 API 密钥，填进本函数的环境变量 TCB_ACCESS_TOKEN。');
    return;
  }

  try {
    // 表里一共多少天、命中多少天、具体条目，都问数据访问层要
    var total = await planDaysRepo.countAll();
    var listRes = await planDaysRepo.list({ q: q, status: status, days: days, limit: limit });

    send(res, 200, {
      ok: true,
      data: {
        total: total,
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
