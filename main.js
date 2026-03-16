const { app, BrowserWindow, ipcMain, clipboard, nativeImage, dialog, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');

const TRAY_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2NkYGD4z0ABYBwNwwQY0cAwGoZhwjAwjIZhAgwAAGgSEWgRTy9mAAAAAElFTkSuQmCC';

const STORAGE_DIR = path.join(app.getPath('userData'), 'library');
const INDEX_FILE = path.join(STORAGE_DIR, 'index.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const THUMBNAIL_CACHE_DIR = path.join(app.getPath('userData'), 'thumbnails');
const MAX_FREE_ITEMS = 50;
const MAX_PAID_ITEMS = 300;

/** Replace with your Buy Me a Coffee page URL after approval. */
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/yourname';

const ICON_ICO = path.join(__dirname, 'icon.ico');
const ICON_PNG = path.join(__dirname, 'icon.png');

function getAppIcon() {
  try {
    if (fsSync.existsSync(ICON_ICO)) {
      return nativeImage.createFromPath(ICON_ICO);
    }
    if (fsSync.existsSync(ICON_PNG)) {
      return nativeImage.createFromPath(ICON_PNG);
    }
  } catch (_) {}
  return nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'));
}

async function getMaxItems() {
  try {
    const s = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(s);
    if (settings.isPro) return MAX_PAID_ITEMS;
  } catch (_) {}
  return MAX_FREE_ITEMS;
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isAnimatedGif(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 6) return false;
  if (buf[0] !== 0x47 || buf[1] !== 0x49 || buf[2] !== 0x46) return false;
  let count = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xF9) count++;
  }
  return count > 1;
}

function resolveType(buffer, ext) {
  const extLower = (ext || '').toLowerCase();
  if (extLower === '.gif') return isAnimatedGif(buffer) ? 'gif' : 'image';
  return 'image';
}

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
function isAllowedExt(ext) {
  const e = (ext || '').toLowerCase();
  if (!e.startsWith('.')) return ALLOWED_EXTENSIONS.includes('.' + e);
  return ALLOWED_EXTENSIONS.includes(e);
}

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function loadIndex() {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    const index = JSON.parse(data);
    if (!index.customTabs) index.customTabs = [];
    if (!index.nextTabId) index.nextTabId = 1;
    if (!index.trash) index.trash = [];
    if (!index.collections) index.collections = [];
    if (!index.nextCollectionId) index.nextCollectionId = 1;
    index.items = index.items || [];
    let orderCounter = 0;
    index.items.forEach((i) => {
      if (!i.tabIds) i.tabIds = [];
      if (!i.collectionIds) i.collectionIds = [];
      if (i.order == null) i.order = (i.addedAt != null ? i.addedAt : orderCounter++);
    });
    return index;
  } catch {
    return { items: [], nextId: 1, customTabs: [], nextTabId: 1, trash: [], collections: [], nextCollectionId: 1 };
  }
}

async function purgeOldTrash(index) {
  const now = Date.now();
  const toRemove = index.trash.filter((t) => now - (t.deletedAt || 0) > TRASH_RETENTION_MS);
  for (const t of toRemove) {
    try { await fs.unlink(path.join(STORAGE_DIR, t.filename)); } catch (_) {}
  }
  if (toRemove.length) {
    index.trash = index.trash.filter((t) => now - (t.deletedAt || 0) <= TRASH_RETENTION_MS);
    await saveIndex(index);
  }
}

async function saveIndex(index) {
  await ensureStorageDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

function getFilePath(id, ext) {
  return path.join(STORAGE_DIR, `${id}${ext}`);
}

ipcMain.handle('storage:getList', async () => {
  const index = await loadIndex();
  await purgeOldTrash(index);
  const limit = await getMaxItems();
  const items = index.items
    .map((i) => ({ ...i, favorite: !!i.favorite, tabIds: i.tabIds || [], collectionIds: i.collectionIds || [] }))
    .sort((a, b) => (a.order != null ? a.order : a.addedAt || 0) - (b.order != null ? b.order : b.addedAt || 0));
  return {
    items,
    count: items.length,
    limit,
    customTabs: index.customTabs || [],
    collections: index.collections || [],
  };
});

ipcMain.handle('storage:toggleFavorite', async (_, id) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === id);
  if (!item) return { ok: false };
  item.favorite = !item.favorite;
  await saveIndex(index);
  return { ok: true, favorite: item.favorite };
});

