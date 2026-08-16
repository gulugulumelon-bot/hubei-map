/**
 * app-2d.js — 中国平面地图版蹭饭图（静态 SVG，无动画）
 * - 省级地图热力着色（人越多颜色越深）
 * - 悬停显示该地区蹭饭人列表
 * - 点击省份进入市级地图（返回全国可回退）
 * - 添加 / 删除 / 搜索 / 导入导出蹭饭人（与 3D 版共用 localStorage）
 */
(function () {
  'use strict';

  const C = CengFanCore;
  const D = CengFanData;

  const $ = function (s) { return document.querySelector(s); };

  const els = {
    map: $('#map-container'),
    tooltip: $('#tooltip'),
    toast: $('#toast'),
    stats: $('#stats'),
    form: $('#add-form'),
    name: $('#input-name'),
    prov: $('#input-province'),
    city: $('#input-city'),
    contact: $('#input-contact'),
    list: $('#people-list'),
    listCount: $('#list-count'),
    search: $('#search'),
    modal: $('#person-modal'),
    modalBody: $('#person-modal-body'),
    modalDelete: $('#btn-modal-delete'),
    modalClose: $('#btn-modal-close'),
    legendBar: $('#legend-bar'),
    btnDemo: $('#btn-demo'),
    btnClear: $('#btn-clear'),
    btnExport: $('#btn-export'),
    btnImport: $('#btn-import'),
    importFile: $('#import-file'),
    btnBack: $('#btn-back'),
    btnAddInProvince: $('#btn-add-in-province'),
    mapTitle: $('#map-title'),
    // 手机端
    sidebar: $('#sidebar'),
    sheetBackdrop: $('#sheet-backdrop'),
    sheetClose: $('#sheet-close'),
    sheetTabs: $('#sheet-tabs'),
    regionModal: $('#region-modal'),
    regionBody: $('#region-body'),
    regionDrill: $('#region-drill'),
    regionClose: $('#region-close'),
    regionCloseBtn: $('#region-close-btn'),
    // 缩放
    zoomIn: $('#zoom-in'),
    zoomOut: $('#zoom-out'),
    zoomReset: $('#zoom-reset')
  };

  // 触屏设备检测（无悬停 → 点按区域弹出信息卡）
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  let chinaJson = null;
  let provinceFeatures = [];  // 有效省级要素（过滤九段线）
  let current = null;         // null = 全国视图 | { adcode, name, geojson }
  let mouse = { x: 0, y: 0 };

  // 缩放 / 平移状态
  let zoomK = 1, zoomTx = 0, zoomTy = 0;
  let baseScale = 1, baseTx = 0, baseTy = 0;
  let renderScheduled = false;
  let dragDist = 0;           // 最近一次拖拽距离（区分点击与拖拽/捏合）
  let dragged = false;
  const pointers = new Map(); // 活动触点
  let pinchState = null;      // 双指捏合状态
  let downInfo = null;        // 按下位置（点击判定）
  let lastTap = null;         // 双击判定
  let tapTimer = null;

  // 有效省级要素：adcode 为纯数字
  function isProvince(f) {
    return f && f.properties && /^\d+$/.test(String(f.properties.adcode));
  }

  // ---------------- 通用 UI ----------------

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2600);
  }

  function showTooltip(html) {
    els.tooltip.innerHTML = html;
    els.tooltip.style.display = 'block';
    positionTooltip();
  }
  function hideTooltip() { els.tooltip.style.display = 'none'; }
  function positionTooltip() {
    if (els.tooltip.style.display !== 'block') return;
    const tw = els.tooltip.offsetWidth, th = els.tooltip.offsetHeight;
    let left = mouse.x + 16, top = mouse.y + 16;
    if (left + tw > window.innerWidth - 10) left = mouse.x - tw - 12;
    if (top + th > window.innerHeight - 10) top = mouse.y - th - 12;
    els.tooltip.style.left = left + 'px';
    els.tooltip.style.top = top + 'px';
  }
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    positionTooltip();
  });

  function openPersonModal(p) {
    els.modalBody.innerHTML =
      '<div class="pm-name">' + C.escapeHtml(p.name) + '</div>' +
      '<div class="pm-region">📍 ' + C.escapeHtml(p.provinceName) + (p.cityName ? ' · ' + C.escapeHtml(p.cityName) : '') + '</div>' +
      (p.contact
        ? '<div class="pm-contact">📞 ' + C.escapeHtml(p.contact) + '</div>'
        : '<div class="pm-contact muted">未填写联系方式</div>');
    els.modal.dataset.id = p.id;
    els.modal.classList.remove('hidden');
  }
  function closePersonModal() { els.modal.classList.add('hidden'); }
  els.modalClose.addEventListener('click', closePersonModal);
  els.modal.addEventListener('click', function (e) { if (e.target === els.modal) closePersonModal(); });
  els.modalDelete.addEventListener('click', function () {
    const id = els.modal.dataset.id;
    const p = D.getPeople().find(function (x) { return x.id === id; });
    if (p) {
      D.removePerson(id);
      refreshAll();
      toast('已删除「' + p.name + '」');
    }
    closePersonModal();
  });

  // ---------------- 手机端：底部抽屉 + 区域信息卡 ----------------

  // tab -> 需要激活的 sheet-panel
  const PANEL_MAP = { stats: ['stats'], add: ['add'], list: ['list'] };

  function setTab(tab) {
    document.querySelectorAll('.sheet-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.sheet-panel').forEach(function (p) {
      p.classList.toggle('active', (PANEL_MAP[tab] || []).indexOf(p.dataset.panel) >= 0);
    });
    document.querySelectorAll('.mnav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
  }

  function openSheet(tab) {
    els.sidebar.classList.add('open');
    els.sheetBackdrop.classList.add('show');
    setTab(tab);
  }
  function closeSheet() {
    els.sidebar.classList.remove('open');
    els.sheetBackdrop.classList.remove('show');
  }

  els.sheetClose.addEventListener('click', closeSheet);
  els.sheetBackdrop.addEventListener('click', closeSheet);
  els.sheetTabs.addEventListener('click', function (e) {
    const tab = e.target && e.target.dataset ? e.target.dataset.tab : null;
    if (tab) setTab(tab);
  });
  document.querySelectorAll('.mnav-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      const tab = b.dataset.tab;
      const same = els.sidebar.classList.contains('open') &&
        b.classList.contains('active');
      if (same) closeSheet();
      else openSheet(tab);
    });
  });

  // 区域信息卡（触屏点按区域）
  function openRegionModal(adcode, name) {
    const people = D.getPeople();
    const list = C.peopleInProvince(people, adcode);
    els.regionBody.innerHTML =
      '<div class="pm-name">' + C.escapeHtml(name) + '</div>' +
      '<div class="tt-count">👥 ' + list.length + ' 人' + (list.length ? '' : ' · 暂无记录') + '</div>' +
      '<div class="tt-list">' + C.buildPeopleListHtml(list) + '</div>';
    els.regionDrill.style.display = !current && /^\d+$/.test(String(adcode)) ? 'inline-block' : 'none';
    els.regionModal.dataset.adcode = adcode;
    els.regionModal.dataset.name = name;
    els.regionModal.classList.remove('hidden');
  }
  function closeRegionModal() { els.regionModal.classList.add('hidden'); }
  els.regionClose.addEventListener('click', closeRegionModal);
  els.regionCloseBtn.addEventListener('click', closeRegionModal);
  els.regionModal.addEventListener('click', function (e) { if (e.target === els.regionModal) closeRegionModal(); });
  els.regionDrill.addEventListener('click', function () {
    const adcode = els.regionModal.dataset.adcode;
    const name = els.regionModal.dataset.name;
    closeRegionModal();
    if (adcode) openProvince(adcode, name);
  });

  // ---------------- 地图渲染 ----------------

  function render() {
    const w = els.map.clientWidth || 900;
    const h = els.map.clientHeight || 700;
    const people = D.getPeople();
    const isChina = !current;
    const gj = isChina ? chinaJson : current.geojson;

    const counts = isChina
      ? C.countsByProvince(people)
      : C.countsByCity(people, current.adcode);
    let max = 1;
    counts.forEach(function (v) { if (v > max) max = v; });

    const base = d3.geoMercator().fitExtent([[48, 48], [w - 48, h - 48]], gj);
    baseScale = base.scale();
    baseTx = base.translate()[0];
    baseTy = base.translate()[1];
    // 应用当前缩放 / 平移
    const projection = d3.geoMercator()
      .scale(baseScale * zoomK)
      .translate([baseTx + zoomTx, baseTy + zoomTy]);
    const pathFn = d3.geoPath(projection);

    let s = '';
    // 区域多边形
    for (const f of gj.features) {
      const name = f.properties.name || '';
      const code = f.properties.adcode;
      const prov = isProvince(f);
      const cnt = prov ? (counts.get(String(code)) || 0) : 0;
      const fill = prov ? C.colorForCount(cnt, max) : 'rgba(0,0,0,0)';
      const stroke = prov ? 'rgba(255,255,255,0.65)' : 'rgba(255,190,80,0.95)';
      const sw = prov ? 0.8 : 1.5;
      s += '<path class="region' + (prov ? ' province' : ' jd') + '" data-adcode="' + C.escapeHtml(code) +
        '" data-name="' + C.escapeHtml(name) + '" d="' + pathFn(f) + '" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    }
    // 名称标注
    const labelFeatures = isChina ? provinceFeatures : gj.features;
    for (const f of labelFeatures) {
      const c = C.featureCenter(f);
      if (!c) continue;
      const p = projection(c);
      if (p[0] < -40 || p[0] > w + 40 || p[1] < -40 || p[1] > h + 40) continue;
      s += '<text class="region-label" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' +
        C.escapeHtml(f.properties.name || '') + '</text>';
    }
    // 人物点位（静态圆点）
    for (const p of people) {
      if (!isChina && String(p.provinceCode) !== String(current.adcode)) continue;
      if (p.lat == null || p.lng == null) continue;
      const xy = projection([p.lng, p.lat]);
      if (xy[0] < -20 || xy[0] > w + 20 || xy[1] < -20 || xy[1] > h + 20) continue;
      s += '<g class="mark" data-id="' + C.escapeHtml(p.id) + '" transform="translate(' +
        xy[0].toFixed(1) + ',' + xy[1].toFixed(1) + ')">' +
        '<circle class="hit" r="14"></circle><circle class="dot" r="5"></circle></g>';
    }

    els.map.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + s + '</svg>';
    bindEvents(els.map, isChina);
  }

  function bindEvents(el, isChina) {
    const people = D.getPeople();

    el.querySelectorAll('.region').forEach(function (pathEl) {
      pathEl.addEventListener('mouseenter', function () {
        if (isTouch) return; // 触屏无悬停
        const name = pathEl.dataset.name || '';
        const adcode = pathEl.dataset.adcode;
        if (!isProvinceByAdcode(adcode)) return; // 九段线等非省级要素不提示
        const list = isChina
          ? C.peopleInProvince(people, adcode)
          : C.peopleInCity(people, current.adcode, name);
        showTooltip(
          '<div class="tt-title">' + C.escapeHtml(name) + '</div>' +
          '<div class="tt-count">👥 ' + list.length + ' 人' + (list.length ? '' : ' · 暂无记录') + '</div>' +
          '<div class="tt-list">' + C.buildPeopleListHtml(list) + '</div>'
        );
      });
      pathEl.addEventListener('mousemove', positionTooltip);
      pathEl.addEventListener('mouseleave', hideTooltip);
      pathEl.addEventListener('click', function (ev) {
        if (dragDist) return;                 // 拖拽/捏合后忽略本次点击
        const adcode = pathEl.dataset.adcode;
        if (!isProvinceByAdcode(adcode)) return; // 九段线不可点
        if (isTouch) {                         // 触屏：单击看信息卡 / 双击放大
          handleTouchTap(ev, adcode, pathEl.dataset.name);
          return;
        }
        if (!isChina) return;                  // 市级地图内点击不再下钻
        openProvince(adcode, pathEl.dataset.name);
      });
    });

    el.querySelectorAll('.mark').forEach(function (m) {
      m.addEventListener('mouseenter', function () {
        if (isTouch) return; // 触屏无悬停
        const p = people.find(function (x) { return x.id === m.dataset.id; });
        if (!p) return;
        showTooltip(
          '<div class="tt-title">' + C.escapeHtml(p.name) + '</div>' +
          '<div class="tt-region">' + C.escapeHtml(p.provinceName) + (p.cityName ? ' · ' + C.escapeHtml(p.cityName) : '') + '</div>' +
          (p.contact ? '<div class="tt-contact">📞 ' + C.escapeHtml(p.contact) + '</div>' : '')
        );
      });
      m.addEventListener('mousemove', positionTooltip);
      m.addEventListener('mouseleave', hideTooltip);
      m.addEventListener('click', function (e) {
        if (dragDist) return; // 拖拽/捏合后忽略
        e.stopPropagation();
        const p = people.find(function (x) { return x.id === m.dataset.id; });
        if (p) openPersonModal(p);
      });
    });
  }

  function isProvinceByAdcode(adcode) {
    return /^\d+$/.test(String(adcode));
  }

  // ---------------- 缩放 / 平移 / 手势 ----------------

  const MAX_ZOOM = 24;

  /**
   * 约束缩放/平移：地图中心必须保持在视口内（留 60px 边距），
   * 避免地图被完全拖出屏幕，同时尽量不干扰"以指针为中心"的锚点。
   */
  function clampZoom() {
    zoomK = Math.max(1, Math.min(MAX_ZOOM, zoomK));
    const w = els.map.clientWidth || 900;
    const h = els.map.clientHeight || 700;
    const gj = current ? current.geojson : chinaJson;
    if (!gj) return;
    try {
      const proj = d3.geoMercator()
        .scale(baseScale * zoomK)
        .translate([baseTx + zoomTx, baseTy + zoomTy]);
      const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(gj);
      const corners = [[minLng, minLat], [maxLng, minLat], [minLng, maxLat], [maxLng, maxLat]];
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const c of corners) {
        const p = proj(c);
        if (!p || !isFinite(p[0])) continue;
        bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]);
        by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]);
      }
      if (!isFinite(bx0)) return;
      const margin = 60;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      // 需要把地图中心拉回 [margin, w-margin] × [margin, h-margin] 的平移量
      const dTx = Math.max(margin - cx, Math.min(w - margin - cx, 0));
      const dTy = Math.max(margin - cy, Math.min(h - margin - cy, 0));
      zoomTx += dTx;
      zoomTy += dTy;
    } catch (e) { /* 忽略 */ }
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(function () {
      renderScheduled = false;
      render();
    });
  }

  /** 以屏幕点 (px,py) 为中心缩放 factor 倍（保持该点地理位置不动） */
  function zoomAt(px, py, factor) {
    const k2 = Math.max(1, Math.min(MAX_ZOOM, zoomK * factor));
    const f = k2 / zoomK;
    zoomTx = px - baseTx - (px - baseTx - zoomTx) * f;
    zoomTy = py - baseTy - (py - baseTy - zoomTy) * f;
    zoomK = k2;
    clampZoom();
    scheduleRender();
  }

  function panBy(dx, dy) {
    zoomTx += dx;
    zoomTy += dy;
    clampZoom();
    scheduleRender();
  }

  function resetZoom() {
    zoomK = 1; zoomTx = 0; zoomTy = 0;
    scheduleRender();
  }

  function mapPoint(e) {
    const rect = els.map.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  function mapCenter() {
    const rect = els.map.getBoundingClientRect();
    return [rect.width / 2, rect.height / 2];
  }

  /** 以屏幕中心为锚点缩放（仅缩放按钮使用） */
  function zoomAtCenter(factor) {
    const c = mapCenter();
    zoomAt(c[0], c[1], factor);
  }

  // 滚轮缩放（桌面，以鼠标位置为中心）
  els.map.addEventListener('wheel', function (e) {
    e.preventDefault();
    const p = mapPoint(e);
    zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // 指针手势：单指拖拽平移 / 双指捏合缩放
  els.map.addEventListener('pointerdown', function (e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downInfo = { x: e.clientX, y: e.clientY };
      dragged = false;
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchState = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2
      };
    }
  });

  window.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      if (downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 8) {
        dragged = true;
      }
      if (dragged) panBy(dx, dy);
    } else if (pointers.size === 2 && pinchState) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = els.map.getBoundingClientRect();
      // 以双指中点为缩放中心
      if (dist > 0 && pinchState.dist > 0) {
        zoomAt(midX - rect.left, midY - rect.top, dist / pinchState.dist);
      }
      panBy(midX - pinchState.midX, midY - pinchState.midY);
      pinchState = { dist: dist, midX: midX, midY: midY };
    }
  });

  window.addEventListener('pointerup', function (e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchState = null;
    if (pointers.size === 0) {
      dragDist = dragged ? 1 : 0; // 供 click 处理器判断
      if (dragged) lastTap = null; // 拖拽/捏合后清除双击记忆
      downInfo = null;
      dragged = false;
    }
  });
  window.addEventListener('pointercancel', function (e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchState = null;
    if (pointers.size === 0) { downInfo = null; dragged = false; }
  });

  // 缩放按钮（以屏幕中心为锚点）
  els.zoomIn.addEventListener('click', function () {
    zoomAtCenter(1.6);
  });
  els.zoomOut.addEventListener('click', function () {
    zoomAtCenter(1 / 1.6);
  });
  els.zoomReset.addEventListener('click', resetZoom);

  // 触屏点按：单击（延迟）显示信息卡，双击放大
  function handleTouchTap(ev, adcode, name) {
    if (dragDist) return; // 拖拽/捏合后不弹信息卡
    const now = Date.now();
    const rect = els.map.getBoundingClientRect();
    const x = ev.clientX, y = ev.clientY;
    if (lastTap && now - lastTap.t < 300 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
      clearTimeout(tapTimer);
      lastTap = null;
      zoomAt(x - rect.left, y - rect.top, 2); // 双击：以点按位置为中心放大
      return;
    }
    lastTap = { x: x, y: y, t: now };
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () {
      openRegionModal(adcode, name);
    }, 280);
  }

  // 调试/测试辅助
  window.__mapDebug = function () {
    return {
      k: zoomK, tx: zoomTx, ty: zoomTy,
      baseScale: baseScale, baseTx: baseTx, baseTy: baseTy,
      pointers: pointers.size, dragDist: dragDist
    };
  };

  // ---------------- 省份下钻 ----------------

  async function openProvince(adcode, name) {
    hideTooltip();
    clearTimeout(tapTimer);
    zoomK = 1; zoomTx = 0; zoomTy = 0; // 复位缩放
    els.mapTitle.textContent = name + ' · 加载中…';
    els.btnBack.style.display = 'inline-block';
    els.btnAddInProvince.style.display = 'inline-block';
    try {
      const gj = await D.loadProvince(adcode);
      current = { adcode: String(adcode), name: name, geojson: gj };
      els.mapTitle.textContent = name + ' · 👥 ' + C.peopleInProvince(D.getPeople(), adcode).length + ' 人';
      render();
    } catch (e) {
      backToChina();
      toast('加载「' + name + '」地图失败');
    }
  }

  function backToChina() {
    hideTooltip();
    clearTimeout(tapTimer);
    current = null;
    zoomK = 1; zoomTx = 0; zoomTy = 0; // 复位缩放
    els.btnBack.style.display = 'none';
    els.btnAddInProvince.style.display = 'none';
    els.mapTitle.textContent = '中国 · 省级蹭饭分布';
    render();
  }

  els.btnBack.addEventListener('click', backToChina);
  els.btnAddInProvince.addEventListener('click', function () {
    if (!current) return;
    selectProvince(current.adcode, null);
    els.form.classList.add('flash');
    setTimeout(function () { els.form.classList.remove('flash'); }, 1300);
    els.name.focus();
  });

  // ---------------- 表单 ----------------

  async function loadCities(code, preselect) {
    els.city.innerHTML = '<option value="">未指定城市</option>';
    if (!code) { els.city.disabled = false; return; }
    els.city.disabled = true;
    try {
      const gj = await D.loadProvince(code);
      const names = gj.features.map(function (f) { return f.properties.name; }).filter(Boolean)
        .sort(function (a, b) { return a.localeCompare(b, 'zh-Hans-CN'); });
      els.city.innerHTML = '<option value="">未指定城市</option>' +
        names.map(function (n) { return '<option value="' + C.escapeHtml(n) + '">' + C.escapeHtml(n) + '</option>'; }).join('');
      if (preselect && names.indexOf(preselect) >= 0) els.city.value = preselect;
    } catch (e) {
      els.city.innerHTML = '<option value="">（暂无细分数据）</option>';
    } finally {
      els.city.disabled = false;
    }
  }

  els.prov.addEventListener('change', function () { loadCities(els.prov.value); });

  function populateProvinceSelect() {
    const opts = provinceFeatures.slice()
      .sort(function (a, b) { return a.properties.adcode - b.properties.adcode; })
      .map(function (f) {
        return '<option value="' + f.properties.adcode + '">' + C.escapeHtml(f.properties.name) + '</option>';
      }).join('');
    els.prov.innerHTML = '<option value="">请选择省份</option>' + opts;
  }

  function selectProvince(code, cityName) {
    els.prov.value = String(code);
    loadCities(String(code), cityName || null);
  }

  /** 解析人物坐标：市级中心 > 省级中心 > 兜底 */
  async function resolveCoords(provCode, cityName) {
    const provFeature = provinceFeatures.find(function (f) {
      return String(f.properties.adcode) === String(provCode);
    });
    let c = null;
    if (cityName) {
      try {
        const gj = await D.loadProvince(provCode);
        const f = C.findFeatureByName(gj, cityName);
        if (f) c = C.featureCenter(f);
      } catch (e) { /* ignore */ }
    }
    if (!c && provFeature) c = C.featureCenter(provFeature);
    if (!c) c = [104, 35];
    return c;
  }

  els.form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = els.name.value.trim();
    const provCode = els.prov.value;
    const provName = els.prov.selectedOptions[0] ? els.prov.selectedOptions[0].textContent : '';
    const cityName = els.city.value;
    const contact = els.contact.value.trim();
    if (!name) { toast('请填写姓名'); return; }
    if (!provCode) { toast('请选择省份'); return; }
    const coords = await resolveCoords(provCode, cityName);
    const person = D.addPerson({
      name: name,
      provinceCode: String(provCode),
      provinceName: provName,
      cityName: cityName,
      contact: contact,
      lat: coords[1],
      lng: coords[0]
    });
    els.form.reset();
    refreshAll();
    toast('✅ 已添加「' + person.name + '」到 ' + person.provinceName + (person.cityName ? '·' + person.cityName : ''));
    if (isTouch) setTab('list'); // 手机端：添加后切到列表页
  });

  // ---------------- 列表 ----------------

  els.search.addEventListener('input', renderList);

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const all = D.getPeople();
    const people = all.filter(function (p) {
      if (!q) return true;
      return (p.name || '').toLowerCase().indexOf(q) >= 0 ||
        (p.provinceName || '').toLowerCase().indexOf(q) >= 0 ||
        (p.cityName || '').toLowerCase().indexOf(q) >= 0;
    });
    els.listCount.textContent = people.length + ' / ' + all.length;
    if (!people.length) {
      els.list.innerHTML = '<li class="empty">暂无蹭饭人，快添加一位吧～ 🍚</li>';
      return;
    }
    els.list.innerHTML = people.map(function (p) {
      return '<li class="person-item" data-id="' + C.escapeHtml(p.id) + '">' +
        '<div class="pi-main"><span class="pi-name">' + C.escapeHtml(p.name) + '</span>' +
        '<span class="pi-region">' + C.escapeHtml(p.provinceName) + (p.cityName ? ' · ' + C.escapeHtml(p.cityName) : '') + '</span></div>' +
        (p.contact ? '<div class="pi-contact">' + C.escapeHtml(p.contact) + '</div>' : '') +
        '<div class="pi-actions"><button class="pi-del" title="删除">🗑️</button></div></li>';
    }).join('');

    els.list.querySelectorAll('.person-item').forEach(function (li) {
      const p = all.find(function (x) { return x.id === li.dataset.id; });
      if (!p) return;
      li.querySelector('.pi-del').addEventListener('click', function () {
        D.removePerson(p.id);
        refreshAll();
        toast('已删除「' + p.name + '」');
      });
    });
  }

  // ---------------- 统计 / 刷新 ----------------

  function renderStats(people) {
    const provSet = new Set(people.map(function (p) { return p.provinceCode; })).size;
    els.stats.innerHTML =
      '<div class="stat"><b>' + people.length + '</b><span>蹭饭人</span></div>' +
      '<div class="stat"><b>' + provSet + '</b><span>覆盖省份</span></div>' +
      '<div class="stat"><b>' + provinceFeatures.length + '</b><span>省级地区</span></div>';
  }

  function refreshAll() {
    const people = D.getPeople();
    render();
    renderList();
    renderStats(people);
    if (current) {
      els.mapTitle.textContent = current.name + ' · 👥 ' + C.peopleInProvince(people, current.adcode).length + ' 人';
    }
  }

  // ---------------- 示例 / 清空 / 导入导出 ----------------

  const SAMPLE = [
    { name: '张三', provinceCode: '440000', provinceName: '广东省', cityName: '深圳市', contact: 'wx: zhangsan88' },
    { name: '李四', provinceCode: '440000', provinceName: '广东省', cityName: '广州市', contact: '138****0001' },
    { name: '王五', provinceCode: '440000', provinceName: '广东省', cityName: '东莞市', contact: '139****0002' },
    { name: '林十三', provinceCode: '440000', provinceName: '广东省', cityName: '佛山市', contact: '133****0007' },
    { name: '赵六', provinceCode: '330000', provinceName: '浙江省', cityName: '杭州市', contact: 'wx: zhaoliu' },
    { name: '钱七', provinceCode: '330000', provinceName: '浙江省', cityName: '宁波市', contact: '136****0004' },
    { name: '周九', provinceCode: '310000', provinceName: '上海市', cityName: '浦东新区', contact: 'wx: zhoujiu' },
    { name: '吴十', provinceCode: '110000', provinceName: '北京市', cityName: '海淀区', contact: '135****0005' },
    { name: '郑十一', provinceCode: '510000', provinceName: '四川省', cityName: '成都市', contact: '134****0006' },
    { name: '陈十二', provinceCode: '420000', provinceName: '湖北省', cityName: '武汉市', contact: 'wx: chen12' },
    { name: '黄十四', provinceCode: '370000', provinceName: '山东省', cityName: '青岛市', contact: '132****0008' },
    { name: '刘十五', provinceCode: '610000', provinceName: '陕西省', cityName: '西安市', contact: 'wx: liu15' }
  ];

  els.btnDemo.addEventListener('click', async function () {
    if (D.getPeople().length) { toast('已有数据，可先「清空数据」再添加示例'); return; }
    for (const s of SAMPLE) {
      const coords = await resolveCoords(s.provinceCode, s.cityName);
      D.addPerson(Object.assign({}, s, { lat: coords[1], lng: coords[0] }));
    }
    refreshAll();
    toast('✅ 已载入 ' + SAMPLE.length + ' 位示例蹭饭人');
  });

  els.btnClear.addEventListener('click', function () {
    if (!D.getPeople().length) { toast('当前没有数据'); return; }
    if (confirm('确定清空所有蹭饭人数据吗？')) {
      D.clearAll();
      refreshAll();
      toast('已清空全部数据');
    }
  });

  els.btnExport.addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(D.getPeople(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    a.download = '蹭饭图数据_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出数据文件');
  });

  els.btnImport.addEventListener('click', function () { els.importFile.click(); });
  els.importFile.addEventListener('change', function () {
    const file = els.importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('格式错误');
        const cleaned = arr.filter(function (p) { return p && p.name && p.provinceCode; })
          .map(function (p) {
            return {
              id: p.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
              name: p.name,
              provinceCode: String(p.provinceCode),
              provinceName: p.provinceName || String(p.provinceCode),
              cityName: p.cityName || '',
              contact: p.contact || '',
              lat: p.lat != null ? p.lat : null,
              lng: p.lng != null ? p.lng : null
            };
          });
        D.replaceAll(cleaned);
        refreshAll();
        toast('已导入 ' + cleaned.length + ' 条数据');
      } catch (err) {
        toast('导入失败：文件不是有效的蹭饭图数据');
      }
    };
    reader.readAsText(file);
    els.importFile.value = '';
  });

  // ---------------- 键盘 ----------------

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!els.modal.classList.contains('hidden')) closePersonModal();
      else if (!els.regionModal.classList.contains('hidden')) closeRegionModal();
      else if (els.sidebar.classList.contains('open')) closeSheet();
      else if (current) backToChina();
    }
  });

  // ---------------- 启动 ----------------

  window.addEventListener('resize', function () {
    zoomK = 1; zoomTx = 0; zoomTy = 0; // 尺寸变化后复位缩放
    render();
  });
  window.addEventListener('orientationchange', function () { setTimeout(render, 250); });

  async function boot() {
    await D.init(); // 先加载共享名单（data/people.json）
    els.legendBar.style.background =
      'linear-gradient(90deg, hsl(48, 95%, 82%), hsl(28, 98%, 55%), hsl(356, 82%, 38%))';
    renderStats(D.getPeople());
    try {
      const china = await D.loadChina();
      chinaJson = china;
      window.__chinaFeats = chinaJson.features || []; // 调试/测试辅助
      provinceFeatures = (china.features || []).filter(isProvince);
      populateProvinceSelect();
      render();
      renderList();
      renderStats(D.getPeople());
      if (!D.getPeople().length) {
        toast('欢迎使用蹭饭图（平面版）！点击「🎲 示例数据」快速体验');
      }
    } catch (e) {
      toast('⚠️ ' + e.message);
      console.error(e);
    }
  }

  boot();
})();
