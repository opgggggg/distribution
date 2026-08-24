import { createApp } from "vue";

import App from "./App.vue";
import { APP_PROFILE } from "./app-profile.generated";
import "./styles.css";

document.title = APP_PROFILE.name;
createApp(App).mount("#app");
window.auroraHarmonyHost?.appReady();
