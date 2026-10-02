"""合并数据源，生成 data/items.js。

输入（放在 .research/，不进仓库）：
  items_raw.json  —— 由 zhuba-Ahhh/df-api 的物品文件整理（官方图鉴字段：品质、格子、产出地）
  price.json      —— orzice/DeltaForcePrice 的交易行价格快照
以及仓库内的 tools/supplement.json（图鉴缺失物品的补充）。
用法：python tools/build_data.py
"""
import json, re, os, datetime, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, '.research')

raw = json.load(open(os.path.join(RES, 'items_raw.json'), encoding='utf-8'))
prices = json.load(open(os.path.join(RES, 'price.json'), encoding='utf-8'))
sup = json.load(open(os.path.join(ROOT, 'tools', 'supplement.json'), encoding='utf-8'))['items']

GUN_CLASSES = ['步枪', '冲锋枪', '霰弹枪', '轻机枪', '精确射手步枪', '狙击步枪', '手枪', '特殊武器']
WANT = {'收集品': '收集品', '护甲': '护甲', '头盔': '头盔', '胸挂': '胸挂', '背包': '背包', **{g: '枪械' for g in GUN_CLASSES}}
WEAR = re.compile(r'\s*\((破损|几乎全新|完好|全新)\)\s*$')

# 价格：按「基础名」归并，护甲/头盔的磨损状态作为变体
price_by = collections.defaultdict(dict)
price_cls = {}
times = []
for p in prices:
    if p['secondClassCN'] not in WANT:
        continue
    m = WEAR.search(p['name'])
    base = WEAR.sub('', p['name']).strip()
    state = m.group(1) if m else '标准'
    price_by[base][state] = p['price']
    price_cls[base] = p['secondClassCN']
    times.append(p['is_get_time'])

def parse_sources(s):
    out = []
    for part in re.split(r'[,，]', s or ''):
        part = part.strip()
        if not part:
            continue
        mp, _, area = part.partition('-')
        out.append([mp, area or ''])
    return out

items = {}
def add(x, cat):
    name = x['objectName']
    pd = x.get('propsDetail') or {}
    prot = x.get('protectDetail') or {}
    gun = x.get('gunDetail') or {}
    it = {
        'name': name, 'cat': cat,
        'sub': pd.get('type') or (x.get('secondClassCN') if cat == '枪械' else ''),
        'grade': x.get('grade') if cat != '枪械' else 0,
        'w': x.get('length'), 'h': x.get('width'),
        'slots': (x.get('length') or 0) * (x.get('width') or 0) or None,
        'weight': x.get('weight'),
        'desc': (x.get('desc') or '').strip(),
        'pic': x.get('pic'),
        'sources': parse_sources(pd.get('propsSource')),
        'src': 'official',
    }
    if prot.get('protectLevel'): it['level'] = prot['protectLevel']
    if prot.get('durability'): it['durability'] = prot['durability']
    if prot.get('capacity'): it['capacity'] = prot['capacity']
    if gun.get('caliber'): it['caliber'] = gun['caliber'].replace('ammo', '')
    items[name] = it

for x in raw['col']: add(x, '收集品')
for x in raw['armor']: add(x, '护甲')
for x in raw['helmet']: add(x, '头盔')
for x in raw['chest']: add(x, '胸挂')
for x in raw['bag']: add(x, '背包')
for x in raw['arms']: add(x, '枪械')

# 只在价格表里出现的物品：品质未知，除非补充表里有
for base, cls in price_cls.items():
    if base in items:
        continue
    items[base] = {'name': base, 'cat': WANT[cls], 'sub': cls if WANT[cls] == '枪械' else '',
                   'grade': 0 if WANT[cls] == '枪械' else None, 'w': None, 'h': None, 'slots': None,
                   'desc': '', 'pic': None, 'sources': [], 'src': 'price-only'}

for name, s in sup.items():
    it = items.get(name)
    if not it:
        continue
    it['grade'] = s['grade']
    it['slots'] = s['slots']
    it['src'] = 'supplement:' + s['ref']
    for src in s.get('sources', []):
        if src not in it['sources']:
            it['sources'].append(src)

for name, it in items.items():
    pv = price_by.get(name)
    if pv:
        it['prices'] = pv
        it['price'] = pv.get('标准') or pv.get('几乎全新') or max(pv.values())

out = sorted(items.values(), key=lambda i: (-(i.get('price') or 0)))
meta = {
    'priceFrom': datetime.datetime.fromtimestamp(min(times)).strftime('%Y-%m-%d'),
    'priceTo': datetime.datetime.fromtimestamp(max(times)).strftime('%Y-%m-%d'),
    'built': datetime.date.today().isoformat(),
    'count': len(out),
}
os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
with open(os.path.join(ROOT, 'data', 'items.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 tools/build_data.py 生成，请勿手改\n')
    f.write('window.DF_META = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
    f.write('window.DF_ITEMS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')

c = collections.Counter((i['cat'], i['grade']) for i in out)
print(meta)
for cat in ['收集品', '护甲', '头盔', '胸挂', '背包', '枪械']:
    print(cat, {g: n for (k, g), n in sorted(c.items(), key=lambda t: str(t[0][1])) if k == cat},
          'noPrice', sum(1 for i in out if i['cat'] == cat and not i.get('price')))
