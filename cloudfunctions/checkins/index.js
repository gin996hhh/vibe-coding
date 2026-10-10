'use strict';

/**
 * POST /api/checkins —— Day 18：把"今天身体怎么样"写进数据库
 * Day 19 重构：把「怎么查数据库」搬走了，这个文件只剩三件事
 *
 * 这个文件现在管什么（入口层 + 业务规则）：
 *   1. 接 HTTP 请求、判断方法和参数合不合规（校验属于业务规则，不归数据层管）
 *   2. 调数据访问层读写（checkinsRepository 写体检，planDaysRepository 确认
 *      这天有没有计划——同一张表的知识全项目只有一份，不再自己抄一遍）
 *   3. 把结果拼成契约规定的响应形状返回
 *
 * 这个文件现在不管什么（数据访问层的事）：
 *   请求发给哪个地址、带什么凭证、查哪张表、新增和更新分别怎么发——
 *   这些都在 _shared 里的 repository 和 gatewayClient。
 *
 * 为什么校验留在入口层：
 *   「睡眠只能是 1 到 5」是业务规矩，不是数据库的规矩。repository 只管
 *   怎么把数据存进去，不该替业务决定什么值合法，否则别的调用方想用
 *   另一套规矩时就绕不开它。
 *
 * 重构的硬要求（Day 19）：响应形状、HTTP 状态码、错误文案一律不变，
 * 不新增任何功能。今天的活是搬家，不是添家具。
 */

const http = require('node:http');

const checkinsRepo = require('./checkinsRepository');
const planDaysRepo = require('./planDaysRepository');
const gw = require('./gatewayClient');

const PORT = process.env.PORT || 9000;

/* ---------- 校验（业务规则，属于这一层） ---------- */

var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var SCORES = ['sleep', 'energy', 'mood'];
var LABEL = { sleep: '睡眠', energy: '精力', mood: '心情' };

function validate(body) {
  // 契约第 3 条：date 必填，没给就是 DATE_MISSING
  var date = body.date;
  if (date === undefined || date === null || date === '') {
    return { code: 'DATE_MISSING', message: '缺少 date（日期）这一项，格式要像 2026-10-03' };
  }
  if (!DATE_RE.test(String(date))) {
    return { code: 'INVALID_DATE', message: 'date 必须是 YYYY-MM-DD 这样的日期，你给的是「' + date + '」' };
  }
  var d = new Date(date + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    return { code: 'INVALID_DATE', message: 'date 不是一个真实存在的日期：「' + date + '」' };
  }

  var row = { date: String(date) };
  for (var i = 0; i < SCORES.length; i++) {
    var k = SCORES[i];
    var v = body[k];
    if (v === undefined || v === null || v === '') {
      return { code: 'FIELD_MISSING', message: '缺少 ' + k + '（' + LABEL[k] + '）这一项' };
    }
    var n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { code: 'INVALID_RANGE', message: LABEL[k] + '只能是 1 到 5 的整数，你给的是「' + v + '」' };
    }
    row[k] = n;
  }
  return { row: row };
}

/* ---------- HTTP 入口 ---------- */

