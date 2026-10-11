# -*- coding: utf-8 -*-
"""
verify-project · 发布前检查（Day 25 建立）

做什么：把「锚点」项目真实踩过的坑固化成一份可执行清单，每次改完代码、
每次上传前跑一遍，逐项给出 PASS / FAIL / SKIP 和一行证据。

怎么跑（在项目根目录）：
    python .workbuddy/skills/verify-project/verify.py
    python .workbuddy/skills/verify-project/verify.py --local    # 只跑本地项，断网也能跑

退出码：全部 PASS 或 SKIP 时返回 0，只要有一项 FAIL 返回 1（方便以后接流水线）。

判定口径：只认客观量。HTTP 状态码、命中条数、文件哈希、命令返回码。
不出现「看起来正常」这种说法，每项必须留下一行可复现的证据。

检查项的来历写在同目录 SKILL.md 的「每一项防的是哪个坑」表里，改判定标准之前先看那张表。
"""

import json
import os
import re
import sys
import time
import socket
import hashlib
import subprocess
import urllib.request
import urllib.error

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ---------- 路径 ----------
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # .workbuddy/skills/verify-project -> 项目根

# ---------- 外部地址（见 docs/cloudbase-环境档案.md） ----------
ENV_ID = "victor-1a2b3c4d-d5fmr5rn115087c8"
BASE = "https://%s-1499478804.ap-shanghai.app.tcloudbase.com" % ENV_ID      # 云函数网关
FRONT = "https://%s-1499478684.tcloudbaseapp.com" % ENV_ID                  # 静态托管
GW = "https://%s.api.tcloudbasegateway.com/v1/rdb/rest" % ENV_ID            # 数据网关

# ---------- 本机工具 ----------
NODE = r"C:\Users\gin99\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
TOKEN_FILE = os.path.join(ROOT, "_local", "密钥", "锚点-访问密钥.txt")
TOKEN_LINE = 6  # 1 起数，第 6 行是服务端 API Key 的值

# 扫描密钥时要跳过的目录：这些地方本来就该放本地产物，且全在 .gitignore 里
SCAN_SKIP_DIRS = {".git", "node_modules", "_local", "dist", "部署包", "_本地归档", "_tmp", "__pycache__"}
SCAN_SKIP_FILES = {os.path.basename(__file__)}  # 脚本自己存的是特征词，不是密钥

# 已知示例行。SKILL.md 的「自检留档」小节里留着那段假密钥，是故意的，
# 要保住原文让人能看懂那是啥，所以豁免这一行本身，不豁免整个文件。
# 为什么用行级白名单而不是目录豁免：给整个文件开口子，将来真密钥写进技能文档
# 就漏检了，检查项会退化成摆设（C10 就是这么废掉一次的）。
# 这里多一行，警报器只对这一行闭嘴，同一文件里出现任何别的密钥照样报。
KNOWN_SAMPLE_LINES = {
    'var FAKE_TOKEN = "sk-verifyprojectfakekey1234567890";',
}
SCAN_MAX_BYTES = 2 * 1024 * 1024

# ---------- 结果收集 ----------
ROWS = []


def record(code, name, status, evidence):
    ROWS.append((code, name, status, evidence))


# ---------- 密钥特征（每个都要求「像真的凭证」，不认裸关键词） ----------
# 第一版用的是 docs/day23-安全自查清单.md 里那条命令的口径（password\s*= 就算命中），
# 实跑一次命中 14 处，全是 Skill 脚本里「运行时从凭据管理器读」的命令行，值里没有真东西。
# 所以改成下面这版：光有关键词不算，等号后面必须有值，且值得像凭证。
# 这段代码自己不会被扫到：正则里的 [ 打断了值的形态，扫不中自己。
SECRET_PATTERNS = [
    ("数据库连接串", r"(postgres|mysql|mongodb(\+srv)?)://[^\s:'\"/]+:[^\s@'\"]+@"),
    ("OpenAI 密钥", r"sk-[A-Za-z0-9]{20,}"),
    ("AWS 密钥", r"AKIA[0-9A-Z]{16}"),
    ("私钥文件头", r"BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"),
    ("口令赋值（带引号）", r"(password|passwd|secret|apikey|token)\s*[=:]\s*['\"][^'\"]{8,}['\"]"),
    ("口令赋值（裸值）", r"(password|passwd|secret|apikey)\s*=\s*[A-Za-z0-9._\-]{12,}"),
    ("JWT 凭证", r"eyJ[A-Za-z0-9_-]{100,}\.[A-Za-z0-9_-]{20,}"),
]

