// Appli Windows Routage : fenêtre qui ouvre le site en ligne (toujours à jour).
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const URL = 'https://routage.pplx.app/';
Menu.setApplicationMenu(null);
// Icône de la fenêtre et de la barre des tâches : celle du bateau choisi dans « Icône du bateau »
const ICO_FILE = () => path.join(app.getPath('userData'), 'icone.txt');
const icoPath = k => path.join(__dirname, `icon-${['c', 'm'].includes(k) ? k : 't'}.png`);
function savedIco() { try { return fs.readFileSync(ICO_FILE(), 'utf8').trim(); } catch (e) { return 't'; } }
function createWindow() {
  const win = new BrowserWindow({ width: 1400, height: 900, title: 'Routage', icon: icoPath(savedIco()), autoHideMenuBar: true, webPreferences: { contextIsolation: true } });
  win.maximize();
  win.loadURL(URL);
  const ses = win.webContents.session;
  const follow = c => {
    if (!c || c.name !== '__Host-tiki38opt') return;
    try {
      const k = JSON.parse(decodeURIComponent(c.value)).ico;
      const v = ['c', 'm'].includes(k) ? k : 't';
      if (v !== savedIco()) { fs.writeFileSync(ICO_FILE(), v); }
      win.setIcon(icoPath(v));
    } catch (e) {}
  };
  ses.cookies.on('changed', (e, c, cause, removed) => { if (!removed) follow(c); });
  win.webContents.on('did-finish-load', () => { ses.cookies.get({ name: '__Host-tiki38opt' }).then(l => follow(l[0])).catch(() => {}); });
  // Liens externes (sources, aide) dans le navigateur habituel
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(URL)) shell.openExternal(url); return { action: 'deny' }; });
  // Enregistrer GPX : fenêtre « Enregistrer sous » de Windows
  ses.on('will-download', (e, item) => { item.setSaveDialogOptions({ title: 'Enregistrer la route GPX', defaultPath: item.getFilename() }); });
  // F5 : recharger
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F5') win.reload(); });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
