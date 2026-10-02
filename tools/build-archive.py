# -*- coding: utf-8 -*-
"""
build-archive.py ── 把「锚点」项目的内容源合并成一份，并导出 md / docx / html 三种格式。

用法：
    python tools/build-archive.py

源（三份，全部并在一个文件里，不删减）：
  1. 桌面/本地资产索引.md               —— 东西都在哪、哪些不能上 GitHub
  2. js/protocols-data.js              —— Huberman《Protocols》47 条中文重述
  3. docs-internal/内容源/高性价比人生指南-全书合并版.md —— 指南 34 章 650 条 + 附录

产物（写到「桌面/锚点-内容源归档/」）：
  锚点-内容源全集.md / .docx / .html
"""
import os
import re
import json
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(os.path.expanduser('~'), 'Desktop', '锚点-内容源归档')
BASE = '锚点-内容源全集'
TODAY = '2026-10-02'

# ── 读源 ────────────────────────────────────────────────────────────────
with open(os.path.join(os.path.expanduser('~'), 'Desktop', 'Ai', '本地资产索引.md'),
          encoding='utf-8') as f:
    INDEX = f.read()

with open(os.path.join(ROOT, '_p47.json'), encoding='utf-8') as f:
    P47 = json.load(f)

GUIDE_DIR = os.path.join(ROOT, 'docs-internal', '内容源')
with open(os.path.join(GUIDE_DIR, '高性价比人生指南-全书合并版.md'), encoding='utf-8') as f:
    GUIDE = f.read()


def build_p47_md(d):
    out = []
    out.append('## 人体操作手册 · 47 条协议（中文重述）\n')
    out.append('> 原书：Protocols: An Operating Manual for the Human Body（有版权，英文原文不公开）。\n'
               '> 这里的「动作」和「机制」是按原书内容**用中文重新写的**，不是翻译也不是照抄。\n'
               '> 编号格式是 P-章-条，指回本地归档的原文，方便日后逐条核对。\n')
    by_ch = {}
    for e in d['entries']:
        by_ch.setdefault(e['ch'], []).append(e)
    for ch in sorted(by_ch):
        rows = sorted(by_ch[ch], key=lambda x: x['no'])
        title = rows[0]['chTitle']
        out.append('\n### 第 %d 章 %s（共 %d 条）\n' % (ch, title, len(rows)))
        for e in rows:
            kind = '今天可做' if e.get('kind') == 'do' else '要避免'
            out.append('\n#### %s｜%s（%s）\n' % (e['ref'], e['title'], kind))
            out.append('\n- **该做什么**：%s\n' % e['action'])
            out.append('- **为什么管用（参考，不打分）**：%s\n' % e['mechanism'])
    return ''.join(out)


P47_MD = build_p47_md(P47)

# ── 组装 ────────────────────────────────────────────────────────────────
HEAD = """# 锚点 · 内容源全集（全量合并版）

生成日期：%s

这个文件把「锚点」项目到目前为止用到的全部内容源**原样合并在一处**，一处都不少。
它由三份原本各自独立的文件拼成，原来那份不删，还在老地方。

## 这一份里有什么

| 部分 | 内容 | 体量 |
|---|---|---|
| 第一部分 | 本地资产索引：东西都放在哪、哪些不能上 GitHub | 原样全文 |
| 第二部分 | 人体操作手册 · 47 条协议中文重述（Huberman《Protocols》） | 47 条，每条含动作 + 机制 |
| 第三部分 | 高性价比人生指南 · 全书（eternity4719 著，CC BY 4.0） | 34 章 650 条 + 附录长文 |

## 关于版权，说清楚

- **高性价比人生指南**：作者 eternity4719，采用 CC BY 4.0 许可。可以公开传播，必须保留作者署名与原仓库链接
  `https://github.com/eternity4719/HowToLiveBetter`。本文件保留了原书的全部正文与解读。
- **Protocols（人体操作手册）**：有版权。**英文原文一个字都不公开**，只放在本地，仅供个人学习。
  这里收录的是编号 + 中文重述（用自己的话重写），编号 P-章-条 用于日后溯源核对。

---

""" % TODAY

MERGED = (
    HEAD
    + '\n# 第一部分 本地资产索引\n\n' + INDEX.strip() + '\n'
    + '\n\n---\n\n# 第二部分 内容源正文\n\n' + P47_MD
    + '\n\n---\n\n# 第三部分 高性价比人生指南（全书）\n\n' + GUIDE.strip() + '\n'
)

os.makedirs(OUT_DIR, exist_ok=True)
md_path = os.path.join(OUT_DIR, BASE + '.md')
with open(md_path, 'w', encoding='utf-8') as f:
    f.write(MERGED)
print('MD：', md_path, round(os.path.getsize(md_path) / 1024 / 1024, 2), 'MB')


