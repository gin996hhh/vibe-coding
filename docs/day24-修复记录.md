# Day 24｜修复记录：新用户记不了体检（核心流程第一步断）

## 现象（怎么发现的）

按 `docs/day24-核心流程测试清单.md` 逐项跑，20 项里 19 项 PASS、1 项 FAIL：

- 契约 §4 写着 `POST /api/plan-days`（新建某天的计划），**代码从来没实现**，实测返回 405。
- 而写体检的前置条件是那天必须已有计划行（checkins.date 外键指向 plan_days.date），没有就报 `PLAN_DAY_NOT_FOUND`。
- 页面上任何地方都建不了计划行。

三件事连起来：新用户打开记录台，库里没有他的任何一天，写体检被挡、建计划没有入口。核心流程第一步就断。Day 21 演示时「写入按钮禁用、写体检报 PLAN_DAY_NOT_FOUND」其实就是这个 Bug，当时只当演示事故处理，没追到根上。

## 定位（怎么排除其他原因的）

1. 先怀疑是前端没传对参数：看请求日志，POST 根本没走到业务逻辑，405 是方法检查直接挡的，说明服务端压根没有这个分支。
2. 再怀疑是数据库约束问题：用 REST 网关直接插 plan_days 成功（201），说明表和约束都正常，问题只在接口层缺实现。
3. 查 git 历史确认：Day 17 只做了 GET，Day 20 加了 DELETE，Day 22 加了 PATCH，POST 从 Day 15 契约写下的那天起就是占位。

结论：不是环境问题、不是数据问题，是契约与实现脱节——文档里承诺的接口代码里不存在。

## 修复（做了什么）

方案是「根治 + 防呆」两个都做：

1. **补实现 POST /api/plan-days**（根治）：`cloudfunctions/_shared/planDaysRepository.js` 新增 `insertByDate`，`cloudfunctions/plan-days/index.js` 新增 POST 分支。date 必填，锚点可空，最多 500 字。已存在返回 409 `DAY_EXISTS`，提示「要改用 PATCH」。
2. **写体检自动补建空计划行**（防呆）：`cloudfunctions/checkins/index.js` 里，写体检时发现这天没有计划行就自动补一条（锚点为空），不再报 `PLAN_DAY_NOT_FOUND`。新用户任何一天都能直接记。
3. **前端加新建入口**：记录台「每天」板块顶部加一行「日期 + 早锚点 + 晚锚点 + 新建这一天的计划」，日期默认今天。`records.html` + `css/style.css`。
4. **契约同步**：§4 标已实现并补四个错误码；§3 的 `PLAN_DAY_NOT_FOUND` 标注 Day 24 起不再抛出及原因。

## 验证（修复前 vs 修复后）

本机起服务连真实库实测（测试数据用 2099 日期，验完已删）：

| 用例 | 修复前 | 修复后 |
| --- | --- | --- |
| POST 新建 2099-06-01 | 405 METHOD_NOT_ALLOWED | **201**，返回完整一天，数据落库 |
| 再建同一天 | 405 | **409 DAY_EXISTS**，中文说明 |
| 不带 date | 405 | **400 DATE_MISSING** |
| body 带多余字段 sleep | 405 | **400 INVALID_FIELD** |
| 给没有计划行的 2099-07-01 直接写体检 | **400 PLAN_DAY_NOT_FOUND**（Bug 现场） | **201**，体检写入，空计划行自动补建 |
| GET 2099-07-01 | 404 | 200，计划行存在、锚点为空、体检挂上 |

## 部署后的验证（公网真实环境，2026-10-10 20:05）

三个包（plan-days 云函数、checkins 云函数、dist 静态托管）传上公网之后
再验一遍，前后不是同一份代码不能算证据。

**一、同一份清单重跑 22 项，全 PASS**（逐条结果见
`docs/day24-核心流程测试清单.md` 的「修复部署后 regression」一节）。
原 FAIL 的两项已转正：

| 用例 | 修复前（线上旧代码） | 修复后（线上新代码） |
| --- | --- | --- |
| POST /api/plan-days 新建计划 | 405 METHOD_NOT_ALLOWED | **201** 建成 |
| POST /api/checkins 打没有计划的那天 | 400 PLAN_DAY_NOT_FOUND | **201** 写入，计划行自动补建 |

**二、核心流程连做三遍（写体检 → PATCH → 删体检 → 删整天）**，三遍结果一样：
体检 3/3/3 落库、计划行仍在、PATCH 200、删体检后计划行保留、删整天后再查 404。
修好是个稳定的修法，不是碰巧一次。

**三、`tools/regression.py --compare` 与 Day 19 基线比对**：10/18 一致。
8 条不一致逐条归因，全是有意改动或历史数据差异，没有一条是这次修复弄坏的：

- C02/03/04/06：列表响应多了 checkin 字段（Day 22 有意加的）
- C09：基线查的是种子数据那天，Day 20 删种子后本就 404
- C13：写体检返回 200→201（Day 24 起新建语义明确为 201）
- C16：这天没计划时写体检 400→201（**本次修复的目标行为**）
- C18：用 POST 打读接口 405→409（Day 24 实现了 POST，重复建同一天返回 409）

`tools/check-repository.js` 11/11 通过，`node --check` 四个改动文件全过。
测试数据（2088 系列、regression.py 留下的 2026-10-01/10-05）跑完已清理，
线上库只剩 10-09（真实记录）和 10-10（演示行）。

## 涉及文件（都属于 Day 24）

- `cloudfunctions/_shared/planDaysRepository.js`：新增 insertByDate
- `cloudfunctions/plan-days/index.js`：新增 POST 分支，CORS 与 405 文案同步
- `cloudfunctions/checkins/index.js`：写体检自动补建空计划行
- `records.html`：新建计划表单 + createDay + 绑定
- `css/style.css`：.newday 样式（色值全取 :root）
- `docs/api-contract.md`：§4、§3 同步
- `docs/day24-核心流程测试清单.md`：发现 Bug 的那份清单
