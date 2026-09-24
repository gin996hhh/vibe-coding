---
name: day-completion-table
description: 为 Victor 的 28 天 VibeCoding 打卡计划生成"Day X 收工完成情况"图片（群打卡用）。当 Victor 说"给我完成情况表 / 打卡表 / Day X 表"时触发。
---

# Day X 完成情况表出图

## 背景
Victor 每天要在微信群发一张"作业完成情况"图。群里公认版式是**分板块卡片**结构（验收项 / 状态 / 说明 三列）。风格已定：清新浅色 + 莫兰迪色，竖版适合手机看。Day 1 第二版已获 Victor 认可。

## 固定参数（不要重问）
- 风格：清新浅色 + 莫兰迪色（sage green / dusty rose / warm beige 点缀），奶油底
- 尺寸：1024x1536（竖版 3:4，群里放大能看清）
- 质量：high
- 输出目录：`C:\Users\gin99\Desktop\Vibe coding\.workbuddy\outputs`
- 每次出图消耗 5-10 算力，出图前要提醒 Victor 一次

## 版式（Day 1 定稿）
- 大标题：`Day {DAY} 收工，完成情况如下` + 副标题（日期 · Vibe Coding 学习打卡 · 项目：Vibe coding（锚点））
- 2-3 个板块，每块一个圆角卡片表，列固定：**验收项 / 状态 / 说明**
- Day 1 的三块：✅ 今日验收清单（WorkBuddy/Git/Node.js/GitHub 账号）｜📁 工作区 + 规则文件｜💬 概念理解（每日一问）
- 后续天按当天清单的「完成标准」自然分块
- 页脚：`今日投入 XX–XX min · Day X / 28`

## 流程
1. 先在对话里列出各板块的「验收项 / 状态 / 说明」内容，**等 Victor 确认内容无误**再出图（内容错了重出费算力）
2. 调 ImageGen 生成图
3. 用 Read 工具打开图，检查中文是否渲染正常（有无花字、乱码）
4. 正常 → present_files 给 Victor；花字 → 重试一次，仍失败 → 改用 HTML 方案（Write 一个 HTML 表格文件让 Victor 自己截图）

## Prompt 模板（替换 {DAY} / {DATE} / {SECTIONS} / {用时}）

```
A vertical infographic poster, ratio 3:4 portrait (1024x1536). Background: very soft cream / off-white (#f7f3ed base), gentle Morandi color accents (sage green, dusty rose, warm beige). Style: clean modern designer, minimalist, large readable text, like a Notion/Linear marketing graphic.

Layout:
- Top header: large bold Chinese title "Day {DAY} 收工，完成情况如下". Smaller subtitle "{DATE} · Vibe Coding 学习打卡 · 项目：Vibe coding（锚点）". Thin sage-green divider.

- Then 2-3 separate section blocks, each with its own rounded-card table. Each section header has a small emoji and bold dark text. Table columns: 验收项 / 状态 / 说明.

{SECTIONS}   ← 每块格式：
Section k header: "✅ {板块名}". Table rows:
Row j: {验收项} | ✅ | {说明}

Each ✅ status is a small sage-green rounded badge with a white check mark inside. Cards have soft rounded corners, subtle shadow, alternating row backgrounds (off-white / pale cream). Chinese characters must render correctly and crisply, NOT garbled, NOT pinyin. Clean modern sans-serif Chinese font (思源黑体 style).

- Footer small subtle gray: "今日投入 {用时} min · Day {DAY} / 28"

No logos, no watermarks, no clutter. Ready to post in a learning group chat.
```

## 已知坑
- ImageGen 对中文渲染大部分情况 OK，但 prompt 里必须显式写 "Chinese characters must render correctly, NOT garbled, NOT pinyin"，否则容易出乱码
- 中文/带空格路径在 output_dir 里没问题（`Vibe coding` 已验证）
- Read 打开生成图就能肉眼检查中文，不要跳过这步
- 出图前内容必须先给 Victor 过目，Day 1 就因为没先确认结构重出了一版（平铺表 vs 分板块表）

## 项目背景速查
- 项目名：Vibe coding（锚点），工作区 `C:\Users\gin99\Desktop\Vibe coding\`
- Victor = 用户称呼；昆明；偏好逻辑链完整 + 术语交代所指
- 每天 21:00 前群里打卡：完成情况图 + 工作区截图 + 每日一问回答
- 每日一问在每日任务清单末尾