ipcMain.handle('storage:addFromClipboard', async () => {
  try {
    const image = clipboard.readImage();
    if (!image || image.isEmpty()) return { ok: false, error: 'no_image' };
    const buf = image.toPNG();
    if (!buf || buf.length === 0) return { ok: false, error: 'no_image' };
    const hash = hashBuffer(buf);
    const index = await loadIndex();
    if (index.items.some((i) => i.hash === hash)) return { ok: false, error: 'duplicate' };
    const maxItems = await getMaxItems();
    if (index.items.length >= maxItems) return { ok: false, error: 'limit' };
    const id = index.nextId++;
    await ensureStorageDir();
    await fs.writeFile(getFilePath(id, '.png'), buf);
    const addedAt = Date.now();
    index.items.push({
      id,
      filename: `${id}.png`,
      addedAt,
      type: 'image',
      favorite: false,
      hash,
      order: addedAt,
    });
    await saveIndex(index);
    return { ok: true, item: index.items[index.items.length - 1] };
  } catch (err) {
    return { ok: false, error: 'no_image' };
  }
});

ipcMain.handle('storage:addFromFile', async (_, buffer, ext) => {
  const safeExt = (ext && ext.startsWith('.')) ? ext : ('.' + (ext || 'png'));
  if (!isAllowedExt(safeExt)) return { ok: false, error: 'format_not_allowed' };
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const hash = hashBuffer(buf);
  const index = await loadIndex();
  if (index.items.some((i) => i.hash === hash)) return { ok: false, error: 'duplicate' };
  const maxItems = await getMaxItems();
  if (index.items.length >= maxItems) return { ok: false, error: 'limit' };
  const id = index.nextId++;
  await ensureStorageDir();
  await fs.writeFile(getFilePath(id, safeExt), buf);
  const type = resolveType(buf, safeExt);
  const addedAt = Date.now();
  index.items.push({
    id,
    filename: `${id}${safeExt}`,
    addedAt,
    type,
    favorite: false,
    hash,
    order: addedAt,
  });
  await saveIndex(index);
  return { ok: true, item: index.items[index.items.length - 1] };
});

ipcMain.handle('storage:moveToTrash', async (_, id) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === id);
  if (!item) return { ok: false };
  index.items = index.items.filter((i) => i.id !== id);
  index.trash = index.trash || [];
  index.trash.push({ ...item, deletedAt: Date.now() });
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:getTrash', async () => {
  const index = await loadIndex();
  await purgeOldTrash(index);
  return index.trash || [];
});

ipcMain.handle('storage:restoreFromTrash', async (_, id) => {
  const index = await loadIndex();
  const idx = (index.trash || []).findIndex((t) => t.id === id);
  if (idx === -1) return { ok: false };
  const [item] = index.trash.splice(idx, 1);
  delete item.deletedAt;
  index.items.push(item);
  await saveIndex(index);
  return { ok: true, item };
});

ipcMain.handle('storage:emptyTrash', async () => {
  const index = await loadIndex();
  for (const t of index.trash || []) {
    try { await fs.unlink(path.join(STORAGE_DIR, t.filename)); } catch (_) {}
  }
  index.trash = [];
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:delete', async (_, id) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === id);
  if (!item) return { ok: false };
  const ext = path.extname(item.filename) || '.png';
  try { await fs.unlink(getFilePath(id, ext)); } catch (_) {}
  index.items = index.items.filter((i) => i.id !== id);
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:addCustomTab', async () => {
  const index = await loadIndex();
  const id = index.nextTabId++;
  const name = 'Tab' + id;
  index.customTabs = index.customTabs || [];
  index.customTabs.push({ id, name });
  await saveIndex(index);
  return { id, name };
});

