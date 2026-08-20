# Stardew Mod Manager

A mod manager for **Stardew Valley** — a desktop app that installs, updates, and
organises SMAPI mods, plus a web companion for discovery and (eventually)
first-party mod hosting. Built to fill the gap left by the current tooling.

> **Status: Phases 3–5.** On top of Phase 2, the app installs from a local zip,
> registers the `nxm://` handler, downloads from Nexus (personal API key), has a
> full app shell (frameless custom title bar, sidebar nav, **profile selector**,
> **Launch modded / without mods**, switchable **profiles**), and a **Mods Store**
> that browses Nexus (trending/latest) with a mod-detail page. CurseForge and
> SMAPI bootstrap are next — see the roadmap below.

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

## Getting started

```bash
pnpm install
```

Run the desktop app in dev (launches Electron with HMR):

```bash
pnpm --filter @sdm/desktop dev
```

Other useful commands (run from the repo root):

```bash
pnpm test        # run all unit tests (currently @sdm/core: 49 tests)
pnpm build       # build every package/app
pnpm typecheck   # type-check every package/app
```

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

## Roadmap

1. **Foundations** — monorepo, `@sdm/core`, Electron + Nuxt UI shell. ✅
2. **Mod manager** — locate the Stardew install, scan `Mods/`, list mods,
   enable/disable, uninstall, reveal/open folders, run update/compat checks via
   the [SMAPI Web API](https://smapi.io/), and one-click **update** outdated mods
   (via their update key: CurseForge / GitHub releases / Nexus Premium). ✅
3. **Downloads** — install from local zip ✅, `nxm://` handler ✅, Nexus API
   (personal key) ✅, CurseForge (API key + search, respects each project's
   third-party distribution toggle) ✅. Next: .rar/.7z support.
4. **App shell & profiles** — frameless title bar ✅, sidebar/topbar shell ✅,
   switchable mod profiles ✅, Launch modded / vanilla ✅.
5. **Mods Store** — browse Nexus trending/latest ✅, mod-detail page ✅, CurseForge
   search ✅, source switch ✅, download + install ✅ (Nexus premium direct / free
   via nxm; CurseForge respecting the distribution toggle).
6. **SMAPI bootstrap** — downloads the official SMAPI installer from GitHub and
   runs it non-interactively (`--install --game-path`), with a folder-open
   fallback; "Install SMAPI" button appears when SMAPI is missing. ✅
7. **Web companion + first-party hosting** — Nuxt portal, creator accounts,
   uploads, moderation. Only mods the uploader authored.

## Licensing notes

- **SMAPI** is GNU LGPL v3 — automated install is permitted (Vortex does it);
  ship from the official source and include the license notice.
- **CurseForge** third-party API requires an API key + ToS acceptance, and each
  author's distribution toggle must be respected.
- **Nexus** free users can only download via `nxm://` links (hence the desktop
  protocol handler); the app must be registered with Nexus for SSO.
- **First-party hosting** means only hosting mods the uploader actually authored,
  with moderation and a DMCA path — not mirroring other sites.
