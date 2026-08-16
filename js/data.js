/**
 * data.js — 数据层：地理数据加载（本地 JSON）+ 蹭饭人存储
 *
 * 蹭饭人数据分两层：
 *  1. 共享名单 data/people.json（静态文件，所有访客可见，改文件并推送即可全员更新）
 *  2. 访客本地增量（localStorage）：
 *     - 'cengfan_people_v1'  访客自己添加的人员（纯数组，与旧版格式兼容）
 *     - 'cengfan_removed_v1' 访客删除的共享人员 id
 *  getPeople() 返回：共享名单（未删除） + 本地添加（去重）
 *
 * 全局命名空间: CengFanData
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'cengfan_people_v1';   // 访客本人添加（纯数组，兼容旧版）
  const REMOVED_KEY = 'cengfan_removed_v1';  // 访客删除的共享人员 id
  const SHARED_URL = 'data/people.json';     // 共享名单（所有人可见）

  let additions = loadAdditions();
  let removedIds = loadRemoved();
  let shared = [];           // 共享基础名单
  let sharedIds = new Set();
  let initPromise = null;
  let chinaPromise = null;
  const provinceCache = new Map(); // adcode -> Promise<geojson>

  function loadAdditions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }
    } catch (e) { /* ignore */ }
    return [];
  }

  function saveAdditions() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(additions)); } catch (e) { /* ignore */ }
  }

  function loadRemoved() {
    try {
      const raw = localStorage.getItem(REMOVED_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? new Set(arr) : new Set();
      }
    } catch (e) { /* ignore */ }
    return new Set();
  }

  function saveRemoved() {
    try { localStorage.setItem(REMOVED_KEY, JSON.stringify(Array.from(removedIds))); } catch (e) { /* ignore */ }
  }

  /** 共享人员稳定 id：姓名+省+市，编辑名单顺序不影响已删除记录 */
  function sharedId(p) {
    return 's' + String(p.name) + '|' + String(p.provinceCode) + '|' + String(p.cityName || '');
  }

  /** 补齐共享人员坐标：市级中心 > 省级中心 */
  async function fillCoords(list) {
    const pending = list.filter(function (p) { return p.lat == null || p.lng == null; });
    if (!pending.length) return;
    let china = null;
    try { china = await loadChina(); } catch (e) { return; }
    const provCache = {};
    for (const p of pending) {
      let c = null;
      if (p.cityName) {
        try {
          if (!provCache[p.provinceCode]) provCache[p.provinceCode] = await loadProvince(p.provinceCode);
          const f = CengFanCore.findFeatureByName(provCache[p.provinceCode], p.cityName);
          if (f) c = CengFanCore.featureCenter(f);
        } catch (e) { /* ignore */ }
      }
      if (!c && china && china.features) {
        const pf = china.features.find(function (f) {
          return String(f.properties.adcode) === String(p.provinceCode);
        });
        if (pf) c = CengFanCore.featureCenter(pf);
      }
      if (c) { p.lng = c[0]; p.lat = c[1]; }
    }
  }

  /** 加载共享名单（幂等，应用启动时 await 一次） */
  function init() {
    if (!initPromise) {
      initPromise = fetch(SHARED_URL)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (data) {
          const list = Array.isArray(data) ? data : (data && Array.isArray(data.people) ? data.people : []);
          shared = list
            .filter(function (p) { return p && p.name && p.provinceCode; })
            .map(function (p) {
              return {
                id: sharedId(p),
                name: p.name,
                provinceCode: String(p.provinceCode),
                provinceName: p.provinceName || String(p.provinceCode),
                cityName: p.cityName || '',
                contact: p.contact || '',
                lat: p.lat != null ? p.lat : null,
                lng: p.lng != null ? p.lng : null
              };
            });
          sharedIds = new Set(shared.map(function (p) { return p.id; }));
          return fillCoords(shared);
        })
        .catch(function () { shared = []; sharedIds = new Set(); });
    }
    return initPromise;
  }

  /** 可见列表 = 共享名单(未删除) + 本地添加(去重) */
  function getPeople() {
    const base = shared.filter(function (p) { return !removedIds.has(p.id); });
    const extra = additions.filter(function (p) { return !sharedIds.has(p.id); });
    return base.concat(extra);
  }

  function addPerson(person) {
    if (!person.id) person.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    additions.push(person);
    saveAdditions();
    return person;
  }

  function removePerson(id) {
    if (sharedIds.has(id)) {
      removedIds.add(id);
      saveRemoved();
    } else {
      additions = additions.filter(function (p) { return p.id !== id; });
      saveAdditions();
    }
    return getPeople();
  }

  /** 导入：替换访客本地数据（与共享名单重复的按 id 剔除） */
  function replaceAll(arr) {
    const stamp = Date.now().toString(36);
    additions = (Array.isArray(arr) ? arr.filter(function (p) { return p && p.name; }) : [])
      .filter(function (p) { return !sharedIds.has(p.id); })
      .map(function (p, i) {
        if (!p.id) p.id = stamp + i;
        return p;
      });
    removedIds = new Set();
    saveAdditions();
    saveRemoved();
    return additions;
  }

  /** 清空：清除访客本人的增删，回到共享名单 */
  function clearAll() {
    additions = [];
    removedIds = new Set();
    saveAdditions();
    saveRemoved();
    return additions;
  }

  function loadChina() {
    if (!chinaPromise) {
      chinaPromise = fetch('data/china.json').then(r => {
        if (!r.ok) throw new Error('加载中国地图数据失败 (HTTP ' + r.status + ')');
        return r.json();
      }).then(gj => CengFanCore.rewindGeoJson(gj));
    }
    return chinaPromise;
  }

  function loadProvince(adcode) {
    const key = String(adcode);
    if (!provinceCache.has(key)) {
      const p = fetch('data/provinces/' + key + '.json').then(r => {
        if (!r.ok) throw new Error('加载省份数据失败 (HTTP ' + r.status + ')');
        return r.json();
      }).then(gj => CengFanCore.rewindGeoJson(gj)).catch(err => {
        provinceCache.delete(key);
        throw err;
      });
      provinceCache.set(key, p);
    }
    return provinceCache.get(key);
  }

  const api = { init, loadChina, loadProvince, addPerson, removePerson, getPeople, replaceAll, clearAll };
  global.CengFanData = api;
})(typeof window !== 'undefined' ? window : globalThis);
