# 锚点

一个记录「今天有没有做到」的小工具。早上定一个锚点，晚上定一个，做完就勾上，一天结束写一句复盘。唯一的参照物是你自己的过去。

## 页面

| 页面 | 干什么 |
|---|---|
| `index.html` | 首页 |
| `today.html` | 今天：锚点、体检、复盘 |
| `records.html` | 记录台：翻以前的日子，改、删、找回 |
| `growth.html` | 成长：看累计 |
| `decompose.html` | 拆解：把大目标拆成能做的事 |

数据存在浏览器 localStorage 和云端数据库两处。公网读云端，本地没网时读本机。

## 公网地址

- 页面：https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478684.tcloudbaseapp.com/dist/
- 接口：https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478804.ap-shanghai.app.tcloudbase.com/api/plan-days

首次打开会有腾讯测试域名的风险提醒页，点继续即可。

## 后端

三个云函数：`health`、`plan-days`、`checkins`，两张表 `plan_days` 和 `checkins`。接口长什么样以 `docs/api-contract.md` 为准，那份文档是仲裁物，代码和文档不一致时以文档为准、然后改代码。

云函数源码在 `cloudfunctions/`，数据访问层只有一份，在 `cloudfunctions/_shared/`，打包时分发进每个包。

## 发布前检查

```bash
python .workbuddy/skills/verify-project/verify.py
```

13 项，逐项 PASS / FAIL，每项留一行证据。退出码非 0 就是有 FAIL，别传。

检查项来自这个项目真实踩过的坑，不是通用模板。在对话里说「运行 verify-project」也能跑。详细说明见 `.workbuddy/skills/verify-project/SKILL.md`。

## 目录速查

| 目录 | 放什么 |
|---|---|
| `cloudfunctions/` | 云函数源码与共享数据访问层 |
| `js/` `css/` | 前端 |
| `db/` | 建表与改表脚本。注意 `schema.sql` 会先删表再建，只在空库上跑 |
| `docs/` | 契约、验收表、各天的记录 |
| `tools/` | 打包、回归、自检脚本 |
| `.workbuddy/skills/` | 项目 Skill，跟着仓库走 |

密钥不放仓库。真值只在两处：云函数的环境变量，和本机 `_local/`（已被 gitignore）。
