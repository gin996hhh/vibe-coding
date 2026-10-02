# -*- coding: utf-8 -*-
"""
parse-guide.py —— 把《高性价比人生指南》的 markdown 正文抽成结构化数据

为什么单独一个脚本：
  书是 markdown 写的，给人读的；产品要的是能被程序筛选、排序、编号检索的数据。
  这一步只做「搬运」，不改一个字——字段照原样搬，算法照作者在 index.html 里写的那套。

数据来源：docs-internal/内容源/高性价比人生指南-project/book/*.md（私有仓库，不公开）
输出：    js/guide-data.js（可公开，CC BY 4.0，页面里有署名）

用法：
  python tools/parse-guide.py                       # 用默认路径
  python tools/parse-guide.py <book目录> <输出文件>   # 自定义
"""
import json
import os
import re
import sys

TAG_RE = re.compile(r'<!--\s*成本标签:(.*?)-->')
KV_RE = re.compile(r'(钱|时间|毅力|收益|口径)\s*=\s*(\S+)')
FIELD_RE = re.compile(r'^-\s*(成本|说人话|收益|证据等级|来源|备注)\s*[:：]\s*(.*)$')
SEC_RE = re.compile(r'^#\s*(\d+)\.\s*(.+?)\s*$')
ENTRY_RE = re.compile(r'^###\s*(\d+)\.\s*(.+?)\s*$')

FIELD_MAP = {
    '成本': 'cost', '说人话': 'human', '收益': 'gain',
    '证据等级': 'grade', '来源': 'src', '备注': 'note',
}


def parse_tag(line):
    """从 HTML 注释里取出五个标签。这是作者留给人 machine-readable 的部分。"""
    m = TAG_RE.search(line)
    if not m:
        return None
    d = dict(KV_RE.findall(m.group(1)))
    if not d:
        return None
    return {
        'money': d.get('钱', ''),
        'time': d.get('时间', ''),
        'will': d.get('毅力', ''),
        'level': d.get('收益', ''),
        'scope': d.get('口径', ''),
    }


def clean(s):
    return s.strip()


def parse_file(path):
    """返回一个节里的所有条目"""
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()

    sec_no, sec_title = None, ''
    entries = []
    cur = None
    pending_tag = False

    for line in lines:
        m = SEC_RE.match(line)
        if m:
            sec_no, sec_title = int(m.group(1)), m.group(2)
            continue

        m = ENTRY_RE.match(line)
        if m:
            if cur:
                entries.append(cur)
            cur = {
                'sec': sec_no, 'secTitle': sec_title,
                'no': int(m.group(1)), 'title': clean(m.group(2)),
                'money': '', 'time': '', 'will': '', 'level': '', 'scope': '',
                'cost': '', 'human': '', 'gain': '', 'grade': '', 'src': '', 'note': '',
            }
            pending_tag = True
            continue

        if cur is None:
            continue

        # 标签必须在条目标题之后紧接着出现
        if pending_tag:
            tag = parse_tag(line)
            if tag:
                cur.update(tag)
                pending_tag = False
                continue

        m = FIELD_RE.match(line)
        if m:
            key = FIELD_MAP.get(m.group(1))
            val = clean(m.group(2))
            if key:
                # 同一字段出现多次就拼接（正文里偶有续行）
                cur[key] = (cur[key] + ' ' + val).strip() if cur[key] else val

    if cur:
        entries.append(cur)
    return entries


def main():
    default_book = os.path.join(
        'docs-internal', '内容源', '高性价比人生指南-project', 'book')
    default_out = os.path.join('js', 'guide-data.js')

    book_dir = sys.argv[1] if len(sys.argv) > 1 else default_book
    out_path = sys.argv[2] if len(sys.argv) > 2 else default_out

    if not os.path.isdir(book_dir):
        print('找不到 book 目录：%s' % book_dir)
        print('提示：正文在私有仓库 docs-internal 里，确认路径或手动传入。')
        return 1

    files = sorted(
        f for f in os.listdir(book_dir)
        if f.endswith('.md') and not f.startswith('.')
    )
    if not files:
        print('book 目录里没有 md 文件')
        return 1

    all_entries = []
    for fn in files:
        got = parse_file(os.path.join(book_dir, fn))
        all_entries.extend(got)
        print('%-32s %3d 条' % (fn, len(got)))

    # 编号统一成「第几节第几条」的稳定格式
    for e in all_entries:
        e['ref'] = '%d-%d' % (e['sec'], e['no'])

    # 自检：标签缺失的条目要报出来，不能静默通过
    missing = [e['ref'] for e in all_entries if not (e['money'] and e['level'] and e['scope'])]
    no_grade = [e['ref'] for e in all_entries if not e['grade']]

    print('')
    print('合计 %d 条' % len(all_entries))
    print('缺成本标签：%d 条 %s' % (len(missing), missing[:10]))
    print('缺证据等级：%d 条 %s' % (len(no_grade), no_grade[:10]))

    data = {
        'meta': {
            'title': '高性价比人生指南',
            'source': 'https://github.com/eternity4719/HowToLiveBetter',
            'license': 'CC BY 4.0',
            'author': 'eternity4719（保留原作者署名）',
            'note': '数据由 tools/parse-guide.py 从正文机械抽取，字段未做改写。'
                    '档位算法取自原仓库 index.html：'
                    'COST_W = { 钱:0/少/多=0/1/2, 时间:少/中/多=0/1/2, 毅力:否/些/是=0/1/2 }，'
                    '成本分=三项之和；收益=大时 0→极高 / ≤2→高 / 其余→一般，'
                    '收益=中时 0→高 / 其余→一般，收益=小→一般。'
        },
        'entries': all_entries,
    }

    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('/* 本文件由 tools/parse-guide.py 自动生成，请勿手工编辑。\n')
        f.write('   来源：《高性价比人生指南》 CC BY 4.0，原作者 eternity4719\n')
        f.write('   https://github.com/eternity4719/HowToLiveBetter */\n')
        f.write('window.GuideData = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    size = os.path.getsize(out_path)
    print('')
    print('已写出 %s  (%.0f KB)' % (out_path, size / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
