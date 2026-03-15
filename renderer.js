const blobs = new Map();
const objectUrls = new Set();
const gifFirstFrames = new Map();
let allItems = [];
let customTabs = [];
let currentFilter = 'all';
let deleteMode = false;
let selectMode = false;
let selectedIds = new Set();
let sortOrder = 'newest';
let thumbnailSize = 'medium';
let previewEnabled = true;
let toastTimer = null;
let renameMode = 'tab'; // 'tab'
let renamePendingId = null;
let focusedCardIndex = -1;

const GIF_HOVER_DELAY_MS = 0;
const GIF_PLAY_DURATION_MS = 5000;

function mimeFromFilename(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext === 'gif') return 'image/gif';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/png';
}

function init() {
  const grid = document.getElementById('grid');
  const dropZone = document.getElementById('dropZone');
  const btnPaste = document.getElementById('btnPaste');
  const btnFile = document.getElementById('btnFile');
  const countEl = document.getElementById('count');
  const alwaysOnTopCheck = document.getElementById('alwaysOnTop');
  const btnDeleteMode = document.getElementById('btnDeleteMode');
  const sortOrderSelect = document.getElementById('sortOrder');
  const thumbnailSizeSelect = document.getElementById('thumbnailSize');
  const btnExport = document.getElementById('btnExport');
  const btnQuickExport = document.getElementById('btnQuickExport');
  const urlInput = document.getElementById('urlInput');
  const btnFromURL = document.getElementById('btnFromURL');
  const toastEl = document.getElementById('toast');
  const hamburgerPanel = document.getElementById('hamburgerPanel');
  const filterTabs = document.getElementById('filterTabs');
  const btnToggleURL = document.getElementById('btnToggleURL');
  const urlAddWrap = document.getElementById('urlAddWrap');
  const btnAddTab = document.getElementById('btnAddTab');
  const customTabsEl = document.getElementById('customTabs');
  const btnTrash = document.getElementById('btnTrash');
  const btnSelect = document.getElementById('btnSelect');
  const bulkBar = document.getElementById('bulkBar');
  const bulkCount = document.getElementById('bulkCount');
  const bulkFavorite = document.getElementById('bulkFavorite');
  const bulkTabSelect = document.getElementById('bulkTabSelect');
  const bulkAddToTab = document.getElementById('bulkAddToTab');
  const bulkTrash = document.getElementById('bulkTrash');
  const bulkCancel = document.getElementById('bulkCancel');
  const btnThumbnailCache = document.getElementById('btnThumbnailCache');
  const previewToggle = document.getElementById('previewEnabled');
  const previewOverlay = document.getElementById('previewOverlay');
  const previewImg = document.getElementById('previewImg');
  const previewClose = document.getElementById('previewClose');
  const renameOverlay = document.getElementById('renameOverlay');
  const renameInput = document.getElementById('renameInput');
  const renameCancel = document.getElementById('renameCancel');
  const renameOk = document.getElementById('renameOk');

  if (!grid || !countEl) return;

  if (btnToggleURL && urlAddWrap) {
    btnToggleURL.addEventListener('click', () => {
      const show = urlAddWrap.style.display !== 'block';
      urlAddWrap.style.display = show ? 'block' : 'none';
    });
  }

  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
    }
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.classList.remove('show');
      toastTimer = null;
    }, 1500);
  }

  function updateCount(list) {
    if (countEl) countEl.textContent = `${list.count} / ${list.limit}`;
  }

  function showCountFeedback(message, resetAfterMs) {
    if (countEl) countEl.textContent = message;
    if (resetAfterMs) setTimeout(async () => {
      try {
        const list = await window.api.getList();
        if (countEl) countEl.textContent = `${list.count} / ${list.limit}`;
      } catch (_) {}
    }, resetAfterMs);
  }

  function captureGifFirstFrame(url, itemId, onReady) {
    if (gifFirstFrames.has(itemId)) {
      if (onReady) onReady(gifFirstFrames.get(itemId));
      return;
    }
    const im = new Image();
    im.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = im.naturalWidth;
        canvas.height = im.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(im, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        gifFirstFrames.set(itemId, dataUrl);
        if (onReady) onReady(dataUrl);
      } catch (_) {
        if (onReady) onReady('');
      }
    };
    im.onerror = () => { if (onReady) onReady(''); };
    im.src = url;
  }

  async function loadItemBlob(item) {
    try {
      const existing = blobs.get(item.id);
      if (existing) {
        const url = URL.createObjectURL(existing.blob);
        objectUrls.add(url);
        return url;
      }
      let buffer = await window.api.readThumbnail(item.id);
      let type = mimeFromFilename(item.filename);
      if (!buffer || (buffer.byteLength !== undefined && buffer.byteLength === 0) || (buffer.length !== undefined && buffer.length === 0)) {
        buffer = await window.api.readFile(item.filename);
      } else {
        type = 'image/png';
      }
      const blob = new Blob([buffer], { type: type || 'image/png' });
      blobs.set(item.id, { blob, filename: item.filename });
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      return url;
    } catch {
      return null;
    }
  }

  function getFilteredItems() {
    let list;
    if (currentFilter === 'favorites') list = allItems.filter((i) => i.favorite);
    else if (currentFilter === 'gif') list = allItems.filter((i) => i.type === 'gif');
    else if (currentFilter === 'image') list = allItems.filter((i) => i.type !== 'gif');
    else if (currentFilter.startsWith('tab-')) {
      const tabId = parseInt(currentFilter.slice(4), 10);
      list = allItems.filter((i) => (i.tabIds || []).includes(tabId));
    } else list = [...allItems];
    if (sortOrder === 'manual') {
      list.sort((a, b) => (a.order != null ? a.order : a.addedAt || 0) - (b.order != null ? b.order : b.addedAt || 0));
    } else {
      const order = sortOrder === 'newest' ? -1 : 1;
      list.sort((a, b) => order * ((b.addedAt || 0) - (a.addedAt || 0)));
    }
    return list;
  }

  function getEmptyMessage() {
    if (currentFilter === 'favorites') return 'No favorites yet. Click ☆ on an object to add.';
    if (currentFilter === 'gif') return 'No GIFs. Add some with Paste, From file, or drag & drop.';
    if (currentFilter === 'image') return 'No images. Add some with Paste, From file, or drag & drop.';
    if (currentFilter.startsWith('tab-')) return 'No items in this tab. Right-click an object → Add to this tab.';
    return 'No objects yet. Use Paste, From file, or drag & drop to add.';
  }

  function createEmptyNode() {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = getEmptyMessage();
    return p;
  }

  function renderCard(item, objectUrl) {
    const isGif = item.type === 'gif';
    const card = document.createElement('div');
    card.className = 'card' + (isGif ? ' card-gif' : '');
    card.dataset.id = String(item.id);
    card.dataset.filename = item.filename;
    const img = document.createElement('img');
    // GIF: show first frame only until hover (set in captureGifFirstFrame callback)
    img.src = (isGif && objectUrl) ? '' : (objectUrl || '');
    img.alt = '';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = '×';
    del.title = 'Remove';
    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'star-btn' + (item.favorite ? ' favorited' : '');
    starBtn.textContent = item.favorite ? '★' : '☆';
    starBtn.title = item.favorite ? 'Remove from favorites' : 'Add to favorites';
    card.appendChild(img);
    card.appendChild(del);
    card.appendChild(starBtn);

    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.moveToTrash(item.id);
      allItems = allItems.filter((i) => i.id !== item.id);
      blobs.delete(item.id);
      gifFirstFrames.delete(item.id);
      if (img.src && img.src.startsWith('blob:')) {
        objectUrls.delete(img.src);
        URL.revokeObjectURL(img.src);
      }
      card.remove();
      const list = await window.api.getList();
      updateCount(list);
      if (getFilteredItems().length === 0) grid.appendChild(createEmptyNode());
    });

    starBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const result = await window.api.toggleFavorite(item.id);
      if (!result.ok) return;
      const it = allItems.find((i) => i.id === item.id);
      if (it) it.favorite = result.favorite;
      starBtn.classList.toggle('favorited', result.favorite);
      starBtn.textContent = result.favorite ? '★' : '☆';
      starBtn.title = result.favorite ? 'Remove from favorites' : 'Add to favorites';
      if (currentFilter === 'favorites' && !result.favorite) card.remove();
      if (currentFilter === 'favorites' && getFilteredItems().length === 0) grid.appendChild(createEmptyNode());
    });

    if (isGif && objectUrl) {
      const url = objectUrl;
      const freeze = () => {
        const firstFrame = gifFirstFrames.get(item.id);
        if (firstFrame) img.src = firstFrame;
      };
      captureGifFirstFrame(url, item.id, (firstFrameDataUrl) => {
        if (firstFrameDataUrl && !card.dataset.hovering) img.src = firstFrameDataUrl;
      });
      let hoverTimer = null;
      let stopTimer = null;
      card.addEventListener('mouseenter', () => {
        card.dataset.hovering = '1';
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          if (stopTimer) clearTimeout(stopTimer);
          img.src = '';
          img.src = url;
          stopTimer = setTimeout(() => { stopTimer = null; freeze(); }, GIF_PLAY_DURATION_MS);
        }, GIF_HOVER_DELAY_MS);
      });
      card.addEventListener('mouseleave', () => {
        delete card.dataset.hovering;
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        freeze();
      });
    }

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.api.showCardContextMenu(item.id, item.filename, item.favorite, item.tabIds || []);
    });

    card.addEventListener('click', async (e) => {
      if (e.target === del || e.target === starBtn) return;
      if (selectMode) {
        e.preventDefault();
        e.stopPropagation();
        toggleCardSelection(card, item.id);
        return;
      }
      e.preventDefault();
      if (previewEnabled) {
        openPreview(item, objectUrl);
      } else {
        await window.api.copyToClipboard(item.filename);
        showToast('Copied!');
      }
    });

    card.addEventListener('dragstart', (e) => {
      if (sortOrder === 'manual') {
        e.dataTransfer.setData('application/x-internal-reorder', String(item.id));
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
        return;
      }
      const entry = blobs.get(item.id);
      if (!entry) return;
      const file = new File([entry.blob], entry.filename, { type: entry.blob.type });
      e.dataTransfer.setData('text/plain', '');
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.items.add(file);
    });

    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    return card;
  }

  function toggleCardSelection(card, itemId) {
    if (selectedIds.has(itemId)) {
      selectedIds.delete(itemId);
      card.classList.remove('selected');
    } else {
      selectedIds.add(itemId);
      card.classList.add('selected');
    }
    updateBulkBar();
  }

  function updateBulkBar() {
    if (!bulkBar || !bulkCount) return;
    if (selectedIds.size === 0) {
      bulkBar.style.display = 'none';
      return;
    }
    bulkBar.style.display = 'flex';
    bulkCount.textContent = selectedIds.size + ' selected';
    if (bulkTabSelect) {
      bulkTabSelect.innerHTML = '<option value="">-- Tab --</option>';
      customTabs.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        bulkTabSelect.appendChild(opt);
      });
    }
  }

  function openPreview(item, objectUrl) {
    if (!previewOverlay || !previewImg) return;
    previewImg.src = objectUrl || '';
    previewImg.dataset.filename = item.filename;
    previewOverlay.classList.add('open');
    previewOverlay.setAttribute('aria-hidden', 'false');
  }

  async function renderGrid(items) {
    grid.innerHTML = '';
    grid.className = 'grid grid-size-' + thumbnailSize;
    if (items.length === 0) {
      grid.appendChild(createEmptyNode());
      return;
    }
    for (const item of items) {
      const objectUrl = await loadItemBlob(item);
      grid.appendChild(renderCard(item, objectUrl));
    }
  }

  grid.addEventListener('dragover', (e) => {
    if (sortOrder === 'manual' && e.dataTransfer.types.includes('application/x-internal-reorder')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });
  grid.addEventListener('drop', (e) => {
    if (sortOrder !== 'manual' || !e.dataTransfer.types.includes('application/x-internal-reorder')) return;
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData('application/x-internal-reorder'), 10);
    const filtered = getFilteredItems();
    const dropCard = e.target.closest('.card');
    let dropIndex = dropCard ? filtered.findIndex((i) => i.id === parseInt(dropCard.dataset.id, 10)) : filtered.length;
    if (dropIndex === -1) dropIndex = filtered.length;
    const fromIndex = filtered.findIndex((i) => i.id === draggedId);
    if (fromIndex === -1) return;
    const newFiltered = filtered.slice();
    newFiltered.splice(fromIndex, 1);
    newFiltered.splice(dropIndex > fromIndex ? dropIndex - 1 : dropIndex, 0, filtered[fromIndex]);
    const filteredIdSet = new Set(newFiltered.map((i) => i.id));
    const allSorted = allItems.slice().sort((a, b) => (a.order != null ? a.order : a.addedAt) - (b.order != null ? b.order : b.addedAt));
    const newOrderedIds = [];
    let fi = 0;
    for (const it of allSorted) {
      if (filteredIdSet.has(it.id)) newOrderedIds.push(newFiltered[fi++].id);
      else newOrderedIds.push(it.id);
    }
    window.api.reorderItems(newOrderedIds).then(async () => {
      const list = await window.api.getList();
      allItems = list.items || [];
      await renderGrid(getFilteredItems());
    });
  });

  async function refreshList() {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.clear();
    blobs.clear();
    gifFirstFrames.clear();
    const list = await window.api.getList();
    allItems = list.items || [];
    customTabs = list.customTabs || [];
    updateCount(list);
    renderCustomTabs();
    await renderGrid(getFilteredItems());
  }

  function setActiveFilter(filterValue) {
    currentFilter = filterValue;
    if (filterTabs) {
      filterTabs.querySelectorAll('.filter-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.filter === filterValue);
      });
    }
    if (customTabsEl) {
      customTabsEl.querySelectorAll('.filter-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.filter === filterValue);
      });
    }
  }

  function renderCustomTabs() {
    if (!customTabsEl) return;
    customTabsEl.innerHTML = '';
    customTabs.forEach((tab) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-tab filter-tab-custom' + (currentFilter === 'tab-' + tab.id ? ' active' : '');
      btn.dataset.filter = 'tab-' + tab.id;
      btn.textContent = tab.name;
      btn.addEventListener('click', () => {
        setActiveFilter('tab-' + tab.id);
        objectUrls.forEach((u) => URL.revokeObjectURL(u));
        objectUrls.clear();
        renderGrid(getFilteredItems());
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.api.showTabContextMenu(tab.id, tab.name);
      });
      customTabsEl.appendChild(btn);
    });
  }

  if (filterTabs) {
    filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab || !tab.dataset.filter) return;
      setActiveFilter(tab.dataset.filter);
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.clear();
      renderGrid(getFilteredItems());
    });
  }

  if (btnAddTab) {
    btnAddTab.addEventListener('click', async () => {
      try {
        const result = await window.api.addCustomTab();
        if (!result || !result.id) return;
        const list = await window.api.getList();
        customTabs = list.customTabs || [];
        renderCustomTabs();
        setActiveFilter('tab-' + result.id);
        objectUrls.forEach((u) => URL.revokeObjectURL(u));
        objectUrls.clear();
        renderGrid(getFilteredItems());
      } catch (_) {}
    });
  }

  window.api.onTabDeleted?.((payload) => {
    const tabId = payload?.tabId;
    if (tabId != null && currentFilter === 'tab-' + tabId) {
      setActiveFilter('all');
      if (filterTabs) {
        const allBtn = filterTabs.querySelector('[data-filter="all"]');
        if (allBtn) allBtn.classList.add('active');
      }
    }
    window.api.getList().then((list) => {
      customTabs = list.customTabs || [];
      renderCustomTabs();
      renderGrid(getFilteredItems());
    });
  });

  window.api.onTabRenameRequest?.((payload) => {
    renameMode = 'tab';
    renamePendingId = payload?.tabId;
    const currentName = payload?.tabName || (renamePendingId != null ? 'Tab' + renamePendingId : '');
    if (renameOverlay) renameOverlay.classList.add('open');
    if (renameInput) { renameInput.value = currentName; renameInput.focus(); renameInput.select(); }
  });

  function closeRenameOverlay() {
    renameMode = 'tab';
    renamePendingId = null;
    if (renameOverlay) renameOverlay.classList.remove('open');
  }

  if (renameOk && renameInput) {
    renameOk.addEventListener('click', async () => {
      if (renamePendingId == null) return;
      const newName = renameInput.value.trim().slice(0, 32) || (renameMode === 'tab' ? 'Tab' + renamePendingId : 'Collection' + renamePendingId);
      let result;
      if (renameMode === 'tab') result = await window.api.renameCustomTab(renamePendingId, newName);
      else result = await window.api.renameCollection(renamePendingId, newName);
      closeRenameOverlay();
      if (result?.ok) {
        const list = await window.api.getList();
        if (renameMode === 'tab') { customTabs = list.customTabs || []; renderCustomTabs(); }
        else { collections = list.collections || []; renderCollectionTabs(); }
      }
    });
  }
  if (renameCancel) renameCancel.addEventListener('click', closeRenameOverlay);
  if (renameOverlay) {
    renameOverlay.addEventListener('mousedown', (e) => {
      if (e.target === renameOverlay) closeRenameOverlay();
    });
  }
  if (renameInput) {
    renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') renameOk?.click();
      if (e.key === 'Escape') closeRenameOverlay();
    });
  }

  document.body.addEventListener('mousedown', (e) => {
    const btn = document.getElementById('btnHamburger');
    const panel = document.getElementById('hamburgerPanel');
    if (!panel) return;
    if (btn && (e.target === btn || btn.contains(e.target))) {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.toggle('open');
      return;
    }
    if (panel.classList.contains('open') && !panel.contains(e.target) && (!btn || !btn.contains(e.target))) {
      panel.classList.remove('open');
    }
  });

  if (hamburgerPanel) {
    hamburgerPanel.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'copy';
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '.png';
        const result = await window.api.addFromFile(new Uint8Array(buf), ext);
        if (result.ok) {
          allItems.push(result.item);
          if (currentFilter === 'all' || result.item.favorite || (currentFilter === 'gif' && result.item.type === 'gif') || (currentFilter === 'image' && result.item.type !== 'gif')) {
            const objectUrl = await loadItemBlob(result.item);
            const card = renderCard(result.item, objectUrl);
            const empty = grid.querySelector('.empty');
            if (empty) empty.remove();
            grid.appendChild(card);
          }
        } else if (result.error === 'duplicate') {
          showCountFeedback('Already in library', 2500);
        } else if (result.error === 'format_not_allowed') {
          showCountFeedback('Format not allowed (use PNG, JPG, GIF, WebP, BMP)', 2500);
        } else if (result.error === 'limit') break;
      }
      const list = await window.api.getList();
      updateCount(list);
    });
  }

  if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
      try {
        const result = await window.api.addFromClipboard();
        if (result.ok) {
          allItems.push(result.item);
          if (currentFilter === 'all' || result.item.favorite || (currentFilter === 'gif' && result.item.type === 'gif') || (currentFilter === 'image' && result.item.type !== 'gif')) {
            const objectUrl = await loadItemBlob(result.item);
            const card = renderCard(result.item, objectUrl);
            const empty = grid.querySelector('.empty');
            if (empty) empty.remove();
            grid.appendChild(card);
          }
          const list = await window.api.getList();
          updateCount(list);
        } else if (result.error === 'duplicate') showCountFeedback('Already in library', 2500);
        else if (result.error === 'limit') showCountFeedback('Limit reached (50)', 2500);
        else if (result.error === 'format_not_allowed') showCountFeedback('Format not allowed (use PNG, JPG, GIF, WebP, BMP)', 2500);
        else showCountFeedback('No image in clipboard', 2500);
      } catch (_) {
        showCountFeedback('Paste failed', 2500);
      }
    });
  }

  if (btnFile) {
    btnFile.addEventListener('click', async () => {
      try {
        const result = await window.api.addFromDialog();
        if (result.canceled) return;
        if (result.ok && result.added && result.added.length > 0) {
          for (const item of result.added) {
            allItems.push(item);
            if (currentFilter === 'all' || item.favorite || (currentFilter === 'gif' && item.type === 'gif') || (currentFilter === 'image' && item.type !== 'gif')) {
              const objectUrl = await loadItemBlob(item);
              const card = renderCard(item, objectUrl);
              const empty = grid.querySelector('.empty');
              if (empty) empty.remove();
              grid.appendChild(card);
            }
          }
          const list = await window.api.getList();
          updateCount(list);
        } else if (result.ok && result.added && result.added.length === 0) {
          showCountFeedback('Limit reached or duplicates skipped', 2500);
        } else if (result.error === 'format_not_allowed') {
          showCountFeedback('Format not allowed (use PNG, JPG, GIF, WebP, BMP)', 2500);
        }
      } catch (_) {
        showCountFeedback('From file failed', 2500);
      }
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const result = await window.api.exportToFolder();
      if (result.ok) showToast('Exported!');
      else if (!result.canceled) showToast('Export failed');
    });
  }

  if (btnQuickExport) {
    btnQuickExport.addEventListener('click', async () => {
      const result = await window.api.quickExport();
      if (result.ok) showToast('Exported!');
      else if (result.error === 'no_last_path') showToast('First use Export to choose a folder');
      else showToast('Quick export failed');
    });
  }

  const trashOverlay = document.getElementById('trashOverlay');
  const trashList = document.getElementById('trashList');
  const trashPanelClose = document.getElementById('trashPanelClose');
  const trashEmptyBtn = document.getElementById('trashEmptyBtn');

  async function openTrashPanel() {
    if (hamburgerPanel) hamburgerPanel.classList.remove('open');
    if (!trashOverlay || !trashList) return;
    trashOverlay.classList.add('open');
    trashOverlay.setAttribute('aria-hidden', 'false');
    const items = await window.api.getTrash();
    trashList.innerHTML = '';
    for (const t of items) {
      const cell = document.createElement('div');
      cell.className = 'trash-item';
      const img = document.createElement('img');
      img.alt = '';
      try {
        const buffer = await window.api.readFile(t.filename);
        const type = mimeFromFilename(t.filename);
        const blob = new Blob([buffer], { type });
        img.src = URL.createObjectURL(blob);
      } catch (_) {
        img.src = '';
      }
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'trash-item-restore';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', async () => {
        const result = await window.api.restoreFromTrash(t.id);
        if (result.ok) {
          allItems.push(result.item);
          cell.remove();
          const list = await window.api.getList();
          updateCount(list);
          showToast('Restored');
        }
      });
      cell.appendChild(img);
      cell.appendChild(restoreBtn);
      trashList.appendChild(cell);
    }
    if (trashEmptyBtn) {
      trashEmptyBtn.disabled = items.length === 0;
      trashEmptyBtn.onclick = async () => {
        await window.api.emptyTrash();
        showToast('Trash emptied');
        trashList.innerHTML = '';
        trashEmptyBtn.disabled = true;
      };
    }
  }

  if (previewClose) previewClose.addEventListener('click', () => {
    if (previewOverlay) { previewOverlay.classList.remove('open'); previewOverlay.setAttribute('aria-hidden', 'true'); }
    if (previewImg) previewImg.src = '';
  });
  const previewCopy = document.getElementById('previewCopy');
  if (previewCopy && previewImg) previewCopy.addEventListener('click', async () => {
    const filename = previewImg.dataset.filename;
    if (filename) { await window.api.copyToClipboard(filename); showToast('Copied!'); }
  });
  if (previewOverlay) {
    previewOverlay.addEventListener('mousedown', (e) => {
      if (e.target === previewOverlay) { previewOverlay.classList.remove('open'); previewOverlay.setAttribute('aria-hidden', 'true'); if (previewImg) previewImg.src = ''; }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewOverlay && previewOverlay.classList.contains('open')) {
      previewOverlay.classList.remove('open'); previewOverlay.setAttribute('aria-hidden', 'true'); if (previewImg) previewImg.src = '';
    }
  });

  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      selectMode = !selectMode;
      btnSelect.classList.toggle('active', selectMode);
      const cards = Array.from(grid.querySelectorAll('.card'));
      cards.forEach((c) => c.classList.remove('keyboard-focus'));
      focusedCardIndex = -1;
      if (!selectMode) {
        selectedIds.clear();
        grid.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
        updateBulkBar();
      }
    });
  }
  if (bulkFavorite) bulkFavorite.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    await window.api.bulkSetFavorite([...selectedIds], true);
    [...selectedIds].forEach((id) => { const it = allItems.find((i) => i.id === id); if (it) it.favorite = true; });
    grid.querySelectorAll('.card.selected').forEach((c) => { c.classList.remove('selected'); const star = c.querySelector('.star-btn'); if (star) { star.classList.add('favorited'); star.textContent = '★'; } });
    selectedIds.clear();
    updateBulkBar();
    showToast('Added to favorites');
  });
  if (bulkAddToTab && bulkTabSelect) bulkAddToTab.addEventListener('click', async () => {
    const tabId = bulkTabSelect.value;
    if (!tabId || selectedIds.size === 0) return;
    await window.api.bulkAddToTab([...selectedIds], tabId);
    const list = await window.api.getList();
    allItems = list.items || [];
    selectedIds.clear();
    grid.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
    updateBulkBar();
    showToast('Added to tab');
  });
  if (bulkTrash) bulkTrash.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    await window.api.bulkMoveToTrash([...selectedIds]);
    [...selectedIds].forEach((id) => { allItems = allItems.filter((i) => i.id !== id); blobs.delete(id); gifFirstFrames.delete(id); });
    grid.querySelectorAll('.card').forEach((c) => { if (selectedIds.has(parseInt(c.dataset.id, 10))) c.remove(); });
    selectedIds.clear();
    updateBulkBar();
    const list = await window.api.getList();
    updateCount(list);
    if (getFilteredItems().length === 0) grid.appendChild(createEmptyNode());
    showToast('Moved to trash');
  });
  if (bulkCancel) bulkCancel.addEventListener('click', () => {
    selectMode = false;
    if (btnSelect) btnSelect.classList.remove('active');
    selectedIds.clear();
    grid.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
    updateBulkBar();
  });

  if (btnThumbnailCache) {
    btnThumbnailCache.addEventListener('click', async () => {
      const items = allItems;
      if (items.length === 0) { showToast('No items to cache'); return; }
      showToast('Building cache...');
      const size = 120;
      for (const item of items) {
        try {
          const buffer = await window.api.readFile(item.filename);
          const blob = new Blob([buffer], { type: mimeFromFilename(item.filename) });
          const url = URL.createObjectURL(blob);
          const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = url;
          });
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          const thumbBlob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
          const arr = await thumbBlob.arrayBuffer();
          await window.api.writeThumbnail(item.id, arr);
        } catch (_) {}
      }
      showToast('Thumbnail cache built');
    });
  }

  if (btnTrash) btnTrash.addEventListener('click', openTrashPanel);
  if (trashPanelClose) trashPanelClose.addEventListener('click', () => {
    if (trashOverlay) {
      trashOverlay.classList.remove('open');
      trashOverlay.setAttribute('aria-hidden', 'true');
    }
  });
  if (trashOverlay) {
    trashOverlay.addEventListener('mousedown', (e) => {
      if (e.target === trashOverlay) {
        trashOverlay.classList.remove('open');
        trashOverlay.setAttribute('aria-hidden', 'true');
      }
    });
  }

  if (btnFromURL && urlInput) {
    btnFromURL.addEventListener('click', async () => {
      const url = (urlInput.value || '').trim();
      if (!url) { showCountFeedback('Enter an image URL', 2500); return; }
      try {
        const result = await window.api.addFromURL(url);
        if (result.ok) {
          allItems.push(result.item);
          if (currentFilter === 'all' || result.item.favorite || (currentFilter === 'gif' && result.item.type === 'gif') || (currentFilter === 'image' && result.item.type !== 'gif')) {
            const objectUrl = await loadItemBlob(result.item);
            const card = renderCard(result.item, objectUrl);
            const empty = grid.querySelector('.empty');
            if (empty) empty.remove();
            grid.appendChild(card);
          }
          const list = await window.api.getList();
          updateCount(list);
          urlInput.value = '';
          showToast('Added!');
        } else if (result.error === 'duplicate') showCountFeedback('Already in library', 2500);
        else if (result.error === 'limit') showCountFeedback('Limit reached (50)', 2500);
        else if (result.error === 'format_not_allowed') showCountFeedback('Format not allowed (use PNG, JPG, GIF, WebP, BMP)', 2500);
        else showCountFeedback('Could not load URL', 2500);
      } catch (_) {
        showCountFeedback('Could not load URL', 2500);
      }
    });
  }

  if (alwaysOnTopCheck) {
    alwaysOnTopCheck.addEventListener('change', async () => {
      await window.api.setAlwaysOnTop(alwaysOnTopCheck.checked);
    });
  }

  if (btnDeleteMode) {
    btnDeleteMode.addEventListener('click', () => {
      deleteMode = !deleteMode;
      document.body.classList.toggle('delete-mode', deleteMode);
      btnDeleteMode.classList.toggle('active', deleteMode);
      btnDeleteMode.title = deleteMode ? 'Delete mode: click × on objects to remove' : 'Show delete buttons on objects';
    });
  }

  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', async () => {
      sortOrder = sortOrderSelect.value;
      await window.api.setSettings('sortOrder', sortOrder);
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.clear();
      await renderGrid(getFilteredItems());
    });
  }

  if (thumbnailSizeSelect) {
    thumbnailSizeSelect.addEventListener('change', async () => {
      thumbnailSize = thumbnailSizeSelect.value;
      await window.api.setSettings('thumbnailSize', thumbnailSize);
      grid.className = 'grid grid-size-' + thumbnailSize;
    });
  }

  if (previewToggle) {
    previewToggle.addEventListener('change', async () => {
      previewEnabled = previewToggle.checked;
      await window.api.setSettings('previewEnabled', previewEnabled);
    });
  }

  window.api.onCardUpdated((payload) => {
    if (payload.action === 'copy') showToast('Copied!');
    else if (payload.action === 'favorite') {
      const it = allItems.find((i) => i.id === payload.id);
      if (it) it.favorite = payload.favorite;
      const card = grid.querySelector(`.card[data-id="${payload.id}"]`);
      if (card) {
        const starBtn = card.querySelector('.star-btn');
        if (starBtn) {
          starBtn.classList.toggle('favorited', payload.favorite);
          starBtn.textContent = payload.favorite ? '★' : '☆';
          starBtn.title = payload.favorite ? 'Remove from favorites' : 'Add to favorites';
        }
      }
      if (currentFilter === 'favorites' && !payload.favorite && card) {
        card.remove();
        if (getFilteredItems().length === 0) grid.appendChild(createEmptyNode());
      }
    } else if (payload.action === 'tabs') {
      const it = allItems.find((i) => i.id === payload.id);
      if (it && payload.tabIds) it.tabIds = payload.tabIds;
    } else if (payload.action === 'collections') {
      const it = allItems.find((i) => i.id === payload.id);
      if (it && payload.collectionIds) it.collectionIds = payload.collectionIds;
    } else if (payload.action === 'delete') {
      allItems = allItems.filter((i) => i.id !== payload.id);
      blobs.delete(payload.id);
      gifFirstFrames.delete(payload.id);
      const card = grid.querySelector(`.card[data-id="${payload.id}"]`);
      if (card) {
        const img = card.querySelector('img');
        if (img && img.src && img.src.startsWith('blob:')) {
          objectUrls.delete(img.src);
          URL.revokeObjectURL(img.src);
        }
        card.remove();
      }
      window.api.getList().then((list) => {
        updateCount(list);
        if (getFilteredItems().length === 0) grid.appendChild(createEmptyNode());
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      if (btnPaste) btnPaste.click();
      return;
    }
    if (e.target.matches('input, textarea, select')) return;
    if ((renameOverlay && renameOverlay.classList.contains('open')) || (previewOverlay && previewOverlay.classList.contains('open'))) return;
    const cards = Array.from(grid.querySelectorAll('.card'));
    if (cards.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusedCardIndex = focusedCardIndex < cards.length - 1 ? focusedCardIndex + 1 : 0;
      cards.forEach((c, i) => c.classList.toggle('keyboard-focus', i === focusedCardIndex));
      cards[focusedCardIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusedCardIndex = focusedCardIndex <= 0 ? cards.length - 1 : focusedCardIndex - 1;
      cards.forEach((c, i) => c.classList.toggle('keyboard-focus', i === focusedCardIndex));
      cards[focusedCardIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (e.key === 'Enter' && focusedCardIndex >= 0 && cards[focusedCardIndex]) {
      e.preventDefault();
      const id = parseInt(cards[focusedCardIndex].dataset.id, 10);
      const item = allItems.find((i) => i.id === id);
      if (item) { window.api.copyToClipboard(item.filename); showToast('Copied!'); }
    } else if (e.key === 'Delete' && focusedCardIndex >= 0 && cards[focusedCardIndex]) {
      e.preventDefault();
      const id = parseInt(cards[focusedCardIndex].dataset.id, 10);
      window.api.moveToTrash(id).then(() => {
        allItems = allItems.filter((i) => i.id !== id);
        cards[focusedCardIndex].remove();
        focusedCardIndex = Math.min(focusedCardIndex, cards.length - 2);
        if (grid.querySelectorAll('.card').length === 0) grid.appendChild(createEmptyNode());
        window.api.getList().then(updateCount);
      });
    }
  });
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const cards = Array.from(grid.querySelectorAll('.card'));
    focusedCardIndex = cards.indexOf(card);
    cards.forEach((c, i) => c.classList.toggle('keyboard-focus', i === focusedCardIndex));
  });

  (async () => {
    try {
      if (alwaysOnTopCheck) {
        const top = await window.api.getAlwaysOnTop();
        alwaysOnTopCheck.checked = top;
      }
      const settings = await window.api.getSettings();
      sortOrder = settings.sortOrder || 'newest';
      thumbnailSize = settings.thumbnailSize || 'medium';
       previewEnabled = settings.previewEnabled !== false;
      if (sortOrderSelect) sortOrderSelect.value = sortOrder;
      if (thumbnailSizeSelect) thumbnailSizeSelect.value = thumbnailSize;
      if (previewToggle) previewToggle.checked = previewEnabled;
      grid.className = 'grid grid-size-' + thumbnailSize;
      await refreshList();
    } catch (_) {
      if (countEl) countEl.textContent = '0 / 50';
    }
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
