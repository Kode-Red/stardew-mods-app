import { resolve } from "node:path";
import { app } from "electron";
import { isNxmLink, parseNxmLink, type NxmLink } from "@sdm/core";

/** Find the first nxm:// argument in a process argv array. */
export function findNxmInArgv(argv: readonly string[]): string | null {
  return argv.find((arg) => isNxmLink(arg)) ?? null;
}

/**
 * Register the app as the OS handler for `nxm://` links and wire up delivery.
 * Windows/Linux deliver the link via a second-instance launch; macOS via
 * `open-url`. The single-instance lock is acquired by the caller in main.
 */
export function setupNxmProtocol(onLink: (link: NxmLink) => void): void {
  const deliver = (raw: string | null): void => {
    if (!raw) return;
    const link = parseNxmLink(raw);
    if (link) onLink(link);
  };

  if (process.defaultApp && process.platform === "win32" && process.argv.length >= 2) {
    // In dev, register with the electron binary + script path so the OS can relaunch us.
    app.setAsDefaultProtocolClient("nxm", process.execPath, [resolve(process.argv[1]!)]);
  } else {
    app.setAsDefaultProtocolClient("nxm");
  }

  // macOS: link arrives as an event.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliver(url);
  });

  // Windows/Linux: a second launch carries the link in its argv.
  app.on("second-instance", (_event, argv) => {
    deliver(findNxmInArgv(argv));
  });

  // Cold start: the link may be in our own argv.
  deliver(findNxmInArgv(process.argv));
}
