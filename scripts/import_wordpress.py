#!/usr/bin/env python3
"""
Import wca-hsv.org (WordPress + Elementor) into schools/wca/content/site/ in the shapes src/site/types.ts
describes: site.json (school, navigation, footer, social), home.json, pages/*.json + pages.ts,
news.json (WordPress posts) and calendar.json (kept as is). Each page's Elementor layout becomes
sections of blocks: headings, paragraphs (with links), lists, quotes, buttons, images, image-box
cards and YouTube/Vimeo videos.

    python3 scripts/import_wordpress.py            # fetch the live site
    python3 scripts/import_wordpress.py --cache D  # read/write fetched HTML in directory D
"""
import json, os, re, sys, urllib.request
from datetime import date
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, NavigableString, Tag

SITE = 'https://wca-hsv.org/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'schools', 'wca', 'content', 'site')
UA = {'User-Agent': 'Mozilla/5.0 (WCA app content import)'}
TODAY = date.today().isoformat()
CACHE = sys.argv[sys.argv.index('--cache') + 1] if '--cache' in sys.argv else None


def fetch(url):
    key = re.sub(r'[^a-z0-9]+', '-', url.lower()).strip('-')
    if CACHE and os.path.exists(os.path.join(CACHE, key)):
        return open(os.path.join(CACHE, key), encoding='utf-8').read()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        text = r.read().decode('utf-8', 'replace')
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
        open(os.path.join(CACHE, key), 'w', encoding='utf-8').write(text)
    return text


def clean(t):
    return re.sub(r'\s+', ' ', (t or '').replace('\xa0', ' ')).strip()


def absurl(u):
    return urljoin(SITE, u) if u else u


def best_src(img):
    """The largest image in a srcset, else src (lazy-loaded images keep it in data-*)."""
    srcset = img.get('srcset') or img.get('data-srcset') or ''
    best, bw = img.get('data-src') or img.get('src'), 0
    for part in srcset.split(','):
        bits = part.strip().split()
        if len(bits) == 2 and bits[1].endswith('w') and int(bits[1][:-1]) > bw:
            best, bw = bits[0], int(bits[1][:-1])
    return absurl(best) if best and not best.startswith('data:') else None


def paragraph(p):
    links = [{'label': clean(a.get_text()), 'url': absurl(a.get('href'))}
             for a in p.find_all('a') if a.get('href') and clean(a.get_text())]
    text = clean(p.get_text(' '))
    text = re.sub(r'\s+([.,;:!?])', r'\1', text)
    if not text:
        return None
    b = {'type': 'paragraph', 'text': text}
    if links:
        b['links'] = links
    return b


def rich(el):
    """A text editor's HTML: paragraphs, lists, headings and quotes."""
    out = []
    kids = [c for c in el.children if isinstance(c, Tag)] or [el]
    for c in kids:
        if c.name in ('ul', 'ol'):
            items = [clean(li.get_text(' ')) for li in c.find_all('li', recursive=False)]
            if items:
                out.append({'type': 'list', 'ordered': c.name == 'ol', 'items': items})
        elif c.name and re.fullmatch(r'h[1-6]', c.name):
            if clean(c.get_text()):
                out.append({'type': 'heading', 'level': int(c.name[1]), 'text': clean(c.get_text())})
        elif c.name == 'blockquote':
            out.append({'type': 'quote', 'text': clean(c.get_text(' '))})
        elif c.name == 'div' and c.find(['p', 'ul', 'ol']):
            out.extend(rich(c))
        else:
            b = paragraph(c)
            if b:
                out.append(b)
    return out


def video_block(w):
    html = str(w)
    m = re.search(r'(?:youtube\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{11})', html)
    if m:
        return {'type': 'youtube', 'id': m.group(1), 'aspectRatio': 16 / 9}
    m = re.search(r'vimeo\.com/(?:video/)?(\d+)', html)
    if m:
        return {'type': 'vimeo', 'id': m.group(1), 'aspectRatio': 16 / 9}
    return None