function cors(res) {
  // CORS 的允许来源由网关层统一配（单一白名单域名）。代码层再设一层会拼成
  // "https://xxx,*" 畸形值被浏览器拦掉（Day 20 踩过），这里只保留方法和头。
  res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 失败统一形状：契约要求 error 是 { code, message } 对象，不是一句话
function fail(res, status, code, message) {
  send(res, status, { ok: false, error: { code: code, message: message } });
}

function send(res, code, body) {
  cors(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = code;
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('请求体不是合法 JSON，请带 Content-Type: application/json 发送'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  /* ---------- DELETE /api/checkins?date=YYYY-MM-DD（Day 22） ----------
   * 只删这一天的体检，那天的计划行留着。想连计划一起删要用
   * DELETE /api/plan-days，那个是删整天。
   */
  if (req.method === 'DELETE') {
    var du = new URL(req.url, 'http://localhost');
    var dDate = du.searchParams.get('date');
    var dm = du.pathname.replace(/\/+$/, '').match(/\/api\/checkins\/(\d{4}-\d{2}-\d{2})$/);
    if (dm) dDate = dm[1];

    if (!dDate || !DATE_RE.test(dDate)) {
      fail(res, 400, 'INVALID_DATE',
        '删除体检要指定日期：?date=YYYY-MM-DD 或路径 /api/checkins/YYYY-MM-DD，你给的是「' + (dDate || '') + '」');
      return;
    }
    if (!gw.hasToken()) {
      fail(res, 500, 'MISSING_TOKEN', '服务端没配访问凭证（环境变量 TCB_ACCESS_TOKEN）。');
      return;
    }
    try {
      var removed = await checkinsRepo.deleteByDate(dDate);
      if (!removed) {
        fail(res, 404, 'CHECKIN_NOT_FOUND', dDate + ' 这天没有体检记录，没什么可删的。');
        return;
      }
      send(res, 200, { ok: true, data: { date: dDate, deleted: true } });
    } catch (e) {
      console.error('[checkins] 删除失败：', e && e.message ? e.message : String(e));
      fail(res, 500, 'CHECKINS_DELETE_FAILED', '删除体检记录失败，原因已记在云函数日志里。');
    }
    return;
  }

  // 到这一步只剩 POST，别的明确挡掉（GET 打开会直接告诉你该怎么用）
  if (req.method !== 'POST') {
    fail(res, 405, 'METHOD_NOT_ALLOWED',
      '这个接口只接受 POST 和 DELETE。写数据请用 POST，例如：curl -X POST 本地址 -H "Content-Type: application/json" -d "{\\"date\\":\\"2026-10-03\\",\\"sleep\\":4,\\"energy\\":3,\\"mood\\":4}"');
    return;
  }

  if (!gw.hasToken()) {
    fail(res, 500, 'MISSING_TOKEN',
      '服务端没配访问凭证。到 CloudBase 控制台 → 环境 → 访问凭证复制 API 密钥，填进本函数的环境变量 TCB_ACCESS_TOKEN。');
    return;
  }

  var body;
  try {
    body = await readBody(req);
  } catch (e) {
    fail(res, 400, 'BODY_NOT_JSON', e.message);
    return;
  }

  var checked = validate(body || {});
  if (checked.code) {
    fail(res, 400, checked.code, checked.message);
    return;
  }

  try {
    var existing = await checkinsRepo.findByDate(checked.row.date);
    var saved, action;
    if (existing) {
      saved = await checkinsRepo.update(checked.row.date, checked.row);
      action = 'updated';
    } else {
      // 新增前先看这天有没有计划。没有就自动补一条空计划行（Day 24 修复），
      // 新用户任何一天都能直接记体检，不再被 PLAN_DAY_NOT_FOUND 挡在第一步。
      // 空计划行的含义：这天没写锚点，但真实存在过。锚点内容想补再用 PATCH。
      // plan_days 的写入全项目只有 planDaysRepository 一份，这里直接调它。
      if (!(await planDaysRepo.existsByDate(checked.row.date))) {
        try {
          await planDaysRepo.insertByDate(checked.row.date, {});
        } catch (e) {
          // 并发下另一路刚好先建了（唯一键冲突）不算失败，接着写体检
          if (!/conflict|duplicate|23505|409/i.test(e.message)) throw e;
        }
      }
      saved = await checkinsRepo.insert(checked.row);
      action = 'created';
    }

    // 契约第 3 条：同一天重复提交 = 覆盖，不报错。
    // 用 HTTP 状态码区分：第一次写 201，覆盖 200，但 data 形状完全一致。
    send(res, action === 'created' ? 201 : 200, {
      ok: true,
      data: {
        date: saved.date,
        sleep: saved.sleep,
        energy: saved.energy,
        mood: saved.mood,
        created_at: saved.created_at || null
      }
    });
  } catch (e) {
    // 服务端日志（余力加练）：原始报错可能是英文，留在这里方便以后排查
    console.error('[checkins] 写库失败：', e && e.message ? e.message : String(e));
    // 给前端的必须是人能看懂的中文，不能把英文堆栈原样甩出去
    fail(res, 500, 'CHECKINS_WRITE_FAILED', '写体检记录失败：数据通道暂时连不上，或者这条数据被数据库挡下了（比如同一天已有记录）。原因已记在云函数日志里。');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('checkins listening on 0.0.0.0:' + PORT);
});
