---
name: verify-project
description: 锚点项目发布前检查。改完代码、上传云函数或静态托管之前跑一遍：公网首页、健康接口、读接口、写接口闭环、跨域预检、工作区密钥、Git 历史密钥、gitignore 与模板、数据库与核心表、云函数共享层副本、前端语法与产物、公网版调试信息、代码字段与数据库对齐，共 13 项，逐项 PASS/FAIL 加一行证据。当 Victor 说「跑一下 verify-project」「发布前检查」「检查一遍再传」「上线前验一下」时使用。
agent_created: true
---

# verify-project · 锚点发布前检查

## 这是什么

把 Day 15 到 Day 24 踩过的坑固化成一份能一键跑的清单。人记不住十几项检查，脚本记得住。每次改完代码、每次上传之前跑一遍，出问题它会指到第几行。

## 怎么跑

```bash
cd "C:/Users/gin99/Desktop/Vibe coding"
python .workbuddy/skills/verify-project/verify.py
```

只跑本地项（断网、或者只想查密钥和语法时用）：

```bash
python .workbuddy/skills/verify-project/verify.py --local
```

退出码：有 FAIL 返回 1，没有返回 0。以后要接流水线就直接看退出码。

在对话里说「运行 verify-project」即可，AI 会加载本文件并执行上面的命令。

## 环境前置

本机 bash 的 PATH 有时是空的，命令找不到就用绝对路径：

- Python：`C:/Users/gin99/.workbuddy/binaries/python/versions/3.13.12/python.exe`
- Node（语法检查用）：脚本里写死路径，找不到就跳过那一项
- Edge（渲染验证用）：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，找不到就跳过那一项
- 数据库凭证：脚本自己从 `_local/密钥/锚点-访问密钥.txt` 第 6 行读，不用手填，也不用贴进对话

## 十三项检查

| 编号 | 查什么 | 怎么算通过 | 防的是哪个坑 |
|---|---|---|---|
| C01 | 公网首页 | HTTP 200，且内容以 `<!doctype html` 开头，且不含 `INVALID_HOST` | 旧域名被回收还拿去发群，页面返回 INVALID_HOST |
| C02 | 健康接口 | GET `/api/health` 返回 200，JSON 里 `ok` 为 true，且不含 `MISSING_TOKEN` | 云函数没配 TCB_ACCESS_TOKEN，接口全是 500 |
| C03 | 读接口 | GET `/api/plan-days?limit=1` 返回 200，`matched` 大于等于 1，行里有 `date` 字段 | 接口通着但库是空的，上线了才发现 |
| C04 | 写接口闭环 | 用探针日期 2099-01-01 走 POST 201、PATCH 200、DELETE 200，最后再查一次该日期必须查不到 | 契约写着已实现、实际返回 405；以及回归脚本往库里留测试数据 |
| C05 | 跨域预检 | OPTIONS 的 `Access-Control-Allow-Methods` 里 GET、POST、PATCH、DELETE 四个都在 | 加了新方法没同步 Allow，浏览器直接 405 |
| C06 | 工作区密钥 | 命中 0 处。光有关键词不算，等号后面必须有值且值得像凭证 | 密钥写进代码提交上去 |
| C07 | Git 历史密钥 | `git log --all -p` 全量历史里命中 0 处 | 工作区删了，历史里还留着也算泄漏 |
| C08 | gitignore 与模板 | `.env` 被忽略，`.env.example` 能进仓库，模板里凭证字段全空 | 模板没入库同伴配不了；模板里带了真值 |
| C09 | 数据库 | 数据网关读 `plan_days` 和 `checkins` 都返回 200；401 单独报「API Key 失效，去控制台重建」 | 表被 DROP 了没人发现；网关 Key 突然失效 |
| C10 | 共享层副本 | 部署包里每个共享文件与 `cloudfunctions/_shared` 源码哈希一致 | 改了源码没分发，两个函数行为不一致 |
| C11 | 前端语法与产物 | HTML 内联脚本 `node --check` 全过，dist 里关键文件齐全 | 改完不自检就上传，线上白屏 |
| C12 | 公网版调试信息 | `records.html?diag=0` 渲染后 diagCard、healthBadge、cloudBadge 都隐藏 | 调试读数被使用者看见 |
| C13 | 代码字段与数据库对齐 | 数据访问层 SELECT 里写的每个字段，库里都查得到。缺哪个就报哪个，并提示先跑 ALTER TABLE | 改了代码里的字段、库的 ALTER TABLE 还没跑，云函数传上去一查就 500，而且是上线之后才炸 |

