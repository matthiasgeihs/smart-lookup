import { contextBridge, ipcRenderer } from 'electron';
import { Settings } from './settings';

contextBridge.exposeInMainWorld('electronAPI', {
  resizeWindow: (width: number, height: number) => ipcRenderer.send('resize-window', { width, height }),
  hideWindow: () => ipcRenderer.send('hide-window'),
  getSettings: () => ipcRenderer.send('get-settings'),
  onUpdateSettings: (callback: (settings: Settings) => void) => ipcRenderer.on('update-settings', (_event, settings) => callback(settings)),
});
