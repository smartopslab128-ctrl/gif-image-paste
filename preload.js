const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getList: () => ipcRenderer.invoke('storage:getList'),
  addFromClipboard: () => ipcRenderer.invoke('storage:addFromClipboard'),
  addFromFile: (buffer, ext) => ipcRenderer.invoke('storage:addFromFile', buffer, ext),
  addFromDialog: () => ipcRenderer.invoke('storage:addFromDialog'),
  addFromURL: (url) => ipcRenderer.invoke('storage:addFromURL', url),
  delete: (id) => ipcRenderer.invoke('storage:delete', id),
  moveToTrash: (id) => ipcRenderer.invoke('storage:moveToTrash', id),
  getTrash: () => ipcRenderer.invoke('storage:getTrash'),
  restoreFromTrash: (id) => ipcRenderer.invoke('storage:restoreFromTrash', id),
  emptyTrash: () => ipcRenderer.invoke('storage:emptyTrash'),
  toggleFavorite: (id) => ipcRenderer.invoke('storage:toggleFavorite', id),
  readFile: (filename) => ipcRenderer.invoke('storage:readFile', filename),
  copyToClipboard: (filename) => ipcRenderer.invoke('clipboard:copy', filename),
  exportToFolder: () => ipcRenderer.invoke('storage:exportToFolder'),
  quickExport: () => ipcRenderer.invoke('storage:quickExport'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  reorderItems: (orderedIds) => ipcRenderer.invoke('storage:reorderItems', orderedIds),
  writeThumbnail: (id, buffer) => ipcRenderer.invoke('storage:writeThumbnail', id, buffer),
  readThumbnail: (itemId) => ipcRenderer.invoke('storage:readThumbnail', itemId),
  addCustomTab: () => ipcRenderer.invoke('storage:addCustomTab'),
  deleteCustomTab: (tabId) => ipcRenderer.invoke('storage:deleteCustomTab', tabId),
  renameCustomTab: (tabId, newName) => ipcRenderer.invoke('storage:renameCustomTab', tabId, newName),
  addItemToTab: (itemId, tabId) => ipcRenderer.invoke('storage:addItemToTab', itemId, tabId),
  removeItemFromTab: (itemId, tabId) => ipcRenderer.invoke('storage:removeItemFromTab', itemId, tabId),
  addCollection: () => ipcRenderer.invoke('storage:addCollection'),
  deleteCollection: (collectionId) => ipcRenderer.invoke('storage:deleteCollection', collectionId),
  renameCollection: (collectionId, newName) => ipcRenderer.invoke('storage:renameCollection', collectionId, newName),
  addItemToCollection: (itemId, collectionId) => ipcRenderer.invoke('storage:addItemToCollection', itemId, collectionId),
  removeItemFromCollection: (itemId, collectionId) => ipcRenderer.invoke('storage:removeItemFromCollection', itemId, collectionId),
  bulkSetFavorite: (ids, value) => ipcRenderer.invoke('storage:bulkSetFavorite', ids, value),
  bulkAddToTab: (ids, tabId) => ipcRenderer.invoke('storage:bulkAddToTab', ids, tabId),
  bulkMoveToTrash: (ids) => ipcRenderer.invoke('storage:bulkMoveToTrash', ids),
  showCardContextMenu: (itemId, filename, favorite, tabIds, collectionIds) => ipcRenderer.invoke('contextMenu:showCard', itemId, filename, favorite, tabIds, collectionIds),
  showTabContextMenu: (tabId, tabName) => ipcRenderer.invoke('contextMenu:showTab', tabId, tabName),
  showCollectionContextMenu: (collectionId, collectionName) => ipcRenderer.invoke('contextMenu:showCollection', collectionId, collectionName),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  getBmcUrl: () => ipcRenderer.invoke('getBmcUrl'),
  getGumroadBuyUrl: () => ipcRenderer.invoke('license:getGumroadUrl'),
  verifyLicense: (key) => ipcRenderer.invoke('license:verify', key),
  onCardUpdated: (callback) => {
    ipcRenderer.on('card-updated', (_, payload) => callback(payload));
  },
  onTabDeleted: (callback) => {
    ipcRenderer.on('tab-deleted', (_, payload) => callback(payload));
  },
  onTabRenameRequest: (callback) => {
    ipcRenderer.on('tab-rename-request', (_, payload) => callback(payload));
  },
  onCollectionRenameRequest: (callback) => {
    ipcRenderer.on('collection-rename-request', (_, payload) => callback(payload));
  },
  onCollectionDeleted: (callback) => {
    ipcRenderer.on('collection-deleted', (_, payload) => callback(payload));
  },
});