def widget_blocks(w):
    kind = (w.get('data-widget_type') or '').split('.')[0]
    if kind == 'heading':
        h = w.find(re.compile(r'^h[1-6]$')) or w
        t = clean(h.get_text(' '))
        level = int(h.name[1]) if h.name and re.fullmatch(r'h[1-6]', h.name) else 3
        return [{'type': 'heading', 'level': level, 'text': t}] if t else []
    if kind == 'text-editor':
        return rich(w.find(class_='elementor-widget-container') or w)
    if kind == 'button':
        a = w.find('a')
        label = clean(a.get_text(' ')) if a else ''
        return [{'type': 'button', 'label': label, 'url': absurl(a.get('href'))}] if a and label and a.get('href') else []
    if kind == 'image':
        img = w.find('img')
        src = best_src(img) if img else None
        if not src:
            return []
        b = {'type': 'image', 'src': src}
        if img.get('alt'):
            b['alt'] = clean(img['alt'])
        a = w.find('a')
        if a and a.get('href'):
            b['url'] = absurl(a['href'])
        cap = w.find('figcaption')
        if cap and clean(cap.get_text()):
            b['caption'] = clean(cap.get_text())
        return [b]
    if kind == 'image-box':
        img = w.find('img')
        title = w.find(class_='elementor-image-box-title')
        desc = w.find(class_='elementor-image-box-description')
        item = {'title': clean(title.get_text(' ')) if title else '', 'text': clean(desc.get_text(' ')) if desc else ''}
        if img and best_src(img):
            item['image'] = best_src(img)
        a = w.find('a')
        if a and a.get('href'):
            item['button'] = {'label': 'Learn more', 'url': absurl(a['href'])}
        return [{'type': 'cards', 'items': [item]}] if item['title'] or item['text'] else []
    if kind == 'icon-list':
        items = [clean(li.get_text(' ')) for li in w.find_all('li')]
        items = [i for i in items if i]
        return [{'type': 'list', 'ordered': False, 'items': items}] if items else []
    if kind == 'blockquote':
        q = w.find(class_='elementor-blockquote__content') or w
        t = clean(q.get_text(' '))
        who = w.find(class_='elementor-blockquote__author')
        if who and clean(who.get_text()):
            t = f'{t} ({clean(who.get_text())})'
        return [{'type': 'quote', 'text': t}] if t else []
    if kind == 'video':
        b = video_block(w)
        if b:
            return [b]
        settings = w.get('data-settings') or ''
        b = video_block(BeautifulSoup(settings.replace('\\/', '/'), 'html.parser'))
        if b:
            return [b]
        v = w.find('video')
        if v and v.get('src'):
            return [{'type': 'video', 'hls': absurl(v['src']), 'thumbnail': absurl(v.get('poster') or ''), 'aspectRatio': 16 / 9}]
        return []
    if kind == 'timeline-widget-addon':
        items = []
        for story in w.select('.twae-story, .twae-content') or []:
            t = clean(story.get_text(' '))
            if t:
                items.append(t)
        return [{'type': 'list', 'ordered': False, 'items': items}] if items else []
    return []  # dividers, social icons, menus, spacers


def merge_cards(blocks):
    """Image boxes next to each other become one cards block."""
    out = []
    for b in blocks:
        if b['type'] == 'cards' and out and out[-1]['type'] == 'cards':
            out[-1]['items'].extend(b['items'])
        else:
            out.append(b)
    return out


def backgrounds(html):
    """Elementor section background images, from the page's own stylesheet (post-<id>.css)."""
    out = {}
    page = re.search(r'data-elementor-id="(\d+)"[^>]*data-elementor-type="wp-page"', html) \
        or re.search(r'data-elementor-type="wp-page"[^>]*data-elementor-id="(\d+)"', html)
    if not page:
        return out
    try:
        css = fetch(f'{SITE}wp-content/uploads/elementor/css/post-{page.group(1)}.css')
    except Exception:
        return out
    for m in re.finditer(r'\.elementor-element-(\w+)[^{]*\{[^}]*background-image:url\("?([^")]+)"?\)', css):
        out.setdefault(m.group(1), absurl(m.group(2)))
    return out


