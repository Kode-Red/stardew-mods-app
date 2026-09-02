// Package the app with electron-builder, with code-signing discovery force-disabled.
// This is what stops electron-builder from fetching its winCodeSign tool, whose
// bundled macOS symlinks can't be extracted on Windows without Developer Mode/admin.
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

const { build, Platform } = await import("electron-builder");

const dirOnly = process.argv.includes("--dir");
const doPublish = process.argv.includes("--publish");

const targetByPlatform = {
  win32: Platform.WINDOWS,
  darwin: Platform.MAC,
  linux: Platform.LINUX,
};
const platform = targetByPlatform[process.platform] ?? Platform.WINDOWS;

try {
  await build({
    // "dir" = unpacked portable folder (no installer); otherwise use the config's target.
    targets: dirOnly ? platform.createTarget("dir") : platform.createTarget(),
    // "always" uploads to GitHub Releases (needs GH_TOKEN); "never" still writes
    // latest.yml + app-update.yml locally so the auto-updater has its metadata.
    publish: doPublish ? "always" : "never",
  });
  console.log("\n✔ Packaging complete — see apps/desktop/release/");
} catch (err) {
  console.error(err);
  process.exit(1);
}
