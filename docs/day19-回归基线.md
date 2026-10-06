# Day 19 重构前接口基线

这份文件是重构前的证据：每个接口当时的 HTTP 状态码和返回内容原样记录。
重构后用 `python tools/regression.py --compare docs/day19-回归基线.md` 逐条比对。

接口地址前缀：`https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478804.ap-shanghai.app.tcloudbase.com`

| 编号 | 用例 | 请求 | HTTP | 返回（整理后） |
| --- | --- | --- | --- | --- |
| C01 | 健康检查 | `GET /api/health` | 200 | {<br>  "ok": true,<br>  "service": "anchor",<br>  "time": "2026-10-05T14:19:15.326Z"<br>} |
| | ↳ 预期差异 | time 是服务器当前时间 | | |
| C02 | 计划列表（无筛选） | `GET /api/plan-days` | 200 | {<br>  "data": {<br>    "items": [<br>      {<br>        "date": "2026-10-03",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": false,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-10-02",<br>        "evening_anchor": "今晚写一句做到了什么",<br>        "evening_done": false,<br>        "morning_anchor": "早饭前写下今天唯一一件事",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-10-01",<br>        "evening_anchor": "复盘三行",<br>        "evening_done": true,<br>        "morning_anchor": "朗读 10 分钟",<br>        "morning_done": true,<br>        "review": "状态不错，多走了一站路"<br>      },<br>      {<br>        "date": "2026-09-30",<br>        "evening_anchor": "今晚写一句做到了什么",<br>        "evening_done": false,<br>        "morning_anchor": "早饭前写下今天唯一一件事",<br>        "morning_done": false,<br>        "review": "找\"今天\"那一栏时停了一下，标识不够明显"<br>      },<br>      {<br>        "date": "2026-09-29",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": true,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": true,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-09-28",<br>        "evening_anchor": "复盘三行",<br>        "evening_done": false,<br>        "morning_anchor": "朗读 10 分钟",<br>        "morning_done": true,<br>        "review": "开口的时候卡在第一个词，明天先把第一句练熟"<br>      }<br>    ],<br>    "matched": 6,<br>    "total": 6<br>  },<br>  "ok": true<br>} |
| C03 | 计划列表 limit=3 | `GET /api/plan-days?limit=3` | 200 | {<br>  "data": {<br>    "items": [<br>      {<br>        "date": "2026-10-03",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": false,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-10-02",<br>        "evening_anchor": "今晚写一句做到了什么",<br>        "evening_done": false,<br>        "morning_anchor": "早饭前写下今天唯一一件事",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-10-01",<br>        "evening_anchor": "复盘三行",<br>        "evening_done": true,<br>        "morning_anchor": "朗读 10 分钟",<br>        "morning_done": true,<br>        "review": "状态不错，多走了一站路"<br>      }<br>    ],<br>    "matched": 6,<br>    "total": 6<br>  },<br>  "ok": true<br>} |
| C04 | 计划列表 status=all_done | `GET /api/plan-days?status=all_done` | 200 | {<br>  "data": {<br>    "items": [<br>      {<br>        "date": "2026-10-01",<br>        "evening_anchor": "复盘三行",<br>        "evening_done": true,<br>        "morning_anchor": "朗读 10 分钟",<br>        "morning_done": true,<br>        "review": "状态不错，多走了一站路"<br>      },<br>      {<br>        "date": "2026-09-29",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": true,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": true,<br>        "review": null<br>      }<br>    ],<br>    "matched": 2,<br>    "total": 6<br>  },<br>  "ok": true<br>} |
| C05 | 计划列表 days=7 | `GET /api/plan-days?days=7` | 200 | {<br>  "data": {<br>    "items": [<br>      {<br>        "date": "2026-10-03",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": false,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-10-02",<br>        "evening_anchor": "今晚写一句做到了什么",<br>        "evening_done": false,<br>        "morning_anchor": "早饭前写下今天唯一一件事",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-10-01",<br>        "evening_anchor": "复盘三行",<br>        "evening_done": true,<br>        "morning_anchor": "朗读 10 分钟",<br>        "morning_done": true,<br>        "review": "状态不错，多走了一站路"<br>      },<br>      {<br>        "date": "2026-09-30",<br>        "evening_anchor": "今晚写一句做到了什么",<br>        "evening_done": false,<br>        "morning_anchor": "早饭前写下今天唯一一件事",<br>        "morning_done": false,<br>        "review": "找\"今天\"那一栏时停了一下，标识不够明显"<br>      },<br>      {<br>        "date": "2026-09-29",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": true,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": true,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-09-28",<br>        "evening_anchor": "复盘三行",<br>        "evening_done": false,<br>        "morning_anchor": "朗读 10 分钟",<br>        "morning_done": true,<br>        "review": "开口的时候卡在第一个词，明天先把第一句练熟"<br>      }<br>    ],<br>    "matched": 6,<br>    "total": 6<br>  },<br>  "ok": true<br>} |
| C06 | 计划列表 关键词 q=温水 | `GET /api/plan-days?q=%E6%B8%A9%E6%B0%B4` | 200 | {<br>  "data": {<br>    "items": [<br>      {<br>        "date": "2026-10-03",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": false,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": false,<br>        "review": null<br>      },<br>      {<br>        "date": "2026-09-29",<br>        "evening_anchor": "拉伸 5 分钟",<br>        "evening_done": true,<br>        "morning_anchor": "多喝温水",<br>        "morning_done": true,<br>        "review": null<br>      }<br>    ],<br>    "matched": 2,<br>    "total": 6<br>  },<br>  "ok": true<br>} |
| C07 | 计划列表 status 给错值 | `GET /api/plan-days?status=xxx` | 400 | {<br>  "error": {<br>    "code": "INVALID_STATUS",<br>    "message": "status 只能是 all / some / all_done / none 这四个，你给的是「xxx」"<br>  },<br>  "ok": false<br>} |
| C08 | 计划列表 limit=0 | `GET /api/plan-days?limit=0` | 400 | {<br>  "error": {<br>    "code": "INVALID_LIMIT",<br>    "message": "limit 只能是 1 到 100 的整数，你给的是「0」"<br>  },<br>  "ok": false<br>} |
| C09 | 查某天（有体检） | `GET /api/plan-days?date=2026-10-01` | 200 | {<br>  "data": {<br>    "checkin": {<br>      "energy": 4,<br>      "mood": 4,<br>      "sleep": 5<br>    },<br>    "date": "2026-10-01",<br>    "evening_anchor": "复盘三行",<br>    "evening_done": true,<br>    "morning_anchor": "朗读 10 分钟",<br>    "morning_done": true,<br>    "review": "状态不错，多走了一站路"<br>  },<br>  "ok": true<br>} |
| C10 | 查某天（这天没计划） | `GET /api/plan-days?date=2026-10-05` | 404 | {<br>  "error": {<br>    "code": "DATE_NOT_FOUND",<br>    "message": "2026-10-05 这天还没有计划，plan_days 表里没有这一天的记录。"<br>  },<br>  "ok": false<br>} |
| C11 | 查某天 date 格式错 | `GET /api/plan-days?date=abc` | 400 | {<br>  "error": {<br>    "code": "INVALID_DATE",<br>    "message": "date 必须是 YYYY-MM-DD 这样的日期，你给的是「abc」"<br>  },<br>  "ok": false<br>} |
| C12 | 查某天 日期不存在（13月） | `GET /api/plan-days?date=2026-13-45` | 500 | {<br>  "error": {<br>    "code": "PLAN_DAYS_READ_FAILED",<br>    "message": "读这一天的记录失败，原因已记在云函数日志里。"<br>  },<br>  "ok": false<br>} |
| C13 | 写体检（同值覆盖，不改数据） | `POST /api/checkins  body={"date": "2026-10-01", "sleep": 5, "energy": 4, "mood": 4}` | 200 | {<br>  "data": {<br>    "created_at": "2026-10-02T13:36:15.238319+08:00",<br>    "date": "2026-10-01",<br>    "energy": 4,<br>    "mood": 4,<br>    "sleep": 5<br>  },<br>  "ok": true<br>} |
| C14 | 写体检 缺 mood | `POST /api/checkins  body={"date": "2026-10-01", "sleep": 5, "energy": 4}` | 400 | {<br>  "error": {<br>    "code": "FIELD_MISSING",<br>    "message": "缺少 mood（心情）这一项"<br>  },<br>  "ok": false<br>} |
| C15 | 写体检 sleep 超范围 | `POST /api/checkins  body={"date": "2026-10-01", "sleep": 9, "energy": 4, "mood": 4}` | 400 | {<br>  "error": {<br>    "code": "INVALID_RANGE",<br>    "message": "睡眠只能是 1 到 5 的整数，你给的是「9」"<br>  },<br>  "ok": false<br>} |
| C16 | 写体检 这天没计划 | `POST /api/checkins  body={"date": "2026-10-05", "sleep": 3, "energy": 3, "mood": 3}` | 400 | {<br>  "error": {<br>    "code": "PLAN_DAY_NOT_FOUND",<br>    "message": "2026-10-05 这天还没有计划（plan_days 表里没有这一天）。体检记录要挂在某一天的计划上，先写计划再打卡。"<br>  },<br>  "ok": false<br>} |
| C17 | 写体检 缺 date | `POST /api/checkins  body={"sleep": 3, "energy": 3, "mood": 3}` | 400 | {<br>  "error": {<br>    "code": "DATE_MISSING",<br>    "message": "缺少 date（日期）这一项，格式要像 2026-10-03"<br>  },<br>  "ok": false<br>} |
| C18 | 用 POST 打读接口（应 405） | `POST /api/plan-days  body={"date": "2026-10-01"}` | 405 | {<br>  "error": {<br>    "code": "METHOD_NOT_ALLOWED",<br>    "message": "这个接口只接受 GET，你发的是 POST"<br>  },<br>  "ok": false<br>} |

## 原始返回（逐字备份）

### C01 健康检查

```
GET /api/health
HTTP 200
{
  "ok": true,
  "service": "anchor",
  "time": "2026-10-05T14:19:15.326Z"
}
```

### C02 计划列表（无筛选）

```
GET /api/plan-days
HTTP 200
{
  "data": {
    "items": [
      {
        "date": "2026-10-03",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": false,
        "morning_anchor": "多喝温水",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-10-02",
        "evening_anchor": "今晚写一句做到了什么",
        "evening_done": false,
        "morning_anchor": "早饭前写下今天唯一一件事",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-10-01",
        "evening_anchor": "复盘三行",
        "evening_done": true,
        "morning_anchor": "朗读 10 分钟",
        "morning_done": true,
        "review": "状态不错，多走了一站路"
      },
      {
        "date": "2026-09-30",
        "evening_anchor": "今晚写一句做到了什么",
        "evening_done": false,
        "morning_anchor": "早饭前写下今天唯一一件事",
        "morning_done": false,
        "review": "找\"今天\"那一栏时停了一下，标识不够明显"
      },
      {
        "date": "2026-09-29",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": true,
        "morning_anchor": "多喝温水",
        "morning_done": true,
        "review": null
      },
      {
        "date": "2026-09-28",
        "evening_anchor": "复盘三行",
        "evening_done": false,
        "morning_anchor": "朗读 10 分钟",
        "morning_done": true,
        "review": "开口的时候卡在第一个词，明天先把第一句练熟"
      }
    ],
    "matched": 6,
    "total": 6
  },
  "ok": true
}
```

### C03 计划列表 limit=3

```
GET /api/plan-days?limit=3
HTTP 200
{
  "data": {
    "items": [
      {
        "date": "2026-10-03",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": false,
        "morning_anchor": "多喝温水",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-10-02",
        "evening_anchor": "今晚写一句做到了什么",
        "evening_done": false,
        "morning_anchor": "早饭前写下今天唯一一件事",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-10-01",
        "evening_anchor": "复盘三行",
        "evening_done": true,
        "morning_anchor": "朗读 10 分钟",
        "morning_done": true,
        "review": "状态不错，多走了一站路"
      }
    ],
    "matched": 6,
    "total": 6
  },
  "ok": true
}
```

### C04 计划列表 status=all_done

```
GET /api/plan-days?status=all_done
HTTP 200
{
  "data": {
    "items": [
      {
        "date": "2026-10-01",
        "evening_anchor": "复盘三行",
        "evening_done": true,
        "morning_anchor": "朗读 10 分钟",
        "morning_done": true,
        "review": "状态不错，多走了一站路"
      },
      {
        "date": "2026-09-29",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": true,
        "morning_anchor": "多喝温水",
        "morning_done": true,
        "review": null
      }
    ],
    "matched": 2,
    "total": 6
  },
  "ok": true
}
```

### C05 计划列表 days=7

```
GET /api/plan-days?days=7
HTTP 200
{
  "data": {
    "items": [
      {
        "date": "2026-10-03",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": false,
        "morning_anchor": "多喝温水",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-10-02",
        "evening_anchor": "今晚写一句做到了什么",
        "evening_done": false,
        "morning_anchor": "早饭前写下今天唯一一件事",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-10-01",
        "evening_anchor": "复盘三行",
        "evening_done": true,
        "morning_anchor": "朗读 10 分钟",
        "morning_done": true,
        "review": "状态不错，多走了一站路"
      },
      {
        "date": "2026-09-30",
        "evening_anchor": "今晚写一句做到了什么",
        "evening_done": false,
        "morning_anchor": "早饭前写下今天唯一一件事",
        "morning_done": false,
        "review": "找\"今天\"那一栏时停了一下，标识不够明显"
      },
      {
        "date": "2026-09-29",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": true,
        "morning_anchor": "多喝温水",
        "morning_done": true,
        "review": null
      },
      {
        "date": "2026-09-28",
        "evening_anchor": "复盘三行",
        "evening_done": false,
        "morning_anchor": "朗读 10 分钟",
        "morning_done": true,
        "review": "开口的时候卡在第一个词，明天先把第一句练熟"
      }
    ],
    "matched": 6,
    "total": 6
  },
  "ok": true
}
```

### C06 计划列表 关键词 q=温水

```
GET /api/plan-days?q=%E6%B8%A9%E6%B0%B4
HTTP 200
{
  "data": {
    "items": [
      {
        "date": "2026-10-03",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": false,
        "morning_anchor": "多喝温水",
        "morning_done": false,
        "review": null
      },
      {
        "date": "2026-09-29",
        "evening_anchor": "拉伸 5 分钟",
        "evening_done": true,
        "morning_anchor": "多喝温水",
        "morning_done": true,
        "review": null
      }
    ],
    "matched": 2,
    "total": 6
  },
  "ok": true
}
```

### C07 计划列表 status 给错值

```
GET /api/plan-days?status=xxx
HTTP 400
{
  "error": {
    "code": "INVALID_STATUS",
    "message": "status 只能是 all / some / all_done / none 这四个，你给的是「xxx」"
  },
  "ok": false
}
```

### C08 计划列表 limit=0

```
GET /api/plan-days?limit=0
HTTP 400
{
  "error": {
    "code": "INVALID_LIMIT",
    "message": "limit 只能是 1 到 100 的整数，你给的是「0」"
  },
  "ok": false
}
```

### C09 查某天（有体检）

```
GET /api/plan-days?date=2026-10-01
HTTP 200
{
  "data": {
    "checkin": {
      "energy": 4,
      "mood": 4,
      "sleep": 5
    },
    "date": "2026-10-01",
    "evening_anchor": "复盘三行",
    "evening_done": true,
    "morning_anchor": "朗读 10 分钟",
    "morning_done": true,
    "review": "状态不错，多走了一站路"
  },
  "ok": true
}
```

### C10 查某天（这天没计划）

```
GET /api/plan-days?date=2026-10-05
HTTP 404
{
  "error": {
    "code": "DATE_NOT_FOUND",
    "message": "2026-10-05 这天还没有计划，plan_days 表里没有这一天的记录。"
  },
  "ok": false
}
```

### C11 查某天 date 格式错

```
GET /api/plan-days?date=abc
HTTP 400
{
  "error": {
    "code": "INVALID_DATE",
    "message": "date 必须是 YYYY-MM-DD 这样的日期，你给的是「abc」"
  },
  "ok": false
}
```

### C12 查某天 日期不存在（13月）

```
GET /api/plan-days?date=2026-13-45
HTTP 500
{
  "error": {
    "code": "PLAN_DAYS_READ_FAILED",
    "message": "读这一天的记录失败，原因已记在云函数日志里。"
  },
  "ok": false
}
```

### C13 写体检（同值覆盖，不改数据）

```
POST /api/checkins
HTTP 200
{
  "data": {
    "created_at": "2026-10-02T13:36:15.238319+08:00",
    "date": "2026-10-01",
    "energy": 4,
    "mood": 4,
    "sleep": 5
  },
  "ok": true
}
```

### C14 写体检 缺 mood

```
POST /api/checkins
HTTP 400
{
  "error": {
    "code": "FIELD_MISSING",
    "message": "缺少 mood（心情）这一项"
  },
  "ok": false
}
```

### C15 写体检 sleep 超范围

```
POST /api/checkins
HTTP 400
{
  "error": {
    "code": "INVALID_RANGE",
    "message": "睡眠只能是 1 到 5 的整数，你给的是「9」"
  },
  "ok": false
}
```

### C16 写体检 这天没计划

```
POST /api/checkins
HTTP 400
{
  "error": {
    "code": "PLAN_DAY_NOT_FOUND",
    "message": "2026-10-05 这天还没有计划（plan_days 表里没有这一天）。体检记录要挂在某一天的计划上，先写计划再打卡。"
  },
  "ok": false
}
```

### C17 写体检 缺 date

```
POST /api/checkins
HTTP 400
{
  "error": {
    "code": "DATE_MISSING",
    "message": "缺少 date（日期）这一项，格式要像 2026-10-03"
  },
  "ok": false
}
```

### C18 用 POST 打读接口（应 405）

```
POST /api/plan-days
HTTP 405
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "这个接口只接受 GET，你发的是 POST"
  },
  "ok": false
}
```