def section_background(top, bgs, blocks):
    try:
        settings = json.loads(top.get('data-settings') or '{}')
    except ValueError:
        settings = {}
    first_image = next((b['src'] for b in blocks if b['type'] == 'image'), None)
    eid = next((c[len('elementor-element-'):] for c in top.get('class') or [] if c.startswith('elementor-element-') and c != 'elementor-element'), None)
    image = bgs.get(eid)
    if settings.get('background_background') == 'video' and settings.get('background_video_link'):
        return {'type': 'video', 'hls': settings['background_video_link'], 'thumbnail': image or first_image or '', 'background': True}
    if image:
        return {'type': 'image', 'src': image}
    return None


def page_sections(html):
    s = BeautifulSoup(html, 'html.parser')
    bgs = backgrounds(html)
    root = s.find(attrs={'data-elementor-type': 'wp-page'}) or s.find('main') or s.body
    tops = [c for c in root.children if isinstance(c, Tag) and 'elementor-element' in (c.get('class') or [])] or [root]
    sections = []
    for top in tops:
        blocks = []
        for w in top.select('[data-widget_type]'):
            # Widgets nested in another widget (rare) are read with their parent.
            if w.find_parent(attrs={'data-widget_type': True}):
                continue
            blocks.extend(widget_blocks(w))
        blocks = merge_cards(blocks)
        # Drop the same button or image twice in a row (mobile/desktop duplicates).
        dedup = []
        for b in blocks:
            if not dedup or b != dedup[-1]:
                dedup.append(b)
        bg = section_background(top, bgs, dedup)
        if dedup:
            sections.append({'blocks': dedup, **({'background': bg} if bg else {})})
    return sections, s


def page_json(pid, title, url, sections):
    return {'_meta': {'source': url, 'scrapedAt': TODAY}, 'page': {'id': pid, 'title': title, 'sourceUrl': url}, 'sections': sections}


def nav_and_footer(s):
    hdr = s.find(attrs={'data-elementor-type': 'header'})
    nav = []
    menu = hdr.find(attrs={'data-widget_type': 'nav-menu.default'}) if hdr else None
    if menu and menu.find('ul'):
        for li in menu.find('ul').find_all('li', recursive=False):
            a = li.find('a')
            item = {'label': clean(a.get_text()), 'url': absurl(a.get('href'))}
            sub = li.find('ul')
            if sub:
                item['items'] = [{'label': clean(x.get_text()), 'url': absurl(x.get('href'))} for x in sub.find_all('a')]
            nav.append(item)
    ft = s.find(attrs={'data-elementor-type': 'footer'})
    links = [{'label': clean(a.get_text()), 'url': absurl(a.get('href'))} for a in ft.find_all('a') if clean(a.get_text())] if ft else []
    social = []
    for a in (ft.find_all('a') if ft else []):
        href = a.get('href') or ''
        for name in ('facebook', 'instagram', 'x.com', 'twitter', 'youtube'):
            if name in href and not any(x['url'] == href for x in social):
                social.append({'service': {'x.com': 'X'}.get(name, name.title()), 'url': href})
    text = clean(ft.get_text(' ')) if ft else ''
    m = re.search(r'(Westminster Christian Academy is a ministry.*?)$', text)
    return nav, links, social, (m.group(1) if m else '')