ipcMain.handle('storage:deleteCustomTab', async (_, tabId) => {
  const index = await loadIndex();
  const numId = parseInt(tabId, 10);
  index.customTabs = (index.customTabs || []).filter((t) => t.id !== numId);
  index.items.forEach((i) => {
    if (i.tabIds) i.tabIds = i.tabIds.filter((tid) => tid !== numId);
  });
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:renameCustomTab', async (_, tabId, newName) => {
  const index = await loadIndex();
  const numId = parseInt(tabId, 10);
  const tab = (index.customTabs || []).find((t) => t.id === numId);
  if (!tab) return { ok: false };
  const name = (newName || '').trim().slice(0, 32) || tab.name;
  tab.name = name;
  await saveIndex(index);
  return { ok: true, name };
});

ipcMain.handle('storage:addItemToTab', async (_, itemId, tabId) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === itemId);
  if (!item) return { ok: false };
  item.tabIds = item.tabIds || [];
  const numTabId = parseInt(tabId, 10);
  if (!item.tabIds.includes(numTabId)) item.tabIds.push(numTabId);
  await saveIndex(index);
  return { ok: true, tabIds: item.tabIds };
});

ipcMain.handle('storage:removeItemFromTab', async (_, itemId, tabId) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === itemId);
  if (!item) return { ok: false };
  item.tabIds = item.tabIds || [];
  const numTabId = parseInt(tabId, 10);
  item.tabIds = item.tabIds.filter((tid) => tid !== numTabId);
  await saveIndex(index);
  return { ok: true, tabIds: item.tabIds };
});

ipcMain.handle('storage:reorderItems', async (_, orderedIds) => {
  const index = await loadIndex();
  const idToOrder = new Map();
  orderedIds.forEach((id, idx) => idToOrder.set(id, idx));
  index.items.forEach((i) => {
    if (idToOrder.has(i.id)) i.order = idToOrder.get(i.id);
  });
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:writeThumbnail', async (_, id, buffer) => {
  await fs.mkdir(THUMBNAIL_CACHE_DIR, { recursive: true });
  const outPath = path.join(THUMBNAIL_CACHE_DIR, `${id}.png`);
  await fs.writeFile(outPath, Buffer.from(buffer));
  return { ok: true };
});

ipcMain.handle('storage:readThumbnail', async (_, itemId) => {
  const id = typeof itemId === 'number' ? itemId : parseInt(String(itemId), 10);
  if (Number.isNaN(id)) return null;
  const cachePath = path.join(THUMBNAIL_CACHE_DIR, `${id}.png`);
  try {
    return await fs.readFile(cachePath);
  } catch {
    return null;
  }
});

ipcMain.handle('storage:addCollection', async () => {
  const index = await loadIndex();
  const id = index.nextCollectionId++;
  const name = 'Collection' + id;
  index.collections = index.collections || [];
  index.collections.push({ id, name });
  await saveIndex(index);
  return { id, name };
});

ipcMain.handle('storage:deleteCollection', async (_, collectionId) => {
  const index = await loadIndex();
  const numId = parseInt(collectionId, 10);
  index.collections = (index.collections || []).filter((c) => c.id !== numId);
  index.items.forEach((i) => {
    if (i.collectionIds) i.collectionIds = i.collectionIds.filter((cid) => cid !== numId);
  });
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:renameCollection', async (_, collectionId, newName) => {
  const index = await loadIndex();
  const c = (index.collections || []).find((x) => x.id === parseInt(collectionId, 10));
  if (!c) return { ok: false };
  c.name = (newName || '').trim().slice(0, 32) || c.name;
  await saveIndex(index);
  return { ok: true, name: c.name };
});

ipcMain.handle('storage:addItemToCollection', async (_, itemId, collectionId) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === itemId);
  if (!item) return { ok: false };
  item.collectionIds = item.collectionIds || [];
  const numCid = parseInt(collectionId, 10);
  if (!item.collectionIds.includes(numCid)) item.collectionIds.push(numCid);
  await saveIndex(index);
  return { ok: true, collectionIds: item.collectionIds };
});

