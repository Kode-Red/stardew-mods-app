import { app } from "electron";
import updaterPkg from "electron-updater";
import type { AppUpdateStatus, UpdateChannel } from "../../shared/types.js";
import { readSettings } from "./settings.js";

// electron-updater is CommonJS; grab autoUpdater off the default export.
const { autoUpdater } = updaterPkg;

type Send = (status: AppUpdateStatus) => void;
let wired = false;

/**
 * Point the updater at the chosen channel. On "beta" we allow prereleases (the
 * updater reads the releases feed and picks the newest, prereleases included);
 * on "stable" it uses GitHub's /releases/latest (prereleases excluded). Allowing
 * downgrade on "stable" lets a machine that opted into beta drop back to the
 * newest stable build when it switches back.
 */
function applyChannel(channel: UpdateChannel): void {
  autoUpdater.allowPrerelease = channel === "beta";
  autoUpdater.allowDowngrade = channel === "stable";
}

/**
 * Wire the GitHub-Releases auto-updater. Only works in a packaged install; in dev
 * there's no app-update.yml, so we report "unsupported" and do nothing else.
 */
export function setupUpdater(send: Send): void {
  if (!app.isPackaged) {
    send({ state: "unsupported" });
    return;
  }
  if (wired) return;
  wired = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => send({ state: "checking" }));
  autoUpdater.on("update-available", (info) => send({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send({ state: "not-available" }));
  autoUpdater.on("download-progress", (p) => send({ state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => send({ state: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => send({ state: "error", message: err?.message ?? String(err) }));
}

export async function checkForAppUpdates(): Promise<void> {
  if (!app.isPackaged) return;
  const settings = await readSettings();
  applyChannel(settings.updateChannel ?? "stable");
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    /* surfaced via the "error" event */
  }
}

export function installAppUpdate(): void {
  if (app.isPackaged) autoUpdater.quitAndInstall();
}
