// Never retain credentials from legacy GET form submissions in the address bar.
// This runs before loading the admin module and does not read or log their values.
if (location.search || location.hash) {
	history.replaceState(null, "", location.pathname);
}