# ── Markdown → 结构化块 ────────────────────────────────────────────────
TAG_RE = re.compile(r'<!--\s*成本标签:(.*?)\s*-->')


def clean(t):
    m = TAG_RE.search(t)
    return m.group(1).strip() if m else None


TAG_RE_G = re.compile(r'<!--\s*成本标签:(.*?)\s*-->')


def blocks(src):
    """把 markdown 拆成块：('h',level,text) / ('p',text) / ('li',level,text) / ('quote',text) / ('hr',) / ('code',text) / ('table',rows)"""
    out = []
    lines = src.split('\n')
    i = 0
    para = []
    indent_stack = []

    def flush():
        if para:
            out.append(('p', '\n'.join(para)))
            para.clear()

    while i < len(lines):
        raw = lines[i]
        ln = raw.rstrip()

        # 代码围栏
        if ln.startswith('```'):
            flush()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append(('code', '\n'.join(buf)))
            continue

        # 表格
        if ln.startswith('|') and '|' in ln[1:] and i + 1 < len(lines) and re.match(r'^\|[\s:\-|]+\|$', lines[i + 1].strip()):
            flush()
            rows = []
            head = [c.strip() for c in ln.strip().strip('|').split('|')]
            i += 2
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            out.append(('table', head, rows))
            continue

        if not ln.strip():
            flush()
            i += 1
            continue

        m = re.match(r'^(#{1,6})\s+(.*)$', ln)
        if m:
            flush()
            out.append(('h', len(m.group(1)), m.group(2).strip()))
            i += 1
            continue

        if ln.strip() in ('---', '***', '___'):
            flush()
            out.append(('hr',))
            i += 1
            continue

        if ln.lstrip().startswith('>'):
            flush()
            out.append(('quote', ln.lstrip()[1:].strip()))
            i += 1
            continue

        m = re.match(r'^(\s*)([-*+])\s+(.*)$', ln)
        if m:
            flush()
            level = len(m.group(1)) // 2
            out.append(('li', level, m.group(3)))
            i += 1
            continue

        para.append(ln)
        i += 1
    flush()
    return out


def inline_runs(text, add_run):
    """简易行内解析：**粗体** / *斜体* / `代码` / [文字](链接) / <链接>"""
    text = TAG_RE_G.sub(lambda m: '【标签】%s ' % m.group(1).strip(), text)
    pattern = re.compile(r'(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|<https?://[^>]+>)')
    pos = 0
    for m in pattern.finditer(text):
        if m.start() > pos:
            add_run(text[pos:m.start()], None)
        tok = m.group(0)
        if tok.startswith('**'):
            add_run(tok[2:-2], 'b')
        elif tok.startswith('`'):
            add_run(tok[1:-1], 'c')
        elif tok.startswith('['):
            mm = re.match(r'\[([^\]]+)\]\(([^)]+)\)', tok)
            if mm:
                add_run('%s <%s>' % (mm.group(1), mm.group(2)), None)
            else:
                add_run(tok, None)
        elif tok.startswith('<'):
            add_run(tok[1:-1], None)
        pos = m.end()
    if pos < len(text):
        add_run(text[pos:], None)


# ── 写 docx ────────────────────────────────────────────────────────────
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn

doc = Document()
style = doc.styles['Normal']
style.font.name = '微软雅黑'
style.font.size = Pt(10.5)
style.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')


def add_runs(par, text):
    def one(t, kind):
        if not t:
            return
        r = par.add_run(t)
        if kind == 'b':
            r.bold = True
        elif kind == 'c':
            r.font.name = 'Consolas'
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(0x44, 0x66, 0x88)
    inline_runs(text, one)


count = 0
for blk in blocks(MERGED):
    if blk[0] == 'h':
        lv = min(blk[1], 4)
        p = doc.add_heading(level=lv)
        add_runs(p, blk[2])
        for r in p.runs:
            r.font.color.rgb = RGBColor(0x1a, 0x1a, 0x1a)
    elif blk[0] == 'p':
        p = doc.add_paragraph()
        add_runs(p, blk[1])
    elif blk[0] == 'li':
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.left_indent = Pt(18 + 18 * blk[1])
        add_runs(p, blk[2])
    elif blk[0] == 'quote':
        p = doc.add_paragraph(style='Intense Quote')
        add_runs(p, blk[1])
    elif blk[0] == 'hr':
        doc.add_paragraph('————————————')
    elif blk[0] == 'code':
        p = doc.add_paragraph()
        r = p.add_run(blk[1])
        r.font.name = 'Consolas'
        r.font.size = Pt(9)
    elif blk[0] == 'table':
        head, rows = blk[1], blk[2]
        t = doc.add_table(rows=1, cols=len(head))
        t.style = 'Table Grid'
        for j, c in enumerate(head):
            cell = t.rows[0].cells[j]
            cell.text = ''
            add_runs(cell.paragraphs[0], c)
        for row in rows:
            cells = t.add_row().cells
            for j in range(len(head)):
                cells[j].text = ''
                if j < len(row):
                    add_runs(cells[j].paragraphs[0], row[j])
    count += 1
    if count % 3000 == 0:
        print('  docx 进度', count)