ipcMain.handle('storage:removeItemFromCollection', async (_, itemId, collectionId) => {
  const index = await loadIndex();
  const item = index.items.find((i) => i.id === itemId);
  if (!item) return { ok: false };
  item.collectionIds = item.collectionIds || [];
  const numCid = parseInt(collectionId, 10);
  item.collectionIds = item.collectionIds.filter((cid) => cid !== numCid);
  await saveIndex(index);
  return { ok: true, collectionIds: item.collectionIds };
});

ipcMain.handle('storage:bulkSetFavorite', async (_, ids, value) => {
  const index = await loadIndex();
  const idSet = new Set(ids);
  index.items.forEach((i) => { if (idSet.has(i.id)) i.favorite = !!value; });
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:bulkAddToTab', async (_, ids, tabId) => {
  const index = await loadIndex();
  const numTabId = parseInt(tabId, 10);
  const idSet = new Set(ids);
  index.items.forEach((i) => {
    if (idSet.has(i.id)) {
      i.tabIds = i.tabIds || [];
      if (!i.tabIds.includes(numTabId)) i.tabIds.push(numTabId);
    }
  });
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:bulkMoveToTrash', async (_, ids) => {
  const index = await loadIndex();
  const idSet = new Set(ids);
  const toTrash = index.items.filter((i) => idSet.has(i.id));
  index.items = index.items.filter((i) => !idSet.has(i.id));
  index.trash = index.trash || [];
  const now = Date.now();
  toTrash.forEach((i) => index.trash.push({ ...i, deletedAt: now }));
  await saveIndex(index);
  return { ok: true };
});

ipcMain.handle('storage:getPath', (_, id, filename) => {
  return path.join(STORAGE_DIR, filename || `${id}.png`);
});

ipcMain.handle('storage:readFile', async (_, filename) => {
  const filePath = path.join(STORAGE_DIR, filename);
  const buf = await fs.readFile(filePath);
  return buf;
});

ipcMain.handle('clipboard:copy', async (_, filename) => {
  const filePath = path.join(STORAGE_DIR, filename);
  const buf = await fs.readFile(filePath);
  const img = nativeImage.createFromBuffer(buf);
  clipboard.writeImage(img);
  return true;
});

ipcMain.handle('storage:addFromDialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select images',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
    ],
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true, added: [] };
  const index = await loadIndex();
  const maxItems = await getMaxItems();
  const added = [];
  for (const filePath of filePaths) {
    if (index.items.length >= maxItems) break;
    const ext = path.extname(filePath).toLowerCase() || '.png';
    if (!isAllowedExt(ext)) continue;
    const buf = await fs.readFile(filePath);
    const hash = hashBuffer(buf);
    if (index.items.some((i) => i.hash === hash)) continue;
    const id = index.nextId++;
    await ensureStorageDir();
    await fs.writeFile(getFilePath(id, ext), buf);
    const type = resolveType(buf, ext);
    const addedAt = Date.now();
    const item = {
      id,
      filename: `${id}${ext}`,
      addedAt,
      type,
      favorite: false,
      hash,
      order: addedAt,
    };
    index.items.push(item);
    added.push(item);
  }
  await saveIndex(index);
  return { ok: true, added };
});

ipcMain.handle('window:setAlwaysOnTop', (_, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(!!flag);
  if (trayMenuUpdater) trayMenuUpdater();
});

ipcMain.handle('window:getAlwaysOnTop', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : true;
});

const DEFAULT_SETTINGS = { sortOrder: 'newest', thumbnailSize: 'medium', isPro: false, previewEnabled: true };

async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

ipcMain.handle('settings:get', loadSettings);

ipcMain.handle('settings:set', async (_, key, value) => {
  const s = await loadSettings();
  s[key] = value;
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(s), 'utf-8');
  return s;
});

async function exportToPath(destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const gifDir = path.join(destDir, 'GIF');
  const imageDir = path.join(destDir, 'Image');
  await fs.mkdir(gifDir, { recursive: true });
  await fs.mkdir(imageDir, { recursive: true });
  const index = await loadIndex();
  for (const item of index.items) {
    const src = path.join(STORAGE_DIR, item.filename);
    const subdir = item.type === 'gif' ? gifDir : imageDir;
    const dest = path.join(subdir, item.filename);
    try {
      await fs.copyFile(src, dest);
    } catch (_) {}
  }
  try {
    await fs.copyFile(INDEX_FILE, path.join(destDir, 'index.json'));
  } catch (_) {}
  return { ok: true, path: destDir };
}

