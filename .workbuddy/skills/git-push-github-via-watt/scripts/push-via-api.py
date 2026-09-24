#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
GitHub REST API 直传：当 github.com:443 完全不可达（沙箱代理只放行 api.github.com、
Watt 没开、直连超时）时，用 API 把本地 HEAD 那个提交写到远端 main。

用法：
    GHPUSH_TOKEN=$(printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill | grep '^password=' | cut -d= -f2-) \
    python push-via-api.py "C:/Users/gin99/Desktop/Vibe coding"

前提：本地 HEAD 的父提交 == 远端 main 当前提交（否则拒绝执行，避免覆盖）。
产出：远端 main 前进一个提交；本地 HEAD 被对齐成与远端同一个提交号（内容不变）。
"""
import os, sys, json, base64, subprocess, datetime, urllib.request, urllib.error

DIR = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
TOK = os.environ['GHPUSH_TOKEN']


def git(*a, stdin=None):
    r = subprocess.run(['git'] + list(a), cwd=DIR, capture_output=True, input=stdin)
    if r.returncode != 0:
        raise SystemExit('git %s 失败: %s' % (' '.join(a), r.stderr.decode('utf-8', 'replace')))
    return r.stdout.decode('utf-8')


def api(method, path, body=None, raw=False):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request('https://api.github.com' + path, data=data, method=method)
    req.add_header('Authorization', 'token ' + TOK)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'workbuddy')
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read()
            return r.status, (body if raw else json.loads(body.decode('utf-8')))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8', 'replace'))


def repo_slug():
    url = git('remote', 'get-url', 'origin').strip()
    for pre in ('https://github.com/', 'git@github.com:'):
        if url.startswith(pre):
            return url[len(pre):].rstrip('/').removesuffix('.git')
    raise SystemExit('无法从远端地址解析仓库名: ' + url)


REPO = repo_slug()
head = git('rev-parse', 'HEAD').strip()
parent = git('rev-parse', 'HEAD^').strip()
msg = git('log', '-1', '--format=%B').rstrip('\n')          # 注意：GitHub 存 message 不带结尾换行
ad = git('log', '-1', '--format=%aI').strip()
cn = git('log', '-1', '--format=%cn').strip()
ce = git('log', '-1', '--format=%ce').strip()

st, ref = api('GET', '/repos/%s/git/ref/heads/main' % REPO)
remote = ref.get('object', {}).get('sha')
print('仓库 %s | 本地 HEAD %s | 远端 main %s' % (REPO, head[:9], str(remote)[:9]))
if remote != parent:
    raise SystemExit('远端不在预期父提交上，已停止（请先人工核对，别覆盖别人的提交）')

st, pc = api('GET', '/repos/%s/git/commits/%s' % (REPO, parent))
base_tree = pc['tree']['sha']

entries = []
for line in git('diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD').splitlines():
    _, path = line.split('\t', 1)
    path = path.strip()
    with open(os.path.join(DIR, path), 'rb') as f:
        raw = f.read()
    s, res = api('POST', '/repos/%s/git/blobs' % REPO,
                 {'content': base64.b64encode(raw).decode('ascii'), 'encoding': 'base64'})
    ok = res.get('sha') == git('hash-object', path).strip()
    print('  blob %-50s %s' % (path, 'OK' if ok else 'SHA 不符!'))
    entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': res['sha']})

s, tree = api('POST', '/repos/%s/git/trees' % REPO, {'base_tree': base_tree, 'tree': entries})
s, cm = api('POST', '/repos/%s/git/commits' % REPO, {
    'message': msg, 'tree': tree['sha'], 'parents': [parent],
    'author': {'name': cn, 'email': ce, 'date': ad},
    'committer': {'name': cn, 'email': ce, 'date': ad},
})
new = cm['sha']
s, _ = api('PATCH', '/repos/%s/git/refs/heads/main' % REPO, {'sha': new, 'force': False})
print('远端 main 已更新为', new)

# API 生成的提交对象与本地那份只差「日期写法 + message 结尾换行」，重建一份让两边同号
epoch = int(datetime.datetime.strptime(ad, '%Y-%m-%dT%H:%M:%S%z').timestamp())
text = 'tree %s\nparent %s\nauthor %s <%s> %d +0800\ncommitter %s <%s> %d +0800\n\n%s' % (
    tree['sha'], parent, cn, ce, epoch, cn, ce, epoch, msg)
local_sha = git('hash-object', '-t', 'commit', '-w', '--stdin', stdin=text.encode('utf-8')).strip()
if local_sha == new:
    git('update-ref', 'refs/heads/main', new)
    print('本地已对齐远端，提交号统一为', new)
else:
    print('提交号未对齐（本地 %s / 远端 %s）——内容一致，必要时人工处理' % (local_sha[:9], new[:9]))
print(git('log', '--oneline', '-2'))
