(function () {
	"use strict";

	const progress = document.querySelector(".privacy-progress");
	const progressValue = document.querySelector(".privacy-progress-value");
	const sections = Array.from(document.querySelectorAll(".privacy-content h2[id]"));
	const sectionLinks = Array.from(document.querySelectorAll(".privacy-index a[href^='#']"));

	if (!progress || !progressValue || sections.length === 0) return;

	let framePending = false;

	function updatePageState() {
		const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
		const percentage = scrollableHeight > 0
			? Math.min(100, Math.max(0, (window.scrollY / scrollableHeight) * 100))
			: 100;

		progress.setAttribute("aria-valuenow", String(Math.round(percentage)));
		progressValue.style.transform = `scaleX(${percentage / 100})`;

		let currentSection = sections[0];
		for (const section of sections) {
			if (section.getBoundingClientRect().top > 140) break;
			currentSection = section;
		}
		if (scrollableHeight > 0 && window.scrollY >= scrollableHeight - 1) {
			currentSection = sections[sections.length - 1];
		}

		for (const link of sectionLinks) {
			if (link.hash === `#${currentSection.id}`) {
				link.setAttribute("aria-current", "location");
			} else {
				link.removeAttribute("aria-current");
			}
		}

		framePending = false;
	}

	function scheduleUpdate() {
		if (framePending) return;
		framePending = true;
		window.requestAnimationFrame(updatePageState);
	}

	window.addEventListener("scroll", scheduleUpdate, { passive: true });
	window.addEventListener("resize", scheduleUpdate);
	window.addEventListener("hashchange", scheduleUpdate);
	updatePageState();
})();
