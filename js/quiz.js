// 熟图测验：「点出位置」与「看位置选名字」
(function (root) {
  'use strict';
  const M2 = root.DFMap2D;
  const L = root.DFLayout;
  const $ = id => document.getElementById(id);
  const ROUND = 10;

  let Q = null;

  function open(def) {
    const world = L.getWorld(def.id);
    const canvas = $('quiz-canvas');
    Q = { def, world, view: null, q: null, n: 0, right: 0, errSum: 0, answered: false, highlight: [] };
    $('qz-title').textContent = def.name + ' · 熟图测验';
    const { cw, ch } = M2.fitCanvas(canvas);
    Q.view = M2.makeView(cw, ch, world);
    if (!Q.bound) bind();
    next(true);
  }

  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    const canvas = $('quiz-canvas');
    M2.attachPanZoom(canvas, () => Q.view, draw);
    canvas.addEventListener('click', e => {
      if (!Q || !Q.q || Q.q.type !== 'where' || Q.answered) return;
      const r = canvas.getBoundingClientRect();
      const [x, y] = M2.toWorld(Q.view, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      answerWhere(x, y);
    });
    $('qz-next').addEventListener('click', () => next(false));
    $('qz-restart').addEventListener('click', () => next(true));
    ['qz-type', 'qz-areas', 'qz-extract'].forEach(id => $(id).addEventListener('change', () => next(true)));
    window.addEventListener('resize', () => { if (Q && $('quiz').classList.contains('active')) draw(); });
  }

  function pool() {
    const items = Q.world.rooms.map(r => ({ kind: 'room', name: r.name, ref: r }));
    if ($('qz-extract').checked) Q.world.extracts.forEach(e => items.push({ kind: 'extract', name: e.name, ref: e }));
    return items;
  }

  function next(reset) {
    if (reset) { Q.n = 0; Q.right = 0; Q.errSum = 0; }
    if (Q.n >= ROUND) { summary(); return; }
    const items = pool();
    const pick = items[Math.floor(Math.random() * items.length)];
    let type = $('qz-type').value;
    if (type === 'mix') type = Math.random() < 0.5 ? 'where' : 'which';
    Q.q = { type, target: pick };
    Q.answered = false;
    Q.highlight = [];
    $('qz-feedback').textContent = '';
    $('qz-options').innerHTML = '';
    if (type === 'where') {
      $('qz-question').innerHTML = `第 ${Q.n + 1}/${ROUND} 题：在地图上点出 <b style="color:#ffe14a">${pick.name}</b>${pick.kind === 'room' ? `<br><span class="hint">${pick.ref.tier}</span>` : ''}`;
    } else {
      $('qz-question').innerHTML = `第 ${Q.n + 1}/${ROUND} 题：黄框标出的是哪里？`;
      Q.highlight = [hl(pick)];
      const same = items.filter(i => i.kind === pick.kind && i.name !== pick.name);
      const opts = [pick];
      while (opts.length < 4 && same.length) opts.push(same.splice(Math.floor(Math.random() * same.length), 1)[0]);
      opts.sort(() => Math.random() - 0.5);
      opts.forEach(o => {
        const b = document.createElement('button');
        b.textContent = o.name;
        b.onclick = () => answerWhich(o, b);
        $('qz-options').appendChild(b);
      });
    }
    score();
    draw();
  }

  function hl(item, color) {
    const r = item.ref;
    return item.kind === 'room' ? { x: r.x, y: r.y, w: r.w, h: r.h, color } : { x: r.x, y: r.y, r: 40, color };
  }
  function centre(item) {
    const r = item.ref;
    return item.kind === 'room' ? [r.x + r.w / 2, r.y + r.h / 2] : [r.x, r.y];
  }

  function answerWhere(x, y) {
    const t = Q.q.target;
    const [cx, cy] = centre(t);
    const dist = Math.round(Math.hypot(cx - x, cy - y));
    const ok = t.kind === 'room' ? L.inside(x, y, t.ref, 30) : dist <= 70;
    finishQ(ok, ok ? '正确！' : `偏差 ${(dist * 0.08).toFixed(0)} 米`, dist);
    Q.highlight = [hl(t, ok ? '#50ff80' : '#ff5050'), { x, y, r: 8, color: '#ffffff' }];
    draw();
  }
  function answerWhich(o, btn) {
    if (Q.answered) return;
    const ok = o.name === Q.q.target.name;
    [...$('qz-options').children].forEach(b => { if (b.textContent === Q.q.target.name) b.classList.add('right'); });
    if (!ok) btn.classList.add('wrong');
    finishQ(ok, ok ? '正确！' : `应为「${Q.q.target.name}」`, 0);
    draw();
  }
  function finishQ(ok, text, dist) {
    Q.answered = true;
    Q.n++;
    if (ok) Q.right++;
    Q.errSum += dist;
    const r = Q.q.target.ref;
    const area = r.area ? (Q.world.areas.find(a => a.id === r.area) || {}).name : '';
    $('qz-feedback').innerHTML = `<span style="color:${ok ? '#50ff80' : '#ff7070'}">${text}</span>${area ? `<br>所在区域：${area}` : ''}${r.note ? `<br>${r.note}` : ''}${r.cond ? `<br>${r.cond}` : ''}`;
    score();
  }
  function score() { $('qz-score').textContent = `得分 ${Q.right} / ${Q.n}`; }
  function summary() {
    Q.q = null;
    $('qz-question').textContent = `本轮结束：${Q.right} / ${ROUND}`;
    $('qz-options').innerHTML = '';
    $('qz-feedback').textContent = Q.right >= 9 ? '熟图大师！' : Q.right >= 6 ? '还不错，再练几轮。' : '多去对局里跑跑图吧。';
    Q.highlight = [];
    draw();
  }

  function draw() {
    if (!Q) return;
    const { ctx, cw, ch } = M2.fitCanvas($('quiz-canvas'));
    // 答题过程中隐藏房间和撤离点名称；答完后显示
    M2.draw(ctx, cw, ch, Q.world, Q.view, {
      labels: { areas: $('qz-areas').checked, rooms: Q.answered || !Q.q, extracts: Q.answered || !Q.q },
      containers: false, spawns: false, unlocked: new Set(), highlight: Q.highlight,
    });
  }

  root.DFQuiz = { open };
})(window);