# ---------- HTTP ----------
def http(method, url, body=None, headers=None, timeout=25):
    """返回 (status, text, headers)。status 为 None 表示连不上。"""
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    # 本机可能配了代理，直连腾讯云必须绕开，否则拿到的不是真实返回
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read().decode('utf-8', 'replace'), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            txt = e.read().decode('utf-8', 'replace')
        except Exception:
            txt = ''
        return e.code, txt, dict(e.headers or {})
    except Exception as e:
        return None, str(e), {}


def jget(text):
    try:
        return json.loads(text)
    except Exception:
        return None


# =====================================================================
# C01 公网首页可访问
# =====================================================================
def c01():
    url = FRONT + "/dist/index.html"
    st, txt, _ = http("GET", url)
    if st is None:
        return "FAIL", "连不上：%s" % txt[:80]
    if st != 200:
        return "FAIL", "HTTP %s（不是 200）" % st
    if "INVALID_HOST" in txt:
        return "FAIL", "HTTP 200 但内容是 INVALID_HOST，域名已被回收"
    if "<!doctype html" not in txt.lower():
        return "FAIL", "返回的不是 HTML 页面"
    title = re.search(r"<title>(.*?)</title>", txt, re.S)
    return "PASS", "HTTP 200，%d 字节，标题「%s」" % (len(txt), (title.group(1).strip() if title else "无"))


# =====================================================================
# C02 健康接口正常
# =====================================================================
def c02():
    st, txt, _ = http("GET", BASE + "/api/health")
    if st is None:
        return "FAIL", "连不上：%s" % txt[:80]
    if "MISSING_TOKEN" in txt:
        return "FAIL", "返回 MISSING_TOKEN，云函数没配 TCB_ACCESS_TOKEN"
    if st != 200:
        return "FAIL", "HTTP %s" % st
    j = jget(txt)
    if not j or j.get('ok') is not True:
        return "FAIL", "HTTP 200 但 ok 不是 true：%s" % txt[:100]
    svc = (j.get('data') or {}).get('service', '?')
    return "PASS", "HTTP 200，ok:true，service=%s" % svc


# =====================================================================
# C03 读接口能读到真实数据
# =====================================================================
def c03():
    st, txt, _ = http("GET", BASE + "/api/plan-days?limit=1")
    if st is None:
        return "FAIL", "连不上：%s" % txt[:80]
    if st != 200:
        return "FAIL", "HTTP %s" % st
    j = jget(txt)
    if not j or j.get('ok') is not True:
        return "FAIL", "响应不是 ok:true：%s" % txt[:100]
    data = j.get('data') or {}
    items = data.get('items') or []
    if not items:
        return "FAIL", "接口通了但一条数据都没有（库被清空了？），matched=%s" % data.get('matched')
    if 'date' not in items[0]:
        return "FAIL", "返回的行里没有 date 字段：%s" % json.dumps(items[0], ensure_ascii=False)[:100]
    return "PASS", "HTTP 200，matched=%s，最近一天 %s" % (data.get('matched'), items[0].get('date'))


# =====================================================================
# C04 写接口闭环（POST -> PATCH -> DELETE），跑完不留残留
# =====================================================================
PROBE_DATE = "2099-01-01"  # 专用探针日期，跟真实记录隔开，跑完必须清掉


