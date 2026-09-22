# RUN.md｜锚点 MVP 运行说明

> Day 7 产出。这份文件只回答一件事：**怎么把它跑起来、怎么确认它真的在跑。**

---

## 一、怎么启动（一行命令）

打开 **PowerShell**，整段粘进去、按回车：

```powershell
& "C:\Users\gin99\.workbuddy\binaries\python\versions\3.13.12\python.exe" -m http.server 8000 --directory "C:\Users\gin99\Desktop\Vibe coding"
```

跑起来后窗口会停在：

```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

**这行字出现 = 服务器已开。** 这个窗口**不要关**（关了页面就打不开），用完再关。

> 备选（如果你自己装了 Python，且已加入 PATH）：
> `python -m http.server 8000 --directory "C:\Users\gin99\Desktop\Vibe coding"`

---

## 二、怎么打开（地址要带 `.html`）

浏览器地址栏输入下面**任意一条**（简写会在 Python 自带服务器上 404，必须带文件名）：

| 页面 | 地址 |
|---|---|
| 首页（F1 拆解入口） | http://localhost:8000/index.html |
| 三环拆解 | http://localhost:8000/decompose.html |
| 今日（F2 体检 + 锚点） | http://localhost:8000/today.html |
| 复盘（F3 复盘卡） | http://localhost:8000/reflect.html |
| 成长（F4 累积） | http://localhost:8000/growth.html |

也可以直接开 **http://localhost:8000/**（等于 index.html），之后用页面顶部的导航在四个页面之间跳。

**❌ 会 404 的写法**：`localhost:8000/today`、`localhost:8000/成长`、`localhost:8000/RUN.md`
（`/today` 这种"没有扩展名"的路径是 PRD 里的叫法，纯静态站点没有路由功能，落地就是 `today.html`。）

---

## 三、为什么必须走 localhost，不能双击文件

双击 `index.html` 打开时，地址栏是 `file://` 开头。**部分浏览器对 `file://` 页面封掉本地存储（localStorage）**——首页写进去的目标存不下来，三环页读不到就显示空。

代价对比：

| 打开方式 | 数据能不能存 | 能不能正常用 |
|---|---|---|
| `http://localhost:8000/...` | ✅ 能 | ✅ 正常 |
| 双击文件（`file://`） | ⚠️ 可能被禁 | 可能整条链路空转 |

**判断方法**：每个页面底部有一行灰色「诊断」字，它会自己报出病因：

- `存储被禁` → 你用的是 `file://`，改走 localhost
- `存储可用 ｜ 目标未读到` → 确实还没写过目标，去首页写一句
- `存储可用 ｜ 目标已读到 ｜ 三环已有` → 一切正常

---

## 四、走一遍完整流程（验证用，约 3 分钟）

1. **首页**写一句想做成的事（例：半年内英文口语能上台）→ 点「拆解」
2. **三环页**看到 状态 / 频率 / 方法 三段 → 点「去今日」
3. **今日页**三项体检各点一格（睡眠 / 精力 / 情绪）→ 点「生成今天的锚点」→ 得到早晚各 1 条 → 勾掉一条，看它变灰、底部计数变 1/2
4. **复盘页**四问填一遍 → 保存 → 刷新，选择会回显（同一天改完覆盖，不新增）
5. **成长页**看到连续天数、状态曲线、跟自己的过去比

**四个页面顶部导航都能互相跳** —— 一条链走通，就是 MVP 跑通了。

---

## 五、数据存在哪 / 怎么清空

- 数据**只存在你这台电脑的浏览器里**（localStorage，两个键：`anchor.goal`、`anchor.records`），**没有服务器、没有账号、没人能看到**。
- 换浏览器、换电脑、清缓存 → 记录就没了（这是 MVP 阶段的已知限制，见 `TECH_DESIGN.md` 第七节）。
- 想重置：浏览器按 **F12** → Console → 输入 `localStorage.clear()` → 回车，然后刷新。

---

## 六、将来怎么发到网上

`TECH_DESIGN.md` 定的路线是 **GitHub Pages**：把这个仓库（`gin996hhh/vibe-coding`）的 Pages 打开，`index.html` 就变成一个公开网址，手机也能打开。

⚠️ 注意：真上公网后，数据仍然只存在**每个访客自己的浏览器**里——你手机上看不到电脑上填的记录。跨设备是 Day 15 接 CloudBase 之后的事。
