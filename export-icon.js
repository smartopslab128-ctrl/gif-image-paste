const fs = require('fs');
const path = require('path');

const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2NkYGD4z0ABYBwNwwQY0cAwGoZhwjAwjIZhAgwAAGgSEWgRTy9mAAAAAElFTkSuQmCC';

const outPath = path.join(__dirname, 'icon.png');
fs.writeFileSync(outPath, Buffer.from(TRAY_ICON_BASE64, 'base64'));
console.log('icon.png を出力しました: ' + outPath);
