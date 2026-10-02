"""合并数据源，生成 data/items.js。

输入（放在 .research/，不进仓库）：
  items_raw.json  —— 由 zhuba-Ahhh/df-api 的物品文件整理（官方图鉴字段：品质、格子、产出地）
  price.json      —— orzice/DeltaForcePrice 的交易行价格快照
  agent/*.json    —— xxxsy11/DeltaForceAgent 的知识图谱（较新的品质、形状、格数、地图模式）
  bingo.csv       —— lvhj4/bingo 的「物品名 → 官方图片地址」
  nexbox/*.ts     —— MuLiuSaMa/NexBox 的枪械/护甲/头盔官方图片地址
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

# ---- DeltaForceAgent：补品质、形状、格数、描述 ----
def norm(n):
    return re.sub(r'[\s“”"「」·.]', '', n or '')
by_norm = {norm(k): v for k, v in items.items()}
agent_items = {}
for f in ['collection', 'equipment', 'firearms']:
    g = json.load(open(os.path.join(RES, 'agent', f + '.json'), encoding='utf-8'))
    nodes = {n['id']: n for n in g['nodes']}
    lv, typ = {}, {}
    for r in g['relationships']:
        to = nodes.get(r['to'], {}).get('props', {})
        if r['type'] == 'HAS_LEVEL': lv[r['from']] = to.get('level')
        elif r['type'].startswith('OF_'): typ[r['from']] = to.get('typeName')
    for nid, n in nodes.items():
        if n['labels'][0] not in ('Collectible', 'Equipment', 'Firearm'):
            continue
        pr = n['props']
        shape = pr.get('shape') or {}
        agent_items[norm(pr['name'])] = {
            'grade': lv.get(nid), 'w': shape.get('length') or pr.get('length'), 'h': shape.get('width') or pr.get('width'),
            'slots': pr.get('number'), 'type': typ.get(nid), 'desc': pr.get('desc'), 'weight': pr.get('weight'),
            'durability': pr.get('durability_new'), 'kind': f,
        }
agent_used = 0
for name, it in items.items():
    a = agent_items.get(norm(name))
    if not a:
        continue
    changed = False
    # 两份数据品质冲突时以较新的 DeltaForceAgent 为准，旧值记下来
    if it['grade'] not in (None, 0) and a['grade'] is not None and a['grade'] != it['grade']:
        it['gradeOld'] = it['grade']; it['grade'] = a['grade']
    if it['grade'] is None and a['grade'] is not None:
        it['grade'] = a['grade']; changed = True
    if not it.get('w') and a.get('w') and a.get('h'):
        it['w'], it['h'] = a['w'], a['h']; it['slots'] = a['w'] * a['h']; changed = True
    if not it.get('slots') and a.get('slots'):
        it['slots'] = a['slots']; changed = True
    if not it.get('sub') and a.get('type') and it['cat'] == '收集品':
        it['sub'] = a['type']
    if not it.get('desc') and a.get('desc'):
        it['desc'] = a['desc']
    if not it.get('weight') and a.get('weight'):
        it['weight'] = str(a['weight'])
    if not it.get('durability') and a.get('durability'):
        it['durability'] = a['durability']
    if changed and it['src'] == 'price-only':
        it['src'] = 'agent'; agent_used += 1

# ---- 官方图片地址补充 ----
import csv
pics = {}
for r in csv.DictReader(open(os.path.join(RES, 'bingo.csv'), encoding='utf-8-sig')):
    if r['source'].startswith('http'):
        pics.setdefault(norm(r['item']), r['source'])
for f in ['weapons', 'armors', 'helmets']:
    t = open(os.path.join(RES, 'nexbox', f + '.ts'), encoding='utf-8').read()
    for m in re.finditer(r'objectName:\s*"([^"]+)",\s*pic:\s*"([^"]+)"', t):
        pics.setdefault(norm(m.group(1)), m.group(2))
pic_used = 0
for name, it in items.items():
    if not it.get('pic') and norm(name) in pics:
        it['pic'] = pics[norm(name)]; pic_used += 1

# ---- 地图开放的模式 ----
mg = json.load(open(os.path.join(RES, 'agent', 'map.json'), encoding='utf-8'))
mn = {n['id']: n['props'] for n in mg['nodes']}
MAP_MODES = collections.defaultdict(list)
for r in mg['relationships']:
    if r['type'] == 'HAS_DIFFICULTY':
        MAP_MODES[mn[r['from']]['name']].append(mn[r['to']]['difficulty'].replace('普通', '常规'))

for name, s in sup.items():
    it = items.get(name)
    if not it:
        continue
    if it['grade'] is None or not it.get('slots'):
        it['grade'] = it['grade'] if it['grade'] is not None else s['grade']
        it['slots'] = it.get('slots') or s['slots']
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
    'mapModes': MAP_MODES,
}
os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
with open(os.path.join(ROOT, 'data', 'items.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 tools/build_data.py 生成，请勿手改\n')
    f.write('window.DF_META = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
    f.write('window.DF_ITEMS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')

c = collections.Counter((i['cat'], i['grade']) for i in out)
print({k: v for k, v in meta.items() if k != 'mapModes'}, 'agent补品质', agent_used, '补图片', pic_used)
print('还缺图片', [i['name'] for i in out if not i.get('pic')])
print('还缺品质', [i['name'] for i in out if i['grade'] is None])
for cat in ['收集品', '护甲', '头盔', '胸挂', '背包', '枪械']:
    print(cat, {g: n for (k, g), n in sorted(c.items(), key=lambda t: str(t[0][1])) if k == cat},
          'noPrice', sum(1 for i in out if i['cat'] == cat and not i.get('price')))