docx_path = os.path.join(OUT_DIR, BASE + '.docx')
doc.save(docx_path)
print('DOCX：', docx_path, round(os.path.getsize(docx_path) / 1024 / 1024, 2), 'MB')


# ── 写 html ────────────────────────────────────────────────────────────
def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline_html(t):
    # 先把成本标签换成占位符，再整体转义，最后还原成带样式的 span
    t = TAG_RE_G.sub(lambda m: '\x01' + esc(m.group(1).strip()) + '\x02', t)
    t = esc(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    t = re.sub(r'&lt;(https?://[^&\s]+)&gt;', r'<a href="\1">\1</a>', t)
    t = t.replace('\x01', '<span class="tag">【标签】').replace('\x02', '</span>')
    return t


parts = []
for blk in blocks(MERGED):
    if blk[0] == 'h':
        parts.append('<h%d>%s</h%d>' % (blk[1], inline_html(blk[2]), blk[1]))
    elif blk[0] == 'p':
        parts.append('<p>%s</p>' % inline_html(blk[1]))
    elif blk[0] == 'li':
        parts.append('<li style="margin-left:%dem">%s</li>' % (1 + blk[1] * 2, inline_html(blk[2])))
    elif blk[0] == 'quote':
        parts.append('<blockquote>%s</blockquote>' % inline_html(blk[1]))
    elif blk[0] == 'hr':
        parts.append('<hr>')
    elif blk[0] == 'code':
        parts.append('<pre>%s</pre>' % esc(blk[1]))
    elif blk[0] == 'table':
        head, rows = blk[1], blk[2]
        h = '<table><thead><tr>' + ''.join('<th>%s</th>' % inline_html(c) for c in head) + '</tr></thead><tbody>'
        for row in rows:
            h += '<tr>' + ''.join('<td>%s</td>' % inline_html(c if i < len(row) else '')
                                  for i, c in enumerate(head)) + '</tr>'
        parts.append(h + '</tbody></table>')

HTML = ('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>%s</title><style>'
        'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;max-width:860px;margin:40px auto;'
        'padding:0 20px;line-height:1.8;color:#222;background:#fff;}'
        'h1,h2,h3,h4{line-height:1.4;} h2{border-bottom:1px solid #ddd;padding-bottom:6px;}'
        'blockquote{border-left:4px solid #bbb;margin:12px 0;padding:6px 14px;color:#555;background:#fafafa;}'
        'code{background:#f2f2f2;padding:1px 5px;border-radius:3px;font-size:13px;}'
        'pre{background:#f6f6f6;padding:12px;overflow-x:auto;}'
        'table{border-collapse:collapse;width:100%%;margin:14px 0;font-size:14px;}'
        'th,td{border:1px solid #ccc;padding:6px 9px;text-align:left;} th{background:#f0f0f0;}'
        '.tag{color:#888;font-size:12px;}'
        'a{color:#0645ad;word-break:break-all;}'
        '</style></head><body>%s</body></html>' % (BASE, ''.join(parts)))

html_path = os.path.join(OUT_DIR, BASE + '.html')
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(HTML)
print('HTML：', html_path, round(os.path.getsize(html_path) / 1024 / 1024, 2), 'MB')

# ── 顺带把源文件也拷一份到桌面归档夹 ──────────────────────────────────
import shutil
copies = [
    (os.path.join(GUIDE_DIR, '高性价比人生指南-全集.zip'), '高性价比人生指南-全集.zip'),
    (os.path.join(GUIDE_DIR, '高性价比人生指南-全书合并版.md'), '源文件-高性价比人生指南-全书合并版.md'),
    (os.path.join(GUIDE_DIR, 'Protocols-47条-原文提取.json'), '源文件-Protocols-47条-原文提取.json'),
    (os.path.join(GUIDE_DIR, 'Huberman-Protocols-47条.md'), '源文件-Huberman-Protocols-47条.md'),
    (os.path.join(os.path.expanduser('~'), 'Desktop', 'Ai', '本地资产索引.md'), '源文件-本地资产索引.md'),
]
for src, name in copies:
    if os.path.exists(src):
        try:
            shutil.copy2(src, os.path.join(OUT_DIR, name))
            print('已拷：', name)
        except Exception as e:
            print('拷贝失败', name, e)

print('\n全部完成 →', OUT_DIR)