def c04():
    steps = []

    st, txt, _ = http("POST", BASE + "/api/plan-days",
                      {"date": PROBE_DATE, "morning_anchor": "verify自检", "evening_anchor": "verify自检"})
    steps.append(("POST", st, txt))
    if st != 201:
        return "FAIL", "POST 期望 201，实际 %s：%s" % (st, txt[:100])

    st2, txt2, _ = http("PATCH", BASE + "/api/plan-days?date=" + PROBE_DATE, {"morning_done": True})
    steps.append(("PATCH", st2, txt2))
    if st2 != 200:
        http("DELETE", BASE + "/api/plan-days?date=" + PROBE_DATE + "&hard=1")
        return "FAIL", "PATCH 期望 200，实际 %s：%s" % (st2, txt2[:100])

    st3, txt3, _ = http("DELETE", BASE + "/api/plan-days?date=" + PROBE_DATE)
    steps.append(("DELETE", st3, txt3))
    if st3 != 200:
        return "FAIL", "DELETE 期望 200，实际 %s：%s" % (st3, txt3[:100])

    # 残留清理：软删除版本要再硬删一次，旧版本已经真删了所以 404 也算干净
    st4, _, _ = http("DELETE", BASE + "/api/plan-days?date=" + PROBE_DATE + "&hard=1")
    st5, txt5, _ = http("GET", BASE + "/api/plan-days?date=" + PROBE_DATE)
    j = jget(txt5) or {}
    items = (j.get('data') or {}).get('items') or []
    if items:
        return "FAIL", "探针日期 %s 没清干净，库里还剩 %d 条" % (PROBE_DATE, len(items))

    seq = "/".join(str(s[1]) for s in steps[:3])
    return "PASS", "POST/PATCH/DELETE 依次 %s，探针日期已清干净" % seq


# =====================================================================
# C05 跨域预检允许全部方法
# =====================================================================
def c05():
    st, _, hdr = http("OPTIONS", BASE + "/api/plan-days")
    if st is None:
        return "FAIL", "连不上"
    low = {k.lower(): v for k, v in hdr.items()}
    allow = low.get('access-control-allow-methods', '')
    need = ["GET", "POST", "PATCH", "DELETE"]
    missing = [m for m in need if m.upper() not in allow.upper()]
    if missing:
        return "FAIL", "Allow-Methods 缺 %s，实际「%s」" % ("/".join(missing), allow or "无")
    return "PASS", "OPTIONS %s，Allow-Methods=%s" % (st, allow)


# =====================================================================
# C06 工作区里搜不到硬编码密钥
# =====================================================================
def scan_workspace(patterns):
    hits = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SCAN_SKIP_DIRS]
        for fn in filenames:
            if fn in SCAN_SKIP_FILES:
                continue
            if os.path.splitext(fn)[1].lower() not in ('.js', '.py', '.html', '.json', '.md', '.txt',
                                                        '.yml', '.yaml', '.sh', '.css', '.env', ''):
                continue
            p = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(p) > SCAN_MAX_BYTES:
                    continue
                with open(p, 'r', encoding='utf-8', errors='ignore') as f:
                    for i, line in enumerate(f, 1):
                        if line.strip() in KNOWN_SAMPLE_LINES:
                            continue
                        for label, pat in patterns:
                            if re.search(pat, line):
                                rel = os.path.relpath(p, ROOT)
                                snippet = line.strip()[:90]
                                hits.append("%s:%d [%s] %s" % (rel, i, label, snippet))
                                break
            except Exception:
                continue
    return hits


def c06():
    hits = scan_workspace(SECRET_PATTERNS)
    if hits:
        return "FAIL", "命中 %d 处，第一处：%s" % (len(hits), hits[0])
    return "PASS", "0 命中（扫了 %s 下所有文本，跳过 .git/_local/dist/部署包）" % os.path.basename(ROOT)


# =====================================================================
# C07 Git 历史里搜不到密钥
# =====================================================================
def git_exe():
    g = None
    from shutil import which
    g = which('git')
    if not g:
        cand = r"C:\Users\gin99\.workbuddy\binaries\PortableGit\versions\1.2.0\cmd\git.exe"
        if os.path.exists(cand):
            g = cand
    return g


def c07():
    g = git_exe()
    if not g:
        return "SKIP", "本机没找到 git"
    try:
        p = subprocess.run([g, "log", "--all", "-p"], cwd=ROOT, capture_output=True, timeout=180)
    except Exception as e:
        return "SKIP", "git log 跑不动：%s" % str(e)[:60]
    blob = (p.stdout or b'') + (p.stderr or b'')
    text = blob.decode('utf-8', 'ignore')
    # 裸的 postgres:// 不算凭证：文档里讲解「不走 pg 直连」时会写这个词。
    # 第一版就是被 day23 清单里那条 grep 命令自己命中了 2 次，所以要带账号密码才算。
    pat = (r"(postgres|mysql|mongodb(\+srv)?)://[^\s:'\"/]+:[^\s@'\"]+@"
           r"|sk-[A-Za-z0-9]{20,}"
           r"|AKIA[0-9A-Z]{16}"
           r"|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"
           r"|eyJ[A-Za-z0-9_-]{100,}\.[A-Za-z0-9_-]{20,}")
    found = re.findall(pat, text)
    if found:
        return "FAIL", "历史里命中 %d 处，例：%s" % (len(found), found[0])
    return "PASS", "0 命中（git log --all -p 全量历史，共 %d 字节）" % len(blob)