ipcMain.handle('storage:exportToFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select folder to export library',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
  const destDir = path.join(filePaths[0], 'GIF-Image-Paste-Export');
  const result = await exportToPath(destDir);
  if (result.ok) {
    const s = await loadSettings();
    s.lastExportPath = destDir;
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf-8');
  }
  return result;
});

ipcMain.handle('storage:quickExport', async () => {
  const s = await loadSettings();
  const lastPath = s.lastExportPath;
  if (!lastPath || typeof lastPath !== 'string') return { ok: false, error: 'no_last_path' };
  try {
    return await exportToPath(lastPath);
  } catch (err) {
    return { ok: false, error: 'export_failed' };
  }
});

ipcMain.handle('storage:addFromURL', async (_, urlStr) => {
  try {
    const res = await fetch(urlStr, { headers: { 'User-Agent': 'GIF-Image-Paste/1.0' } });
    if (!res.ok) return { ok: false, error: 'fetch_failed' };
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType.includes('avif') || contentType.includes('heic') || contentType.includes('webm')) return { ok: false, error: 'format_not_allowed' };
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = hashBuffer(buf);
    const index = await loadIndex();
    if (index.items.some((i) => i.hash === hash)) return { ok: false, error: 'duplicate' };
    const maxItems = await getMaxItems();
    if (index.items.length >= maxItems) return { ok: false, error: 'limit' };
    let ext = '.png';
    if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('bmp')) ext = '.bmp';
    else {
      const u = new URL(urlStr);
      const pathname = u.pathname || '';
      const m = pathname.match(/\.(gif|jpe?g|png|webp|bmp)$/i);
      if (m) ext = '.' + m[1].toLowerCase();
    }
    if (!isAllowedExt(ext)) return { ok: false, error: 'format_not_allowed' };
    const type = resolveType(buf, ext);
    const id = index.nextId++;
    await ensureStorageDir();
    await fs.writeFile(getFilePath(id, ext), buf);
    const addedAt = Date.now();
    const item = {
      id,
      filename: `${id}${ext}`,
      addedAt,
      type,
      favorite: false,
      hash,
      order: addedAt,
    };
    index.items.push(item);
    await saveIndex(index);
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: 'fetch_failed' };
  }
});

