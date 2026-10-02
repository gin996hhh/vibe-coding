# -*- coding: utf-8 -*-
"""
parse-protocols.py —— 从 Protocols epub 抽 47 条协议的「动作 + 机制」原文

只把原文抽到本地归档（docs-internal），**不进公开仓库**（版权）。
公开的产品页用的是 protocols-data.js 里的中文重述，由人根据这份原文改写。

输出：docs-internal/内容源/Protocols-47条-原文提取.json
"""
import json
import os
import re
import zipfile
import html

EPUB = os.path.join(
    r'C:\Users\gin99\Desktop\Protocols：人体操作手册 （Protocols An Operating Manual for the Human Body）',
    r'Protocols An Operating Manual for the Human Body (Andrew D. Huberman) (z-library.sk, 1lib.sk, z-lib.sk).epub')

OUT = os.path.join('docs-internal', '内容源', 'Protocols-47条-原文提取.json')

CHAPTER_TITLES = {
    1: '睡眠', 2: '运动', 3: '压力控制', 4: '营养',
    5: '光照', 6: '专注与学习', 7: '个人成长',
}


def txt(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def seg(flat, key, stops):
    i = flat.upper().find(key)
    if i < 0:
        return ''
    s = flat[i + len(key):]
    for nx in stops:
        j = s.upper().find(nx)
        if j > 0:
            s = s[:j]
    return s.strip()


def main():
    z = zipfile.ZipFile(EPUB)
    pat = re.compile(r'ch(\d+)_pro(\d+)\.xhtml$')
    files = {}
    for n in z.namelist():
        m = pat.search(n)
        if m:
            files[(int(m.group(1)), int(m.group(2)))] = n

    entries = []
    for (ch, no) in sorted(files.keys()):
        flat = txt(z.read(files[(ch, no)]).decode('utf-8', 'ignore'))
        # 标题：到第一个 SLEEP/EXERCISE 这类大写重复或 WHAT TO DO 前
        ti = re.match(r'^(.*?)(?:\s+(?:SLEEP|EXERCISE|STRESS|NUTRITION|LIGHT|FOCUS|PERSONAL)\s+PROTOCOL)', flat)
        title = ti.group(1).strip() if ti else flat.split(' WHAT TO DO')[0][:120]
        title = re.sub(r'^.*?Protocol \d+:\s*', '', title).strip() or flat[:80]
        todo = seg(flat, 'WHAT TO DO:', ['WHAT NOT TO DO:', 'HOW IT WORKS:', 'PROTOCOL SUMMARY'])
        notdo = seg(flat, 'WHAT NOT TO DO:', ['HOW IT WORKS:', 'PROTOCOL SUMMARY', 'WHAT TO DO:'])
        why = seg(flat, 'HOW IT WORKS:', ['WHAT NOT TO DO:', 'PROTOCOL SUMMARY', 'PROTOCOL:'])
        entries.append({
            'ref': 'P-%d-%02d' % (ch, no),
            'ch': ch,
            'chTitle': CHAPTER_TITLES.get(ch, ''),
            'no': no,
            'titleEn': title,
            'todoEn': todo,
            'notdoEn': notdo,
            'whyEn': why,
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'meta': {
            'note': '47 条协议的动作与机制原文，仅本地使用，禁止进公开仓库。'
                    '标题/正文均为原书英文，产品页用的中文重述见 js/protocols-data.js。',
            'source': 'Protocols An Operating Manual for the Human Body (epub, 本地)'
        }, 'entries': entries}, f, ensure_ascii=False, indent=1)

    by_ch = {}
    for e in entries:
        by_ch.setdefault(e['ch'], 0)
        by_ch[e['ch']] += 1
    print('共 %d 条' % len(entries))
    for c in sorted(by_ch):
        print('  第 %d 章 %s：%d 条' % (c, CHAPTER_TITLES[c], by_ch[c]))
    miss_todo = [e['ref'] for e in entries if not e['todoEn']]
    miss_why = [e['ref'] for e in entries if not e['whyEn']]
    print('缺动作：', miss_todo)
    print('缺机制：', miss_why)
    print('写出：', OUT, '(%.0f KB)' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
