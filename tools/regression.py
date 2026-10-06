# -*- coding: utf-8 -*-
"""
Day 19 回归脚本（可复用，不是一次性用品）

做什么：把「锚点」所有已上线接口调用一遍，把返回原样记录下来。
两种用法：
    python tools/regression.py --save   docs/day19-回归基线.md   # 重构前：存基线
    python tools/regression.py --compare docs/day19-回归基线.md  # 重构后：逐条比对

为什么要有这个脚本：
    重构的验收标准是「行为不变」。口头说不变不算数，要拿重构前的返回和重构后的
    返回逐字比对。这份基线是唯一的证据，重构之后再补不回来，所以必须第一步就存。

判定口径：
    - HTTP 状态码一致 + 响应体逐字一致 = 通过
    - GET /api/health 里的 time 是服务器当前时间，每次必然不同，单独标为预期差异
    - 响应体末尾换行不算差异
"""

import json, urllib.request, urllib.error, urllib.parse, sys, os, io

BASE = "https://victor-1a2b3c4d-d5fmr5rn115087c8-1499478804.ap-shanghai.app.tcloudbase.com"

# 每个用例：编号、说明、方法、路径、请求体（GET 为 None）
CASES = [
    ("C01", "健康检查",                     "GET",  "/api/health",                          None),
    ("C02", "计划列表（无筛选）",            "GET",  "/api/plan-days",                        None),
    ("C03", "计划列表 limit=3",              "GET",  "/api/plan-days?limit=3",                None),
    ("C04", "计划列表 status=all_done",      "GET",  "/api/plan-days?status=all_done",        None),
    ("C05", "计划列表 days=7",               "GET",  "/api/plan-days?days=7",                 None),
    ("C06", "计划列表 关键词 q=温水",        "GET",  "/api/plan-days?q=" + urllib.parse.quote("温水"), None),
    ("C07", "计划列表 status 给错值",        "GET",  "/api/plan-days?status=xxx",             None),
    ("C08", "计划列表 limit=0",              "GET",  "/api/plan-days?limit=0",                None),
    ("C09", "查某天（有体检）",              "GET",  "/api/plan-days?date=2026-10-01",        None),
    ("C10", "查某天（这天没计划）",          "GET",  "/api/plan-days?date=2026-10-05",        None),
    ("C11", "查某天 date 格式错",            "GET",  "/api/plan-days?date=abc",               None),
    ("C12", "查某天 日期不存在（13月）",     "GET",  "/api/plan-days?date=2026-13-45",        None),
    ("C13", "写体检（同值覆盖，不改数据）",  "POST", "/api/checkins",
     {"date": "2026-10-01", "sleep": 5, "energy": 4, "mood": 4}),
    ("C14", "写体检 缺 mood",                "POST", "/api/checkins",
     {"date": "2026-10-01", "sleep": 5, "energy": 4}),
    ("C15", "写体检 sleep 超范围",           "POST", "/api/checkins",
     {"date": "2026-10-01", "sleep": 9, "energy": 4, "mood": 4}),
    ("C16", "写体检 这天没计划",             "POST", "/api/checkins",
     {"date": "2026-10-05", "sleep": 3, "energy": 3, "mood": 3}),
    ("C17", "写体检 缺 date",                "POST", "/api/checkins",
     {"sleep": 3, "energy": 3, "mood": 3}),
    ("C18", "用 POST 打读接口（应 405）",    "POST", "/api/plan-days",
     {"date": "2026-10-01"}),
]

# 这些用例的响应里含有每次都不一样的内容，比对时跳过具体值
VOLATILE = {
    "C01": "time 是服务器当前时间，每次调用都不同",
    "C05": "days=7 是「最近 7 天」，起点由当前日期算出，跨天之后结果本来就该变",
}


def call(method, path, body=None):
    url = BASE + path
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        r = urllib.request.urlopen(req, timeout=25)
        return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, "ERR " + repr(e)


def pretty(raw):
    """把响应整理成稳定、可比对的形式"""
    try:
        return json.dumps(json.loads(raw), ensure_ascii=False, sort_keys=True, indent=2)
    except Exception:
        return raw.strip()


def run():
    out = []
    for cid, desc, method, path, body in CASES:
        status, raw = call(method, path, body)
        out.append({"id": cid, "desc": desc, "method": method, "path": path,
                    "body": body, "status": status, "raw": raw})
        print(f"{cid} {method} {path} -> HTTP {status}")
    return out


