import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

// electron-vite conventions: renderer root is src/renderer, output is out/renderer.
// Bundle our workspace pkg (ESM-only) and fflate into the CJS main/preload output
// so the packaged app has zero runtime node_modules dependencies (only Electron +
// Node built-ins, both provided at runtime). This keeps electron-builder simple.
const externalize = externalizeDepsPlugin({ exclude: ["@sdm/core", "fflate"] });

export default defineConfig({
  main: {
    plugins: [externalize],
  },
  preload: {
    plugins: [externalize],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    // @sdm/core is ESM + only depends on zod; let Vite bundle it for the renderer.
    plugins: [vue(), ui()],
  },
});