## 判定口径的三条硬规矩

1. 只认客观量。HTTP 状态码、命中条数、文件哈希、命令返回码。不许出现「看起来正常」「基本没问题」。
2. 每项必须留一行证据，证据要能照着复现。
3. 扫不到就写 SKIP，不许拿 SKIP 冒充 PASS。C10 曾经因为匹配路径写错一路 SKIP 到底，等于摆设，已修。

## 修过的误报（第一次实跑的记录）

第一版照抄 Day 23 清单里那条命令的口径，12 项跑出 4 个 FAIL，逐个查过：

| 项 | 结果 | 原因 | 怎么改的 |
|---|---|---|---|
| C01 | 误报 | 我写 `"<!DOCTYPE html" not in txt.lower()`，拿大写去比小写，永远判 FAIL | 改成小写再比 |
| C06 | 误报 14 处 | `password\s*=` 只要出现关键词就算，命中的全是 Skill 脚本里「运行时从凭据管理器读」的命令行，值里没有真东西 | 改成等号后必须有值，且值得像凭证 |
| C07 | 误报 2 处 | 命中的是 `day23-安全自查清单.md` 里那条 grep 命令自己，文档写了命令就被当成凭证 | `postgres://` 要求带 `账号:密码@` 才算 |
| C08 | 误报 | `PORT=9000` 是端口默认值，不是密钥 | 改成只查凭证类字段是否为空，其余字段只要值不像密钥就放行 |
| C10 | 漏报 | 部署包里共享层平铺在 zip 根目录，我按 `_shared/xxx.js` 找，找不到就跳过 | 两种路径都认 |
| C06（第二轮） | 自咬文档 | 写进本文件「自检留档」里那段假密钥示例，被扫描器自己当成真密钥命中了 | 用行级白名单豁免这一行本身，不给整个文件开口子 |

改完再跑，12 项全 PASS，0 误报。

第二轮那个 C06 值得说一句。当时有两种省事的修法：把整个 SKILL.md 加进排除名单，或者把示例字符串改得断开写。两种都没选。给整个文件开口子，将来真密钥写进任何技能文档都会漏检，检查项会退化成摆设，C10 就是这么废掉过一次的。改文档则靠人记得怎么绕，不靠机制。最后用的是行级白名单：只豁免那一行，别的照查。

改完当场验过它没被拆：在同一个 SKILL.md 里另起一行塞一个不同的假密钥，C06 照样报 FAIL，指到第 99 行，退出码 1；删掉回到 PASS，退出码 0。豁免范围是那一行，不是那个文件。

## 自检留档：故意弄坏过一次

2026-10-11 验证过它不会虚报通过。做法是在 `js/mock.js` 里塞一行假密钥：

```js
var FAKE_TOKEN = "sk-verifyprojectfakekey1234567890";
```

带它跑，C06 报 FAIL，证据是 `js\mock.js:93 [OpenAI 密钥] var FAKE_TOKEN = "sk-..."`，退出码 1。把那行删掉再跑，C06 回到 PASS，退出码 0。

结论：这项真的在读文件，不是写死返回 PASS。

## 抽样复核

从 PASS 项里抽两项，人工照着「怎么算通过」重做一遍：

- C02：curl 拿 `https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478804.ap-shanghai.app.tcloudbase.com/api/health`，返回 `{"ok":true,"data":{"service":"anchor",...}}`，与脚本结论一致。
- C08：跑 `git check-ignore -v .env` 有输出，`.env.example` 存在且 `git check-ignore .env.example` 无输出，凭证字段为空，与脚本结论一致。

## 以后加检查项

每加一项，先在表格里写清它防的是哪个具体的坑。说不出坑名的检查项不要加，那是通用模板，不是这个项目的经验。
