// 2D 俯视地图渲染：小地图、全图、熟图测验、地图编辑器共用
(function (root) {
  'use strict';
  const { CONTAINERS } = root.DF;
  const L = root.DFLayout;

  const TIER_COLOR = { '玻璃房': 'rgba(90,200,255,0.30)', '非玻璃房': 'rgba(255,160,60,0.28)', '密码房': 'rgba(220,90,255,0.30)' };
  const TIER_STROKE = { '玻璃房': '#5ac8ff', '非玻璃房': '#ffa03c', '密码房': '#dc5aff' };

  // view: { x, y, z } —— 世界坐标中心与缩放（屏幕像素/世界单位）
  function makeView(cw, ch, world) {
    const z = Math.min(cw / world.w, ch / world.h) * 0.94;
    return { x: world.w / 2, y: world.h / 2, z };
  }
  function toScreen(v, cw, ch, x, y) { return [(x - v.x) * v.z + cw / 2, (y - v.y) * v.z + ch / 2]; }
  function toWorld(v, cw, ch, sx, sy) { return [(sx - cw / 2) / v.z + v.x, (sy - ch / 2) / v.z + v.y]; }

  function label(ctx, text, x, y, size, color, align = 'center') {
    ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size / 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // opt: { labels: {areas, rooms, extracts}, containers, spawns, grid, bg, bgAlpha, searched:Set, unlocked:Set,
  //        hideRooms:Set(房间 id 隐藏名称), selected:id, player:{x,y,yaw}, highlight:[{x,y,w,h}|{x,y,r}] }
  function draw(ctx, cw, ch, world, v, opt = {}) {
    const lab = opt.labels || { areas: true, rooms: true, extracts: true };
    const S = (x, y) => toScreen(v, cw, ch, x, y);
    ctx.save();
    ctx.fillStyle = '#12161a';
    ctx.fillRect(0, 0, cw, ch);

    const [ox, oy] = S(0, 0);
    const ww = world.w * v.z, wh = world.h * v.z;
    ctx.fillStyle = '#1d2620';
    ctx.fillRect(ox, oy, ww, wh);

    if (opt.bg && opt.bg.img) {
      const b = opt.bg;
      ctx.globalAlpha = b.alpha;
      const [bx, by] = S(b.x, b.y);
      ctx.drawImage(b.img, bx, by, b.w * v.z, b.h * v.z);
      ctx.globalAlpha = 1;
    }

    // 网格：A~H × 1~8，熟图时方便报点
    if (opt.grid !== false) {
      const step = world.w / 8;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        const [gx] = S(i * step, 0), [, gy] = S(0, i * step);
        ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + wh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + ww, gy); ctx.stroke();
      }
      if (v.z * step > 60) {
        for (let i = 0; i < 8; i++) {
          const [gx] = S(i * step + step / 2, 0), [, gy] = S(0, i * step + step / 2);
          label(ctx, String.fromCharCode(65 + i), gx, oy + 10, 11, 'rgba(255,255,255,0.35)');
          label(ctx, String(i + 1), ox + 10, gy, 11, 'rgba(255,255,255,0.35)');
        }
      }
    }
    ctx.strokeStyle = '#4a5a50';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, ww, wh);

    // 区域
    world.areas.forEach(a => {
      const [x, y] = S(a.x, a.y);
      ctx.fillStyle = a.id === opt.selected ? 'rgba(255,255,120,0.18)' : 'rgba(160,190,170,0.10)';
      ctx.fillRect(x, y, a.w * v.z, a.h * v.z);
      ctx.strokeStyle = a.id === opt.selected ? '#ffff78' : 'rgba(180,210,190,0.45)';
      ctx.lineWidth = a.id === opt.selected ? 2 : 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, a.w * v.z, a.h * v.z);
      ctx.setLineDash([]);
      if (lab.areas) label(ctx, a.name, x + 2, y - 9, Math.max(11, Math.min(16, v.z * 22)), '#d8e8dc', 'left');
    });

    // 房间
    world.rooms.forEach(r => {
      const [x, y] = S(r.x, r.y);
      ctx.fillStyle = TIER_COLOR[r.tier] || 'rgba(200,200,200,0.2)';
      ctx.fillRect(x, y, r.w * v.z, r.h * v.z);
      ctx.fillStyle = r.id === opt.selected ? '#ffff78' : (TIER_STROKE[r.tier] || '#ccc');
      L.roomWalls(r).forEach(w => {
        const [wx, wy] = S(w.x, w.y);
        ctx.fillRect(wx, wy, Math.max(1, w.w * v.z), Math.max(1, w.h * v.z));
      });
      const d = L.doorRect(r);
      const [dx, dy] = S(d.x, d.y);
      ctx.fillStyle = opt.unlocked && opt.unlocked.has(r.id) ? '#50e070' : '#e04040';
      ctx.fillRect(dx, dy, Math.max(2, d.w * v.z), Math.max(2, d.h * v.z));
      const hidden = opt.hideRooms && opt.hideRooms.has(r.id);
      if (lab.rooms && !hidden) {
        const size = Math.max(10, Math.min(14, v.z * 16));
        const cx = x + r.w * v.z / 2, cy = y + r.h * v.z / 2 + (opt.containers ? 10 : 0);
        ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
        // 名字比房间宽时拆成两行
        if (ctx.measureText(r.name).width > r.w * v.z * 1.05 && r.name.length > 3) {
          const half = Math.ceil(r.name.length / 2);
          label(ctx, r.name.slice(0, half), cx, cy - size * 0.55, size, '#fff');
          label(ctx, r.name.slice(half), cx, cy + size * 0.55, size, '#fff');
        } else label(ctx, r.name, cx, cy, size, '#fff');
      }
    });

    // 变卖物箱
    if (opt.containers) {
      const sz = Math.max(4, Math.min(14, v.z * 12));
      world.containers.forEach(c => {
        const t = CONTAINERS[c.type] || CONTAINERS.box;
        const [x, y] = S(c.x, c.y);
        const done = opt.searched && opt.searched.has(c.id);
        ctx.fillStyle = done ? '#444' : t.color;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        if (c.id === opt.selected) { ctx.strokeStyle = '#ffff78'; ctx.lineWidth = 2; ctx.strokeRect(x - sz / 2 - 2, y - sz / 2 - 2, sz + 4, sz + 4); }
        if (sz >= 11) label(ctx, t.short, x, y, sz - 2, done ? '#888' : '#111');
      });
    }

    // 出生点
    if (opt.spawns) {
      world.spawns.forEach((s, i) => {
        const [x, y] = S(s.x, s.y);
        ctx.fillStyle = opt.selected === 'spawn-' + i ? '#ffff78' : '#5aa0ff';
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.fill();
      });
    }

    // 撤离点
    world.extracts.forEach(e => {
      const [x, y] = S(e.x, e.y);
      const r = Math.max(5, 40 * v.z);
      ctx.fillStyle = 'rgba(60,230,110,0.25)';
      ctx.strokeStyle = e.id === opt.selected ? '#ffff78' : '#3ce66e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (lab.extracts) label(ctx, '⇧ ' + e.name, x, y - r - 9, Math.max(10, Math.min(13, v.z * 15)), '#7dffa6');
    });

    (opt.highlight || []).forEach(h => {
      ctx.strokeStyle = h.color || '#ffff40';
      ctx.lineWidth = 3;
      if (h.r != null) {
        const [x, y] = S(h.x, h.y);
        ctx.beginPath(); ctx.arc(x, y, Math.max(6, h.r * v.z), 0, Math.PI * 2); ctx.stroke();
      } else {
        const [x, y] = S(h.x, h.y);
        ctx.strokeRect(x - 3, y - 3, h.w * v.z + 6, h.h * v.z + 6);
      }
    });

    if (opt.player) {
      const p = opt.player;
      const [x, y] = S(p.x, p.y);
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      // yaw 为 0 时朝北（-y）
      const dx = Math.sin(p.yaw), dy = -Math.cos(p.yaw);
      ctx.moveTo(x + dx * 10, y + dy * 10);
      ctx.lineTo(x - dy * 6 - dx * 6, y + dx * 6 - dy * 6);
      ctx.lineTo(x + dy * 6 - dx * 6, y - dx * 6 - dy * 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  // 高 DPI 画布：返回 CSS 尺寸
  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cw: r.width, ch: r.height };
  }

  // 平移/缩放交互（右键或中键拖动、滚轮缩放）
  function attachPanZoom(canvas, getView, onChange, opts = {}) {
    let drag = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => {
      if (e.button === 1 || e.button === 2 || (opts.leftPan && e.button === 0 && opts.leftPan())) {
        const v = getView();
        drag = { sx: e.clientX, sy: e.clientY, x: v.x, y: v.y };
        e.preventDefault();
      }
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const v = getView();
      v.x = drag.x - (e.clientX - drag.sx) / v.z;
      v.y = drag.y - (e.clientY - drag.sy) / v.z;
      onChange();
    });
    window.addEventListener('mouseup', () => { drag = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const v = getView();
      const r = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(v, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      const k = Math.exp(-e.deltaY * 0.0015);
      v.z = Math.min(8, Math.max(0.1, v.z * k));
      const [nx, ny] = toWorld(v, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      v.x += wx - nx; v.y += wy - ny;
      onChange();
    }, { passive: false });
    return { isDragging: () => !!drag };
  }

  root.DFMap2D = { draw, makeView, toScreen, toWorld, fitCanvas, attachPanZoom, label, TIER_STROKE };
})(window);
