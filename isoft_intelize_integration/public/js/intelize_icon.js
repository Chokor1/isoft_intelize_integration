// Intelize navbar shortcut — a red circle with a white italic "i" linking to the
// Intelize Control Panel. Shown only to users with a dashboard role.
(function () {
	"use strict";

	const ALLOWED_ROLES = ["System Manager", "Accounts Manager", "Accounts User"];

	function initIntelizeIcon() {
		if (document.getElementById("intelize-navbar")) return; // don't add twice
		if (typeof frappe === "undefined" || !frappe.user) return;

		const roles = (frappe.user_roles || []);
		if (!roles.some((r) => ALLOWED_ROLES.includes(r))) return; // no access

		// Only render the icon when Intelize Settings is enabled.
		frappe.call({
			method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_settings.intelize_settings.is_enabled",
			callback(r) {
				if (r && r.message) renderIntelizeIcon();
			},
		});
	}

	function renderIntelizeIcon() {
		if (document.getElementById("intelize-navbar")) return; // guard against races

		// NOTE: the inline onclick is required. Frappe's router intercepts <a> clicks
		// on /app/* links; a link with onclick is left alone, so we route ourselves.
		const icon = `
			<li class="nav-item dropdown intelize-nav-item" title="Intelize Control Panel" aria-label="Intelize Control Panel">
				<a href="/app/intelize-dashboard" class="intelize-nav-button" id="intelize-navbar"
					onclick="frappe.set_route('intelize-dashboard'); return false;">
					<span class="intelize-i">i</span>
				</a>
			</li>`;

		const $navbarList = $("header.navbar > .container > .navbar-collapse > ul");
		if ($navbarList.length) {
			$navbarList.prepend(icon);
		}

		if (!document.getElementById("intelize-icon-styles")) {
			$("head").append(`
				<style id="intelize-icon-styles">
					.intelize-nav-item { margin-right: 8px; display: flex; align-items: center; }
					.intelize-nav-button {
						display: flex; align-items: center; justify-content: center;
						width: 40px; height: 40px; border-radius: 50%;
						background: #dc2626; color: #ffffff; text-decoration: none;
						box-shadow: 0 2px 8px rgba(220, 38, 38, 0.45);
						transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
					}
					.intelize-nav-button:hover {
						background: #b91c1c; color: #ffffff; text-decoration: none;
						transform: translateY(-2px) scale(1.05);
						box-shadow: 0 4px 16px rgba(220, 38, 38, 0.55);
					}
					.intelize-nav-button:active { transform: translateY(0) scale(0.98); }
					.intelize-i {
						font-family: Georgia, "Times New Roman", serif;
						font-style: italic; font-weight: 700; font-size: 22px; line-height: 1;
						text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
					}
					@media (max-width: 768px) {
						.intelize-nav-button { width: 36px; height: 36px; }
						.intelize-i { font-size: 20px; }
					}
				</style>`);
		}
	}

	if (typeof frappe !== "undefined" && frappe.user) {
		$(document).ready(initIntelizeIcon);
	} else {
		$(document).on("frappe:ready", initIntelizeIcon);
	}
})();
