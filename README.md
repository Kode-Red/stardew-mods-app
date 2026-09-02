# Stardew Mod Manager

A mod manager for **Stardew Valley** — a desktop app that installs, updates, and
organises SMAPI mods, plus a web companion for discovery and (eventually)
first-party mod hosting. Built to fill the gap left by the current tooling.


## Tech stack

| Layer            | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                          |
| Desktop shell    | Electron (all-TypeScript main/preload)              |
| UI               | Vue 3 + [Nuxt UI](https://ui.nuxt.com) v3 + Tailwind v4 |
| Domain logic     | `@sdm/core` — pure TypeScript, Zod-validated, unit-tested |
| Tests            | Vitest                                              |

## Layout

```
apps/
  desktop/          Electron + Vue renderer (Nuxt UI). electron-vite build.
    src/main/            Main process. Node/TS.
      ipc.ts             ipcMain handlers + nxm download/install orchestration
      services/          game-locator, smapi, mod-scanner, mod-toggle,
                         update-check (SMAPI Web API), settings, archive (unzip),
                         installer, nexus-client, nxm-protocol
    src/preload/         contextBridge API exposed to the renderer as window.api
    src/renderer/        Vue 3 app (Nuxt UI): frameless title bar + sidebar shell,
                         router pages (Dashboard, Mods Library, Mods Store, mod
                         detail, Downloads, Settings), a shared reactive store,
                         and Profiles/Progress components.
    src/shared/types.ts  IPC payload types shared by main + preload + renderer
packages/
  core/             Domain engine: manifest parsing, version compare, compat.
    src/version.ts       SMAPI-flavoured semver parse + compare
    src/manifest.ts      manifest.json schema + parser (BOM/comment tolerant)
    src/update-keys.ts   UpdateKeys parsing (Nexus / CurseForge / GitHub / ...)
    src/compat.ts        update-available / SMAPI-too-old / missing deps
    src/mod-folder.ts    enable/disable dot-folder naming
    src/smapi-api.ts     SMAPI Web API request builder + response parser
    src/nxm.ts           nxm:// link parsing
    src/install-plan.ts  decide which folders in an archive to install
    src/nexus.ts         Nexus API request builders + response parsers
    src/profiles.ts      profile capture + reconcile-to-disk logic
```

Planned (later phases): `apps/web` (Nuxt SSR companion), `apps/api` (hosting +
version registry), `packages/sources` (Nexus / CurseForge / SMAPI-web adapters),
`packages/ui` (shared components), `packages/db` (Drizzle schema).

## Commands

First time only:

```bash
pnpm install
```

Everything else runs **from the repo root** (each builds `@sdm/core` first where needed):

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in dev with hot-reload (builds core first, then Electron). |
| `pnpm app` | Build everything and run the packaged output (no dev server). |
| `pnpm build` | Build every package/app. |
| `pnpm test` | Run all unit tests. |
| `pnpm typecheck` | Type-check every package/app. |
| `pnpm check` | typecheck + test + build, in one go. |
| `pnpm dist:win` | Build the **Windows installer** → `apps/desktop/release/Stardew Mod Manager-<version>-setup.exe` (also writes `latest.yml` for auto-update). |
| `pnpm pack:win` | Build a **portable** folder → `apps/desktop/release/win-unpacked/` (zip & share, no install). |
| `pnpm --filter @sdm/desktop release:win` | Build **and publish** to GitHub Releases (needs `GH_TOKEN`). |
| `pnpm release:reveal` | Open the `release/` folder in Explorer. |
| `pnpm clean` | Remove build outputs + `node_modules`. |

Notes:
- Builds are **unsigned** (`win.signAndEditExecutable: false`), which avoids electron-builder's
  winCodeSign tool that can't extract on Windows without Developer Mode. The installer, shortcuts,
  and the running app show the custom icon; the bare `.exe` keeps the default Electron icon.
- macOS/Linux packaging (`electron-builder`'s dmg/AppImage) needs to run on those OSes.

### Auto-updates (GitHub Releases)

The app checks **GitHub Releases** for updates (via `electron-updater`) and installs them on
restart. To turn it on for your fork:

1. Set `publish.owner` / `publish.repo` in `apps/desktop/electron-builder.yml` to your repo.
2. Bump `version` in `apps/desktop/package.json`, commit, and tag it.
3. Run `GH_TOKEN=<token> pnpm --filter @sdm/desktop release:win` to build + upload the installer and
   `latest.yml` to a GitHub Release.
4. Installed apps will detect the new version, download it, and show "Restart & update".

Auto-update only runs in an installed build (in dev it reports "unsupported").
 
## The domain engine (`@sdm/core`)

This is the tested heart of the manager and is deliberately free of any
Electron/Vue/Node dependencies so it runs in the main process, the renderer, and
the future web app alike.

- **`parseManifest(json)`** — validates a SMAPI `manifest.json` and normalises it
  (tolerates a BOM and `//` / `/* */` comments, like SMAPI's own reader).
- **`compareVersions(a, b)`** — semver 2.0.0 precedence with SMAPI conveniences
  (optional patch, ignored build metadata, correct prerelease ordering).
- **`checkForUpdate(installed, latest)`** — `up-to-date` / `update-available` /
  `ahead` / `unknown`.
- **`checkApiCompatibility(manifest, smapiVersion)`** — is the installed SMAPI new
  enough for a mod's `MinimumApiVersion`?
- **`findMissingDependencies(manifest, installed)`** — missing/outdated required deps.
- **`parseUpdateKeys([...])`** — maps a mod to its hosting sites, which is how
  version-mismatch detection will drive the SMAPI Web API in Phase 2.

## Licensing notes

- **SMAPI** is GNU LGPL v3 — automated install is permitted (Vortex does it);
  ship from the official source and include the license notice.
- **CurseForge** third-party API requires an API key + ToS acceptance, and each
  author's distribution toggle must be respected.
- **Nexus** free users can only download via `nxm://` links (hence the desktop
  protocol handler); the app must be registered with Nexus for SSO.
- **First-party hosting** means only hosting mods the uploader actually authored,
  with moderation and a DMCA path — not mirroring other sites.
