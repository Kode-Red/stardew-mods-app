import "./assets/css/main.css";
import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import Dashboard from "./pages/Dashboard.vue";
import ModsLibrary from "./pages/ModsLibrary.vue";
import Downloads from "./pages/Downloads.vue";
import Settings from "./pages/Settings.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "dashboard", component: Dashboard },
    { path: "/mods", name: "mods", component: ModsLibrary },
    { path: "/downloads", name: "downloads", component: Downloads },
    { path: "/settings", name: "settings", component: Settings },
  ],
});

createApp(App).use(router).use(ui).mount("#app");
