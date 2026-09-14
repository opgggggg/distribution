import { createApp } from "vue";

import App from "./App.vue";
import PrivacyGate from "./PrivacyGate.vue";
import { APP_PROFILE } from "./app-profile.generated";
import { hasPrivacyConsent } from "./privacy-consent";
import "./styles.css";
import "./android/android.css";
import "./android/panels.css";

document.title = APP_PROFILE.name;

function startWorkspace(): void {
	createApp(App).mount("#app");
	window.auroraHarmonyHost?.appReady();
}

// Nothing else may run until the privacy policy is accepted, so the gate owns
// the first mount and hands over once the user agrees.
if (hasPrivacyConsent()) {
	startWorkspace();
} else {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const gate = createApp(PrivacyGate, {
		onAgree: () => {
			gate.unmount();
			host.remove();
			startWorkspace();
		},
	});
	gate.mount(host);
	window.auroraHarmonyHost?.appReady();
}
