#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
回滚演练探测：每隔几秒打一次公网和读接口，把每次的结果连时间戳记成 CSV。

为什么要这个脚本：演练的耗时不能靠人掐表，也不能靠嘴说。三个硬数据
（回滚前的时间、恢复可用的时间、总耗时）必须来自机器记的流水，别人拿
CSV 也能对得上。

用法：
    python tools/rollback-watch.py --out "<输出csv>" --minutes 20
    python tools/rollback-watch.py --once          # 只打一次，用于确认基线

Ctrl+C 提前结束不影响，已经写的行都留着。
"""

import os
import re
import sys
import csv
import time
import json
import argparse
import datetime
import urllib.request
import urllib.error

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ENV_ID = "victor-1a2b3c4d-d5fmr5rn115087c8"
FRONT = "https://%s-1499478684.tcloudbaseapp.com" % ENV_ID
BASE = "https://%s-1499478804.ap-shanghai.app.tcloudbase.com" % ENV_ID


def http_get(url, timeout=15):
    """返回 (status, text)。status 为 None 表示连不上。"""
    req = urllib.request.Request(url, method="GET")
    req.add_header('Accept-Encoding', 'identity')   # 不压缩，免得字节数被压缩方式影响
    # 本机可能配了代理，直连腾讯云必须绕开，否则拿到的不是真实返回
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        try:
            txt = e.read().decode('utf-8', 'replace')
        except Exception:
            txt = ''
        return e.code, txt
    except Exception as e:
        return None, str(e)


def probe():
    """打一次公网首页加一次读接口，再打一次记录台判定版本，返回一行需要的七个值。

    为什么额外打 records.html：两版的首页 index.html 完全一样（都是 5017 字节），
    只打首页认不出版本。记录台不一样，v1.0 是 46512 字节，Day24 是 39625 字节，
    光看这个数就知道线上现在是哪一版。
    """
    st_home, txt_home = http_get(FRONT + "/dist/index.html")
    size, title, note = 0, "", ""
    if st_home == 200:
        size = len(txt_home)
        if "INVALID_HOST" in txt_home:
            note = "内容是 INVALID_HOST，域名被回收"
        else:
            m = re.search(r"<title>(.*?)</title>", txt_home, re.S)
            title = m.group(1).strip() if m else ""
    elif st_home is None:
        note = "连不上"

    st_api, txt_api = http_get(BASE + "/api/plan-days")
    matched = ""
    if st_api == 200:
        try:
            j = json.loads(txt_api)
            matched = (j.get("data") or {}).get("matched", "")
        except Exception:
            matched = "解析失败"

    # 版本判定靠内容特征，不靠字节数：CDN 对不同边缘节点返回的内容可能压缩方式不同，
    # 字节数会飘。fold-head 那条回收站折叠块只有 v1.0 有，Day24 没有，这个跑不掉。
    st_rec, txt_rec = http_get(FRONT + "/dist/records.html")
    rec_size = len(txt_rec) if st_rec == 200 else 0
    if st_rec != 200:
        ver = "不可达"
    else:
        has_fold = "fold-head" in txt_rec
        has_headact = "head-act" in txt_rec
        has_card_go = "去今日" in txt_rec and not has_headact
        if has_fold and has_headact:
            ver = "v1.0"
        elif has_card_go and not has_fold:
            ver = "Day24"
        else:
            ver = "夹杂态(折叠:%s,右上:%s)" % ("有" if has_fold else "无", "有" if has_headact else "无")
    return st_home, size, title, st_api, matched, note, rec_size, ver


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="")
    ap.add_argument("--minutes", type=float, default=20.0)
    ap.add_argument("--interval", type=float, default=8.0)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()

    cols = ["时间", "首页状态", "首页字节", "首页标题", "接口状态", "matched", "备注", "记录台字节", "版本"]
    out = a.out
    if not out:
        out = os.path.join(os.getcwd(), "回滚探测日志.csv")

    def once_row():
        st_home, size, title, st_api, matched, note, rec_size, ver = probe()
        now = datetime.datetime.now().strftime("%H:%M:%S")
        with open(out, 'a', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            if f.tell() == 0:
                w.writerow(cols)
            w.writerow([now, st_home, size, title, st_api, matched, note, rec_size, ver])
        ok = (st_home == 200) and ("INVALID_HOST" not in note)
        print("%s  首页 %s（%s）  接口 %s matched=%s  记录台 %s 字节=%s  %s" % (
            now, st_home, "可用" if ok else "不可用", st_api, matched, rec_size, ver, note))
        return st_home, ver

    print("探测目标：%s" % (FRONT + "/dist/index.html"))
    print("日志文件：%s" % out)

    if a.once:
        once_row()
        return 0

    print("每 %.0f 秒一次，最多 %.0f 分钟。" % (a.interval, a.minutes))
    end = time.time() + a.minutes * 60
    last = None
    try:
        while time.time() < end:
            st_home, ver = once_row()
            if last is not None:
                if (st_home == 200) != (last[0] == 200):
                    print("    >>> 可用性变了：首页 %s -> %s，记下这个时刻" % (last[0], st_home))
                if ver != last[1]:
                    print("    >>> 版本切换：%s -> %s，记下这个时刻" % (last[1], ver))
            last = (st_home, ver)
            time.sleep(a.interval)
    except KeyboardInterrupt:
        print("提前结束。")
    print("日志留在：%s" % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
