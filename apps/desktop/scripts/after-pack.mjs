// electron-builder afterPack hook: embed the app icon into the Windows .exe.
//
// We keep win.signAndEditExecutable:false so electron-builder never pulls its
// winCodeSign tool (whose bundled macOS symlinks can't be extracted on Windows
// without Developer Mode). The cost is that electron-builder then doesn't set the
// exe's icon — so we do it here with rcedit, which edits the PE resource table
// directly and needs no signing tooling. Runs before NSIS packages the folder, so
// the installed app, shortcuts, taskbar, and Explorer all show the app icon.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { default: rcedit } = await import("rcedit");
  const productName = context.packager.appInfo.productFilename;
  const exePath = join(context.appOutDir, `${productName}.exe`);
  const iconPath = join(here, "..", "build", "icon.ico");
  await rcedit(exePath, { icon: iconPath });
  console.log(`✔ Embedded app icon into ${productName}.exe`);
}