# =====================================================================
# C08 .gitignore 盖住 .env，且模板在库里
# =====================================================================
def c08():
    g = git_exe()
    if not g:
        return "SKIP", "本机没找到 git"

    def ignored(path):
        r = subprocess.run([g, "check-ignore", "-v", path], cwd=ROOT, capture_output=True)
        return r.returncode == 0

    if not ignored(".env"):
        return "FAIL", ".env 没被 .gitignore 盖住，真凭证有被提交出去的风险"

    ex = os.path.join(ROOT, ".env.example")
    if not os.path.exists(ex):
        return "FAIL", "仓库里没有 .env.example，同伴照着配不了环境"
    if ignored(".env.example"):
        return "FAIL", ".env.example 被 .gitignore 挡住了，进不了仓库"

    with open(ex, 'r', encoding='utf-8') as f:
        content = f.read()

    # 凭证类字段必须空着。PORT=9000 这种端口默认值不算泄密，第一版把它判成真值是错的。
    cred_words = ("TOKEN", "KEY", "SECRET", "PASSWORD", "PASSWD", "CREDENTIAL")
    bad = []
    keys = []
    for ln in content.splitlines():
        s = ln.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, v = s.split('=', 1)
        k, v = k.strip(), v.strip()
        keys.append(k)
        if any(w in k.upper() for w in cred_words) and v:
            bad.append("%s 填了值" % k)
            continue
        for label, pat in SECRET_PATTERNS:
            if v and re.search(pat, v):
                bad.append("%s 的值像%s" % (k, label))
                break
    if bad:
        return "FAIL", ".env.example 里有不该出现的值：%s" % "；".join(bad)
    return "PASS", ".env 已忽略，.env.example 在库里且凭证字段全空（%s）" % "/".join(keys)


# =====================================================================
# C09 数据库可连接，核心表存在
# =====================================================================
def read_token():
    if not os.path.exists(TOKEN_FILE):
        return None
    with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()
    if len(lines) < TOKEN_LINE:
        return None
    return lines[TOKEN_LINE - 1].strip()


def c09():
    tok = read_token()
    if not tok:
        return "SKIP", "没读到本机凭证（%s 第 %d 行），跳过数据库检查" % (
            os.path.relpath(TOKEN_FILE, ROOT), TOKEN_LINE)
    hdr = {"Authorization": "Bearer " + tok, "apikey": tok}
    out = []
    for table in ("plan_days", "checkins"):
        st, txt, _ = http("GET", "%s/%s?select=date&limit=1" % (GW, table), headers=hdr)
        if st in (401, 403):
            return "FAIL", "网关返回 %s，服务端 API Key 失效了，要去控制台重建并替换环境变量" % st
        if st is None:
            return "FAIL", "连不上数据网关：%s" % txt[:60]
        if st != 200:
            return "FAIL", "表 %s 返回 HTTP %s（表不存在？）：%s" % (table, st, txt[:80])
        out.append(table)
    return "PASS", "两张表都能读：%s" % "、".join(out)


