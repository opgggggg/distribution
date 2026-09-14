// The store review guidelines require an explicit privacy notice before the
// app does anything else. Bumping the version re-prompts every install once the
// policy changes materially.
const CONSENT_KEY = "cubeoffice.privacy.consent";
const CONSENT_VERSION = "2026-09-07";

export function hasPrivacyConsent(): boolean {
	try {
		return localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION;
	} catch {
		// Private modes and hosts with storage disabled cannot remember the
		// answer. Asking again on every launch is the compliant fallback.
		return false;
	}
}

export function acceptPrivacyPolicy(): void {
	try {
		localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
	} catch {
		// Consent still applies to this session even when it cannot be stored.
	}
}
