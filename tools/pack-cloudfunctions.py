# 打包云函数代码包到桌面（Day 17 起部署用；Day 19 增加共享层分发）
# 用法：python tools/pack-cloudfunctions.py
#
# Day 19 之后为什么要改这个脚本：
#   数据访问层收进 cloudfunctions/_shared 之后，源码只有一份，但每个云函数是
#   各自打成一个压缩包单独上传的——运行时只看得见自己包里的文件。所以打包时
#   必须把 _shared 里的文件分发进每一个包。
#
# 为什么要有断言（防呆）：
#   分发靠脚本做，就怕哪次绕过脚本、手传一个旧包，线上就变成两份副本内容
#   不一致。这种不一致不会报错，只会表现为某个接口读到的字段和另一个不一样，
#   是最难查的那类问题。所以脚本里加三道检查，任何一道不过就直接报错退出，
#   不产出 zip。
import os
import re
import zipfile
import hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CF = os.path.join(ROOT, 'cloudfunctions')
SHARED_DIR = os.path.join(CF, '_shared')
DESKTOP = r'C:\Users\gin99\Desktop'

BASE_FILES = ['index.js', 'package.json', 'scf_bootstrap', 'cloudbaserc.json']

# 共享层：每个包都要带上。源码只有这一份，分发由本脚本负责。
SHARED_FILES = ['gatewayClient.js', 'planDaysRepository.js', 'checkinsRepository.js']


def sha(b):
    return hashlib.sha256(b).hexdigest()


def require_targets(src):
    """找出一个 js 文件里 require('./xxx') 引用的本地文件"""
    text = open(src, encoding='utf-8').read()
    return sorted(set(re.findall(r"require\(\s*['\"]\./([A-Za-z0-9_\-]+\.js)['\"]\s*\)", text)))


def build(name, folder, patch=None):
    """
    打一个包。patch 是可选的改写函数，签名 f(filename, text) -> text，
    用来打故意写错表名的测试包。
    """
    src = os.path.join(CF, folder)
    blobs = {}

    for f in BASE_FILES:
        blobs[f] = open(os.path.join(src, f), 'rb').read()

    for f in SHARED_FILES:
        blobs[f] = open(os.path.join(SHARED_DIR, f), 'rb').read()

    if patch:
        for f in list(blobs.keys()):
            blobs[f] = patch(f, blobs[f].decode('utf-8')).encode('utf-8')

    # —— 断言 1：require 到的本地文件必须都在包里 ——
    for f in blobs:
        if not f.endswith('.js'):
            continue
        tmp = os.path.join(DESKTOP, '_packcheck_' + f)
        open(tmp, 'wb').write(blobs[f])
        for t in require_targets(tmp):
            if t not in blobs:
                os.remove(tmp)
                raise SystemExit('打包失败：%s 里 require 了 ./%s，但包里没有这个文件' % (f, t))
        os.remove(tmp)

    out = os.path.join(DESKTOP, name)
    z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    for f in sorted(blobs.keys()):
        z.writestr(f, blobs[f])
    z.close()
    print('%s  %.1f KB  %s' % (name, os.path.getsize(out) / 1024, zipfile.ZipFile(out).namelist()))
    return out


BROKEN = 'plan_days_故意写错的表名'


def break_table(filename, text):
    """故意写错表名：只改 planDaysRepository.js 里那一处，别的原样返回"""
    if filename != 'planDaysRepository.js':
        return text
    out = text.replace("var TABLE = 'plan_days';", "var TABLE = '" + BROKEN + "';")
    if BROKEN not in out:
        raise SystemExit('打包失败：没找到要改写的表名，检查 planDaysRepository.js 里表名的写法')
    return out


a = build('plan-days.zip', 'plan-days')
b = build('checkins.zip', 'checkins')
build('health.zip', 'health')   # health 不用共享层，但它的代码也会改（如 CORS），一样要能出包
build('plan-days-错误测试版.zip', 'plan-days', break_table)

# —— 断言 2：两个包里的共享文件必须逐字节一致 ——
# 源码只有一份，分发出来的副本如果不一样，说明有人绕过了脚本或者改了单边。
za = zipfile.ZipFile(a)
zb = zipfile.ZipFile(b)
for f in SHARED_FILES:
    ha = sha(za.read(f))
    hb = sha(zb.read(f))
    if ha != hb:
        raise SystemExit('打包失败：两个包里的 %s 内容不一致（%s / %s）' % (f, ha[:12], hb[:12]))
print('断言通过：两个包里的共享层文件逐字节一致')

# —— 断言 3：包里的共享文件必须和 _shared 源码一致 ——
for f in SHARED_FILES:
    src_sha = sha(open(os.path.join(SHARED_DIR, f), 'rb').read())
    if sha(za.read(f)) != src_sha:
        raise SystemExit('打包失败：包里的 %s 与 _shared 源码不一致' % f)
print('断言通过：包里的共享文件与 _shared 源码一致')