# =====================================================================
# C10 云函数共享层副本与源一致
# =====================================================================
def c10():
    src = os.path.join(ROOT, "cloudfunctions", "_shared")
    if not os.path.isdir(src):
        return "SKIP", "没有 cloudfunctions/_shared 目录"
    srcs = {}
    for fn in sorted(os.listdir(src)):
        if fn.endswith('.js'):
            with open(os.path.join(src, fn), 'rb') as f:
                srcs[fn] = hashlib.sha256(f.read()).hexdigest()
    if not srcs:
        return "SKIP", "共享层里没有 .js"
    checked = 0
    for fn_dir in ("plan-days", "checkins"):
        d = os.path.join(ROOT, "cloudfunctions", fn_dir, "_shared")
        if not os.path.isdir(d):
            continue
        for fn, h in srcs.items():
            p = os.path.join(d, fn)
            if not os.path.exists(p):
                return "FAIL", "%s/_shared 里缺 %s" % (fn_dir, fn)
            with open(p, 'rb') as f:
                if hashlib.sha256(f.read()).hexdigest() != h:
                    return "FAIL", "%s/_shared/%s 与源不一致" % (fn_dir, fn)
            checked += 1
    # 函数目录里没副本是正常的（打包时才生成），那就去部署包里查，
    # 不然这项永远 SKIP，等于摆设。
    if checked == 0:
        import zipfile
        for zp in ("plan-days.zip", "checkins.zip"):
            p = os.path.join(ROOT, "部署包", zp)
            if not os.path.exists(p):
                continue
            with zipfile.ZipFile(p) as z:
                names = z.namelist()
                for fn, h in srcs.items():
                    # 打包脚本把共享层平铺在 zip 根目录（没有 _shared/ 这层），
                    # 手打的目录包可能带这层，两种都认。
                    cand = [n for n in names
                            if n.replace('\\', '/') == fn
                            or n.replace('\\', '/').endswith('_shared/' + fn)]
                    if not cand:
                        return "FAIL", "%s 里缺 _shared/%s" % (zp, fn)
                    if hashlib.sha256(z.read(cand[0])).hexdigest() != h:
                        return "FAIL", "%s 里的 _shared/%s 与源不一致" % (zp, fn)
                    checked += 1
        if checked == 0:
            return "SKIP", "函数目录和部署包里都没有 _shared 副本，先跑 tools/pack-cloudfunctions.py"
    return "PASS", "%d 个副本与源逐字节一致（%s）" % (checked, "、".join(srcs))


# =====================================================================
# C11 前端语法与构建产物齐全
# =====================================================================
def c11():
    if not os.path.exists(NODE):
        return "SKIP", "没找到 node：%s" % NODE
    tmp = os.path.join(ROOT, "_tmp", "verify")
    os.makedirs(tmp, exist_ok=True)
    checked = 0
    for fn in sorted(os.listdir(ROOT)):
        if not fn.endswith('.html'):
            continue
        with open(os.path.join(ROOT, fn), 'r', encoding='utf-8') as f:
            src = f.read()
        blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S)
        for i, b in enumerate(blocks):
            p = os.path.join(tmp, "%s_%d.js" % (fn.replace('.', '_'), i))
            with open(p, 'w', encoding='utf-8') as f:
                f.write(b)
            r = subprocess.run([NODE, "--check", p], capture_output=True)
            if r.returncode != 0:
                return "FAIL", "%s 第 %d 段内联脚本语法错：%s" % (
                    fn, i + 1, (r.stderr or b'').decode('utf-8', 'ignore')[:80])
            checked += 1
    shutil_rmtree(tmp)

    dist = os.path.join(ROOT, "dist")
    if not os.path.isdir(dist):
        return "SKIP", "语法检查通过 %d 段；dist 目录不存在，跳过产物检查" % checked
    need = ["index.html", "records.html", "css/style.css", "js/records.js", "js/store.js"]
    missing = [n for n in need if not os.path.exists(os.path.join(dist, n))]
    if missing:
        return "FAIL", "dist 里缺 %s" % "、".join(missing)
    return "PASS", "内联脚本 %d 段全过；dist 关键文件齐全" % checked


def shutil_rmtree(p):
    import shutil
    try:
        shutil.rmtree(p)
    except Exception:
        pass


# =====================================================================
# C12 公网版不显示调试信息
# =====================================================================
def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def c12():
    if not os.path.exists(EDGE):
        return "SKIP", "没找到 Edge：%s" % EDGE
    page = os.path.join(ROOT, "records.html")
    if not os.path.exists(page):
        return "SKIP", "项目里没有 records.html"
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.5)
        url = "http://127.0.0.1:%d/records.html?diag=0" % port
        r = subprocess.run([EDGE, "--headless", "--disable-gpu", "--virtual-time-budget=8000",
                            "--dump-dom", url], capture_output=True, timeout=90)
        dom = (r.stdout or b'').decode('utf-8', 'ignore')
    except Exception as e:
        return "SKIP", "无头浏览器跑不动：%s" % str(e)[:60]
    finally:
        srv.terminate()
    if not dom:
        return "SKIP", "没拿到渲染后的 DOM"
    shown = []
    for eid in ("diagCard", "healthBadge", "cloudBadge"):
        m = re.search(r'id="%s"[^>]{0,200}' % eid, dom)
        if not m:
            shown.append(eid + "(元素不存在)")
            continue
        frag = m.group(0)
        if 'display: none' not in frag and 'display:none' not in frag:
            shown.append(eid)
    if shown:
        return "FAIL", "公网模式下这些调试元素还在显示：%s" % "、".join(shown)
    return "PASS", "diagCard/healthBadge/cloudBadge 在 diag=0 下全部隐藏"


