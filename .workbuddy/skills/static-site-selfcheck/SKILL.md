---
name: static-site-selfcheck
description: 纯静态网站（html/css/js，无构建）提交前的全自动自检工作流：六项静态检查 + 无头浏览器双宽度真渲染验证 + 依赖 localStorage 的边界场景注入断言 + 截图留证。适用于 Windows + 本机 Edge/Chrome，不需要安装任何依赖。
agent_created: true
---

# 纯静态站自检工作流（无依赖版）

适用：纯 html/css/js 静态站（如 Vibe coding 项目）。全程不装包，只用：Python（任意 3.x）+ 本机 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）+ Node（可选，语法检查用）。

**本机环境前置动作**：这个 bash 的 PATH 可能为空（连 `ls`/`cat` 都 command not found），脚本第一行先补 PATH：

```bash
export PATH="/c/Users/gin99/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/c/Users/gin99/.workbuddy/binaries/PortableGit/versions/1.2.0/bin:/c/Windows/System32:/c/Windows:$PATH"
```

页面要用 `http://localhost:8000/` 打开（`file://` 下 localStorage 不可靠）。起服务器：`python -m http.server 8000`（在项目根目录）。

## 一、静态检查脚本（Python 一次跑六项）

参考实现：`C:\Users\gin99\AppData\Local\Temp\anchor-selfcheck.py`（若被清理，按下述重写，~120 行）。

六项检查：
1. **语法**：`node --check` 每个 js 文件；HTML 内联脚本用正则 `<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>`（re.S）抽出后逐段检查。
2. **id 引用**：收集每页 `id="..."` 集合；扫该页引入的外部 js + 内联脚本里的 `getElementById('x')` 和 `querySelector('#x')`，报缺失。**页面空白的头号原因**。
3. **链接**：`<script src>`/`<link href>`/`<a href>` 指向的本地文件是否存在（跳过 http/#/mailto/data:）。
4. **mock 安全**：假数据文件里 grep `setItem|removeItem`，必须为 0。
5. **导航一致性**：每页 `<nav class="nav">` 块内的 href 集合必须相同，且恰好 1 个 `class="...active..."`。**例外**：不在导航里的中间页（如 decompose.html）允许 0 个 active。单页检查抓不住这类跨页约定，必须单独一项。
6. **旧色残留**：grep 旧配色硬编码（如 #9aa4b2/#d6dbe3/#c0392b），应为 0。

## 二、无头浏览器真渲染验证（不需要装 playwright/chromium）

原理：Edge/Chrome 自带 headless 模式。关键参数：
```
msedge.exe --headless=new --disable-gpu --no-first-run --no-default-browser-check
  --user-data-dir=<临时目录>   ← 必加，避免与已开的 Edge 抢 profile
  --virtual-time-budget=20000  ← 让 setTimeout/异步跑完再 dump/截图
  --dump-dom <url>             ← 拿渲染后的 HTML
  --screenshot=<png> --window-size=1400,1600  ← 截图
  --hide-scrollbars            ← 截图时用
```

**双宽度技巧**：把被测页放进自检页的 `<iframe>`，iframe 宽度设 1400（桌面）和 390（手机）——iframe 内是独立视口，media query 按 iframe 宽度生效，一次跑完全部页面 × 全部宽度。自检页放 `<项目>/.workbuddy/_selfcheck.html`（同源、已被 .gitignore 挡住、不进仓库），结果 JSON 写进 `<pre id="out">`，用 --dump-dom 抓回来解析。

每个 iframe 的检查项：`documentElement.scrollWidth > clientWidth`（横向溢出）、`body.innerText.length`（渲染出了内容）、`window.__err`（页面自己的错误捕获，前提是被测页面有 onerror 兜底）。

