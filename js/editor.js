// 地图编辑器：对照真实地图底图校正区域/房间/箱子/撤离点位置
(function (root) {
  'use strict';
  const { CONTAINERS } = root.DF;
  const M2 = root.DFMap2D;
  const L = root.DFLayout;
  const $ = id => document.getElementById(id);
  const BG_KEY = id => `dfthings.bg.${id}`;
  const HANDLE = 10;

  let E = null;

  function open(def) {
    const world = L.getWorld(def.id);
    E = { def, world, view: null, sel: null, adding: null, drag: null, bg: loadBg(def.id) };
    $('ed-title').textContent = def.name + ' · 地图编辑';
    const { cw, ch } = M2.fitCanvas($('editor-canvas'));
    E.view = M2.makeView(cw, ch, world);
    bind();
    syncBgInputs();
    props();
    status(L.loadSaved(def.id) ? '当前为已保存的自定义布局' : '当前为默认示意布局');
    draw();
  }

  // ---------- 底图 ----------
  function loadBg(id) {
    const bg = { img: null, alpha: 0.6, x: 0, y: 0, w: 2000, h: 2000 };
    try {
      const s = JSON.parse(localStorage.getItem(BG_KEY(id)) || 'null');
      if (s) {
        Object.assign(bg, s, { img: null });
        const img = new Image();
        img.onload = () => { bg.img = img; draw(); };
        img.src = s.src;
      }
    } catch (e) { /* 忽略 */ }
    return bg;
  }
  function saveBg() {
    const b = E.bg;
    if (!b.img) { try { localStorage.removeItem(BG_KEY(E.def.id)); } catch (e) { /* 忽略 */ } return; }
    try {
      localStorage.setItem(BG_KEY(E.def.id), JSON.stringify({ src: b.src, alpha: b.alpha, x: b.x, y: b.y, w: b.w, h: b.h }));
    } catch (e) { status('底图过大，未能保存到浏览器（本次编辑仍可用）'); }
  }
  function setBgFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // 压缩到最长边 2048，便于存进 localStorage
        const k = Math.min(1, 2048 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const src = c.toDataURL('image/jpeg', 0.85);
        const im2 = new Image();
        im2.onload = () => {
          const b = E.bg;
          b.img = im2; b.src = src;
          b.x = 0; b.y = 0; b.w = 2000; b.h = Math.round(2000 * c.height / c.width);
          syncBgInputs(); saveBg(); draw();
        };
        im2.src = src;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function syncBgInputs() {
    const b = E.bg;
    $('ed-bg-alpha').value = b.alpha;
    $('ed-bg-x').value = b.x; $('ed-bg-y').value = b.y; $('ed-bg-w').value = b.w; $('ed-bg-h').value = b.h;
  }

  // ---------- 选择与命中 ----------
  function allItems() {
    const w = E.world;
    const list = [];
    w.containers.forEach(c => list.push({ kind: 'container', o: c }));
    w.extracts.forEach(e => list.push({ kind: 'extract', o: e }));
    w.spawns.forEach((s, i) => list.push({ kind: 'spawn', o: s, i }));
    w.rooms.forEach(r => list.push({ kind: 'room', o: r }));
    w.areas.slice().sort((a, b) => a.w * a.h - b.w * b.h).forEach(a => list.push({ kind: 'area', o: a }));
    return list;
  }
  function selId(it) { return it.kind === 'spawn' ? 'spawn-' + it.i : it.o.id; }
  function hit(x, y) {
    const z = E.view.z;
    for (const it of allItems()) {
      const o = it.o;
      if (it.kind === 'container' && Math.hypot(o.x - x, o.y - y) < Math.max(8, 8 / z)) return it;
      if (it.kind === 'spawn' && Math.hypot(o.x - x, o.y - y) < Math.max(10, 9 / z)) return it;
      if (it.kind === 'extract' && Math.hypot(o.x - x, o.y - y) < 40) return it;
      if ((it.kind === 'room' || it.kind === 'area') && L.inside(x, y, o)) return it;
    }
    return null;
  }
  function onHandle(it, x, y) {
    if (!it || (it.kind !== 'room' && it.kind !== 'area')) return false;
    const o = it.o, t = HANDLE / E.view.z;
    return Math.abs(x - (o.x + o.w)) < t && Math.abs(y - (o.y + o.h)) < t;
  }

  // ---------- 事件 ----------
  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    const canvas = $('editor-canvas');
    const pz = M2.attachPanZoom(canvas, () => E.view, draw);
    const worldPos = e => {
      const r = canvas.getBoundingClientRect();
      return M2.toWorld(E.view, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
    };
    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0 || !E) return;
      const [x, y] = worldPos(e).map(Math.round);
      if (E.adding) { addAt(E.adding, x, y); E.adding = null; canvas.style.cursor = ''; return; }
      const cur = E.sel && allItems().find(it => selId(it) === E.sel);
      if (onHandle(cur, x, y)) { E.drag = { it: cur, mode: 'resize' }; return; }
      const it = hit(x, y);
      E.sel = it ? selId(it) : null;
      if (it) E.drag = { it, mode: 'move', lx: x, ly: y, children: children(it) };
      props(); draw();
    });
    window.addEventListener('mousemove', e => {
      if (!E || !E.drag || pz.isDragging()) return;
      const [x, y] = worldPos(e).map(Math.round);
      const d = E.drag, o = d.it.o;
      if (d.mode === 'resize') {
        o.w = Math.max(30, x - o.x); o.h = Math.max(30, y - o.y);
      } else {
        const dx = x - d.lx, dy = y - d.ly;
        d.lx = x; d.ly = y;
        o.x += dx; o.y += dy;
        d.children.forEach(c => { c.x += dx; c.y += dy; });
      }
      d.moved = true;
      draw();
    });
    window.addEventListener('mouseup', () => {
      if (!E || !E.drag) return;
      const d = E.drag;
      E.drag = null;
      if (d.moved) {
        // 移动后的房间/箱子重新归属区域
        if (d.it.kind === 'room' || d.it.kind === 'container') reassign(d.it.o);
        persist(); props();
      }
    });
    window.addEventListener('keydown', e => {
      if (!E || !$('editor').classList.contains('active')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'INPUT') { del(); e.preventDefault(); }
      if (e.key === 'Escape') { E.adding = null; $('editor-canvas').style.cursor = ''; }
    });
    window.addEventListener('resize', () => { if (E && $('editor').classList.contains('active')) draw(); });

    document.querySelectorAll('#editor [data-add]').forEach(b => b.addEventListener('click', () => {
      E.adding = b.dataset.add;
      $('editor-canvas').style.cursor = 'crosshair';
      status('在地图上点击放置：' + b.textContent);
    }));
    const sel = $('ed-ctype');
    sel.innerHTML = Object.entries(CONTAINERS).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');

    $('ed-bg-file').addEventListener('change', e => { if (e.target.files[0]) setBgFile(e.target.files[0]); e.target.value = ''; });
    $('ed-bg-alpha').addEventListener('input', e => { E.bg.alpha = +e.target.value; saveBg(); draw(); });
    ['x', 'y', 'w', 'h'].forEach(k => $('ed-bg-' + k).addEventListener('input', e => { E.bg[k] = +e.target.value || 0; saveBg(); draw(); }));
    $('ed-bg-clear').addEventListener('click', () => { E.bg.img = null; E.bg.src = null; saveBg(); draw(); });

    $('ed-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(E.world, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dfthings-${E.def.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('ed-import').addEventListener('click', () => $('ed-import-file').click());
    $('ed-import-file').addEventListener('change', e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      f.text().then(t => {
        const w = JSON.parse(t);
        if (!w.areas || !w.rooms || !w.containers || !w.extracts) throw new Error('格式不对');
        if (w.map && w.map !== E.def.id) throw new Error(`这是「${w.map}」的布局`);
        w.spawns = w.spawns || [];
        E.world = w; E.sel = null;
        persist(); props(); draw();
        status('已导入');
      }).catch(err => status('导入失败：' + err.message));
    });
    $('ed-reset').addEventListener('click', () => {
      if (!window.confirm('恢复为默认示意布局？当前自定义布局会被清除（建议先导出）。')) return;
      L.clearSaved(E.def.id);
      E.world = L.getWorld(E.def.id); E.sel = null;
      props(); draw();
      status('已恢复默认布局');
    });
  }

  function children(it) {
    const w = E.world;
    if (it.kind === 'area') {
      const rooms = w.rooms.filter(r => r.area === it.o.id);
      const ids = new Set(rooms.map(r => r.id));
      return [...rooms, ...w.containers.filter(c => c.area === it.o.id || ids.has(c.room))];
    }
    if (it.kind === 'room') return w.containers.filter(c => c.room === it.o.id);
    return [];
  }
  function reassign(o) {
    const w = E.world;
    const cx = o.w ? o.x + o.w / 2 : o.x, cy = o.h ? o.y + o.h / 2 : o.y;
    const a = w.areas.find(a => L.inside(cx, cy, a));
    if (a) o.area = a.id;
    if (o.type) {
      const r = w.rooms.find(r => L.inside(o.x, o.y, r));
      o.room = r ? r.id : null;
      if (r) o.area = r.area;
    }
  }

  let uid = Date.now() % 100000;
  function addAt(kind, x, y) {
    const w = E.world, id = `${E.def.id}-u${uid++}`;
    let o;
    if (kind === 'area') { o = { id, name: '新区域', x: x - 100, y: y - 80, w: 200, h: 160 }; w.areas.push(o); }
    if (kind === 'room') { o = { id, name: '新房间', card: '新房间', tier: '非玻璃房', door: 's', note: '', area: null, x: x - 55, y: y - 45, w: 110, h: 90 }; reassign(o); w.rooms.push(o); }
    if (kind === 'extract') { o = { id, name: '新撤离点', cond: '', x, y }; w.extracts.push(o); }
    if (kind === 'spawn') { w.spawns.push({ x, y }); E.sel = 'spawn-' + (w.spawns.length - 1); }
    if (kind === 'container') { o = { id, type: $('ed-ctype').value, area: null, room: null, x, y }; reassign(o); w.containers.push(o); }
    if (o) E.sel = o.id;
    persist(); props(); draw();
    status('已添加');
  }
  function del() {
    if (!E.sel) return;
    const w = E.world;
    if (E.sel.startsWith('spawn-')) w.spawns.splice(+E.sel.slice(6), 1);
    else {
      w.containers = w.containers.filter(c => c.id !== E.sel && c.room !== E.sel);
      w.rooms = w.rooms.filter(r => r.id !== E.sel);
      w.extracts = w.extracts.filter(e => e.id !== E.sel);
      w.areas = w.areas.filter(a => a.id !== E.sel);
    }
    E.sel = null;
    persist(); props(); draw();
  }

  // ---------- 属性面板 ----------
  function props() {
    const box = $('ed-props');
    const it = E.sel && allItems().find(i => selId(i) === E.sel);
    if (!it) { box.innerHTML = '<h3>属性</h3><p class="hint">未选中</p>'; return; }
    const o = it.o;
    const field = (label, key, html) => `<label class="row">${label} ${html || `<input data-k="${key}" value="${String(o[key] ?? '').replace(/"/g, '&quot;')}">`}</label>`;
    const select = (key, opts) => `<select data-k="${key}">${opts.map(([v, t]) => `<option value="${v}" ${o[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    let h = `<h3>属性 · ${{ area: '区域', room: '房间', extract: '撤离点', spawn: '出生点', container: '箱子' }[it.kind]}</h3>`;
    if (it.kind === 'area' || it.kind === 'room' || it.kind === 'extract') h += field('名称', 'name');
    if (it.kind === 'room') {
      h += field('房卡', 'card');
      h += field('档次', 'tier', select('tier', [['玻璃房', '玻璃房'], ['非玻璃房', '非玻璃房'], ['密码房', '密码房']]));
      h += field('门朝向', 'door', select('door', [['n', '北'], ['s', '南'], ['w', '西'], ['e', '东']]));
      h += field('备注', 'note');
    }
    if (it.kind === 'extract') h += field('条件', 'cond');
    if (it.kind === 'container') h += field('类型', 'type', select('type', Object.entries(CONTAINERS).map(([k, t]) => [k, t.name])));
    h += `<p class="hint">坐标 (${Math.round(o.x)}, ${Math.round(o.y)})${o.w ? ` 尺寸 ${o.w}×${o.h}` : ''}</p>`;
    h += '<button id="ed-del">删除</button>';
    box.innerHTML = h;
    box.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      o[inp.dataset.k] = inp.value;
      persist(); draw();
    }));
    $('ed-del').onclick = del;
  }

  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      status(L.save(E.def.id, E.world) ? '已自动保存' : '保存失败（浏览器存储不可用），请导出 JSON');
    }, 300);
  }
  function status(t) { $('ed-status').textContent = t; }

  function draw() {
    if (!E) return;
    const { ctx, cw, ch } = M2.fitCanvas($('editor-canvas'));
    M2.draw(ctx, cw, ch, E.world, E.view, {
      labels: { areas: true, rooms: true, extracts: true }, containers: true, spawns: true,
      selected: E.sel, bg: E.bg, unlocked: new Set(),
    });
    const it = E.sel && allItems().find(i => selId(i) === E.sel);
    if (it && (it.kind === 'room' || it.kind === 'area')) {
      const [hx, hy] = M2.toScreen(E.view, cw, ch, it.o.x + it.o.w, it.o.y + it.o.h);
      ctx.fillStyle = '#ffff78';
      ctx.fillRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
    }
  }

  root.DFEditor = { open };
})(window);
