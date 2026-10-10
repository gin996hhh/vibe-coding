# 接口契约 · 锚点（第 3 周唯一仲裁物）

这份文档是前后端的合同。后端照它实现，前端照它调用，谁也不去猜谁的代码。
今天（Day 15）只登记占位，**一个都不实现**。实现节奏：Day 17 读接口 → Day 18 写接口 → Day 19 分层重构。

服务名：anchor


## 通用约定

- 所有接口前缀 `/api`，只收 JSON，只回 JSON。
- 成功统一形状：`{ "ok": true, "data": <本接口的数据> }`
- 失败统一形状：`{ "ok": false, "error": { "code": "<大写下划线>", "message": "<给用户看的一句话>" } }`
- 日期一律 `YYYY-MM-DD` 字符串，时区按东八区。
- 本课程不登录、不建用户表，请求里不带身份字段。


## 0. 健康检查（Day 15 实现，唯一一个今天就要跑通的）

GET /api/health

请求参数：无

响应（成功）：
```json
{ "ok": true, "data": { "service": "anchor", "time": "2026-10-02T11:20:00+08:00" } }
```

失败形态：无。此接口不连数据库、不做任何判断，设计上不会失败。

不连数据库、不写业务。浏览器直接打开能看到这段 JSON 就算链路通。


## 1. 读取当前目标

GET /api/goal

请求参数：无

响应（成功）：
```json
{ "ok": true, "data": { "id": 1, "content": "半年内英文口语能上台", "created_at": "2026-10-02" } }
```

没有目标时：
```json
{ "ok": true, "data": null }
```

失败：`GOAL_READ_FAILED`


## 2. 新建或替换目标

POST /api/goal

请求参数：
```json
{ "content": "半年内英文口语能上台" }
```
- content：字符串，必填，1 到 100 字

响应（成功）：
```json
{ "ok": true, "data": { "id": 1, "content": "半年内英文口语能上台", "created_at": "2026-10-02" } }
```

失败：
- `CONTENT_EMPTY`：content 为空或超长


## 3. 写入今天的体检

状态：已实现（Day 18，2026-10-03 部署并验证通过）

POST /api/checkins

请求参数：
```json
{ "date": "2026-10-02", "sleep": 3, "energy": 4, "mood": 3 }
```
- date：字符串，必填
- sleep / energy / mood：整数 1 到 5，必填

响应（成功）：
```json
{ "ok": true, "data": { "date": "2026-10-02", "sleep": 3, "energy": 4, "mood": 3, "created_at": "2026-10-02T08:10:00+08:00" } }
```

同一天重复提交：覆盖，不报错。

失败：
- `INVALID_RANGE`：三项里有不在 1 到 5 的
- `DATE_MISSING`：date 没给
- `FIELD_MISSING`：sleep / energy / mood 少给了某一项（Day 18 实测补记）
- `PLAN_DAY_NOT_FOUND`：Day 18 起用，Day 24 起不再抛出（Day 24 实测新用户没有任何一天能打卡，核心流程第一步就断）。改为：写体检时如果这天没有计划行，服务端自动补建一条空计划行（锚点为空、完成状态 false），体检正常写入。空计划行的含义是「这天真实存在过，但没写锚点」，想补锚点用 PATCH 或页面上的新建入口


## 4. 写入今天的计划（早晚两条锚点）

状态：已实现（Day 24 补齐，2026-10-10 本机验证通过）

POST /api/plan-days

请求参数：
```json
{ "date": "2026-10-02", "morning_anchor": "早饭前写下今天唯一一件必须做成的事", "evening_anchor": "今晚写一句今天做到了什么" }
```
- date：必填
- morning_anchor / evening_anchor：字符串，可为空

响应（成功）：
```json
{ "ok": true, "data": { "date": "2026-10-02", "morning_anchor": "...", "morning_done": false, "evening_anchor": "...", "evening_done": false, "review": null, "created_at": "..." } }
```

失败：
- `DATE_MISSING`：没带 date 或格式不是 YYYY-MM-DD
- `INVALID_FIELD`：body 里出现了 date 和两个锚点之外的字段，或锚点不是文字
- `ANCHOR_TOO_LONG`：锚点超过 500 字
- `DAY_EXISTS`（HTTP 409）：这天已经有计划了。重复新建不报 500，明确告诉调用方「要改内容用 PATCH」


## 5. 更新某天的完成状态或复盘

状态：已实现（Day 22，2026-10-10 部署并验证通过）

PATCH /api/plan-days/:date

路径参数：date，形如 2026-10-02

请求参数（都可选，给哪个改哪个）：
```json
{ "morning_done": true, "evening_done": false, "review": "今天被现实打脸的地方是……" }
```

响应（成功）：
```json
{ "ok": true, "data": { "date": "2026-10-02", "morning_done": true, "evening_done": false, "review": "..." } }
```

失败：
- `DATE_NOT_FOUND`：这天还没有计划，先走第 4 个接口
- `INVALID_DATE`：date 不是 YYYY-MM-DD，或者干脆没给
- `INVALID_FIELD`：想改的字段不在 morning_done / evening_done / review 这三项里；
  morning_done 和 evening_done 只收 true 和 false
- `REVIEW_TOO_LONG`：复盘超过 2000 字
- `NO_FIELDS_TO_UPDATE`：三个字段一个都没给
- `BODY_NOT_JSON`：请求体不是合法 JSON

补充（Day 22 实测补记）：
- 只改传进来的字段，没传的字段原样保留，这是 PATCH 和「整条覆盖」的区别
- 日期同样走查询串 `?date=YYYY-MM-DD`（网关没开子路径透传），路径形式也认
- 前端记录台在每个日期块上给了三个入口：早/晚完成状态点一下就改、复盘输入框加保存、删体检（只删当天的打卡）


