import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

// electron-vite conventions: renderer root is src/renderer, output is out/renderer.
// @sdm/core is ESM-only (no CJS `require` export), so it must be bundled into
// the CJS main/preload output rather than externalized and require()'d at runtime.
const externalize = externalizeDepsPlugin({ exclude: ["@sdm/core"] });

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
