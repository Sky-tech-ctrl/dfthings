// 由基础数据生成「世界快照」：区域、房间（带门）、变卖物箱、撤离点、出生点。
// 快照是纯 JSON，编辑器修改后整体保存/导出；有快照时优先使用快照。
(function (root) {
  'use strict';
  const DF = root.DF;
  const WORLD = 2000;
  const ROOM_W = 110, ROOM_H = 90, PAD = 14, GAP_X = 26, GAP_Y = 40;  // 房间间留出走廊

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }

  function inside(px, py, r, pad = 0) {
    return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
  }

  // 房间的固定箱子：玻璃房必有展柜，其余按档次给
  function roomContainers(room) {
    if (room.tier === '玻璃房') return ['glass', 'safe', 'drawer'];
    if (room.tier === '密码房') return ['safe', 'crate', 'glass'];
    return ['smallsafe', 'crate', 'drawer'];
  }

  function autoLayout(def) {
    const areas = def.areas.map(a => ({ id: a.id, name: a.name, x: a.x, y: a.y, w: a.w, h: a.h }));
    const rooms = [];
    const containers = [];

    // 房间：沿区域内部按行排列（北侧起），尽量不挤占整个区域
    const cursor = {};
    def.rooms.forEach((r, i) => {
      const a = areas.find(x => x.id === r.area);
      const w = r.w || ROOM_W, h = r.h || ROOM_H;
      const c = cursor[a.id] || (cursor[a.id] = { x: a.x + PAD, y: a.y + 24, rowH: 0 });
      if (c.x + w > a.x + a.w - PAD) { c.x = a.x + PAD; c.y += c.rowH + GAP_Y; c.rowH = 0; }
      const room = {
        id: `${def.id}-room-${i}`, name: r.name, card: r.card || r.name, tier: r.tier, area: a.id,
        door: r.door || 's', note: r.note || '', x: Math.round(c.x), y: Math.round(c.y), w, h,
      };
      c.x += w + GAP_X;
      c.rowH = Math.max(c.rowH, h);
      rooms.push(room);
      roomContainers(room).forEach((type, k, list) => {
        const step = room.w / (list.length + 1);
        containers.push({
          id: `${room.id}-c${k}`, type, area: a.id, room: room.id,
          x: Math.round(room.x + step * (k + 1)), y: Math.round(room.y + room.h * 0.42),
        });
      });
    });

    // 区域内散布的箱子：固定种子，同一张图每次位置一致
    def.areas.forEach(a => {
      const rand = rng(hash(def.id + a.id));
      let n = 0;
      // 每个区域默认放 1~2 具可搜包的人机尸体
      const spec = Object.assign({ body: a.w * a.h > 120000 ? 2 : 1 }, a.c || {});
      Object.entries(spec).forEach(([type, count]) => {
        for (let k = 0; k < count; k++) {
          let x = 0, y = 0;
          for (let t = 0; t < 40; t++) {
            x = a.x + 20 + rand() * (a.w - 40);
            y = a.y + 30 + rand() * (a.h - 50);
            if (!rooms.some(r => inside(x, y, r, 22)) && !containers.some(c => Math.hypot(c.x - x, c.y - y) < 34)) break;
          }
          containers.push({ id: `${def.id}-${a.id}-c${n++}`, type, area: a.id, room: null, x: Math.round(x), y: Math.round(y) });
        }
      });
    });

    return {
      version: 1, map: def.id, w: WORLD, h: WORLD,
      areas, rooms, containers,
      extracts: def.extracts.map((e, i) => ({ id: `${def.id}-ex-${i}`, name: e.name, cond: e.cond || '', x: e.x, y: e.y })),
      spawns: def.spawns.map(([x, y]) => ({ x, y })),
    };
  }

  const STORE_KEY = id => `dfthings.layout.${id}`;

  function loadSaved(id) {
    try { const s = localStorage.getItem(STORE_KEY(id)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function save(id, world) {
    try { localStorage.setItem(STORE_KEY(id), JSON.stringify(world)); return true; } catch (e) { return false; }
  }
  function clearSaved(id) {
    try { localStorage.removeItem(STORE_KEY(id)); } catch (e) { /* 忽略 */ }
  }

  function getWorld(id) {
    const def = DF.MAPS.find(m => m.id === id);
    const snap = loadSaved(id) || DF.LAYOUTS[id];
    return JSON.parse(JSON.stringify(snap || autoLayout(def)));
  }

  // 房间墙体与门：门开在 door 一侧中央，宽 DOOR
  const WALL = 8, DOOR = 44;
  function roomWalls(r) {
    const walls = [];
    const side = (s, x, y, w, h) => {
      if (r.door !== s) { walls.push({ x, y, w, h }); return; }
      if (w > h) {
        const g = (w - DOOR) / 2;
        walls.push({ x, y, w: g, h }, { x: x + g + DOOR, y, w: g, h });
      } else {
        const g = (h - DOOR) / 2;
        walls.push({ x, y, w, h: g }, { x, y: y + g + DOOR, w, h: g });
      }
    };
    side('n', r.x, r.y, r.w, WALL);
    side('s', r.x, r.y + r.h - WALL, r.w, WALL);
    side('w', r.x, r.y, WALL, r.h);
    side('e', r.x + r.w - WALL, r.y, WALL, r.h);
    return walls;
  }
  function doorRect(r) {
    switch (r.door) {
      case 'n': return { x: r.x + (r.w - DOOR) / 2, y: r.y, w: DOOR, h: WALL };
      case 's': return { x: r.x + (r.w - DOOR) / 2, y: r.y + r.h - WALL, w: DOOR, h: WALL };
      case 'w': return { x: r.x, y: r.y + (r.h - DOOR) / 2, w: WALL, h: DOOR };
      default: return { x: r.x + r.w - WALL, y: r.y + (r.h - DOOR) / 2, w: WALL, h: DOOR };
    }
  }

  root.DFLayout = { autoLayout, getWorld, save, loadSaved, clearSaved, roomWalls, doorRect, inside, rng, hash, WORLD };
})(typeof window !== 'undefined' ? window : globalThis);
