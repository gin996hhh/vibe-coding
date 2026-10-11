#!/usr/bin/env python3
"""git push 撞 502 时的备用通道：走 GitHub Data API 把本地提交写上去。

什么时候需要它
    本机到 github.com 的 git 协议被代理掐断（`CONNECT tunnel failed, response 502`
    或 `Empty reply from server`），但 api.github.com 是通的（curl 能拿到 200）。
    这时候 git push 没辙，改用这个脚本直接调接口建提交。

怎么用
    export GH_TOKEN=$(printf "protocol=https\\nhost=github.com\\n\\n" \\
        | timeout 30 git credential fill 2>/dev/null | sed -n 's/^password=//p')
    python tools/push-via-api.py

两个已经踩过的坑，别改回去
    1. 令牌必须在 shell 里取，不能在 python 里 subprocess 调 `git credential fill`。
       credential helper 在子进程里拿不到终端，会一直挂着直到超时。
    2. `git credential fill` 有时返回空串（实测五次里空过一次），
       拿到空令牌要重试，不要拿空串去调接口，那会 401。
    3. 不要逐个对象先问「远端有没有」再传。blob 和 tree 都是内容寻址，
       重复传同一份内容只会拿回同一个 sha，多花一次请求反而更慢，
       第一次写这个脚本时因为探测太多被超时掐断过。

跑完之后本地会怎样
    远端提交是 GitHub 生成的，sha 跟本地不一样（提交者信息与时间戳不同），
    tree 与本地完全一致。fetch 拉不回对象（同样被代理掐），所以本地
    origin/main 会被指到 HEAD：内容同号，sha 不同号。下次再推时，
    待推列表取 origin/main..HEAD，parent 用接口读到的真实远端 sha。
"""
import base64
import os
import subprocess
import sys
import urllib.error
import urllib.request
import json

REPO = "gin996hhh/vibe-coding"
API = "https://api.github.com/repos/" + REPO


def git(*args, binary=False):
    r = subprocess.run(["git"] + list(args), capture_output=True)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace").strip()


def req(method, path, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + os.environ["GH_TOKEN"])
    r.add_header("Accept", "application/vnd.github+json")
    r.add_header("User-Agent", "vibe-coding-push")
    if data:
        r.add_header("Content-Type", "application/json")
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with op.open(r, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def upload_tree(tree_sha):
    """递归把一棵 tree 和它下面的 blob 传上去，返回 GitHub 那边的 tree sha"""
    entries = []
    for ln in git("ls-tree", tree_sha).splitlines():
        meta, path = ln.split("\t", 1)
        mode, typ, sha = meta.split()
        new = sha
        if typ == "blob":
            content = git("cat-file", "-p", sha, binary=True)
            r = req("POST", "/git/blobs", {
                "content": base64.b64encode(content).decode("ascii"),
                "encoding": "base64"
            })
            new = r["sha"]
        elif typ == "tree":
            new = upload_tree(sha)
        entries.append({"path": path, "mode": mode, "type": typ, "sha": new})
    return req("POST", "/git/trees", {"tree": entries})["sha"]


def push_commit(local_sha, parent_sha):
    gh_tree = upload_tree(git("rev-parse", local_sha + "^{tree}"))
    r = req("POST", "/git/commits", {
        "message": git("log", "-1", "--format=%B", local_sha),
        "tree": gh_tree,
        "parents": [parent_sha],
        "author": {"name": "victor", "email": "gin996@outlook.com"}
    })
    return r["sha"]


def main():
    if not os.environ.get("GH_TOKEN"):
        sys.exit("缺少 GH_TOKEN。先在 shell 里用 git credential fill 取令牌再跑。")

    cur = req("GET", "/git/ref/heads/main")["object"]["sha"]
    print("远端当前：%s" % cur[:7], flush=True)

    commits = git("rev-list", "--reverse", "origin/main..HEAD").split()
    if not commits:
        print("没有需要推的提交")
        return
    print("待推 %d 个：%s" % (len(commits), " ".join(c[:7] for c in commits)), flush=True)

    for c in commits:
        cur = push_commit(c, cur)
        print("  已写 %s -> 远端 %s" % (c[:7], cur[:7]), flush=True)

    req("PATCH", "/git/refs/heads/main", {"sha": cur, "force": False})
    git("update-ref", "refs/remotes/origin/main", "HEAD")
    print("main 已指向 %s，本地 origin/main 同步到 HEAD" % cur[:7], flush=True)


if __name__ == "__main__":
    main()