# =====================================================================
# C13 代码要用的字段，库里都得有
# =====================================================================
# 防的坑：改了数据访问层的字段（比如软删除加的 is_deleted），云函数传上去了，
# 数据库的 ALTER TABLE 还没跑。云函数一查就 500，而且是上线之后才炸。
# C09 只查表在不在，查不出字段对不对，所以单列这一项。
def c13():
    tok = read_token()
    if not tok:
        return "SKIP", "没读到本机凭证，跳过"
    fields = {}
    for repo, table in (("planDaysRepository.js", "plan_days"),
                        ("checkinsRepository.js", "checkins")):
        p = os.path.join(ROOT, "cloudfunctions", "_shared", repo)
        if not os.path.exists(p):
            continue
        m = re.search(r"var SELECT\s*=\s*'([^']+)'", open(p, 'r', encoding='utf-8').read())
        if not m:
            continue
        fields[table] = [f.strip() for f in m.group(1).split(',') if f.strip()]
    if not fields:
        return "SKIP", "没从数据访问层里读到字段清单"

    hdr = {"Authorization": "Bearer " + tok, "apikey": tok}
    missing = []
    total = 0
    for table, fs in fields.items():
        total += len(fs)
        st, txt, _ = http("GET", "%s/%s?select=%s&limit=1" % (GW, table, ",".join(fs)), headers=hdr)
        if st in (401, 403):
            return "FAIL", "网关返回 %s，API Key 失效，去控制台重建" % st
        if st == 200:
            continue
        # 整条查挂了，逐个定位到底缺哪个字段
        for f in fs:
            st2, _, _ = http("GET", "%s/%s?select=%s&limit=1" % (GW, table, f), headers=hdr)
            if st2 != 200:
                missing.append("%s.%s" % (table, f))
    if missing:
        return "FAIL", "代码要用但库里还没有：%s。先去控制台跑对应的 ALTER TABLE" % "、".join(missing)
    return "PASS", "%d 个字段库里都有（%s）" % (
        total, "、".join("%s(%d)" % (t, len(f)) for t, f in fields.items()))


# =====================================================================
# 主流程
# =====================================================================
CHECKS = [
    ("C01", "公网首页可访问", c01, False),
    ("C02", "健康接口正常", c02, False),
    ("C03", "读接口返回真实数据", c03, False),
    ("C04", "写接口闭环且不留残留", c04, False),
    ("C05", "跨域预检允许全部方法", c05, False),
    ("C06", "工作区无硬编码密钥", c06, True),
    ("C07", "Git 历史无密钥", c07, True),
    ("C08", ".gitignore 与 .env.example", c08, True),
    ("C09", "数据库可连接且核心表在", c09, True),
    ("C10", "云函数共享层副本一致", c10, True),
    ("C11", "前端语法与构建产物", c11, True),
    ("C12", "公网版无调试信息", c12, True),
    ("C13", "代码字段与数据库对齐", c13, True),
]


def main():
    local_only = "--local" in sys.argv
    print("verify-project · 发布前检查")
    print("项目根：%s" % ROOT)
    print("范围：%s" % ("仅本地项" if local_only else "全部 12 项"))
    print("-" * 78)
    for code, name, fn, is_local in CHECKS:
        if local_only and not is_local:
            record(code, name, "SKIP", "本次只跑本地项")
            continue
        try:
            status, evidence = fn()
        except Exception as e:
            status, evidence = "FAIL", "检查项自己崩了：%s" % str(e)[:100]
        record(code, name, status, evidence)
        print("[%s] %s  %s" % (status, code + " " + name, ""))
        print("     证据：%s" % evidence)

    print("-" * 78)
    p = sum(1 for r in ROWS if r[2] == "PASS")
    f = sum(1 for r in ROWS if r[2] == "FAIL")
    s = sum(1 for r in ROWS if r[2] == "SKIP")
    print("合计：%d PASS / %d FAIL / %d SKIP" % (p, f, s))
    if f:
        print("有 FAIL 项，发布前先修掉。")
        return 1
    print("没有 FAIL 项。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
