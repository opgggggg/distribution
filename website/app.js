const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#site-nav");

if (toggle && nav) {
	toggle.addEventListener("click", () => {
		const nextOpen = toggle.getAttribute("aria-expanded") !== "true";
		toggle.setAttribute("aria-expanded", String(nextOpen));
		nav.dataset.open = String(nextOpen);
	});

	nav.addEventListener("click", (event) => {
		if (event.target instanceof HTMLAnchorElement) {
			toggle.setAttribute("aria-expanded", "false");
			nav.dataset.open = "false";
		}
	});
}

for (const year of document.querySelectorAll("[data-current-year]")) {
	year.textContent = String(new Date().getFullYear());
}
