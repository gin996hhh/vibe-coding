'use strict';

/**
 * POST /api/checkins —— Day 18：把"今天身体怎么样"写进数据库
 *
 * 做什么：收到前端发来的 { date, sleep, energy, mood }，存进 checkins 表。
 *   同一天再提交一次 = 改当天那条（不会变成两条），所以反复提交是安全的。
 *
 * 为什么只接受 POST：
 *   写数据的动作不该走 GET。GET 会被浏览器缓存、可能被预取、链接一点就触发，
 *   写操作必须显式用 POST，这是接口设计的规矩。
 *
 * 为什么每个值都要校验：
 *   前端可以做校验，但接口不能指望前端一定可靠——别人可以直接发请求打进来。
 *   睡眠/精力/心情只收 1 到 5 的整数，日期只收 YYYY-MM-DD，不合规就挡掉，
 *   挡掉时用中文说清楚哪一项不对、应该是什么样。
 *
 * 为什么响应形状和读接口一样是 { ok, data, error }：
 *   前端只认这一个形状，读写都一样，就不用为写接口另写一套判断。
 */

const http = require('node:http');

const PORT = process.env.PORT || 9000;

/* ---------- 连接信息：全部从环境变量读 ---------- */

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
var SELECT = 'date,sleep,energy,mood,created_at';

function authHeaders(extra) {
  var h = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + TOKEN,
    apikey: TOKEN
  };
  if (extra) Object.assign(h, extra);
  return h;
}

/* ---------- 校验 ---------- */

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

/* ---------- 写库：同一天有就改，没有就新增 ---------- */

async function findOne(date) {
  var res = await fetch(BASE + '/checkins?select=' + SELECT + '&date=eq.' + date, {
    method: 'GET',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('查询当天记录失败（网关返回 ' + res.status + '）');
  var rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

// checkins.date 外键引用 plan_days(date)（见 db/schema.sql 第 30 行）：
// 没有计划的那天打不了卡。这里提前查一次，把数据库原本的英文外键报错
// 换成一句人能看懂的中文，不然前端只能拿到 500 和一堆英文。
async function planDayExists(date) {
  var res = await fetch(BASE + '/plan_days?select=date&date=eq.' + date, {
    method: 'GET',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('查询当天计划失败（网关返回 ' + res.status + '）');
  var rows = await res.json();
  return Boolean(rows && rows.length);
}

async function insertRow(row) {
  row.created_at = new Date().toISOString();
  var res = await fetch(BASE + '/checkins?select=' + SELECT, {
    method: 'POST',
    headers: authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  var text = await res.text();
  if (!res.ok) throw new Error('新增失败（网关返回 ' + res.status + '）：' + text.slice(0, 200));
  var rows = JSON.parse(text);
  return rows && rows.length ? rows[0] : row;
}

async function updateRow(date, row) {
  var res = await fetch(BASE + '/checkins?select=' + SELECT + '&date=eq.' + date, {
    method: 'PATCH',
    headers: authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  var text = await res.text();
  if (!res.ok) throw new Error('更新失败（网关返回 ' + res.status + '）：' + text.slice(0, 200));
  var rows = JSON.parse(text);
  return rows && rows.length ? rows[0] : row;
}

/* ---------- HTTP 服务 ---------- */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

  // 只接受 POST，别的明确挡掉（GET 打开会直接告诉你该怎么用）
  if (req.method !== 'POST') {
    fail(res, 405, 'METHOD_NOT_ALLOWED',
      '这个接口只接受 POST。写数据请用 POST，例如：curl -X POST 本地址 -H "Content-Type: application/json" -d "{\\"date\\":\\"2026-10-03\\",\\"sleep\\":4,\\"energy\\":3,\\"mood\\":4}"');
    return;
  }

  if (!TOKEN) {
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
    var existing = await findOne(checked.row.date);
    var saved, action;
    if (existing) {
      saved = await updateRow(checked.row.date, checked.row);
      action = 'updated';
    } else {
      // 新增前先看这天有没有计划。没有就直接挡掉并说明原因，
      // 别让数据库抛英文外键错误、前端拿到 500 白屏。
      if (!(await planDayExists(checked.row.date))) {
        fail(res, 400, 'PLAN_DAY_NOT_FOUND',
          checked.row.date + ' 这天还没有计划（plan_days 表里没有这一天）。' +
          '体检记录要挂在某一天的计划上，先写计划再打卡。');
        return;
      }
      saved = await insertRow(checked.row);
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
    fail(res, 500, 'CHECKINS_WRITE_FAILED', '写体检记录失败：' + (e && e.message ? e.message : String(e)));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('checkins listening on 0.0.0.0:' + PORT);
});
