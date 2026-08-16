/**
 * core.js — 纯逻辑（无 DOM 依赖，便于 Node 单测）
 * 全局命名空间: CengFanCore
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 人数 -> 颜色。人数越多颜色越深：
   * 浅金(0) -> 橙(0.45) -> 深红(1)
   */
  function colorForRatio(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
      { t: 0.0, h: 48, s: 95, l: 82 },   // 浅金（无人）
      { t: 0.45, h: 28, s: 98, l: 55 },  // 橙
      { t: 1.0, h: 356, s: 82, l: 38 }   // 深红（人多）
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].t && t <= stops[i + 1].t) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const span = (b.t - a.t) || 1;
    const k = (t - a.t) / span;
    const h = a.h + (b.h - a.h) * k;
    const s = a.s + (b.s - a.s) * k;
    const l = a.l + (b.l - a.l) * k;
    return 'hsl(' + h.toFixed(1) + ', ' + s.toFixed(1) + '%, ' + l.toFixed(1) + '%)';
  }

  function colorForCount(count, maxCount) {
    if (!count || !maxCount) return 'hsla(48, 95%, 82%, 0.5)';
    return colorForRatio(Math.pow(count / maxCount, 0.55));
  }

  /** 按省统计人数: Map<provinceCode, count> */
  function countsByProvince(people) {
    const m = new Map();
    for (const p of people) m.set(String(p.provinceCode), (m.get(String(p.provinceCode)) || 0) + 1);
    return m;
  }

  /** 按市统计人数（限定省份）: Map<cityName, count> */
  function countsByCity(people, provinceCode) {
    const m = new Map();
    for (const p of people) {
      if (String(p.provinceCode) !== String(provinceCode)) continue;
      const k = p.cityName || '其他';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  function peopleInProvince(people, provinceCode) {
    return people.filter(p => String(p.provinceCode) === String(provinceCode));
  }

  function peopleInCity(people, provinceCode, cityName) {
    return people.filter(p =>
      String(p.provinceCode) === String(provinceCode) &&
      (p.cityName || '其他') === (cityName || '其他')
    );
  }

  /** 简单平均坐标（多边形所有顶点平均） */
  function avgCoord(feature) {
    let x = 0, y = 0, n = 0;
    (function walk(coords) {
      if (typeof coords[0] === 'number') { x += coords[0]; y += coords[1]; n++; }
      else coords.forEach(walk);
    })(feature.geometry.coordinates);
    return n ? [x / n, y / n] : null;
  }

  /** 取要素中心点: properties.center > properties.centroid > 顶点平均 */
  function featureCenter(feature) {
    const p = (feature && feature.properties) || {};
    if (Array.isArray(p.center) && p.center.length === 2) return p.center.slice();
    if (Array.isArray(p.centroid) && p.centroid.length === 2) return p.centroid.slice();
    return avgCoord(feature);
  }

  function findFeatureByName(geojson, name) {
    if (!geojson || !geojson.features) return null;
    return geojson.features.find(f => f.properties && f.properties.name === name) || null;
  }

  function buildPeopleListHtml(people, max) {
    max = max || 20;
    if (!people.length) return '<div class="tt-empty">暂无蹭饭记录 🍚</div>';
    const lines = people.slice(0, max).map(p =>
      '<div class="tt-person"><span class="tt-name">' + escapeHtml(p.name) + '</span>' +
      (p.contact ? '<span class="tt-contact">' + escapeHtml(p.contact) + '</span>' : '') +
      '</div>'
    ).join('');
    const more = people.length > max ? '<div class="tt-more">… 还有 ' + (people.length - max) + ' 位</div>' : '';
    return lines + more;
  }

  /**
   * 反转 GeoJSON 环的绕向（原地修改，按环角色归一化）。
   * d3 的 geoBounds/geoArea 管线约定：外环顺时针、洞环逆时针。
   * 不同来源数据的绕向可能不一致（DataV 大部分为逆时针外环，
   * 但天津/内蒙古等个别市级数据含顺时针外环与洞环），
   * 因此只对"方向相反"的环做反转，避免把本就正确的环转错。
   */
  function rewindRing(ring) {
    return ring.slice().reverse(); // 闭合环整体反转，仍闭合
  }

  /** 平面鞋带公式求环的有向面积（正=逆时针，负=顺时针） */
  function ringArea2D(ring) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return a / 2;
  }

  function rewindGeoJson(geojson) {
    if (!geojson || !geojson.features) return geojson;
    for (const f of geojson.features) {
      if (!f.geometry) continue;
      let polys = null;
      if (f.geometry.type === 'Polygon') polys = [f.geometry.coordinates];
      else if (f.geometry.type === 'MultiPolygon') polys = f.geometry.coordinates;
      if (!polys) continue;
      for (const poly of polys) {
        if (!Array.isArray(poly) || !poly.length) continue;
        poly.forEach(function (ring, i) {
          if (!Array.isArray(ring) || ring.length < 3) return;
          const area = ringArea2D(ring);
          const isOuter = i === 0;
          if (isOuter && area > 0) poly[i] = rewindRing(ring);       // 外环 逆→顺
          else if (!isOuter && area < 0) poly[i] = rewindRing(ring); // 洞环 顺→逆
        });
      }
    }
    return geojson;
  }

  const api = {
    escapeHtml,
    colorForRatio,
    colorForCount,
    countsByProvince,
    countsByCity,
    peopleInProvince,
    peopleInCity,
    avgCoord,
    featureCenter,
    findFeatureByName,
    buildPeopleListHtml,
    rewindGeoJson
  };

  global.CengFanCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