ipcMain.handle('contextMenu:showCard', async (_, itemId, filename, favorite, tabIds) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const index = await loadIndex();
  const itemTabIds = tabIds || [];
  const customTabs = index.customTabs || [];
  const template = [
    { label: 'Copy', click: async () => {
      try {
        const filePath = path.join(STORAGE_DIR, filename);
        const buf = await fs.readFile(filePath);
        clipboard.writeImage(nativeImage.createFromBuffer(buf));
        mainWindow.webContents.send('card-updated', { action: 'copy' });
      } catch (_) {}
    }},
    { label: favorite ? 'Remove from favorites' : 'Add to favorites', click: async () => {
      const idx = await loadIndex();
      const it = idx.items.find((i) => i.id === itemId);
      if (it) {
        it.favorite = !it.favorite;
        await saveIndex(idx);
        mainWindow.webContents.send('card-updated', { id: itemId, action: 'favorite', favorite: it.favorite });
      }
    }},
  ];
  if (customTabs.length) {
    template.push({ type: 'separator' });
    customTabs.forEach((tab) => {
      const inTab = itemTabIds.includes(tab.id);
      template.push({
        label: inTab ? `Remove from ${tab.name}` : `Add to ${tab.name}`,
        click: async () => {
          const idx = await loadIndex();
          const it = idx.items.find((i) => i.id === itemId);
          if (!it) return;
          it.tabIds = it.tabIds || [];
          if (inTab) it.tabIds = it.tabIds.filter((tid) => tid !== tab.id);
          else if (!it.tabIds.includes(tab.id)) it.tabIds.push(tab.id);
          await saveIndex(idx);
          mainWindow.webContents.send('card-updated', { id: itemId, action: 'tabs', tabIds: it.tabIds });
        },
      });
    });
  }
  template.push({ type: 'separator' }, {
    label: 'Remove',
    click: async () => {
      const idx = await loadIndex();
      const it = idx.items.find((i) => i.id === itemId);
      if (!it) return;
      idx.items = idx.items.filter((i) => i.id !== itemId);
      idx.trash = idx.trash || [];
      idx.trash.push({ ...it, deletedAt: Date.now() });
      await saveIndex(idx);
      mainWindow.webContents.send('card-updated', { id: itemId, action: 'delete' });
    },
  });
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

ipcMain.handle('contextMenu:showCollection', async (_, collectionId, collectionName) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const numId = parseInt(collectionId, 10);
  const name = collectionName || 'Collection' + numId;
  const template = [
    { label: 'Rename', click: () => {
      mainWindow.webContents.send('collection-rename-request', { collectionId: numId, collectionName: name });
    }},
    { label: 'Delete collection', click: async () => {
      const idx = await loadIndex();
      idx.collections = (idx.collections || []).filter((c) => c.id !== numId);
      idx.items.forEach((i) => {
        if (i.collectionIds) i.collectionIds = i.collectionIds.filter((cid) => cid !== numId);
      });
      await saveIndex(idx);
      mainWindow.webContents.send('collection-deleted', { collectionId: numId });
    }},
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

ipcMain.handle('contextMenu:showTab', async (_, tabId, tabName) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const numId = parseInt(tabId, 10);
  const name = tabName || 'Tab' + numId;
  const template = [
    { label: 'Rename', click: () => {
      mainWindow.webContents.send('tab-rename-request', { tabId: numId, tabName: name });
    }},
    { label: 'Delete tab', click: async () => {
      const idx = await loadIndex();
      idx.customTabs = (idx.customTabs || []).filter((t) => t.id !== numId);
      idx.items.forEach((i) => {
        if (i.tabIds) i.tabIds = i.tabIds.filter((tid) => tid !== numId);
      });
      await saveIndex(idx);
      mainWindow.webContents.send('tab-deleted', { tabId: numId });
    }},
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

ipcMain.handle('openExternal', (_, url) => {
  if (url && typeof url === 'string') shell.openExternal(url);
});
ipcMain.handle('getBmcUrl', () => BUY_ME_A_COFFEE_URL);

let mainWindow = null;
let tray = null;
let trayMenuUpdater = null;
let quitting = false;

function createWindow() {
  const winIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    minWidth: 320,
    minHeight: 360,
    alwaysOnTop: true,
    frame: true,
    title: 'GIF & Image Paste',
    icon: winIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = getAppIcon();
  tray = new Tray(icon);
  tray.setToolTip('GIF & Image Paste');
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
  });
  const isTop = mainWindow ? mainWindow.isAlwaysOnTop() : true;
  const updateTrayMenu = () => {
    const isTop = mainWindow && !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : true;
    tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow && mainWindow.show() },
    { label: 'Hide', click: () => mainWindow && mainWindow.hide() },
    { type: 'separator' },
    { label: isTop ? 'Always on top: On' : 'Always on top: Off', type: 'checkbox', checked: isTop, click: (item) => { if (mainWindow) mainWindow.setAlwaysOnTop(item.checked); updateTrayMenu(); } },
    { type: 'separator' },
    { label: '☕ Buy Me a Coffee', click: () => shell.openExternal(BUY_ME_A_COFFEE_URL) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; tray = null; app.quit(); } },
    ]));
  };
  updateTrayMenu();
  trayMenuUpdater = updateTrayMenu;
}

ipcMain.on('window:alwaysOnTopChanged', () => { if (trayMenuUpdater) trayMenuUpdater(); });

app.whenReady().then(() => {
  createWindow();
  app.dock && app.dock.hide();
  createTray();
});

app.on('window-all-closed', () => {
  if (!tray) app.quit();
});
