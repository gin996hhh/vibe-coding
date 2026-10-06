'use strict';

/**
 * 数据访问层离线自检（不需要联网、不需要部署）
 * 用法：node tools/check-repository.js
 *
 * 做什么：用一个假的网关接住请求，把 repository 真正发出的地址记录下来，
 *   和「重构前那版代码会发出的地址」逐条对照。
 *
 * 为什么需要它：
 *   重构最容易出的问题是「查询条件拼错了」——地址差一个字符，线上就读不到
 *   数据，但接口不会报错，只会安静地返回空。部署后才发现要重新打包重传。
 *   这里在本地就把地址对清楚，上传前心里有底。
 *
 * 期望值从哪来：Day 17 / Day 18 那版 index.js 里 rdb()、buildParams()、
 *   findOne()、insertRow() 等函数的实际拼接结果，逐条抄下来作为对照标准。
 *   这些字符串就是「重构前的行为」，一个字符都不许变。
 */

process.env.TCB_ACCESS_TOKEN = 'mock-token-for-local-check';

const path = require('node:path');
const SHARED = path.join(__dirname, '..', 'cloudfunctions', '_shared');

const ENV_ID = 'victor-1a2b3c4d-d5fmr5rn115087c8';
const BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

const P_SELECT = 'date,morning_anchor,morning_done,evening_anchor,evening_done,review';
const C_SELECT = 'date,sleep,energy,mood,created_at';

// 期望：重构前会发出的地址（去掉前缀部分，便于阅读）
const EXPECT = {
  countAll: '/plan_days?select=date&limit=1',
  listPlain: '/plan_days?select=' + P_SELECT + '&order=date.desc',
  listQ: '/plan_days?select=' + P_SELECT + '&order=date.desc' +
    '&or=(morning_anchor.ilike.*%E6%B8%A9%E6%B0%B4*,evening_anchor.ilike.*%E6%B8%A9%E6%B0%B4*,review.ilike.*%E6%B8%A9%E6%B0%B4*)',
  listStatus: '/plan_days?select=' + P_SELECT + '&order=date.desc' +
    '&and=(morning_done.eq.true,evening_done.eq.true)',
  listDays: '/plan_days?select=' + P_SELECT + '&order=date.desc&date=gte.{DAYSAGO}',
  listLimit: '/plan_days?select=' + P_SELECT + '&order=date.desc&limit=3',
  planFind: '/plan_days?select=' + P_SELECT + '&date=eq.2026-10-01',
  planExists: '/plan_days?select=date&date=eq.2026-10-01',
  ckFind: '/checkins?select=' + C_SELECT + '&date=eq.2026-10-01',
  ckInsert: '/checkins?select=' + C_SELECT,
  ckUpdate: '/checkins?select=' + C_SELECT + '&date=eq.2026-10-01'
};

let captured = [];

function mockFetch(rows, contentRange) {
  return async function (url, init) {
    captured.push({ url: url, init: init });
    return {
      ok: true,
      status: 200,
      headers: { get: function (k) { return k === 'content-range' ? contentRange : null; } },
      text: async function () { return JSON.stringify(rows); }
    };
  };
}

let pass = 0, fail = 0;

function check(name, actualUrl, expectedSuffix) {
  const actual = actualUrl.replace(BASE, '');
  const ok = actual === expectedSuffix;
  if (ok) {
    pass++;
    console.log('  通过  ' + name);
  } else {
    fail++;
    console.log('  不一致  ' + name);
    console.log('    期望：' + expectedSuffix);
    console.log('    实际：' + actual);
  }
}

(async function () {
  console.log('数据访问层离线自检');
  console.log('（假网关接住请求，只看地址对不对，不真连数据库）\n');

  const planDaysRepo = require(path.join(SHARED, 'planDaysRepository'));
  const checkinsRepo = require(path.join(SHARED, 'checkinsRepository'));

  // 1. 总数
  captured = [];
  global.fetch = mockFetch([{ date: '2026-10-01' }], '0-0/6');
  const total = await planDaysRepo.countAll();
  check('countAll 查总数', captured[0].url, EXPECT.countAll);
  console.log('    返回的 matched = ' + total + '（期望 6，来自 Content-Range 头）');

  // 2. 列表：四种筛选各自拼出来的地址
  captured = [];
  await planDaysRepo.list({ status: 'all' });
  check('list 无筛选', captured[0].url, EXPECT.listPlain);

  captured = [];
  await planDaysRepo.list({ q: '温水', status: 'all' });
  check('list 关键词 q=温水（含转义）', captured[0].url, EXPECT.listQ);

  captured = [];
  await planDaysRepo.list({ status: 'all_done' });
  check('list status=all_done', captured[0].url, EXPECT.listStatus);

  captured = [];
  const beforeDays = await planDaysRepo.list({ days: 7 });
  const daysAgo = (function () {
    const d = new Date(Date.now() - 7 * 86400000);
    return d.toISOString().slice(0, 10);
  })();
  check('list days=7', captured[0].url, EXPECT.listDays.replace('{DAYSAGO}', daysAgo));

  captured = [];
  await planDaysRepo.list({ limit: 3 });
  check('list limit=3', captured[0].url, EXPECT.listLimit);

  // 3. plan_days 查单天 / 判断存在
  captured = [];
  await planDaysRepo.findByDate('2026-10-01');
  check('planDaysRepository.findByDate', captured[0].url, EXPECT.planFind);

  captured = [];
  await planDaysRepo.existsByDate('2026-10-01');
  check('planDaysRepository.existsByDate（checkins 用的那个）', captured[0].url, EXPECT.planExists);

  // 4. checkins 查 / 改 / 增
  captured = [];
  await checkinsRepo.findByDate('2026-10-01');
  check('checkinsRepository.findByDate', captured[0].url, EXPECT.ckFind);

  captured = [];
  global.fetch = mockFetch([{ date: '2026-10-01', sleep: 5, energy: 4, mood: 4, created_at: 'x' }]);
  await checkinsRepo.update('2026-10-01', { date: '2026-10-01', sleep: 5, energy: 4, mood: 4 });
  check('checkinsRepository.update（PATCH）', captured[0].url, EXPECT.ckUpdate);
  console.log('    方法与头：' + captured[0].init.method + ' / Prefer=' + captured[0].init.headers.Prefer);

  captured = [];
  await checkinsRepo.insert({ date: '2026-10-01', sleep: 5, energy: 4, mood: 4 });
  check('checkinsRepository.insert（POST）', captured[0].url, EXPECT.ckInsert);
  console.log('    方法与头：' + captured[0].init.method + ' / Prefer=' + captured[0].init.headers.Prefer);

  console.log('\n通过 ' + pass + ' / ' + (pass + fail) + '，不一致 ' + fail);
  process.exit(fail ? 1 : 0);
})();
