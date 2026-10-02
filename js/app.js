// 三角洲变卖物统计
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const MAPS = ['零号大坝', '长弓溪谷', '航天基地', '巴克什', '潮汐监狱'];
  const MODES = ['常规', '机密', '绝密'];
  const CATS = ['收集品', '护甲', '头盔', '胸挂', '背包', '枪械'];
  // 分档：顺序即展示顺序；color 用游戏品质色
  const TIERS = [
    { id: '大红', g: 6, big: true, color: 'var(--g6)' },
    { id: '小红', g: 6, big: false, color: 'var(--g6)' },
    { id: '大金', g: 5, big: true, color: 'var(--g5)' },
    { id: '小金', g: 5, big: false, color: 'var(--g5)' },
    { id: '大紫', g: 4, big: true, color: 'var(--g4)' },
    { id: '小紫', g: 4, big: false, color: 'var(--g4)' },
    { id: '蓝', g: 3, color: 'var(--g3)' },
    { id: '绿', g: 2, color: 'var(--g2)' },
    { id: '白', g: 1, color: 'var(--g1)' },
    { id: '无品质', g: 0, color: 'var(--g0)' },
    { id: '品质未知', g: null, color: 'var(--gx)' },
  ];
  const TIER = Object.fromEntries(TIERS.map(t => [t.id, t]));
  // 社区经验容器分级（不含概率）
  const COMMUNITY = [
    ['高爆率', ['保险柜', '小保险箱', '服务器', '电脑', '实验服', '医疗物资堆', '航空储物箱']],
    ['中爆率', ['电脑机箱', '大武器箱', '衣服', '工具柜', '登山包', '鸟窝', '高级旅行箱', '高级储物箱', '三角蚌', '马桶', '特殊人机盒子']],
    ['低爆率', ['抽屉柜', '工具盒', '医疗包', '旅行袋', '手提箱', '储物柜', '野外物资箱', '井盖', '弹药箱']],
    ['最低', ['垃圾箱', '快递箱', '电脑包', '普通人机盒子']],
    ['特殊', ['Boss盒子', '幸运鼠鼠盒子', '武器箱', '水泥车', '空投', '干员盒子']],
  ];
  const BOXES = COMMUNITY.flatMap(([, l]) => l).concat(['其他']);

  // ---------- 存储 ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dfstat.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dfstat.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ---------- 数据 ----------
  const META = window.DF_META || {};
  const ITEMS = (window.DF_ITEMS || []).map((it, i) => Object.assign({ idx: i }, it));
  const BY_NAME = new Map(ITEMS.map(it => [it.name, it]));
  let priceOverride = store.get('prices', null);   // { name: price }

  function priceOf(it) {
    if (priceOverride && priceOverride[it.name] != null) return priceOverride[it.name];
    return it.price ?? null;
  }
  let threshold = +store.get('threshold', 6);
  function tierOf(it) {
    if (it.grade == null) return '品质未知';
    if (it.grade === 0) return '无品质';
    const t = TIERS.find(t => t.g === it.grade);
    if (t.big == null) return t.id;
    const big = (it.slots || 0) >= threshold;
    return TIERS.find(x => x.g === it.grade && x.big === big).id;
  }
  function fmt(v) {
    if (v == null) return '—';
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
    if (v >= 1e4) return (v / 1e4).toFixed(v >= 1e6 ? 0 : 1) + '万';
    return String(Math.round(v));
  }
  const tierHTML = id => `<span class="tier"><i style="background:${TIER[id].color}"></i>${id}</span>`;
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // ---------- 头部 ----------
  $('meta').textContent = `${ITEMS.length} 件物品 · 价格快照 ${META.priceFrom || '?'}${priceOverride ? '（已导入自定义价格）' : ''}`;
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    store.set('tab', b.dataset.tab);
    render();
  }));

  // ---------- 物品总览 ----------
  const F = { q: '', cat: '全部', tier: '全部', map: '全部', mode: '全部', sort: 'price' };
  const MAP_MODES = META.mapModes || {};
  const modesOf = it => [...new Set(it.sources.flatMap(s => MAP_MODES[s[0]] || []))];
  function chipGroup(el, values, cur, onPick, withDot) {
    el.innerHTML = values.map(v => `<span class="chip ${v === cur ? 'on' : ''}" data-v="${esc(v)}">${withDot && TIER[v] ? `<span class="dot" style="background:${TIER[v].color}"></span>` : ''}${esc(v)}</span>`).join('');
    el.onclick = e => { const c = e.target.closest('.chip'); if (c) onPick(c.dataset.v); };
  }
  $('f-map').innerHTML = ['全部', ...MAPS, '无产出地数据'].map(m => `<option>${m}</option>`).join('');
  $('f-th').value = String(threshold);
  $('f-q').addEventListener('input', e => { F.q = e.target.value.trim(); renderItems(); });
  $('f-map').addEventListener('change', e => { F.map = e.target.value; renderItems(); });
  $('f-mode').innerHTML = ['全部', ...MODES].map(m => `<option>${m}</option>`).join('');
  $('f-mode').addEventListener('change', e => { F.mode = e.target.value; renderItems(); });
  $('f-sort').addEventListener('change', e => { F.sort = e.target.value; renderItems(); });
  $('f-th').addEventListener('change', e => { threshold = +e.target.value; store.set('threshold', threshold); render(); });

  function filtered() {
    const q = F.q.toLowerCase();
    let list = ITEMS.filter(it =>
      (F.cat === '全部' || it.cat === F.cat) &&
      (F.tier === '全部' || tierOf(it) === F.tier) &&
      (!q || it.name.toLowerCase().includes(q) || (it.sub || '').includes(q)) &&
      (F.map === '全部' || (F.map === '无产出地数据' ? !it.sources.length : it.sources.some(s => s[0] === F.map))) &&
      (F.mode === '全部' || modesOf(it).includes(F.mode)));
    const per = it => { const p = priceOf(it); return p != null && it.slots ? p / it.slots : -1; };
    const sorters = {
      price: (a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1),
      per: (a, b) => per(b) - per(a),
      grade: (a, b) => ((b.grade ?? -1) - (a.grade ?? -1)) || ((priceOf(b) ?? -1) - (priceOf(a) ?? -1)),
      name: (a, b) => a.name.localeCompare(b.name, 'zh'),
    };
    return list.sort(sorters[F.sort]);
  }
  function attrs(it) {
    const a = [];
    if (it.level) a.push(`${it.level}级防护`);
    if (it.durability) a.push(`耐久 ${it.durability}`);
    if (it.capacity) a.push(`容量 ${it.capacity} 格`);
    if (it.caliber) a.push(it.caliber);
    if (it.weight) a.push(`${it.weight}kg`);
    return a.join(' · ');
  }
  function sourcesHTML(it) {
    if (!it.sources.length) return '<span class="muted">—</span>';
    return it.sources.map(([m, a]) => `<b>${esc(m)}</b>${a ? '·' + esc(a) : ''}${MAP_MODES[m] ? `<span class="muted">（${MAP_MODES[m].join('/')}）</span>` : ''}`).join('<br>');
  }
  function renderItems() {
    chipGroup($('f-cat'), ['全部', ...CATS], F.cat, v => { F.cat = v; renderItems(); });
    chipGroup($('f-tier'), ['全部', ...TIERS.map(t => t.id)], F.tier, v => { F.tier = v; renderItems(); }, true);
    const list = filtered();
    const total = list.reduce((s, it) => s + (priceOf(it) || 0), 0);
    $('count').textContent = `共 ${list.length} 件 · 价格合计 ${fmt(total)}（单价相加，仅供比较）`;
    $('items').querySelector('tbody').innerHTML = list.slice(0, 600).map(it => {
      const p = priceOf(it);
      const size = it.w && it.h ? `${it.w}×${it.h}` : it.slots ? `${it.slots} 格` : '—';
      return `<tr data-i="${it.idx}">
        <td>${it.pic ? `<img class="pic" loading="lazy" referrerpolicy="no-referrer" src="${esc(it.pic)}" alt="" onerror="this.style.visibility='hidden'">` : '<div class="pic"></div>'}</td>
        <td><div class="nm">${esc(it.name)}</div><div class="sub">${esc(it.cat)}${it.sub && it.sub !== it.cat ? ' · ' + esc(it.sub) : ''}</div></td>
        <td>${tierHTML(tierOf(it))}</td>
        <td>${size}</td>
        <td class="num">${fmt(p)}</td>
        <td class="num">${p != null && it.slots ? fmt(p / it.slots) : '—'}</td>
        <td class="src">${sourcesHTML(it)}</td>
        <td class="attr">${esc(attrs(it))}</td>
      </tr>`;
    }).join('');
  }
  $('items').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) openDrawer(ITEMS[+tr.dataset.i]);
  });

  // ---------- 详情 ----------
  function openDrawer(it) {
    const p = priceOf(it);
    const logs = store.get('log', []);
    const n = logs.length, hit = logs.filter(r => r.items.includes(it.name)).length;
    const variants = it.prices ? Object.entries(it.prices).map(([k, v]) => `${k} ${fmt(v)}`).join('；') : '';
    $('d-content').innerHTML = `
      ${it.pic ? `<img class="d-pic" referrerpolicy="no-referrer" src="${esc(it.pic)}" alt="" onerror="this.remove()">` : ''}
      <h2>${esc(it.name)}</h2>
      ${tierHTML(tierOf(it))}
      <div class="kv">
        <span>类别</span><span>${esc(it.cat)}${it.sub && it.sub !== it.cat ? ' · ' + esc(it.sub) : ''}</span>
        <span>格子</span><span>${it.w && it.h ? `${it.w}×${it.h}（${it.slots} 格）` : it.slots ? it.slots + ' 格' : '未知'}</span>
        <span>价格</span><span>${fmt(p)}${variants && Object.keys(it.prices).length > 1 ? `<br><span class="muted">${esc(variants)}</span>` : ''}</span>
        <span>单格价值</span><span>${p != null && it.slots ? fmt(p / it.slots) : '—'}</span>
        <span>出现位置</span><span>${sourcesHTML(it)}</span>
        ${attrs(it) ? `<span>属性</span><span>${esc(attrs(it))}</span>` : ''}
        <span>你的记录</span><span>${n ? `${hit} / ${n} 箱出过（${(hit / n * 100).toFixed(2)}%）` : '还没有出货记录'}</span>
        <span>数据来源</span><span>${{ official: '官方图鉴快照', 'price-only': '仅交易行价格（品质未知）', agent: 'DeltaForceAgent 数据（较新）' }[it.src] || '补充：' + esc(it.src.split(':')[1])}${it.gradeOld != null ? `<br><span class="muted">旧图鉴品质为 ${'白绿蓝紫金红'[it.gradeOld - 1]}，新数据为 ${'白绿蓝紫金红'[it.grade - 1]}，已按新数据</span>` : ''}</span>
      </div>
      ${it.desc ? `<p>${esc(it.desc).replace(/\n/g, '<br>')}</p>` : ''}`;
    $('drawer').classList.remove('hidden');
  }
  $('d-close').onclick = () => $('drawer').classList.add('hidden');
  $('drawer').addEventListener('click', e => { if (e.target.id === 'drawer') $('drawer').classList.add('hidden'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('drawer').classList.add('hidden'); });

  // ---------- 悬停提示 ----------
  const tip = $('tip');
  document.addEventListener('mousemove', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.classList.add('hidden'); return; }
    tip.innerHTML = t.dataset.tip;
    tip.classList.remove('hidden');
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  });

  // ---------- 条形图 ----------
  // rows: [{ label, value, color, text, tip, ci:[lo,hi] }]，max 为比例尺上限
  function bars(rows, max, wide) {
    max = max || Math.max(1, ...rows.map(r => r.value));
    return `<div class="bars${wide ? ' wide' : ''}">${rows.map(r => `
      <div class="bar" data-tip="${esc(r.tip || '')}">
        <span class="lab">${esc(r.label)}</span>
        <span class="track"><span class="fill" style="display:block;width:${r.value / max * 100}%;background:${r.color}"></span>
          ${r.ci ? `<span class="ci" style="left:${r.ci[0] / max * 100}%;width:${(r.ci[1] - r.ci[0]) / max * 100}%"></span>` : ''}</span>
        <span class="val">${esc(r.text)}</span>
      </div>`).join('')}</div>`;
  }

  // ---------- 分级统计 ----------
  let SC = '全部';
  function renderStats() {
    chipGroup($('s-cat'), ['全部', ...CATS], SC, v => { SC = v; renderStats(); });
    const list = ITEMS.filter(it => SC === '全部' || it.cat === SC);
    const groups = TIERS.map(t => ({ t, items: list.filter(it => tierOf(it) === t.id) })).filter(g => g.items.length);
    $('s-tiles').innerHTML = groups.map(g => {
      const ps = g.items.map(priceOf).filter(v => v != null);
      return `<div class="tile"><div class="k">${tierHTML(g.t.id)}</div><div class="v">${g.items.length}</div>
        <div class="s">中位 ${fmt(median(ps))} · 最高 ${fmt(ps.length ? Math.max(...ps) : null)}</div></div>`;
    }).join('');
    $('s-bars').innerHTML = bars(groups.map(g => ({ label: g.t.id, value: g.items.length, color: g.t.color, text: g.items.length + ' 件', tip: `${g.t.id}：${g.items.length} 件` })));
    const pr = groups.map(g => { const ps = g.items.map(priceOf).filter(v => v != null); return { g, m: median(ps), n: ps.length, min: ps.length ? Math.min(...ps) : null, max: ps.length ? Math.max(...ps) : null }; }).filter(x => x.m != null);
    $('s-price').innerHTML = bars(pr.map(x => ({ label: x.g.t.id, value: x.m, color: x.g.t.color, text: fmt(x.m), tip: `${x.g.t.id}：中位 ${fmt(x.m)}<br>最低 ${fmt(x.min)} · 最高 ${fmt(x.max)}<br>有价格的 ${x.n} 件` })));
    const cols = [...MAPS, '无数据'];
    $('s-matrix').innerHTML = `<thead><tr><th>分档</th>${cols.map(c => `<th class="num">${c}</th>`).join('')}</tr></thead><tbody>${groups.map(g => `<tr><td>${tierHTML(g.t.id)}</td>${cols.map(c => {
      const n = c === '无数据' ? g.items.filter(it => !it.sources.length).length : g.items.filter(it => it.sources.some(s => s[0] === c)).length;
      return `<td class="num">${n || '<span class="muted">0</span>'}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
    $('s-top').innerHTML = groups.filter(g => g.t.g !== null || true).map(g => {
      const top = g.items.filter(it => priceOf(it) != null).sort((a, b) => priceOf(b) - priceOf(a)).slice(0, 8);
      if (!top.length) return '';
      return `<div><div>${tierHTML(g.t.id)}</div><ol>${top.map(it => `<li><span>${esc(it.name)}</span><span>${fmt(priceOf(it))}</span></li>`).join('')}</ol></div>`;
    }).join('');
  }

  // ---------- 出货记录 ----------
  let pending = [];
  const opts = (arr, all) => (all ? [`<option>${all}</option>`] : []).concat(arr.map(v => `<option>${esc(v)}</option>`)).join('');
  $('l-map').innerHTML = opts(MAPS); $('l-mode').innerHTML = opts(MODES); $('l-box').innerHTML = opts(BOXES);
  $('p-map').innerHTML = opts(MAPS, '全部'); $('p-mode').innerHTML = opts(MODES, '全部'); $('p-box').innerHTML = opts(BOXES, '全部');
  $('l-items').innerHTML = ITEMS.filter(it => it.cat !== '枪械').map(it => `<option value="${esc(it.name)}">`).join('');
  const lastForm = store.get('form', null);
  if (lastForm) { $('l-map').value = lastForm.map; $('l-mode').value = lastForm.mode; $('l-box').value = lastForm.box; }

  function addPending() {
    const v = $('l-item').value.trim();
    if (!v) return;
    if (!BY_NAME.has(v)) { $('l-msg').textContent = `没找到「${v}」，请从下拉候选里选`; return; }
    pending.push(v);
    $('l-item').value = '';
    $('l-msg').textContent = '';
    renderPending();
  }
  function renderPending() {
    $('l-chips').innerHTML = pending.map((n, i) => `<span class="chip" data-i="${i}">${tierHTML(tierOf(BY_NAME.get(n)))} ${esc(n)}<span class="x">×</span></span>`).join('');
  }
  $('l-chips').onclick = e => { const c = e.target.closest('.chip'); if (c) { pending.splice(+c.dataset.i, 1); renderPending(); } };
  $('l-add').onclick = addPending;
  $('l-item').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPending(); } });
  function saveBox(items) {
    const rec = { t: Date.now(), map: $('l-map').value, mode: $('l-mode').value, box: $('l-box').value, items };
    const log = store.get('log', []);
    log.push(rec);
    if (!store.set('log', log)) { $('l-msg').textContent = '保存失败：浏览器存储不可用'; return; }
    store.set('form', { map: rec.map, mode: rec.mode, box: rec.box });
    pending = []; renderPending();
    $('l-msg').textContent = `已记录（${rec.map}·${rec.mode}·${rec.box}·${items.length ? items.length + ' 件' : '空箱'}），共 ${log.length} 箱`;
    renderLog();
  }
  $('l-save').onclick = () => { if ($('l-item').value.trim()) addPending(); saveBox(pending.slice()); };
  $('l-empty').onclick = () => saveBox([]);
  ['p-map', 'p-mode', 'p-box'].forEach(id => $(id).addEventListener('change', renderLog));

  // Wilson 95% 置信区间
  function wilson(k, n) {
    if (!n) return [0, 0];
    const z = 1.96, p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  const pct = v => (v * 100).toFixed(v < 0.01 && v > 0 ? 2 : 1) + '%';
  const boxValue = r => r.items.reduce((s, n) => s + (BY_NAME.has(n) ? priceOf(BY_NAME.get(n)) || 0 : 0), 0);

  function renderLog() {
    const all = store.get('log', []);
    const fm = $('p-map').value, fmo = $('p-mode').value, fb = $('p-box').value;
    const log = all.filter(r => (fm === '全部' || r.map === fm) && (fmo === '全部' || r.mode === fmo) && (fb === '全部' || r.box === fb));
    const n = log.length;
    const vals = log.map(boxValue);
    const itemsN = log.reduce((s, r) => s + r.items.length, 0);
    const empty = log.filter(r => !r.items.length).length;
    $('p-tiles').innerHTML = [
      ['记录箱数', n, `全部 ${all.length} 箱`],
      ['出货件数', itemsN, n ? `平均每箱 ${(itemsN / n).toFixed(2)} 件` : ''],
      ['空箱率', n ? pct(empty / n) : '—', `${empty} 个空箱`],
      ['平均每箱价值', n ? fmt(vals.reduce((a, b) => a + b, 0) / n) : '—', n ? `中位 ${fmt(median(vals))}` : ''],
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');

    if (!n) {
      $('p-tiers').innerHTML = '<p class="muted">还没有符合筛选的记录。在上面「记一箱」开始记录。</p>';
    } else {
      const rows = TIERS.filter(t => t.g !== 0).map(t => {
        const k = log.filter(r => r.items.some(nm => BY_NAME.has(nm) && tierOf(BY_NAME.get(nm)) === t.id)).length;
        const cnt = log.reduce((s, r) => s + r.items.filter(nm => BY_NAME.has(nm) && tierOf(BY_NAME.get(nm)) === t.id).length, 0);
        const ci = wilson(k, n);
        return { label: t.id, value: k / n, color: t.color, ci, text: `${pct(k / n)}（${pct(ci[0])}–${pct(ci[1])}）`, tip: `${t.id}：${k} / ${n} 箱出过，共 ${cnt} 件<br>95% 区间 ${pct(ci[0])} – ${pct(ci[1])}` };
      });
      $('p-tiers').innerHTML = bars(rows, Math.max(0.05, ...rows.map(r => r.ci[1])), true);
    }

    // 按容器
    const byBox = {};
    log.forEach(r => { (byBox[r.box] = byBox[r.box] || []).push(r); });
    const hasTier = (r, ids) => r.items.some(nm => BY_NAME.has(nm) && ids.includes(tierOf(BY_NAME.get(nm))));
    $('p-boxes').innerHTML = `<thead><tr><th>容器</th><th class="num">箱数</th><th class="num">出红</th><th class="num">出金及以上</th><th class="num">平均价值</th></tr></thead><tbody>${
      Object.entries(byBox).sort((a, b) => b[1].length - a[1].length).map(([b, rs]) => {
        const red = rs.filter(r => hasTier(r, ['大红', '小红'])).length, gold = rs.filter(r => hasTier(r, ['大红', '小红', '大金', '小金'])).length;
        return `<tr><td>${esc(b)}</td><td class="num">${rs.length}</td><td class="num">${pct(red / rs.length)}</td><td class="num">${pct(gold / rs.length)}</td><td class="num">${fmt(rs.map(boxValue).reduce((x, y) => x + y, 0) / rs.length)}</td></tr>`;
      }).join('') || '<tr><td colspan="5" class="muted">暂无</td></tr>'}</tbody>`;

    // 出得最多的物品
    const cnt = {};
    log.forEach(r => new Set(r.items).forEach(nm => { cnt[nm] = (cnt[nm] || 0) + 1; }));
    $('p-items').innerHTML = `<thead><tr><th>物品</th><th>分档</th><th class="num">出现箱数</th><th class="num">每箱概率</th></tr></thead><tbody>${
      Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([nm, k]) => {
        const it = BY_NAME.get(nm);
        return `<tr><td>${esc(nm)}</td><td>${it ? tierHTML(tierOf(it)) : ''}</td><td class="num">${k}</td><td class="num">${pct(k / n)}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">暂无</td></tr>'}</tbody>`;

    // 列表（最近 200 条）
    $('p-n').textContent = `（共 ${all.length} 箱，显示筛选后最近 200 条）`;
    const idxOf = new Map(all.map((r, i) => [r, i]));
    $('p-list').innerHTML = `<thead><tr><th>时间</th><th>地图</th><th>模式</th><th>容器</th><th>物品</th><th class="num">价值</th><th></th></tr></thead><tbody>${
      log.slice(-200).reverse().map(r => `<tr><td class="muted">${new Date(r.t).toLocaleString('zh-CN', { hour12: false })}</td><td>${esc(r.map)}</td><td>${esc(r.mode)}</td><td>${esc(r.box)}</td>
        <td>${r.items.length ? r.items.map(nm => BY_NAME.has(nm) ? `${tierHTML(tierOf(BY_NAME.get(nm)))} ${esc(nm)}` : esc(nm)).join('、') : '<span class="muted">空箱</span>'}</td>
        <td class="num">${fmt(boxValue(r))}</td><td><button data-del="${idxOf.get(r)}">删除</button></td></tr>`).join('')}</tbody>`;

    $('p-community').innerHTML = COMMUNITY.map(([lv, l]) => `<p><b>${lv}</b>：${l.join('、')}</p>`).join('');
  }
  $('p-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-del]');
    if (!b) return;
    const log = store.get('log', []);
    log.splice(+b.dataset.del, 1);
    store.set('log', log);
    renderLog();
  });
  $('p-export').onclick = () => download(`dfstat-log-${new Date().toISOString().slice(0, 10)}.json`, store.get('log', []));
  $('p-import').onclick = () => $('p-file').click();
  $('p-file').onchange = e => readJSON(e, data => {
    if (!Array.isArray(data) || data.some(r => !r || !Array.isArray(r.items) || !r.map)) throw new Error('格式不对');
    const log = store.get('log', []);
    const seen = new Set(log.map(r => r.t + '|' + r.box + '|' + r.items.join(',')));
    const add = data.filter(r => !seen.has(r.t + '|' + r.box + '|' + r.items.join(',')));
    store.set('log', log.concat(add));
    alert(`导入 ${add.length} 条（跳过重复 ${data.length - add.length} 条）`);
    renderLog();
  });
  $('p-clear').onclick = () => {
    if (!confirm('清空全部出货记录？建议先导出备份。')) return;
    store.set('log', []);
    renderLog();
  };

  function download(name, obj) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function readJSON(e, fn) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then(t => fn(JSON.parse(t))).catch(err => alert('导入失败：' + err.message));
  }

  // ---------- 数据说明 ----------
  function renderAbout() {
    const c = k => ITEMS.filter(it => it.src.startsWith(k)).length;
    $('about').innerHTML = `
      <h3>分档规则</h3>
      <ul>
        <li>品质颜色：红 &gt; 金 &gt; 紫 &gt; 蓝 &gt; 绿 &gt; 白，来自官方图鉴的品质等级。</li>
        <li><b>大/小</b>：按占用格子数划分，当前分界为 <b>≥${threshold} 格算「大」</b>（物品总览里可改成 4 / 6 / 9）。社区说法不统一，常见定义是「6 格及以上的红色物品叫大红」。</li>
        <li>枪械在游戏里没有品质色，归为「无品质」；图鉴没收录的物品归为「品质未知」。</li>
      </ul>
      <h3>数据来源</h3>
      <ul>
        <li><b>品质、格子、产出地、属性</b>：官方图鉴（playerhub.df.qq.com）字段，取自 <a href="https://github.com/zhuba-Ahhh/df-api" target="_blank" rel="noopener">zhuba-Ahhh/df-api</a> 的快照，共 ${c('official')} 件。这份快照偏旧，<b>产出地只覆盖零号大坝、长弓溪谷、航天基地</b>，巴克什和潮汐监狱的新物品不全。</li>
        <li><b>价格</b>：<a href="https://github.com/orzice/DeltaForcePrice" target="_blank" rel="noopener">orzice/DeltaForcePrice</a> 交易行价格，快照日期 ${META.priceFrom}（该项目已于 2026-01-11 停更）。价格随市场波动很大，可在下方导入新价格。护甲/头盔有「破损/几乎全新」等不同状态的价格，详情里可以看到。</li>
        <li><b>补充</b>：海洋之泪、“纵横”、万金泪冠的产出地取自<a href="https://www.18183.com/gonglue/202607/5sbgtvva.html" target="_blank" rel="noopener">攻略</a>和<a href="https://www.sohu.com/a/937327976_122511859" target="_blank" rel="noopener">大红图鉴</a>。</li>
        <li><b>较新数据补充</b>：${c('agent')} 件旧图鉴没收录的物品（巴克什、潮汐监狱的新物品、新枪等），品质、形状、格数取自 <a href="https://github.com/xxxsy11/DeltaForceAgent" target="_blank" rel="noopener">xxxsy11/DeltaForceAgent</a>（2026-03）。两份数据都收录的 327 件里有 326 件品质一致，唯一的冲突（高级咖啡豆）按新数据处理。</li>
        <li><b>图片</b>：官方图片（playerhub.df.qq.com），新物品的图片地址取自 <a href="https://github.com/lvhj4/bingo" target="_blank" rel="noopener">lvhj4/bingo</a> 和 <a href="https://github.com/MuLiuSaMa/NexBox" target="_blank" rel="noopener">MuLiuSaMa/NexBox</a>。</li>
        <li><b>模式</b>：按产出地所在地图开放的模式推算（零号大坝、长弓溪谷：常规/机密；航天基地、巴克什：机密/绝密；潮汐监狱：绝密），不代表物品在每个模式都一定会刷。</li>
        <li><b>仍缺</b>：${ITEMS.filter(it => it.grade == null).length} 件品质未知，${ITEMS.filter(it => !it.pic).length} 件没有图片，${ITEMS.filter(it => it.price == null).length} 件没有价格（大多是价格表里已下架的旧物品），${ITEMS.filter(it => !it.sources.length).length} 件没有产出地数据。</li>
      </ul>
      <h3>出现概率</h3>
      <ul>
        <li>官方没有公布过爆率。网上流传的「官方爆率」（例如「红品 0.08% / 0.35% / 0.8%」）找不到可核实的官方出处，<b>本工具不采用</b>。</li>
        <li>「出货记录」页按你自己记录的开箱数据计算实测概率，并给出 95% 置信区间。样本越多越准，红色物品通常要几百上千箱才有参考意义。</li>
        <li>物品在各模式（常规/机密/绝密）里实际刷不刷、刷多少，同样没有公开数据；页面上的「模式」只是按地图推算，要看真实情况得靠出货记录。</li>
      </ul>`;
  }
  $('a-price').onclick = () => $('a-file').click();
  $('a-file').onchange = e => readJSON(e, data => {
    if (!Array.isArray(data)) throw new Error('应为数组');
    const map = {};
    data.forEach(p => { if (p && p.name && typeof p.price === 'number') map[String(p.name).replace(/\s*\((破损|几乎全新|完好|全新)\)\s*$/, '').trim()] ??= p.price; });
    const hit = ITEMS.filter(it => map[it.name] != null).length;
    priceOverride = map;
    store.set('prices', map);
    $('a-msg').textContent = `已导入，匹配 ${hit} 件物品`;
    $('meta').textContent = `${ITEMS.length} 件物品 · 已导入自定义价格`;
    render();
  });
  $('a-reset').onclick = () => {
    priceOverride = null;
    store.set('prices', null);
    $('a-msg').textContent = '已恢复内置价格';
    $('meta').textContent = `${ITEMS.length} 件物品 · 价格快照 ${META.priceFrom}`;
    render();
  };

  function render() {
    const tab = (document.querySelector('#tabs button.on') || {}).dataset?.tab || 'items';
    if (tab === 'items') renderItems();
    if (tab === 'stats') renderStats();
    if (tab === 'log') renderLog();
    if (tab === 'about') renderAbout();
  }
  // 恢复上次打开的页签（放在所有渲染函数定义之后）
  const tabBtn = document.querySelector(`#tabs button[data-tab="${store.get('tab', 'items')}"]`);
  if (tabBtn) tabBtn.click(); else render();

  window.DFStat = { tierOf, priceOf, ITEMS };
})();