**五个必踩的坑**：
- iframe 里的相对路径会以自检页所在目录解析 → src 必须写绝对路径 `/index.html`，否则全部 404。**（2026-09-24 又踩一次：探针页放 `.workbuddy/` 下时写 `f.src='today.html'`，实际请求到 `.workbuddy/today.html` → 404。凡 iframe/跳转一律 `/xxx.html`。）**
- 若被测页面有"先显示加载态、延时再渲染"的设计（如 450ms），抓取延时必须大于它（用 ≥1200ms），否则全误报"卡在加载中"。
- **`--virtual-time-budget` 会快进 `Date.now()` 和 `setTimeout`**：探针里用"`Date.now() - t0 > 6000`"判断等待超时，会在虚拟时钟下**瞬间到期**，页面还没渲染就报"找不到元素"（本次实测：真实渲染没问题，纯粹是超时判断被快进）。**等待逻辑一律用「轮询次数上限」而不是时间**，例如 `waitFor(fn, cb, 400)` 每 25ms 轮一次、轮完 400 次才判失败。同理，页面内以 `Date.now()` 算耗时的地方在 headless 下都不可信。
- **`--window-size` 有最小宽度（本机实测 360 被撑到 504）**：想截手机宽度必须走 iframe（iframe 宽度就是独立视口，media query 按它生效），直接用 `--window-size=360,1400` 截出来的固定是 360×1400 的 PNG，但里面是 504px 视口的内容被裁掉右半边——**看着像横向溢出，其实是假的**。判溢出永远以 iframe 里的 `documentElement.scrollWidth > clientWidth` 为准，不看图。
- **Edge/Chrome 在 MSYS bash 里必须给 Windows 路径**：`--user-data-dir=/c/Users/...` 和 `--screenshot=/c/...` 会静默不产出文件（退出码还是 0）；要写 `C:/Users/...`。命令里加 `2>&1` 别用 `2>/dev/null`，否则连报错都看不见。

**验证"有数据"状态（截图用）**：写一个 `_seed.html`（同样放 .workbuddy 下），往 localStorage 写入示例数据后 `location.replace('/真实页面.html')`，用 --screenshot 截它。因为用的是临时 user-data-dir，不会碰用户自己浏览器的真实数据。

**边界场景注入断言（比"看一眼"硬，比单元测试真）**：当页面行为取决于 localStorage 里的**数据形态**（连续 / 中断 N 天 / 首日 / 空 / 坏数据），只截"有数据"一张图是不够的——要造多场景逐条断言。

做法（`.workbuddy/_gap.html` 模式）：
1. 自检页里写 `seed(records)` 函数 → `localStorage.setItem('app.xxx', JSON.stringify(...))`；日期用 `dstr(off)` 按"今天 ± N 天"生成，不要写死日期。
2. `load('/被测页.html')` 返回 Promise，内部建 `<iframe>` 并 `onload` + `setTimeout(res, 1300)`（**必须大于页面的加载态延时**，否则全误报）。
3. 从 iframe 里取值断言：`f.contentDocument.getElementById('x').textContent`，判断 `contains('上次写到')` 之类。
4. 多场景 for 循环，每轮 `f.remove()` + 短暂 `await wait(120)`，结果 + `通过 x / 失败 y` 写进 `<pre id="out">`，`--dump-dom` 抓回。`--virtual-time-budget` 给足（5 场景取 40000）。

**边界场景截图**：`_gapseed.html` 只写数据**不跳转**（跳转会截不到），然后另起一次 `--screenshot` 打开被测页；两次调用共用同一个 `--user-data-dir`，localStorage 才会带过去。

**为什么值得做**：这次给"中断友好首屏"改页头徽标，5 个场景断言一次跑出「中断 5 天 → 上次写到 9月19日 / 连续 → 第 13 天 / 首日 → 第 13 天」全对，比人工点 5 遍可靠——而且**改逻辑时能立刻看出哪一类被改坏了**。

## 三、纪律

- 自检发现的任何非零项：先判断是 bug 还是误报（读代码确认），修复后必须重跑全套。
- 自检脚本本身的误报要消除（如 decompose 的 active 例外写进逻辑），否则以后每次都是噪音。
- 提交前六项全绿 + 12 项渲染全过才允许 commit。
- 本工作流每次使用后若发现新的检查盲区（如导航一致性），当场补进脚本第 N 项，不要等下次踩坑。
