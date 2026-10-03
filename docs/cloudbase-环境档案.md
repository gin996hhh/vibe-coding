# CloudBase 环境档案

按附录 M 第二部分要求：环境 ID、剩余额度、到期日期三项当天就记下来。查不到的时候翻这里。

## 一、环境三要素（作业要填的就是这三项）

| 项目 | 值 |
|---|---|
| 环境名 | victor-1a2b3c4d |
| **环境 ID** | `victor-1a2b3c4d-d5fmr5rn115087c8` |
| **剩余额度** | 资源点 3000 点（已用 0） |
| **到期日期** | **2027-04-02**（6 个月，2026-10-02 开通） |
| 地域 | 上海（ap-shanghai） |
| 套餐 | 云开发免费体验版 ¥0/月 |
| 是否开启按量计费 | **未开启**（免费体验版不支持加购资源包和开启按量付费） |

## 二、两个公网地址

| 用途 | 地址 |
|---|---|
| 前端页面 | https://anchor-victor-1a2b3c4d-d5fmr5rn115087c8.webapps.tcloudbase.com |
| 后端 /api/health | https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478804.ap-shanghai.app.tcloudbase.com/api/health |

⚠️ 前端用的是**新版应用部署域名**（`webapps.tcloudbase.com`）。部署日志里给的旧格式地址（`tcloudbaseapp.com`）会返回 HTTP 418，不要用。

## 三、控制台地图：哪天用哪个环节

| 环节 | 用到的天数 | 我们当前进度 |
|---|---|---|
| 云函数 | Day 15、17–19、22 | Day 15 已完成（health） |
| HTTP 访问服务 / HTTP 网关 | Day 15、Day 20（**CORS 跨域配置在这里**） | Day 15 已完成（路由 /api/health） |
| 静态网站托管 | Day 15、Day 20（重传真实数据版）、Day 26（回滚演练） | Day 15 已完成 |
| PostgreSQL 数据库 | Day 16、17–22、Day 27（数据导出） | Day 16 已完成（三张表） |
| 用量与费用 | Day 15、26、27 | Day 15 已记录 |

## 四、安全红线（附录 M 第四条，一条都不能碰）

- 不开启按量计费、预置并发、任何付费套餐 —— 当前未开启
- **数据库连接串和密钥只放环境变量**，不进代码、不进 Git、不进聊天 —— 目前还没连数据库，等 Day 17 接库时严格执行
- 到期前完成数据导出（方法见附录 E，在 Day 27 做）

## 五、到期前要做的三件事（现在就知道，别到时候抓瞎）

1. **免费续期任务**：控制台「套餐用量」页写着，到期前要「选平台发布内容 → 粘贴链接截图 → 验证通过」才能 0 元续期。**2027 年 3 月前处理**
2. **数据导出**：Day 27 按附录 E 导出数据库备份
3. **重新部署**：到期后公网地址失效，用「Day 27 导出的备份 + GitHub 仓库代码」在新环境重新部署即可恢复

一句话记住：**代码在 GitHub 永久保存，数据靠到期前导出的备份，公网地址是租来的、会到期。**

## 六、结营后

仓库已在个人账号 `gin996hhh/vibe-coding`，不需要从班级组织转移。

## 八、2026-10-03 更新（原文不动，本节是对上面第二节的更正与补充）

上面「二、两个公网地址」里的**前端地址已失效**（2026-10-02 删应用重点项目时被回收，返回 INVALID_HOST，救不回来）。按现行的：

| 用途 | 地址（2026-10-03 起） |
|---|---|
| 前端页面 | https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478684.tcloudbaseapp.com/anchor/ （尾巴 `/anchor/` 不能少；首次打开有测试域名风险提醒页，点继续） |
| GET 读计划 | https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478684.ap-shanghai.app.tcloudbase.com/api/plan-days |
| POST 写体检 | https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478684.ap-shanghai.app.tcloudbase.com/api/checkins |
| 健康接口 | https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478804.ap-shanghai.app.tcloudbase.com/api/health |

注意两个域名长得像但不是同一个：
- 静态托管域名 `…-1499478684.tcloudbaseapp.com`（**没有** ap-shanghai.app）
- 网关域名 `…-1499478684.ap-shanghai.app.tcloudbase.com`（**有** ap-shanghai.app）
读接口、写接口都挂在网关域名下。

Day 17、18 建的两个函数（plan-days、checkin）的配置细节、环境变量名、路由表、踩过的坑，另见：
`docs/deploy-云函数与网关配置清单.md`

## 七、一条流程提醒（附录 H 给的）

Day 20 前端要接真实接口，**CORS 跨域配置是在「HTTP 访问服务」里配的**。我们已经在 health 云函数代码里写了 CORS 响应头（代码层），到 Day 20 时再在网关层确认一次，两层都有更稳。
