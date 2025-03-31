import {
  app,
  globalShortcut,
  ipcMain,
  session,
  BrowserWindow,
  Menu,
  Tray,
  shell,
} from "electron";
import path from "node:path";
import fs, { FSWatcher, WatchEventType, WatchListener } from "node:fs";
import os from "node:os";
import { defaultSettings, Settings } from "./settings";
import { deepEqual } from "./util";

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow: BrowserWindow;

/// Error handling

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      `alert("Main: Uncaught Exception: ${error.message}")`,
    );
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      `alert("Main: Unhandled Rejection: ${reason}")`,
    );
  }
});

/// Settings

const settingsPath = path.join(os.homedir(), ".smart-lookup");

let settings: Settings = defaultSettings();

if (fs.existsSync(settingsPath)) {
  try {
    const settingsData = fs.readFileSync(settingsPath, "utf-8");
    const loadedSettings = JSON.parse(settingsData);
    settings = {
      ...settings,
      ...loadedSettings,
    };
    console.log("Loaded settings:", settings);
    if (!deepEqual(settings, loadedSettings)) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("Updated settings file with new defaults.");
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
} else {
  console.warn(
    `Settings file not found at ${settingsPath}. Writing default settings.`,
  );
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// Watch settings file for changes.
const watchSettingsFile = false;
if (watchSettingsFile) {
  const handleSettingsFileChanged = () => {
    try {
      const settingsData = fs.readFileSync(settingsPath, "utf-8");
      settings = {
        ...settings,
        ...JSON.parse(settingsData),
      };
      console.log("Settings updated:", settings);
      if (mainWindow) {
        mainWindow.webContents.send("update-settings", settings);
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  // `fs.watch` is recommended over `fs.watchFile` but does not work reliably
  // because some editors seem to move the settings file.
  fs.watchFile(settingsPath, (cur, prev) => {
    console.log("watchFile triggered");
    if (cur.mtime != prev.mtime) {
      console.log("watchFile: file changed");
      handleSettingsFileChanged();
    }
  });
}

/// App lifetime management

const openSettings = (): void => {
  shell.openPath(settingsPath);
};

const createWindow = (): void => {
  if (mainWindow) {
    throw new Error("Main window already exists");
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 100,
    width: 600,
    maxWidth: 800,
    maxHeight: 600,
    frame: false,
    resizable: false,
    show: false,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      devTools: !app.isPackaged,
    },
  });

  ipcMain.on("get-settings", () => {
    mainWindow.webContents.send("update-settings", settings);
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Allow talking to Ollama server.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "connect-src 'self' http://127.0.0.1:11434",
        ],
      },
    });
  });

  /// Open links in external browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); // Open the URL in the system's default browser
    return { action: "deny" }; // Prevent the app from opening the URL internally
  });

  ipcMain.on("resize-window", (_event, arg) => {
    const [width, height] = mainWindow.getSize();
    const widthChanged = arg.width && width != arg.width;
    const heightChanged = arg.height && height != arg.height;
    if (widthChanged || heightChanged) {
      mainWindow.setSize(arg.width || width, arg.height || height);
    }
  });

  ipcMain.on("hide-window", () => {
    mainWindow.hide();
  });

  globalShortcut.register(settings.keyboardShortcut, () => {
    mainWindow.show();
  });

  // Create tray item.
  (() => {
    const iconFileName = "trayTemplate.png";
    const iconPath = app.isPackaged
      ? path.join(__dirname, "..", "..", "..", iconFileName)
      : path.join(__dirname, "..", "..", "assets", iconFileName);
    const tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      { label: `Settings...`, type: "normal", click: openSettings },
      { label: `Quit ${app.name}`, type: "normal", click: app.quit },
    ]);
    tray.setContextMenu(contextMenu);

    tray.setToolTip(app.name);
  })();
};

app.on("ready", createWindow);

app.on("did-resign-active", () => {
  mainWindow.hide();
});

app.dock.hide();

// Run at login.
if (settings.runOnStartup) {
  app.setLoginItemSettings({
    openAtLogin: true,
  });
}
