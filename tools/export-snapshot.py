#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发布前数据快照：把线上两张表全量导成 JSON，作为「能真的灌回去」的备份资产。

只读脚本。只发 GET，一行线上数据都不改。

用法：
    python tools/export-snapshot.py                 # 存到 _本地归档/<今天>-发布快照\
    python tools/export-snapshot.py <输出目录>

产出：
    plan_days.json   全量（含回收站里已软删的行）
    checkins.json    全量
    manifest.json    导出时间、环境、每张表行数与日期范围、文件 sha256
"""

import os
import sys
import json
import time
import hashlib
import datetime
import urllib.request
import urllib.error

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ENV_ID = "victor-1a2b3c4d-d5fmr5rn115087c8"
GW = "https://%s.api.tcloudbasegateway.com/v1/rdb/rest" % ENV_ID
TOKEN_FILE = os.path.join(ROOT, "_local", "密钥", "锚点-访问密钥.txt")
TOKEN_LINE = 6          # 1 起数，第 6 行是服务端 API Key 的值
TABLES = ("plan_days", "checkins")
PAGE = 1000             # 网关单页上限，取满一页就翻下一页


def read_token():
    """从本机凭据文件读服务端 API Key。读不到就返回 None，不打印文件内容。"""
    if not os.path.exists(TOKEN_FILE):
        return None
    with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()
    if len(lines) < TOKEN_LINE:
        return None
    tok = lines[TOKEN_LINE - 1].strip()
    return tok or None


def http_get(url, headers):
    """返回 (status, text, content_range)。status 为 None 表示连不上。"""
    req = urllib.request.Request(url, method="GET")
    for k, v in headers.items():
        req.add_header(k, v)
    # 本机可能配了代理，直连腾讯云必须绕开，否则拿到的不是真实返回
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace'), r.headers.get('Content-Range', '')
    except urllib.error.HTTPError as e:
        try:
            txt = e.read().decode('utf-8', 'replace')
        except Exception:
            txt = ''
        return e.code, txt, ''
    except Exception as e:
        return None, str(e), ''


def fetch_table(table, headers):
    """分页取全量。返回 (rows, err)。"""
    rows = []
    start = 0
    while True:
        hdr = dict(headers)
        hdr["Range"] = "%d-%d" % (start, start + PAGE - 1)
        url = "%s/%s?select=*" % (GW, table)
        st, txt, _ = http_get(url, hdr)
        if st is None:
            return None, "连不上：%s" % txt[:120]
        if st in (401, 403):
            return None, "网关返回 %s，服务端 API Key 失效，去控制台重建" % st
        if st != 200 and st != 206:
            return None, "网关返回 %s：%s" % (st, txt[:160])
        try:
            chunk = json.loads(txt)
        except Exception:
            return None, "返回不是 JSON：%s" % txt[:160]
        if not isinstance(chunk, list):
            return None, "返回不是数组：%s" % txt[:160]
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        start += PAGE
        if start > 50000:      # 兜底，防止网关不认 Range 导致死循环
            return None, "翻页超过 50 页仍没取完，停下来查网关"
    return rows, None


def date_range(rows):
    vals = [r.get('date') for r in rows if isinstance(r, dict) and r.get('date')]
    if not vals:
        return None
    vals = sorted(str(v) for v in vals)
    return vals[0], vals[-1]


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for blk in iter(lambda: f.read(65536), b''):
            h.update(blk)
    return h.hexdigest()


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else None
    if out_dir is None:
        today = datetime.date.today().isoformat()
        out_dir = os.path.join(ROOT, "_本地归档", "%s-v1.0发布快照" % today)
    os.makedirs(out_dir, exist_ok=True)

    tok = read_token()
    if not tok:
        print("FAIL 没读到本机凭证：%s 第 %d 行" % (os.path.relpath(TOKEN_FILE, ROOT), TOKEN_LINE))
        return 1
    headers = {"Authorization": "Bearer " + tok, "apikey": tok,
               "Accept": "application/json"}

    started = time.time()
    t0 = datetime.datetime.now()
    print("数据快照导出")
    print("  时间：%s" % t0.strftime("%Y-%m-%d %H:%M:%S"))
    print("  网关：%s" % GW)
    print("  输出：%s" % out_dir)
    print("")

    manifest = {
        "exported_at": t0.isoformat(timespec='seconds'),
        "env_id": ENV_ID,
        "gateway": GW,
        "mode": "read-only GET，未做任何写操作",
        "tables": {},
    }
    bad = 0
    for table in TABLES:
        rows, err = fetch_table(table, headers)
        if err:
            print("  FAIL %-10s %s" % (table, err))
            bad += 1
            continue
        path = os.path.join(out_dir, table + ".json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
        rng = date_range(rows)
        deleted = sum(1 for r in rows if isinstance(r, dict) and r.get('is_deleted'))
        manifest["tables"][table] = {
            "rows": len(rows),
            "file": os.path.basename(path),
            "bytes": os.path.getsize(path),
            "sha256": sha256_of(path),
            "date_range": list(rng) if rng else None,
            "is_deleted_rows": deleted,
        }
        print("  PASS %-10s %d 行，%s，日期 %s，其中回收站内 %d 行" % (
            table, len(rows),
            "%.1f KB" % (os.path.getsize(path) / 1024.0),
            ("%s ~ %s" % rng) if rng else "无日期字段",
            deleted))

    if bad:
        print("\n导出未完成：%d 张表失败" % bad)
        return 1

    mpath = os.path.join(out_dir, "manifest.json")
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("")
    print("清单：%s" % os.path.basename(mpath))
    print("耗时 %.1f 秒。这堆文件就是「数据被误删后能灌回去」的那份备份。" % (time.time() - started))
    return 0


if __name__ == "__main__":
    sys.exit(main())
