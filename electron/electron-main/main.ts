import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererDir = path.resolve(__dirname, "..", "dist-renderer");
const devServerUrl = process.env.SILT_RENDERER_URL;

let mainWindow: any = null;
let settingsWindow: any = null;

function makeWindowBounds(kind: "main" | "settings") {
  if (kind === "settings") {
    return {
      width: 860,
      height: 720,
      minWidth: 760,
      minHeight: 620,
      title: "Silt Settings",
      backgroundColor: "#0f1117",
    };
  }

  return {
    width: 1320,
    height: 880,
    minWidth: 1100,
    minHeight: 760,
    title: "Silt",
    backgroundColor: "#0f1117",
  };
}

async function loadPage(window: any, page: "index.html" | "settings.html") {
  if (devServerUrl) {
    await window.loadURL(new URL(page, devServerUrl).toString());
    return;
  }

  await window.loadFile(path.join(rendererDir, page));
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    ...makeWindowBounds("main"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: "hiddenInset",
  });

  await loadPage(mainWindow, "index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    ...makeWindowBounds("settings"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: "hiddenInset",
    parent: mainWindow ?? undefined,
  });

  await loadPage(settingsWindow, "settings.html");

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

ipcMain.on("app:open-settings", () => {
  void createSettingsWindow();
});

ipcMain.on("settings:changed", (event: any, payload: any) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents.id === event.sender.id) continue;
    window.webContents.send("settings:changed", payload);
  }
});

app.whenReady().then(async () => {
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
