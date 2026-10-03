# 打包云函数代码包到桌面（Day 17 / Day 18 部署用）
# 用法：python tools/pack-cloudfunctions.py
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CF = os.path.join(ROOT, 'cloudfunctions')
DESKTOP = r'C:\Users\gin99\Desktop'
FILES = ['index.js', 'package.json', 'scf_bootstrap', 'cloudbaserc.json']


def pack(name, folder, patch=None):
    out = os.path.join(DESKTOP, name)
    src = os.path.join(CF, folder)
    z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    for f in FILES:
        data = open(os.path.join(src, f), 'rb').read()
        if patch and f == 'index.js':
            data = patch(data.decode('utf-8')).encode('utf-8')
        z.writestr(f, data)
    z.close()
    print('%s  %.1f KB  %s' % (name, os.path.getsize(out) / 1024, zipfile.ZipFile(out).namelist()))


pack('plan-days.zip', 'plan-days')
pack('checkins.zip', 'checkins')

# 错误测试版：故意把表名写错，验证出错时是否返回 {ok:false, error:{code,message}}
pack('plan-days-错误测试版.zip', 'plan-days',
     lambda s: s.replace("var TABLE = 'plan_days';", "var TABLE = 'plan_days_故意写错的表名';"))
