/**
 * store.js —— 数据层
 *
 * 全站所有读写 localStorage 的代码只在这一个文件里。
 * 将来 Day 15 换成云端数据库时，只改这一个文件，其他页面一行都不用动。
 *
 * 两个键：
 *   anchor.goal    当前目标（只有一条）
 *   anchor.records 每日记录（一天一条，可覆盖）
 */

var KEY_GOAL = 'anchor.goal';
var KEY_RECORDS = 'anchor.records';

/* ---------- 工具：本地日期 YYYY-MM-DD ---------- */

function todayStr() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * 存储是否可用
 * 双击 html 文件打开（file://）时，部分浏览器会禁掉 localStorage，
 * 表现是"首页写进去了，下一页读出来是空的"。
 */
function isAvailable() {
  try {
    var k = '__t';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 底层：读 / 写 ---------- */

function readJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    // 数据坏了不报错，返回空结构
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- 目标 anchor.goal ---------- */

function getGoal() {
  return readJSON(KEY_GOAL, null);
}

function saveGoal(goal) {
  writeJSON(KEY_GOAL, goal);
}

function clearGoal() {
  localStorage.removeItem(KEY_GOAL);
}

/**
 * 新建一个 goal 对象
 * @param {string} content 目标内容，例：半年内英文口语能上台
 * @param {object} threeRings 三环拆解结果
 */
function makeGoal(content, threeRings) {
  return {
    id: 'g_' + Date.now(),
    content: content,
    created_at: todayStr(),
    status: 'active',
    three_rings: threeRings || null
  };
}

/* ---------- 每日记录 anchor.records ---------- */

function getRecords() {
  return readJSON(KEY_RECORDS, []);
}

function saveRecords(list) {
  writeJSON(KEY_RECORDS, list);
}

/** 取某一天的记录，没有则返回 null */
function getRecord(date) {
  var list = getRecords();
  var target = date || todayStr();
  for (var i = 0; i < list.length; i++) {
    if (list[i].date === target) return list[i];
  }
  return null;
}

/** 空的一天记录结构 */
function makeRecord(date) {
  return {
    date: date || todayStr(),
    checkin: null,        // { sleep, energy, mood } 各 1–5
    anchors: null,        // { morning:{text,reason}, evening:{text,reason} } 当天两条锚点
    morning_done: false,
    evening_done: false,
    ritual_count: null,   // 复盘时确认的仪式完成数 0-2（默认从当天记录带出，可改）
    state_score: null,    // 1-5
    method_text: '',      // 今天实际用的方法（自己写，一句话）
    stuck_text: '',       // 今天卡在哪一下（问事实，不问自评——缺口 C）
    hard_start_text: ''
  };
}

/**
 * 写入 / 覆盖某一天的记录（同一天只保留一条）
 * @param {string} date YYYY-MM-DD
 * @param {object} patch 要合并进去的字段
 * @returns {object} 合并后的完整记录
 */
function upsertRecord(date, patch) {
  var d = date || todayStr();
  var list = getRecords();
  var found = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].date === d) { found = list[i]; break; }
  }
  if (!found) {
    found = makeRecord(d);
    list.push(found);
  }
  if (patch) {
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        found[k] = patch[k];
      }
    }
  }
  saveRecords(list);
  return found;
}

/* ---------- 清空（PRD 第七章：localStorage 被清后的兜底） ---------- */

function clearAll() {
  localStorage.removeItem(KEY_GOAL);
  localStorage.removeItem(KEY_RECORDS);
}

/* ---------- 暴露给页面 ---------- */

window.Store = {
  isAvailable: isAvailable,
  todayStr: todayStr,
  getGoal: getGoal,
  saveGoal: saveGoal,
  clearGoal: clearGoal,
  makeGoal: makeGoal,
  getRecords: getRecords,
  saveRecords: saveRecords,
  getRecord: getRecord,
  makeRecord: makeRecord,
  upsertRecord: upsertRecord,
  clearAll: clearAll
};
