import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { handleNxmLink, registerIpc } from "./ipc.js";
import { setupNxmProtocol } from "./services/nxm-protocol.js";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: "Stardew Mod Manager",
    // Frameless with a custom in-app title bar (matches the dark theme).
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    backgroundColor: "#0c0a09",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const emitMaximized = (): void =>
    mainWindow?.webContents.send("window:maximized", mainWindow.isMaximized());
  mainWindow.on("maximize", emitMaximized);
  mainWindow.on("unmaximize", emitMaximized);

  // Open external links in the user's browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// A single instance is required so `nxm://` links from a second launch are
// delivered to the running app instead of starting a new one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    registerIpc(() => mainWindow);
    setupNxmProtocol((link) => {
      if (mainWindow?.isMinimized()) mainWindow.restore();
      void handleNxmLink(link);
    });
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