def main():
    pages = json.loads(fetch(SITE + 'wp-json/wp/v2/pages?per_page=100&_fields=id,slug,link,title,parent'))
    home_html = fetch(SITE)
    home_sections, s = page_sections(home_html)
    nav, footer_links, social, ministry = nav_and_footer(s)

    os.makedirs(os.path.join(OUT, 'pages'), exist_ok=True)
    for f in os.listdir(os.path.join(OUT, 'pages')):
        os.remove(os.path.join(OUT, 'pages', f))
    json.dump(page_json('home', 'Home', SITE, home_sections), open(os.path.join(OUT, 'home.json'), 'w'), indent=1, ensure_ascii=False)

    ids = []
    for p in pages:
        if p['slug'] == 'home':
            continue
        title = BeautifulSoup(p['title']['rendered'], 'html.parser').get_text()
        secs, _ = page_sections(fetch(p['link']))
        if not secs:
            print(f"· {p['slug']}: nothing the app can show, skipped")
            continue
        json.dump(page_json(p['slug'], title, p['link'], secs), open(os.path.join(OUT, 'pages', f"{p['slug']}.json"), 'w'), indent=1, ensure_ascii=False)
        ids.append(p['slug'])
        print(f"✓ {p['slug']}: {sum(len(x['blocks']) for x in secs)} blocks")

    titles = {p['slug']: BeautifulSoup(p['title']['rendered'], 'html.parser').get_text() for p in pages}
    json.dump({'pages': [{'id': i, 'title': titles[i]} for i in ids], 'aliases': {}},
              open(os.path.join(OUT, 'pages', 'index.json'), 'w'), indent=1, ensure_ascii=False)

    var = lambda i: 'p_' + re.sub(r'\W', '_', i)
    ts = ['// Generated by scripts/import_wordpress.py — do not edit.', "import type { SitePage } from '../../../../src/site/types';"]
    ts += [f"import {var(i)} from './pages/{i}.json';" for i in ids]
    ts += ['', 'export const pages: Record<string, SitePage> = {'] + [f"  '{i}': {var(i)} as unknown as SitePage," for i in ids] + ['};', '']
    open(os.path.join(OUT, 'pages.ts'), 'w').write('\n'.join(ts))

    # News: WordPress posts (the site has none of substance yet; "Hello world!" is skipped).
    posts = json.loads(fetch(SITE + 'wp-json/wp/v2/posts?per_page=100&_embed=1'))
    articles = []
    for p in posts:
        if p['slug'] == 'hello-world':
            continue
        body = rich(BeautifulSoup(p['content']['rendered'], 'html.parser'))
        media = (p.get('_embedded', {}).get('wp:featuredmedia') or [{}])[0].get('source_url')
        articles.append({'id': str(p['id']), 'slug': p['slug'], 'title': clean(BeautifulSoup(p['title']['rendered'], 'html.parser').get_text()),
                         'publishedAt': p['date'][:10], 'author': 'Westminster Christian Academy', 'category': 'News', 'tags': [],
                         'featured': False, 'heroImage': media, 'summary': clean(BeautifulSoup(p['excerpt']['rendered'], 'html.parser').get_text())[:300],
                         'sourceUrl': p['link'], 'body': body})
    json.dump({'_meta': {'source': SITE, 'scrapedAt': TODAY}, 'categories': ['News'], 'articles': articles},
              open(os.path.join(OUT, 'news.json'), 'w'), indent=1, ensure_ascii=False)

    site_path = os.path.join(OUT, 'site.json')
    site = json.load(open(site_path))
    site['_meta'] = {'source': SITE, 'scrapedAt': TODAY}
    site['navigation'] = nav
    site['social'] = social
    site['footer']['quickLinks'] = [l for l in footer_links if l['label'].lower() not in ('about', 'academics', 'admissions', 'athletics', 'give', 'apply')]
    # The buttons families use most: the home page's Request Information, Apply, the Westminster Hub portal.
    hero = next((b for sec in home_sections for b in sec['blocks'] if b['type'] == 'button' and 'request' in b['label'].lower()), None)
    portal = next((l for l in footer_links if 'hub' in l['label'].lower()), None)
    apply = next((n for n in nav if n['label'].lower() == 'apply'), None)
    site['footer']['actions'] = [x for x in [
        hero and {'label': 'Request Information', 'url': hero['url']},
        apply and {'label': 'Apply', 'url': apply['url']},
        portal and {'label': portal['label'], 'url': portal['url']},
    ] if x]
    if ministry:
        site['footer']['nonDiscrimination'] = ministry
    json.dump(site, open(site_path, 'w'), indent=1, ensure_ascii=False)
    print(f"✓ home, {len(ids)} pages, {len(articles)} news posts, {len(nav)} menu items")


if __name__ == '__main__':
    main()