## 6. 读取计划列表（支持筛选，记录台用）

状态：已实现（Day 17，2026-10-03 部署并验证通过）

GET /api/plan-days

查询参数（都可选）：
- q：关键词，匹配早晚锚点和复盘文字
- status：all（默认） / some（有完成） / all_done（全完成） / none（都未完成）
- days：最近多少天，不给就返回全部

响应（成功）：
```json
{ "ok": true, "data": { "total": 2, "matched": 1, "items": [ { "date": "2026-10-02", "morning_anchor": "...", "morning_done": true, "evening_anchor": "...", "evening_done": false, "review": null } ] } }
```

2026-10-06 起列表的每一项额外带了 checkin 字段（那天填过体检就有，没填是 null），
形状与 §7 单天返回里的 checkin 一致。记录台靠这个字段在列表上直接显示体检，
所以列表和单天现在都合并了体检，不用二次请求。

失败：
- `INVALID_STATUS`：status 不在允许的四档里
- `INVALID_LIMIT`：limit 不是 1 到 100 的整数（Day 17 余力加练加的参数，1 到 100，不给就全返回）


## 7. 读取某一天（含体检，复盘页对照用）

状态：已实现（Day 17 补做，2026-10-03 部署并验证通过）

GET /api/plan-days/:date

路径参数：date

2026-10-03 实测补记：路径形式 `/api/plan-days/2026-10-03` 需要网关把子路径透传给函数，
当前路由没开透传，所以实际用查询形式 **`/api/plan-days?date=2026-10-03`** 调用，返回完全一致。
两种形式代码都认，等网关开了透传，路径形式不用改代码就能用。

响应（成功）：
```json
{ "ok": true, "data": { "date": "2026-10-02", "morning_anchor": "...", "morning_done": true, "evening_anchor": "...", "evening_done": false, "review": null, "checkin": { "sleep": 3, "energy": 4, "mood": 3 } } }
```

失败：
- `DATE_NOT_FOUND`


## 8. 读取汇总统计（成长页用）

GET /api/stats

请求参数：无

响应（成功）：
```json
{ "ok": true, "data": { "streak_days": 3, "total_done": 12, "days_with_record": 8 } }
```
- streak_days：连续天数，今天没做不算断
- total_done：累计完成的锚点数
- days_with_record：有记录的天数

失败：
- `STATS_FAILED`


## 9. 删除某一天（连同它的体检）

状态：已实现（Day 20 补做，2026-10-06 部署并验证通过）

DELETE /api/plan-days?date=2026-10-06

查询参数：date（必填，要删的那一天）

说明：先查这一天在 plan_days 里存不存在，不存在就返回中文错误，不静默成功；存在则删掉这一天，checkins 表里挂在这一天的体检一起删。

响应（成功）：
```json
{ "ok": true, "data": { "date": "2026-10-06", "deleted": true } }
```

失败：
- `MISSING_DATE`：没给 date
- `DATE_NOT_FOUND`：「这天在 plan_days 表里不存在，没什么可删的」
- `DELETE_FAILED`：删除没成功，附带原始原因

注：日期走查询串而不是路径形式，原因见 §7 的实测补记（网关没开子路径透传）。这一节是 Day 22 之前就已经上线的实现，补登记是为了让契约跟得上代码；Day 22 加了 PATCH 之后，要按本节同样的格式一并登记进来。


## 10. 删除某一天的体检（只删 checkins，计划行留着）

状态：已实现（Day 22，2026-10-10 部署并验证通过）

DELETE /api/checkins?date=2026-10-10

查询参数：date（必填，要删体检的那一天）

说明：和 §9 的区别是删的范围——§9 删的是一整天（计划 + 体检一起没），这一节只删 checkins 里那一行，plan_days 那天的计划和早晚锚点原样留着。先查这天有没有体检，没有就返回中文错误，不静默成功。

响应（成功）：
```json
{ "ok": true, "data": { "date": "2026-10-10", "deleted": true } }
```

失败：
- `INVALID_DATE`：date 不是 YYYY-MM-DD，或者干脆没给
- `CHECKIN_NOT_FOUND`：「这天没有体检记录，没什么可删的」
- `CHECKINS_DELETE_FAILED`：删除没成功，附带原始原因

补充（Day 22 实测补记）：
- 日期走查询串 `?date=YYYY-MM-DD`，路径形式 `/api/checkins/YYYY-MM-DD` 也认
- 前端在点「删体检」之前会弹一次确认，写明「只删体检，计划和锚点留着」


## 表结构（Day 16 据此建表，从本契约推导）

goals
　id、content、created_at

plan_days（每日计划）
　date（主键）、morning_anchor、morning_done、evening_anchor、evening_done、review、created_at

checkins（每日体检记录）
　date（关联 plan_days.date）、sleep、energy、mood、created_at

plan_days 与 checkins 靠 date 关联：同一天，一边一条计划，一边一条体检。


## 今天没实现的部分

第 1 到第 8 个接口**今天全部只登记占位，不实现**。
Day 15 只实现第 0 个（/api/health）。

2026-10-03 补记（不改动上面的原文，只追加事实）：
第 3 条（POST /api/checkins）和第 6 条（GET /api/plan-days）已实现、已部署到公网、已实测通过，
在上面两条各自的标题下标注了状态。第 1、2、4、5、7、8 条仍是占位。

2026-10-10 补记（Day 22，同上只追加事实）：
第 5 条（PATCH /api/plan-days）已实现，另新增第 10 条（DELETE /api/checkins，只删体检）。
第 1、2、4、7、8 条仍是占位。
