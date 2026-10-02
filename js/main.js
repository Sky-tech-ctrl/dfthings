// 页面流程：主菜单 → 出发配置 → 3D 对局 → 结算；以及测验、编辑器入口
(function (root) {
  'use strict';
  const { MAPS, RARITY } = root.DF;
  const L = root.DFLayout;
  const Loot = root.DFLoot;
  const M2 = root.DFMap2D;
  const $ = id => document.getElementById(id);

  let current = null;   // 当前地图定义
  let world = null;     // 当前地图布局（出发配置用）

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  }
  function toast(t) {
    const el = $('toast');
    el.textContent = t;
    el.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.style.display = 'none'; }, 2200);
  }

  // ---------- 主菜单 ----------
  function renderMenu() {
    $('map-list').innerHTML = MAPS.map(m => {
      const w = L.getWorld(m.id);
      const custom = L.loadSaved(m.id) ? ' · <span style="color:#7fc89a">已自定义布局</span>' : '';
      const glass = w.rooms.filter(r => r.tier === '玻璃房').length;
      return `<div class="map-card">
        <h2>${m.name}</h2>
        <p>${m.desc}</p>
        <div class="meta">${w.areas.length} 个区域 · ${w.rooms.length} 个钥匙房（玻璃房 ${glass}）· ${w.containers.length} 个箱子 · ${w.extracts.length} 个撤离点${custom}</div>
        <div class="btns">
          <button class="primary" data-go="play" data-map="${m.id}">进入对局</button>
          <button data-go="quiz" data-map="${m.id}">熟图测验</button>
          <button data-go="edit" data-map="${m.id}">地图编辑</button>
        </div>
      </div>`;
    }).join('');
  }
  $('map-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-go]');
    if (!b) return;
    current = MAPS.find(m => m.id === b.dataset.map);
    if (b.dataset.go === 'play') openLoadout();
    if (b.dataset.go === 'quiz') { show('quiz'); root.DFQuiz.open(current); }
    if (b.dataset.go === 'edit') { show('editor'); root.DFEditor.open(current); }
  });

  // ---------- 出发配置 ----------
  let code = '';
  function openLoadout() {
    world = L.getWorld(current.id);
    $('lo-title').textContent = current.name;
    $('lo-desc').textContent = current.desc;
    const cards = world.rooms.filter(r => r.tier !== '密码房');
    const tierColor = M2.TIER_STROKE;
    const saved = loadPref('cards.' + current.id);
    $('lo-cards').innerHTML = cards.map(r => `<label><input type="checkbox" value="${r.card}" ${!saved || saved.includes(r.card) ? 'checked' : ''}>
      ${r.card} <span class="tier" style="color:${tierColor[r.tier]};border-color:${tierColor[r.tier]}">${r.tier}</span></label>`).join('')
      || '<p class="hint">这张图没有钥匙房</p>';
    code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    $('lo-code').textContent = code;
    const pw = world.rooms.filter(r => r.tier === '密码房');
    $('lo-code-where').textContent = pw.length ? '密码房：' + pw.map(r => r.name + (r.note ? `（${r.note}）` : '')).join('；') : '这张图暂无密码房';
    $('lo-spawn').innerHTML = '<option value="-1">随机</option>' + world.spawns.map((s, i) => {
      const a = world.areas.find(a => L.inside(s.x, s.y, a, 120));
      return `<option value="${i}">出生点 ${i + 1}${a ? ' · ' + a.name + '附近' : ''}</option>`;
    }).join('');
    $('lo-labels').value = loadPref('labels') || 'all';
    $('lo-time').value = loadPref('time') || '1800';
    show('loadout');
  }
  $('lo-all').onclick = () => document.querySelectorAll('#lo-cards input').forEach(i => { i.checked = true; });
  $('lo-none').onclick = () => document.querySelectorAll('#lo-cards input').forEach(i => { i.checked = false; });
  $('lo-back').onclick = () => { renderMenu(); show('menu'); };
  $('lo-start').onclick = startRaid;

  let lastSettings = null;
  function startRaid() {
    const cards = [...document.querySelectorAll('#lo-cards input:checked')].map(i => i.value);
    const settings = {
      cards, code,
      labels: $('lo-labels').value,
      time: +$('lo-time').value,
      spawn: +$('lo-spawn').value,
    };
    savePref('cards.' + current.id, cards);
    savePref('labels', settings.labels);
    savePref('time', String(settings.time));
    lastSettings = settings;
    launch(settings);
  }
  function launch(settings) {
    show('game');
    try {
      root.DFGame.start({ world: L.getWorld(current.id), def: current, settings, onEnd: showResult });
    } catch (err) {
      console.error(err);
      toast('3D 场景启动失败：' + err.message);
      show('loadout');
    }
  }

  // ---------- 结算 ----------
  function showResult(r) {
    show('result');
    $('res-title').innerHTML = r.success ? `<span style="color:#50e080">${r.reason}</span>` : `<span style="color:#ff6060">撤离失败 · ${r.reason}</span>`;
    const t = Math.floor(r.time);
    const stat = (k, v) => `<div>${k}<b>${v}</b></div>`;
    $('res-stats').innerHTML = [
      stat('带出价值', Loot.fmt(r.value)),
      stat('用时', `${Math.floor(t / 60)}分${t % 60}秒`),
      stat('进入房间', `${r.rooms} / ${r.roomsTotal}`),
      stat('开启钥匙房', r.unlocked),
      stat('搜完箱子', `${r.searched} / ${r.containersTotal}`),
      stat(r.success ? '带出物品' : '损失物品', (r.success ? r.items : r.lost).length + ' 件'),
    ].join('');
    const list = (r.success ? r.items : r.lost).slice().sort((a, b) => b.value - a.value);
    $('res-items').innerHTML = list.map(it => {
      const c = RARITY[it.rarity].color;
      return `<div class="item" style="border-color:${c};background:linear-gradient(160deg,${c}33,#1b2120);${r.success ? '' : 'opacity:.45'}">
        <span class="nm" style="color:${c}">${it.name}</span><span class="val">${Loot.fmt(it.value)}</span></div>`;
    }).join('');
  }
  $('res-again').onclick = () => { if (lastSettings) { lastSettings.code = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); openLoadout(); } };
  $('res-menu').onclick = () => { renderMenu(); show('menu'); };
  $('qz-back').onclick = () => { renderMenu(); show('menu'); };
  $('ed-back').onclick = () => { renderMenu(); show('menu'); };

  // ---------- 偏好 ----------
  function loadPref(k) { try { return JSON.parse(localStorage.getItem('dfthings.pref.' + k)); } catch (e) { return null; } }
  function savePref(k, v) { try { localStorage.setItem('dfthings.pref.' + k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } }

  renderMenu();
  root.DFApp = { show, launchFor(mapId, settings) { current = MAPS.find(m => m.id === mapId); world = L.getWorld(mapId); launch(settings); } };
})(window);