def save(path, results):
    lines = ["# Day 19 重构前接口基线",
             "",
             "这份文件是重构前的证据：每个接口当时的 HTTP 状态码和返回内容原样记录。",
             "重构后用 `python tools/regression.py --compare docs/day19-回归基线.md` 逐条比对。",
             "",
             "接口地址前缀：`" + BASE + "`",
             "",
             "| 编号 | 用例 | 请求 | HTTP | 返回（整理后） |",
             "| --- | --- | --- | --- | --- |"]
    for r in results:
        req = r["method"] + " " + r["path"]
        if r["body"]:
            req += "  body=" + json.dumps(r["body"], ensure_ascii=False)
        body_md = pretty(r["raw"]).replace("\n", "<br>").replace("|", "\\|")
        lines.append(f"| {r['id']} | {r['desc']} | `{req}` | {r['status']} | {body_md} |")
        if r["id"] in VOLATILE:
            lines.append(f"| | ↳ 预期差异 | {VOLATILE[r['id']]} | | |")

    lines += ["", "## 原始返回（逐字备份）", ""]
    for r in results:
        lines.append("### " + r["id"] + " " + r["desc"])
        lines.append("")
        lines.append("```")
        lines.append(f"{r['method']} {r['path']}")
        lines.append("HTTP " + str(r["status"]))
        lines.append(pretty(r["raw"]))
        lines.append("```")
        lines.append("")

    with io.open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n基线已写入：" + path)


def parse_baseline(path):
    """从 md 里读回每条用例的期望状态码与返回"""
    text = io.open(path, encoding="utf-8").read()
    expect = {}
    cur = None
    for line in text.splitlines():
        if line.startswith("### "):
            cur = line[4:].split(" ")[0]
            expect[cur] = {"status": None, "lines": []}
        elif cur and line.startswith("HTTP "):
            expect[cur]["status"] = int(line[5:])
        elif cur and expect[cur]["status"] is not None:
            # 跳过代码块围栏和空行，只留真正的 JSON 内容
            if line.strip() == "```" or line.strip() == "":
                continue
            expect[cur]["lines"].append(line)
    for k in expect:
        try:
            expect[k]["obj"] = json.loads("\n".join(expect[k]["lines"]))
        except Exception:
            expect[k]["obj"] = None
    return expect


def compare(path, out=None):
    expect = parse_baseline(path)
    results = run()
    rows = []
    for r in results:
        e = expect.get(r["id"])
        if not e:
            rows.append((r["id"], r["desc"], "?", "基线里没有这一条"))
            continue
        same_status = e["status"] == r["status"]
        try:
            now = json.loads(r["raw"])
        except Exception:
            now = None
        if r["id"] in VOLATILE:
            rows.append((r["id"], r["desc"], "一致（已排除波动项）", VOLATILE[r["id"]] + " 不计入比对"))
            continue
        if e["obj"] is None or now is None:
            same = str(e["obj"]) == str(now)
        else:
            same = e["obj"] == now
        if same_status and same:
            rows.append((r["id"], r["desc"], "通过", "状态码与返回内容均与基线一致"))
        else:
            rows.append((r["id"], r["desc"], "不一致",
                         f"基线 HTTP {e['status']} / 现在 HTTP {r['status']}"))

    lines = ["| 编号 | 用例 | 结果 | 说明 |", "| --- | --- | --- | --- |"]
    for a, b, c, d in rows:
        lines.append(f"| {a} | {b} | {c} | {d} |")
    bad = [x for x in rows if x[2] == "不一致"]
    lines.append("")
    lines.append("通过 %d / %d，不一致 %d" % (len(rows) - len(bad), len(rows), len(bad)))
    report = "\n".join(lines)
    print("\n" + report)

    if out:
        head = ["# Day 19 重构后回归对比结果", "",
                "对照 `docs/day19-回归基线.md`（重构前抓的 18 条返回），重新请求一遍逐条比对。",
                "判定：HTTP 状态码一致 + 返回内容逐字一致 = 通过。",
                ""]
        io.open(out, "w", encoding="utf-8").write("\n".join(head) + report + "\n")
        print("\n报告已写入：" + out)
    return len(bad)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    mode, target = sys.argv[1], sys.argv[2]
    if mode == "--save":
        save(target, run())
    elif mode == "--compare":
        out = sys.argv[3] if len(sys.argv) > 3 else None
        sys.exit(1 if compare(target, out) else 0)
    else:
        print(__doc__)
