// 3D 第一人称对局：场景建模、移动碰撞、刷卡开门、开箱搜包、撤离
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const { CONTAINERS, RARITY } = root.DF;
  const L = root.DFLayout;
  const M2 = root.DFMap2D;
  const Loot = root.DFLoot;

  const S = 0.08;            // 世界单位 → 米
  const EYE = 1.65, RADIUS = 0.32, WALL_H = 3.2;
  const WALK = 4.6, RUN = 7.2, GRAVITY = 18, JUMP = 6;
  const REACH = 2.4;          // 交互距离（米）
  const EXTRACT_R = 40, EXTRACT_TIME = 5;

  const $ = id => document.getElementById(id);

  // ---------- 小工具 ----------
  const matCache = new Map();
  function mat(color, extra) {
    const key = color + JSON.stringify(extra || {});
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial(Object.assign({ color }, extra)));
    return matCache.get(key);
  }
  function box(w, h, d, color, extra) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  }
  function textTexture(text, opt = {}) {
    const size = opt.size || 48;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
    const tw = Math.ceil(g.measureText(text).width) + size;
    c.width = tw; c.height = Math.ceil(size * 1.6);
    g.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
    g.fillStyle = opt.bg || 'rgba(0,0,0,0.65)';
    g.fillRect(0, 0, c.width, c.height);
    if (opt.border) { g.strokeStyle = opt.border; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6); }
    g.fillStyle = opt.color || '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return { tex, aspect: c.width / c.height };
  }
  function sprite(text, height, opt) {
    const { tex, aspect } = textTexture(text, opt);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: opt && opt.depthTest === false ? false : true, transparent: true }));
    s.scale.set(height * aspect, height, 1);
    return s;
  }
  function signPlane(text, height, opt) {
    const { tex, aspect } = textTexture(text, opt);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    return m;
  }

  // ---------- 箱子模型 ----------
  function containerMesh(type) {
    const g = new THREE.Group();
    const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    switch (type) {
      case 'safe':
        add(box(0.7, 0.9, 0.6, '#3a3f44'), 0, 0.45, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), mat('#c9a040')), 0.12, 0.55, 0.31).rotation.x = Math.PI / 2;
        return { g, h: 0.9, hw: 0.36, solid: true };
      case 'smallsafe':
        add(box(0.5, 0.5, 0.45, '#4a4f54'), 0, 0.25, 0);
        add(box(0.08, 0.08, 0.03, '#c9a040'), 0.1, 0.3, 0.23);
        return { g, h: 0.5, hw: 0.26, solid: true };
      case 'glass': {
        add(box(0.9, 0.9, 0.9, '#d8d8d8'), 0, 0.45, 0);
        add(box(0.82, 0.62, 0.82, '#9fefff', { transparent: true, opacity: 0.28 }), 0, 1.21, 0);
        add(box(0.22, 0.18, 0.22, '#f0c040', { emissive: '#604010' }), 0, 1.0, 0);
        return { g, h: 1.5, hw: 0.46, solid: true };
      }
      case 'crate':
        add(box(1.0, 0.6, 0.6, '#7a5a34'), 0, 0.3, 0);
        add(box(1.02, 0.08, 0.62, '#5a4024'), 0, 0.62, 0);
        return { g, h: 0.66, hw: 0.5, solid: true };
      case 'drawer':
        add(box(0.8, 1.0, 0.45, '#8a6a44'), 0, 0.5, 0);
        for (let i = 0; i < 3; i++) add(box(0.7, 0.02, 0.02, '#3a2a18'), 0, 0.25 + i * 0.27, 0.235);
        return { g, h: 1.0, hw: 0.41, solid: true };
      case 'pc':
        add(box(0.24, 0.48, 0.5, '#2a2d33'), 0, 0.24, 0);
        add(box(0.02, 0.04, 0.02, '#40a0ff', { emissive: '#2060c0' }), 0.06, 0.4, 0.26);
        return { g, h: 0.48, hw: 0.26, solid: false };
      case 'server':
        add(box(0.7, 1.9, 0.8, '#15171b'), 0, 0.95, 0);
        for (let i = 0; i < 6; i++) add(box(0.5, 0.03, 0.02, '#3070ff', { emissive: '#2050d0' }), 0, 0.3 + i * 0.26, 0.41);
        return { g, h: 1.9, hw: 0.4, solid: true };
      case 'medical':
        add(box(0.6, 0.4, 0.4, '#e8e8e8'), 0, 0.2, 0);
        add(box(0.2, 0.06, 0.02, '#d02020'), 0, 0.22, 0.21);
        add(box(0.06, 0.2, 0.02, '#d02020'), 0, 0.22, 0.21);
        return { g, h: 0.4, hw: 0.3, solid: false };
      case 'toolbox':
        add(box(0.9, 1.2, 0.5, '#a83030'), 0, 0.6, 0);
        add(box(0.8, 0.02, 0.02, '#401010'), 0, 0.8, 0.26);
        return { g, h: 1.2, hw: 0.46, solid: true };
      case 'bag':
        add(box(0.45, 0.55, 0.25, '#4f6a3a'), 0, 0.28, 0);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#4f6a3a')), 0, 0.55, 0).scale.set(1, 0.5, 0.6);
        return { g, h: 0.6, hw: 0.24, solid: false };
      case 'box':
        add(box(0.5, 0.3, 0.4, '#b8a47c'), 0, 0.15, 0);
        return { g, h: 0.3, hw: 0.26, solid: false };
      case 'field':
        add(box(0.9, 0.5, 0.6, '#556b3a'), 0, 0.25, 0);
        add(box(0.92, 0.06, 0.1, '#333'), 0, 0.5, 0);
        return { g, h: 0.56, hw: 0.46, solid: true };
      case 'nest':
        add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.1, 6, 12), mat('#7a6038')), 0, 0.1, 0).rotation.x = Math.PI / 2;
        return { g, h: 0.2, hw: 0.3, solid: false };
      case 'aircase':
        add(box(1.0, 0.45, 0.6, '#d06a2a'), 0, 0.23, 0);
        add(box(0.12, 0.47, 0.62, '#333'), -0.3, 0.23, 0);
        add(box(0.12, 0.47, 0.62, '#333'), 0.3, 0.23, 0);
        return { g, h: 0.46, hw: 0.5, solid: true };
      case 'body': {
        const torso = add(box(0.45, 0.25, 0.8, '#3d4a3a'), 0, 0.14, 0);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat('#c8a080')), 0, 0.16, -0.55);
        add(box(0.16, 0.16, 0.8, '#2e3a2c'), -0.12, 0.09, 0.75);
        add(box(0.16, 0.16, 0.8, '#2e3a2c'), 0.12, 0.09, 0.75);
        add(box(0.4, 0.2, 0.5, '#5a4a30'), 0, 0.34, -0.05);
        torso.userData.part = 'torso';
        return { g, h: 0.4, hw: 0.4, solid: false };
      }
      default:
        add(box(0.5, 0.5, 0.5, '#888'), 0, 0.25, 0);
        return { g, h: 0.5, hw: 0.25, solid: false };
    }
  }

  // ---------- 主体 ----------
  let G = null;

  function start(opts) {
    stop();
    const { world, def, settings, onEnd } = opts;
    const host = $('view3d');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.preserve });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9fb8c8');
    scene.fog = new THREE.Fog('#9fb8c8', 50, 190);
    const camera = new THREE.PerspectiveCamera(75, host.clientWidth / host.clientHeight, 0.05, 400);
    camera.rotation.order = 'YXZ';

    scene.add(new THREE.HemisphereLight('#dfefff', '#4a5a40', 0.85));
    const sun = new THREE.DirectionalLight('#fff4e0', 0.75);
    sun.position.set(-60, 100, -40);
    scene.add(sun);

    const showArea = settings.labels !== 'none';
    const showRoom = settings.labels === 'all';
    const colliders = [];       // { x0,z0,x1,z1, door?:room id }
    const addCol = (x0, z0, x1, z1, extra) => { const c = Object.assign({ x0, z0, x1, z1 }, extra); colliders.push(c); return c; };
    const rect2col = (r, extra) => addCol(r.x * S, r.y * S, (r.x + r.w) * S, (r.y + r.h) * S, extra);

    // 地面与边界
    const W = world.w * S, H = world.h * S;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80), mat('#56664a'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    scene.add(ground);
    [[-1, H / 2, 2, H + 2], [W + 1, H / 2, 2, H + 2], [W / 2, -1, W + 2, 2], [W / 2, H + 1, W + 2, 2]].forEach(([x, z, w, d]) => {
      const m = box(w, 4, d, '#6a6a60'); m.position.set(x, 2, z); scene.add(m);
      addCol(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    });

    const rand = L.rng(L.hash(def.id + 'decor'));
    const blocked = (x, y, pad) =>
      world.rooms.some(r => L.inside(x, y, r, pad)) ||
      world.containers.some(c => Math.hypot(c.x - x, c.y - y) < pad) ||
      world.extracts.some(e => Math.hypot(e.x - x, e.y - y) < EXTRACT_R + pad) ||
      world.spawns.some(s => Math.hypot(s.x - x, s.y - y) < pad);

    // 区域：地坪 + 名称牌 + 掩体
    world.areas.forEach((a, i) => {
      const shade = ['#8a8c86', '#7e817a', '#93918a', '#868a8e'][i % 4];
      const pad = box(a.w * S, 0.08, a.h * S, shade);
      pad.position.set((a.x + a.w / 2) * S, 0.04, (a.y + a.h / 2) * S);
      scene.add(pad);
      if (showArea) {
        const sp = sprite(a.name, 1.6, { color: '#e8fff0', bg: 'rgba(20,40,30,0.7)', border: '#7fc89a' });
        sp.position.set((a.x + a.w / 2) * S, 7, (a.y + a.h / 2) * S);
        scene.add(sp);
      }
      const n = 2 + Math.floor(a.w * a.h / 60000);
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < 30; t++) {
          const kind = rand();
          const w = kind < 0.35 ? 75 : kind < 0.7 ? 50 : 22, d = kind < 0.35 ? 30 : kind < 0.7 ? 5 : 22;
          const rot = rand() < 0.5;
          const ww = rot ? d : w, dd = rot ? w : d;
          const x = a.x + 30 + rand() * (a.w - 60 - ww), y = a.y + 30 + rand() * (a.h - 60 - dd);
          if (x < a.x || y < a.y || blocked(x + ww / 2, y + dd / 2, Math.max(ww, dd) / 2 + 30)) continue;
          const h = kind < 0.35 ? 2.6 : kind < 0.7 ? 1.3 : 1.0;
          const color = kind < 0.35 ? ['#7a3a2a', '#2a5a7a', '#5a6a2a'][k % 3] : kind < 0.7 ? '#9a9a90' : '#4a4a40';
          const m = box(ww * S, h, dd * S, color);
          m.position.set((x + ww / 2) * S, h / 2, (y + dd / 2) * S);
          scene.add(m);
          rect2col({ x, y, w: ww, h: dd });
          break;
        }
      }
    });

    // 野外树木（实例化）
    const trees = [];
    for (let t = 0; t < 900 && trees.length < 170; t++) {
      const x = 30 + rand() * (world.w - 60), y = 30 + rand() * (world.h - 60);
      if (world.areas.some(a => L.inside(x, y, a, 45)) || blocked(x, y, 60)) continue;
      trees.push([x, y, 0.7 + rand() * 0.5]);
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 6), mat('#5a4030'), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4, 7), mat('#2f5a2c'), trees.length);
    const tmp = new THREE.Object3D();
    trees.forEach(([x, y, s], i) => {
      tmp.position.set(x * S, 1.2 * s, y * S); tmp.scale.set(s, s, s); tmp.updateMatrix(); trunk.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x * S, 4 * s, y * S); tmp.updateMatrix(); crown.setMatrixAt(i, tmp.matrix);
      addCol(x * S - 0.3, y * S - 0.3, x * S + 0.3, y * S + 0.3);
    });
    scene.add(trunk, crown);

    // 房间：墙、地板、天花板、门、门牌、读卡器
    const doors = new Map();   // room id → { room, mesh, col, light, locked, anim }
    world.rooms.forEach(r => {
      const tierCol = M2.TIER_STROKE[r.tier] || '#ccc';
      L.roomWalls(r).forEach(w => {
        const m = box(w.w * S, WALL_H, w.h * S, '#c8c4b8');
        m.position.set((w.x + w.w / 2) * S, WALL_H / 2, (w.y + w.h / 2) * S);
        scene.add(m);
        rect2col(w);
      });
      const floor = box(r.w * S, 0.1, r.h * S, r.tier === '玻璃房' ? '#5a6a74' : r.tier === '密码房' ? '#5a4a6a' : '#6a5a4a');
      floor.position.set((r.x + r.w / 2) * S, 0.06, (r.y + r.h / 2) * S);
      scene.add(floor);
      const ceil = box(r.w * S, 0.15, r.h * S, '#a8a8a0');
      ceil.position.set((r.x + r.w / 2) * S, WALL_H + 0.07, (r.y + r.h / 2) * S);
      scene.add(ceil);
      const lamp = box(r.w * S * 0.4, 0.04, 0.5, '#ffffff', { emissive: '#fff4d0' });
      lamp.position.set((r.x + r.w / 2) * S, WALL_H - 0.02, (r.y + r.h / 2) * S);
      scene.add(lamp);

      const d = L.doorRect(r);
      const horiz = d.w > d.h;
      const dm = new THREE.Group();
      const dh = WALL_H - 0.6;
      const panel = box(d.w * S, dh, d.h * S * 0.6, '#6a7480');
      const stripe = box(d.w * S * (horiz ? 1.002 : 1), 0.18, d.h * S * 0.62 + (horiz ? 0 : 0), tierCol);
      stripe.position.y = 0.35;
      dm.add(panel, stripe);
      const dcx = (d.x + d.w / 2) * S, dcz = (d.y + d.h / 2) * S;
      dm.position.set(dcx, dh / 2, dcz);
      scene.add(dm);
      const lintel = box(d.w * S, 0.6, d.h * S, '#c8c4b8');
      lintel.position.set(dcx, WALL_H - 0.3, dcz);
      scene.add(lintel);
      const col = rect2col(d, { door: r.id });

      // 门外朝向
      const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[r.door] || [0, 1];
      const sign = signPlane(showRoom ? r.name : '？？？', 0.42, { color: '#fff', bg: 'rgba(15,20,25,0.9)', border: tierCol, size: 40 });
      sign.position.set(dcx + out[0] * 0.36, WALL_H - 0.3, dcz + out[1] * 0.36);
      sign.rotation.y = Math.atan2(out[0], out[1]);
      scene.add(sign);
      const reader = box(0.14, 0.22, 0.06, '#222');
      const side = horiz ? [d.w * S / 2 + 0.25, 0] : [0, d.h * S / 2 + 0.25];
      reader.position.set(dcx + side[0] + out[0] * 0.36, 1.3, dcz + side[1] + out[1] * 0.36);
      reader.rotation.y = Math.atan2(out[0], out[1]);
      scene.add(reader);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
      light.position.copy(reader.position).add(new THREE.Vector3(out[0] * 0.04, 0.05, out[1] * 0.04));
      light.rotation.y = reader.rotation.y;
      scene.add(light);
      doors.set(r.id, { room: r, mesh: dm, col, light, locked: true, anim: 0, out, pos: [dcx, dcz] });
    });

    // 箱子
    const boxes = new Map();   // container id → { c, group, state }
    world.containers.forEach(c => {
      const { g, h, hw, solid } = containerMesh(c.type);
      const crand = L.rng(L.hash(c.id));
      g.position.set(c.x * S, 0.1, c.y * S);
      g.rotation.y = c.room ? 0 : Math.floor(crand() * 4) * Math.PI / 2 + (crand() - 0.5) * 0.4;
      scene.add(g);
      if (solid) addCol(c.x * S - hw, c.y * S - hw, c.x * S + hw, c.y * S + hw);
      boxes.set(c.id, { c, group: g, h, state: null });
    });

    // 撤离点
    world.extracts.forEach(e => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(EXTRACT_R * S, EXTRACT_R * S, 30, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#3ce66e', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.set(e.x * S, 15, e.y * S);
      scene.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(EXTRACT_R * S - 0.2, EXTRACT_R * S, 32), new THREE.MeshBasicMaterial({ color: '#3ce66e', side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x * S, 0.12, e.y * S);
      scene.add(ring);
      if (settings.labels !== 'none') {
        const sp = sprite('撤离：' + e.name, 1.2, { color: '#9effc0', bg: 'rgba(10,40,20,0.75)' });
        sp.position.set(e.x * S, 5, e.y * S);
        scene.add(sp);
      }
    });

    // 目标指示
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: '#ffe14a' }));
    marker.visible = false;
    scene.add(marker);

    // ---------- 状态 ----------
    const spawnIdx = settings.spawn >= 0 && settings.spawn < world.spawns.length ? settings.spawn : Math.floor(Math.random() * world.spawns.length);
    const sp0 = world.spawns[spawnIdx] || { x: world.w / 2, y: world.h / 2 };
    const centre = { x: world.w / 2, y: world.h / 2 };
    const st = {
      x: sp0.x * S, z: sp0.y * S, y: 0, vy: 0,
      yaw: Math.atan2(-(centre.x - sp0.x), -(centre.y - sp0.y)), pitch: 0,
      keys: {}, cards: new Set(settings.cards), code: settings.code,
      timeLeft: settings.time || 0, elapsed: 0,
      bag: [], unlocked: new Set(), visited: new Set(), searched: new Set(), opened: 0,
      ui: null, target: null, loot: null, extract: null, ended: false,
      fullView: null, labels: settings.labels,
    };

    G = { renderer, scene, camera, st, world, def, settings, onEnd, doors, boxes, colliders, marker, raf: 0, listeners: [] };

    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); G.listeners.push([el, ev, fn, o]); };

    // ---------- 输入 ----------
    const canvas = renderer.domElement;
    const lockReq = () => { if (!st.ui && !st.ended) requestLock(canvas); };
    on(canvas, 'click', lockReq);
    on($('clickplay'), 'click', lockReq);
    on(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      $('clickplay').classList.toggle('hidden', locked || !!st.ui || st.ended);
      if (!locked && !st.ui && !st.ended && st.wasLocked) openUI('pause');
      st.wasLocked = locked;
    });
    on(document, 'mousemove', e => {
      if (document.pointerLockElement !== canvas || st.ui) return;
      st.yaw -= e.movementX * 0.0022;
      st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch - e.movementY * 0.0022));
    });
    on(window, 'keydown', e => {
      if (st.ended) return;
      const k = e.code;
      if (st.ui === 'code') {
        if (k === 'Enter') submitCode();
        if (k === 'Escape') closeUI();
        return;
      }
      if (k === 'Tab') { e.preventDefault(); st.ui === 'bag' ? closeUI() : (!st.ui && openUI('bag')); return; }
      if (k === 'KeyM') { st.ui === 'map' ? closeUI() : (!st.ui && openUI('map')); return; }
      if (k === 'KeyE') {
        if (st.ui === 'loot') { closeUI(); return; }
        if (!st.ui) interact();
        return;
      }
      if (k === 'KeyF' && st.ui === 'loot') { takeAll(); return; }
      if (k === 'Escape') { if (st.ui && st.ui !== 'pause') closeUI(); return; }
      st.keys[k] = true;
      if (k === 'Space') e.preventDefault();
    });
    on(window, 'keyup', e => { st.keys[e.code] = false; });
    on(window, 'blur', () => { st.keys = {}; });
    on(window, 'resize', () => {
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });

    on($('loot-all'), 'click', takeAll);
    on($('loot-close'), 'click', closeUI);
    on($('code-ok'), 'click', submitCode);
    on($('code-cancel'), 'click', closeUI);
    on($('pause-resume'), 'click', closeUI);
    on($('pause-quit'), 'click', () => finish(false, '放弃撤离'));
    on($('loot-grid'), 'click', e => {
      const el = e.target.closest('.item');
      if (el && el.dataset.i != null) takeItem(+el.dataset.i);
    });

    // 全图交互
    const fmCanvas = $('fullmap-canvas');
    M2.attachPanZoom(fmCanvas, () => st.fullView, drawFullMap, { leftPan: () => true });

    $('hud-map').textContent = def.name;
    $('msgs').innerHTML = '';
    ['loot', 'bag', 'fullmap', 'codebox', 'pause'].forEach(id => $(id).classList.add('hidden'));
    $('clickplay').classList.remove('hidden');
    msg(`已部署至 ${def.name}。携带房卡 ${st.cards.size} 张。今日密码 ${st.code}`);

    let last = performance.now();
    const loop = now => {
      G.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      renderer.render(scene, camera);
      drawMinimap();
    };
    G.raf = requestAnimationFrame(loop);
  }

  // ---------- 每帧 ----------
  function unitsPos() { return { x: G.st.x / S, y: G.st.z / S }; }

  function update(dt) {
    if (!G) return;
    const st = G.st;
    if (st.ended) return;
    if (st.ui !== 'pause') {
      st.elapsed += dt;
      if (st.timeLeft) {
        st.timeLeft -= dt;
        if (st.timeLeft <= 0) { finish(false, '超时未撤离'); return; }
      }
    }

    // 移动
    if (!st.ui) {
      const f = (st.keys.KeyW ? 1 : 0) - (st.keys.KeyS ? 1 : 0);
      const s = (st.keys.KeyD ? 1 : 0) - (st.keys.KeyA ? 1 : 0);
      const speed = st.keys.ShiftLeft || st.keys.ShiftRight ? RUN : WALK;
      const len = Math.hypot(f, s) || 1;
      // yaw=0 时朝 -z（北）
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
      const rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
      const vx = (fx * f + rx * s) / len * speed, vz = (fz * f + rz * s) / len * speed;
      moveWithCollision(vx * dt, vz * dt);
      if (st.keys.Space && st.y <= 0) { st.vy = JUMP; }
    }
    st.vy -= GRAVITY * dt;
    st.y = Math.max(0, st.y + st.vy * dt);
    if (st.y === 0) st.vy = Math.max(0, st.vy);

    G.camera.position.set(st.x, EYE + st.y, st.z);
    G.camera.rotation.set(st.pitch, st.yaw, 0);

    // 门动画
    G.doors.forEach(d => {
      if (!d.locked && d.anim < 1) {
        d.anim = Math.min(1, d.anim + dt * 1.5);
        d.mesh.position.y = (WALL_H - 0.6) / 2 + d.anim * (WALL_H - 0.6);
        d.mesh.scale.y = Math.max(0.05, 1 - d.anim * 0.95);
      }
    });

    // 当前位置
    const p = unitsPos();
    const room = G.world.rooms.find(r => L.inside(p.x, p.y, r));
    const area = G.world.areas.find(a => L.inside(p.x, p.y, a));
    if (room && !st.visited.has(room.id)) { st.visited.add(room.id); msg(`进入 ${room.name}`); }
    const where = room ? room.name : area ? area.name : '野外';
    const showWhere = st.labels === 'all' || (st.labels === 'areas' && !room);
    $('hud-where').textContent = '位置：' + (showWhere ? where : '？');
    $('hud-time').textContent = st.timeLeft ? '剩余 ' + clock(st.timeLeft) : '用时 ' + clock(st.elapsed);
    $('hud-value').textContent = `背包价值 ${Loot.fmt(bagValue())} · ${st.bag.length} 件`;

    // 搜索进度
    if (st.ui === 'loot' && st.loot) tickLoot(dt);

    // 交互目标
    st.target = st.ui ? null : findTarget(p, room);
    const pr = $('prompt');
    if (st.target) {
      pr.style.display = 'block';
      pr.textContent = st.target.label;
      G.marker.visible = true;
      G.marker.position.set(st.target.pos[0], st.target.h + 0.35 + Math.sin(st.elapsed * 4) * 0.06, st.target.pos[1]);
      G.marker.rotation.y += dt * 3;
    } else {
      pr.style.display = 'none';
      G.marker.visible = false;
    }

    // 撤离
    const ex = G.world.extracts.find(e => Math.hypot(e.x - p.x, e.y - p.y) < EXTRACT_R);
    const bar = $('progress');
    if (ex && !st.ui) {
      if (!st.extract || st.extract.e !== ex) st.extract = { e: ex, t: 0 };
      st.extract.t += dt;
      bar.style.display = 'block';
      $('progress-bar').style.width = (st.extract.t / EXTRACT_TIME * 100) + '%';
      $('progress-text').textContent = `撤离中 ${Math.max(0, EXTRACT_TIME - st.extract.t).toFixed(1)}s${ex.cond ? '（' + ex.cond + '）' : ''}`;
      if (st.extract.t >= EXTRACT_TIME) { finish(true, '成功撤离：' + ex.name); }
    } else {
      st.extract = null;
      bar.style.display = 'none';
    }
  }

  function moveWithCollision(dx, dz) {
    const st = G.st;
    const steps = Math.ceil(Math.hypot(dx, dz) / 0.2) || 1;
    for (let i = 0; i < steps; i++) {
      st.x += dx / steps;
      st.z += dz / steps;
      for (let pass = 0; pass < 2; pass++) {
        for (const c of G.colliders) {
          if (c.door && G.doors.get(c.door) && !G.doors.get(c.door).locked) continue;
          const cx = Math.max(c.x0, Math.min(st.x, c.x1)), cz = Math.max(c.z0, Math.min(st.z, c.z1));
          const ox = st.x - cx, oz = st.z - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 >= RADIUS * RADIUS) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            st.x += ox / d * (RADIUS - d);
            st.z += oz / d * (RADIUS - d);
          } else {
            // 圆心在矩形内：沿最短方向推出
            const pushes = [[c.x0 - RADIUS - st.x, 0], [c.x1 + RADIUS - st.x, 0], [0, c.z0 - RADIUS - st.z], [0, c.z1 + RADIUS - st.z]];
            pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
            st.x += pushes[0][0]; st.z += pushes[0][1];
          }
        }
      }
    }
  }

  function findTarget(p, room) {
    const st = G.st;
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    let best = null, bestScore = Infinity;
    const consider = (x, z, h, label, kind, ref) => {
      const dx = x - st.x, dz = z - st.z;
      const dist = Math.hypot(dx, dz);
      if (dist > REACH) return;
      const cos = (dx * fx + dz * fz) / (dist || 1);
      if (dist > 0.6 && cos < 0.75) return;
      const score = dist * (2 - cos);
      if (score < bestScore) { bestScore = score; best = { pos: [x, z], h, label, kind, ref }; }
    };
    G.doors.forEach(d => {
      if (!d.locked) return;
      // 只能从门外交互
      const ox = d.pos[0] + d.out[0] * 0.8, oz = d.pos[1] + d.out[1] * 0.8;
      if (Math.hypot(ox - st.x, oz - st.z) > REACH) return;
      const r = d.room;
      let label;
      if (r.tier === '密码房') label = `[E] 输入密码 · ${showName(r)}`;
      else if (st.cards.has(r.card)) label = `[E] 刷卡开门 · ${r.card}`;
      else label = `需要房卡：${st.labels === 'all' ? r.card : '？？？'}（未携带）`;
      consider(d.pos[0], d.pos[1], 2.0, label, 'door', d);
    });
    G.boxes.forEach(b => {
      if (b.c.room && (!room || room.id !== b.c.room)) return;
      const t = CONTAINERS[b.c.type];
      const done = b.state && b.state.revealed >= b.state.items.length && b.state.items.every((it, i) => b.state.taken.has(i));
      const verb = b.c.type === 'body' ? '搜包' : '搜索';
      consider(b.c.x * S, b.c.y * S, b.h, done ? `${t.name}（已搜空）` : `[E] ${verb} · ${t.name}`, 'box', b);
    });
    return best;
  }
  function showName(r) { return G.st.labels === 'all' ? r.name : '？？？'; }

  // ---------- 交互 ----------
  function interact() {
    const st = G.st;
    const t = st.target;
    if (!t) return;
    if (t.kind === 'door') {
      const r = t.ref.room;
      if (r.tier === '密码房') { openUI('code'); st.codeDoor = t.ref; return; }
      if (st.cards.has(r.card)) { unlock(t.ref); msg(`使用房卡「${r.card}」打开了 ${r.name}`); }
      else msg(`没有房卡「${st.labels === 'all' ? r.card : '？？？'}」`, '#ff8080');
    } else if (t.kind === 'box') {
      const b = t.ref;
      if (!b.state) {
        const rand = Math.random;
        b.state = { items: Loot.rollContainer(b.c.type, G.def.id, rand), revealed: 0, progress: 0, taken: new Set() };
        st.opened++;
      }
      st.loot = b;
      openUI('loot');
    }
  }
  function unlock(d) {
    d.locked = false;
    d.light.material.color.set('#30ff60');
    G.st.unlocked.add(d.room.id);
  }
  function submitCode() {
    const st = G.st;
    const v = $('code-input').value.trim();
    if (v === st.code) { unlock(st.codeDoor); msg(`密码正确，${st.codeDoor.room.name} 已打开`); closeUI(); }
    else { msg('密码错误', '#ff8080'); $('code-input').select(); }
  }

  function tickLoot(dt) {
    const s = G.st.loot.state;
    if (s.revealed >= s.items.length) return;
    s.progress += dt;
    const need = s.items[s.revealed].time;
    if (s.progress >= need) {
      s.progress = 0;
      s.revealed++;
      if (s.revealed >= s.items.length) markSearched(G.st.loot);
      renderLoot();
    } else {
      const el = document.querySelector('#loot-grid .item.searching');
      if (el) el.style.setProperty('--p', (s.progress / need * 100) + '%');
    }
  }
  function markSearched(b) {
    if (G.st.searched.has(b.c.id)) return;
    G.st.searched.add(b.c.id);
    b.group.traverse(o => {
      if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.5); }
    });
  }
  function itemHTML(it, i, cls = '') {
    const r = RARITY[it.rarity];
    return `<div class="item ${cls}" data-i="${i}" style="border-color:${r.color};background:linear-gradient(160deg,${r.color}33,#1b2120)">
      <span class="nm" style="color:${r.color}">${it.name}</span><span class="val">${Loot.fmt(it.value)}</span></div>`;
  }
  function renderLoot() {
    const b = G.st.loot;
    const s = b.state;
    const t = CONTAINERS[b.c.type];
    const where = b.c.room ? (G.world.rooms.find(r => r.id === b.c.room) || {}).name : (G.world.areas.find(a => a.id === b.c.area) || {}).name;
    $('loot-title').textContent = `${t.name}${where && G.st.labels !== 'none' ? ' · ' + where : ''}`;
    $('loot-grid').innerHTML = s.items.length === 0 ? '<div class="hint">空的</div>' : s.items.map((it, i) => {
      if (i < s.revealed) return itemHTML(it, i, s.taken.has(i) ? 'taken' : '');
      if (i === s.revealed) return `<div class="item unknown searching">?</div>`;
      return `<div class="item unknown">?</div>`;
    }).join('');
  }
  function takeItem(i) {
    const s = G.st.loot && G.st.loot.state;
    if (!s || i >= s.revealed || s.taken.has(i)) return;
    s.taken.add(i);
    G.st.bag.push(s.items[i]);
    const it = s.items[i];
    msg(`拿取 ${it.name}（${Loot.fmt(it.value)}）`, RARITY[it.rarity].color);
    renderLoot();
  }
  function takeAll() {
    const s = G.st.loot && G.st.loot.state;
    if (!s) return;
    for (let i = 0; i < s.revealed; i++) if (!s.taken.has(i)) takeItem(i);
  }

  // 新版 Chrome 的 requestPointerLock 返回 Promise，失败时（无用户手势等）静默处理
  function requestLock(el) {
    if (!el.requestPointerLock) return;
    try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 需要用户点击 */ }
  }

  // ---------- 面板 ----------
  function openUI(name) {
    const st = G.st;
    st.ui = name;
    st.keys = {};
    if (document.pointerLockElement) document.exitPointerLock();
    $('clickplay').classList.add('hidden');
    if (name === 'loot') { renderLoot(); $('loot').classList.remove('hidden'); }
    if (name === 'bag') { renderBag(); $('bag').classList.remove('hidden'); }
    if (name === 'map') {
      $('fullmap').classList.remove('hidden');
      const { cw, ch } = M2.fitCanvas($('fullmap-canvas'));
      st.fullView = M2.makeView(cw, ch, G.world);
      drawFullMap();
    }
    if (name === 'code') { $('codebox').classList.remove('hidden'); const i = $('code-input'); i.value = ''; setTimeout(() => i.focus(), 0); }
    if (name === 'pause') $('pause').classList.remove('hidden');
  }
  function closeUI() {
    const st = G.st;
    ['loot', 'bag', 'fullmap', 'codebox', 'pause'].forEach(id => $(id).classList.add('hidden'));
    if (st.ui === 'loot') st.loot = null;
    st.ui = null;
    const c = G.renderer.domElement;
    requestLock(c);
    setTimeout(() => { if (G && document.pointerLockElement !== c && !G.st.ui && !G.st.ended) $('clickplay').classList.remove('hidden'); }, 150);
  }
  function renderBag() {
    const st = G.st;
    $('bag-sum').textContent = `· ${st.bag.length} 件 · ${Loot.fmt(bagValue())}`;
    const sorted = st.bag.slice().sort((a, b) => b.value - a.value);
    $('bag-grid').innerHTML = sorted.length ? sorted.map((it, i) => itemHTML(it, i)).join('') : '<div class="hint">空</div>';
    $('bag-cards').innerHTML = st.cards.size ? [...st.cards].map(c => `<span>${c}</span>`).join('') : '<span>未携带房卡</span>';
  }
  function bagValue() { return G.st.bag.reduce((a, b) => a + b.value, 0); }

  // ---------- 地图 ----------
  function mapOpts() {
    const st = G.st;
    const lab = st.labels === 'all' ? { areas: true, rooms: true, extracts: true }
      : st.labels === 'areas' ? { areas: true, rooms: false, extracts: true } : { areas: false, rooms: false, extracts: false };
    return { labels: lab, containers: true, searched: st.searched, unlocked: st.unlocked, player: { x: st.x / S, y: st.z / S, yaw: -st.yaw } };
  }
  function drawMinimap() {
    if (!G) return;
    const c = $('minimap');
    const { ctx, cw, ch } = M2.fitCanvas(c);
    const v = { x: G.st.x / S, y: G.st.z / S, z: 0.24 };
    const o = mapOpts();
    o.labels = Object.assign({}, o.labels, { rooms: false });   // 小地图太小，房间名只在全图显示
    M2.draw(ctx, cw, ch, G.world, v, o);
  }
  function drawFullMap() {
    if (!G || G.st.ui !== 'map') return;
    const { ctx, cw, ch } = M2.fitCanvas($('fullmap-canvas'));
    M2.draw(ctx, cw, ch, G.world, G.st.fullView, mapOpts());
  }

  // ---------- 其它 ----------
  function clock(t) {
    t = Math.max(0, Math.floor(t));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  function msg(text, color) {
    const box = $('msgs');
    const d = document.createElement('div');
    d.textContent = text;
    if (color) d.style.color = color;
    box.appendChild(d);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.opacity = '0'; }, 5000);
    setTimeout(() => d.remove(), 5800);
  }

  function finish(success, reason) {
    const st = G.st;
    if (st.ended) return;
    st.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const res = {
      success, reason, map: G.def, time: st.elapsed,
      items: success ? st.bag.slice() : [], lost: success ? [] : st.bag.slice(),
      value: success ? bagValue() : 0,
      rooms: st.visited.size, roomsTotal: G.world.rooms.length,
      unlocked: st.unlocked.size, opened: st.opened, searched: st.searched.size, containersTotal: G.world.containers.length,
    };
    const cb = G.onEnd;
    stop();
    cb(res);
  }

  function stop() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    G.listeners.forEach(([el, ev, fn, o]) => el.removeEventListener(ev, fn, o));
    G.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
    G.renderer.dispose();
    G.renderer.domElement.remove();
    ['loot', 'bag', 'fullmap', 'codebox', 'pause', 'clickplay'].forEach(id => $(id).classList.add('hidden'));
    $('prompt').style.display = 'none';
    $('progress').style.display = 'none';
    G = null;
  }

  // 调试/自动化测试用
  const debug = {
    state: () => G && G.st,
    teleport(x, y, yaw) { if (!G) return; G.st.x = x * S; G.st.z = y * S; if (yaw != null) G.st.yaw = yaw; },
    lookAt(x, y) { if (!G) return; G.st.yaw = Math.atan2(-(x * S - G.st.x), -(y * S - G.st.z)); G.st.pitch = -0.25; },
    interact: () => interact(),
    tick: dt => update(dt),
    render: () => G && G.renderer.render(G.scene, G.camera),
    target: () => G && G.st.target && G.st.target.label,
  };

  root.DFGame = { start, stop, debug, S };
})(window);
