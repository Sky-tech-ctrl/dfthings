// 掉落生成：按箱子类型的稀有度权重随机出物品
(function (root) {
  'use strict';
  const { ITEMS, CONTAINERS } = root.DF;

  // 只在特定地图出现的物品
  const MAP_ONLY = { '海洋之泪': 'tide' };
  // 每件物品的搜索耗时（秒），按稀有度
  const SEARCH_TIME = [0, 0.5, 0.7, 1.0, 1.4, 1.9, 2.6];

  function pickWeighted(w, rand) {
    const sum = w.reduce((a, b) => a + b, 0);
    let r = rand() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i + 1; }
    return 1;
  }

  function rollItem(rarity, mapId, rand) {
    const pool = ITEMS.filter(it => it.rarity === rarity && (!MAP_ONLY[it.name] || MAP_ONLY[it.name] === mapId));
    const it = pool[Math.floor(rand() * pool.length)];
    const value = Math.round((it.min + rand() * (it.max - it.min)) / 100) * 100;
    return { name: it.name, rarity: it.rarity, value, time: SEARCH_TIME[it.rarity] };
  }

  function rollContainer(type, mapId, rand = Math.random) {
    const t = CONTAINERS[type] || CONTAINERS.box;
    const n = t.rolls[0] + Math.floor(rand() * (t.rolls[1] - t.rolls[0] + 1));
    const items = [];
    for (let i = 0; i < n; i++) items.push(rollItem(pickWeighted(t.w, rand), mapId, rand));
    return items;
  }

  function fmt(v) {
    if (v >= 10000) return (v / 10000).toFixed(v >= 1000000 ? 0 : 1) + '万';
    return String(v);
  }

  root.DFLoot = { rollContainer, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
