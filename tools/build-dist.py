# -*- coding: utf-8 -*-
"""
build-dist.py —— 把「锚点」前端源码打成公网用的 dist/（Day 20 建）

用法：
    python tools/build-dist.py

做什么：
    把顶层的 .html、css/、js/ 复制进 dist/。
    dist/ 就是上传到静态托管的那个目录，里面有什么，公网上就有什么。

两条排除规则（别改）：
    1. js/guide.js、js/guide-data.js 不进 dist ——「参考」页的内容源只在本地，不上公网。
    2. .workbuddy/ 这类本地自检目录不进 dist —— 里面有调试用的种子页，不该被人访问到。

跑完会自己检查一遍：dist 里不该出现的东西一个都没有，该有的页面一个不少。
检查不过就直接报错退出，不给你一个"看起来打好了其实缺文件"的 dist。
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')

# 不进公网的：参考页内容源
EXCLUDE_JS = {'guide.js', 'guide-data.js'}
# 不进公网的目录
EXCLUDE_DIRS = {'.workbuddy', '.git', 'docs-internal', '_local', 'cloudfunctions', 'tools', 'db', 'node_modules'}
# 必须出现的页面（少一个就是打包漏了）
REQUIRED_PAGES = [
    'index.html', 'today.html', 'records.html',
    'reflect.html', 'growth.html', 'decompose.html', 'protocols.html',
]
REQUIRED_JS = ['store.js', 'growth.js', 'records.js', 'today.js', 'reflect.js', 'growth.js']


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    # 1. 顶层 html
    pages = sorted(f for f in os.listdir(ROOT)
                   if f.endswith('.html') and os.path.isfile(os.path.join(ROOT, f)))
    for f in pages:
        shutil.copy2(os.path.join(ROOT, f), os.path.join(DIST, f))

    # 2. css
    shutil.copytree(os.path.join(ROOT, 'css'), os.path.join(DIST, 'css'))

    # 3. js（排除参考页那两个）
    src_js = os.path.join(ROOT, 'js')
    dst_js = os.path.join(DIST, 'js')
    os.makedirs(dst_js)
    copied = []
    for f in sorted(os.listdir(src_js)):
        if f in EXCLUDE_JS:
            continue
        p = os.path.join(src_js, f)
        if os.path.isfile(p):
            shutil.copy2(p, os.path.join(dst_js, f))
            copied.append(f)

    # ---------- 打完自己查一遍 ----------
    problems = []

    for p in REQUIRED_PAGES:
        if not os.path.isfile(os.path.join(DIST, p)):
            problems.append('缺页面：' + p)
    for j in set(REQUIRED_JS):
        if not os.path.isfile(os.path.join(dst_js, j)):
            problems.append('缺脚本：js/' + j)
    if not os.path.isfile(os.path.join(DIST, 'css', 'style.css')):
        problems.append('缺样式：css/style.css')

    for name in os.listdir(DIST):
        if name in EXCLUDE_DIRS:
            problems.append('不该进公网的目录混进来了：' + name)
    for f in os.listdir(dst_js):
        if f in EXCLUDE_JS:
            problems.append('不该上公网的脚本混进来了：js/' + f)

    # 检查台页面（records.html）是给人验证"数据是真的"用的，一个示例字样都不能有 —— 这条阻断
    ck = os.path.join(DIST, 'records.html')
    if os.path.isfile(ck):
        t = open(ck, encoding='utf-8').read()
        if '示例数据' in t or 'Mock.build' in t:
            problems.append('检查台 records.html 里还有示例数据相关字样（必须是真数据）')

    # 其余页面：也扫一遍，有的话列出来提醒（不阻断 —— 这几页还没接云端，清它们属于另一天的活）
    warn = []
    for p in REQUIRED_PAGES:
        if p == 'records.html':
            continue
        path = os.path.join(DIST, p)
        if os.path.isfile(path):
            t = open(path, encoding='utf-8').read()
            if '示例数据' in t or 'Mock.build' in t:
                warn.append(p)

    print('dist 已重建：%d 个页面 / %d 个脚本 / css' % (len(pages), len(copied)))
    print('排除（不上公网）：js/' + '、js/'.join(sorted(EXCLUDE_JS)))

    if problems:
        print('\n★ 检查没过，dist 不能上传：')
        for x in problems:
            print('   - ' + x)
        sys.exit(1)
    print('自检通过：该有的都在，不该有的都没进。')
    if warn:
        print('\n提醒（不阻断）：这几个页面还带着示例数据模式 —— 它们没接云端，')
        print('访客第一次打开（本地没数据时）会自动显示假数据：' + '、'.join(warn))
        print('今天只要求检查台干净，这几页留到接云端那天再清。')


if __name__ == '__main__':
    main()
