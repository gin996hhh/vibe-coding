#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 Victor 粘贴到对话里的截图，存到指定的归档文件夹并改名。

他明确说过：截图给到 AI 之后由 AI 自己保存，不要让他去复制文件。
粘贴的图会落到 ~/.workbuddy/clipboard-images/，文件名是 clipboard-<时间戳>-<随机>.png。
这个脚本取那里最新的一张，复制到目标目录并用新名字。

用法：
    python tools/save-clipshot.py "<目标文件夹>" "<新文件名>"
例：
    python tools/save-clipshot.py "C:/Users/gin99/Desktop/Day25-打卡" "Day25-04-新对话复用.png"

只加 --dry 就只显示会动哪张，不复制：
    python tools/save-clipshot.py "<目标文件夹>" "<新文件名>" --dry

注意：取的是「最新一张」。如果他一次发了好几张，要按从旧到新的顺序一张张存，
或者存完一张告诉我一声，我再存下一张（存完脚本会打印源文件名，方便核对）。
"""
import os
import shutil
import sys

SRC_DIR = os.path.join(os.path.expanduser("~"), ".workbuddy", "clipboard-images")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")


def newest():
    if not os.path.isdir(SRC_DIR):
        return None
    best, best_t = None, -1
    for name in os.listdir(SRC_DIR):
        if not name.lower().endswith(IMAGE_EXT):
            continue
        p = os.path.join(SRC_DIR, name)
        t = os.path.getmtime(p)
        if t > best_t:
            best, best_t = p, t
    return best


def main():
    args = [a for a in sys.argv[1:] if a != "--dry"]
    dry = "--dry" in sys.argv[1:]
    if len(args) < 2:
        print("用法：python tools/save-clipshot.py \"<目标文件夹>\" \"<新文件名>\" [--dry]")
        return 1
    dest_dir, dest_name = args[0], args[1]
    src = newest()
    if not src:
        print("没找到截图：%s 里没有图片" % SRC_DIR)
        return 1
    if not os.path.isdir(dest_dir):
        os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, dest_name)
    size = os.path.getsize(src)
    print("源：%s（%d 字节）" % (os.path.basename(src), size))
    print("存到：%s" % dest)
    if dry:
        print("（--dry，没有真的复制）")
        return 0
    shutil.copy2(src, dest)
    print("已保存，%d 字节" % os.path.getsize(dest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
