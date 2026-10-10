# Day 23｜错误处理与安全自查清单

每项都写「怎么算通过」和「这次实测到什么」，允许只写结论的说法一律不写。
自查时间：2026-10-10（Day 23）

---

## 一、密钥排查（上线红线，优先级最高）

### 第 1 项｜工作区里搜不到密钥特征词

怎么算通过：在项目根目录跑下面这条命令，返回 **0 条**。特征词覆盖数据库连接串、OpenAI 风格的 sk- 密钥、AWS AKIA、私钥文件头、password / secret / apikey 后面跟了长串值。

```bash
grep -rInE "postgres://|mysql://|mongodb(\+srv)?://|sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password\s*=|passwd\s*=|secret\s*=|apikey\s*[:=]\s*['\"][A-Za-z0-9._-]{20,}" . --exclude-dir=node_modules --exclude-dir=.git
```

**实测结果**：命中 2 条，逐条看过，都是 `.workbuddy/skills/git-push-github-via-watt/` 里那个脚本的命令行，内容是 `git credential fill | grep '^password='`，作用是**运行时从系统凭据管理器读**，文件里没有任何真实值。判定：**通过（0 条真密钥）**。

### 第 2 项｜Git 历史里搜不到密钥

怎么算通过：跑下面这条，返回 **0 条**。比工作区更重要——工作区删了，历史里还留着也算泄漏。

```bash
git log --all -p | grep -InE "postgres://|sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|eyJhbGciOi"
```

**实测结果**：**0 命中**。判定：通过。

### 第 3 项｜真实凭证只在两处，都不进仓库

怎么算通过：仓库里搜不到 `.env`，且下面这条命令原样输出 `.env`（有输出＝被忽略，提交不出去；没输出＝没被忽略，要改 .gitignore）。

```bash
git check-ignore -v .env
```

**实测结果**：`.gitignore:2:.env	.env`（已被忽略），仓库里没有 `.env` 文件。真值只在两处：CloudBase 控制台的云函数环境变量、本机自己建的 `.env`。判定：通过。

### 第 4 项｜仓库里有 .env.example，且只有字段名没有值

怎么算通过：文件存在，`git check-ignore` 查它**没有输出**（能入库），打开里面等号后面全是空。

**实测结果**：`.env.example` 已建，三个字段 `TCB_ENV_ID` / `TCB_ACCESS_TOKEN` / `PORT` 都为空值，并写了注释说明真值放哪、泄漏后要作废重生成。`.gitignore` 补了 `!.env.example` 这条例外（原来 `.env.*` 会把它一起挡掉）。判定：通过。

---

## 二、三类错误的中文提示

分法：用户输入错（告诉他改什么）、网络 / 接口错（提示稍后再试）、服务端错（记日志 + 通用提示）。

### 第 5 项｜用户输入错 → 告诉他改什么

怎么算通过：随便发一个不合规的请求，返回 400 且 message 是中文，说清哪项不合规、正确格式是什么。不能是英文堆栈，也不该是 500。

```bash
curl -X PATCH "<网关>/api/plan-days?date=2026-10-10" -H "Content-Type: application/json" -d '{"sleep":5}'
```

**实测结果**：`400 {"ok":false,"error":{"code":"INVALID_FIELD","message":"这一项不能改：sleep。改一天只能改 morning_done（早锚点完成）、evening_done（晚锚点完成）、review（复盘）这三项"}}`。判定：通过。

### 第 6 项｜服务端错 → 中文通用提示，原文只进日志

怎么算通过：让服务端真的出问题（本机不配凭证就能模拟），返回 500 且 message 是中文，说明该找谁处理；英文原始报错只出现在云函数日志里。

```bash
# 不设 TCB_ACCESS_TOKEN 起服务，再打一次
curl "<本机>/api/plan-days?date=2026-10-10"
```

**实测结果**：`500 {"ok":false,"error":{"code":"MISSING_TOKEN","message":"服务端没配访问凭证（环境变量 TCB_ACCESS_TOKEN）。"}}`。三个云函数的 catch 里都是 `console.error` 记英文原文 + 给前端中文。判定：通过。

### 第 7 项｜网络 / 接口错 → 提示稍后再试，不甩英文

怎么算通过：断网或接口不可达时，页面提示是中文「网络不通，稍后再试一次」，不能出现 `Failed to fetch` 这类浏览器原文。

**实测结果**：`records.html` 里加了 `humanError()`，认出 fetch / network / timeout / abort / Failed to 这类字样就换成中文提示，原始报错只 `console.error` 进控制台留档。单元验证：输入 `Failed to fetch` 输出「网络不通，稍后再试一次」；输入服务端的中文 400 提示则原样透传，不二次加工。页面上有 6 处调用（拉列表、健康检查、改完成状态、保存复盘、删整天、删体检）。判定：通过。

---

## 三、明确的输入边界

### 第 8 项｜每个接口都声明了接受什么、拒绝什么

怎么算通过：打开 `docs/api-contract.md`，每个接口下面都能看到「失败」那一栏列了错误码和触发条件。

**实测结果**：Day 22 补的 PATCH 有 6 个错误码（INVALID_DATE / INVALID_FIELD / REVIEW_TOO_LONG / NO_FIELDS_TO_UPDATE / DATE_NOT_FOUND / BODY_NOT_JSON），DELETE /api/checkins 有 3 个（INVALID_DATE / CHECKIN_NOT_FOUND / CHECKINS_DELETE_FAILED）。判定：通过。

### 第 9 项｜输入有长度和类型上限

怎么算通过：文本字段有长度上限，数值字段有取值范围，超出就挡掉并给中文提示。

**实测结果**：复盘最长 2000 字（超了报 REVIEW_TOO_LONG 并告诉你写了多少个字），体检三项只能是 1 到 5 的整数（数据库层还有 CHECK 约束兜底），日期必须是 YYYY-MM-DD 且是真实存在的日期。判定：通过。

---

## 四、这次没做的

- Day 23 的余力加练（加请求日志：时间、路径、结果）没做。理由是它只提升排查效率、不改变产品行为，而且三个云函数的 catch 里已经有 `console.error` 记时间和原因，重复加一层意义不大。真要排查线上问题，Day 26 之后按云函数日志查就够。
