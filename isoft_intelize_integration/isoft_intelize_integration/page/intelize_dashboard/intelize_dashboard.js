frappe.pages["intelize-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Intelize Control Panel"),
		single_column: true,
	});
	wrapper.intelize_cp = new IntelizeControlPanel(page);
};

frappe.pages["intelize-dashboard"].on_page_show = function (wrapper) {
	if (wrapper.intelize_cp) wrapper.intelize_cp.refresh();
};

const IP_METHOD = "isoft_intelize_integration.isoft_intelize_integration.page.intelize_dashboard.intelize_dashboard";
const IP_PAYMENT = "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment";
const IP_REFERENCE = "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references";

class IntelizeControlPanel {
	constructor(page) {
		this.page = page;
		this.active_tab = "overview";
		this.make();
		this.refresh();
	}

	make() {
		this.body = $(`
			<div class="intelize-cp intelize-dashboard">
				<div class="intelize-header">
					<div class="intelize-header-main">
						<div class="intelize-brand"><i class="fa fa-bolt"></i></div>
						<div class="intelize-header-text">
							<div class="intelize-header-title">${__("Intelize Control Panel")}</div>
							<div class="intelize-header-sub"></div>
						</div>
					</div>
					<div class="intelize-header-right">
						<div class="intelize-settings-strip"></div>
						<div class="intelize-header-actions">
							<button class="intelize-btn intelize-btn-primary" data-action="fetch">
								<i class="fa fa-cloud-download"></i> ${__("Fetch Now")}
							</button>
							<button class="intelize-btn" data-action="new-reference">
								<i class="fa fa-plus"></i> ${__("New Reference")}
							</button>
							<button class="intelize-btn intelize-btn-square" data-action="settings" title="${__("Intelize Settings")}" aria-label="${__("Intelize Settings")}">
								<i class="fa fa-cog"></i>
							</button>
						</div>
					</div>
				</div>
				<div class="intelize-toolbar">
					<div class="intelize-tabs">
						<button class="intelize-tab active" data-tab="overview">${__("Overview")}</button>
						<button class="intelize-tab" data-tab="references">${__("References")} <span class="intelize-count" data-count="references"></span></button>
						<button class="intelize-tab" data-tab="payments">${__("Payments")} <span class="intelize-count" data-count="payments"></span></button>
						<button class="intelize-tab" data-tab="logs">${__("Logs")}</button>
					</div>
					<div class="intelize-daterange">
						<i class="fa fa-calendar intelize-daterange-icon"></i>
						<div class="intelize-date" data-date="from"></div>
						<span class="intelize-daterange-sep">&rarr;</span>
						<div class="intelize-date" data-date="to"></div>
						<button class="intelize-icon-btn" data-action="refresh" title="${__("Refresh")}" aria-label="${__("Refresh")}">
							<i class="fa fa-refresh"></i>
						</button>
					</div>
				</div>
				<div class="intelize-panel" data-panel="overview"></div>
				<div class="intelize-panel hidden" data-panel="references"></div>
				<div class="intelize-panel hidden" data-panel="payments"></div>
				<div class="intelize-panel hidden" data-panel="logs"></div>
			</div>
		`).appendTo(this.page.main);

		// the header card carries the title and every action, so the page head is dead weight
		this.page.wrapper.find(".page-head").addClass("hidden");

		this.make_date_controls();

		this.body.find('[data-action="fetch"]').on("click", () => this.fetch_now());
		this.body.find('[data-action="new-reference"]').on("click", () =>
			frappe.new_doc("Intelize References")
		);
		this.body.find('[data-action="settings"]').on("click", () =>
			frappe.set_route("List", "Intelize Settings")
		);

		this.body.find(".intelize-tab").on("click", (e) => {
			this.switch_tab($(e.currentTarget).attr("data-tab"));
		});

		this.body.find('.intelize-icon-btn[data-action="refresh"]').on("click", (e) => {
			const $btn = $(e.currentTarget);
			$btn.addClass("spinning");
			setTimeout(() => $btn.removeClass("spinning"), 700);
			this.refresh();
		});
	}

	make_date_controls() {
		const make = (selector, value) => {
			const control = frappe.ui.form.make_control({
				parent: this.body.find(selector),
				df: { fieldtype: "Date", fieldname: "date", placeholder: __("Date") },
				render_input: true,
			});
			control.set_value(value);
			control.$input.on("change", () => this.refresh());
			return control;
		};
		this.from_date = make(
			'.intelize-date[data-date="from"]',
			frappe.datetime.add_months(frappe.datetime.get_today(), -1)
		);
		this.to_date = make('.intelize-date[data-date="to"]', frappe.datetime.get_today());
	}

	get_filters() {
		return { from_date: this.from_date.get_value(), to_date: this.to_date.get_value() };
	}

	switch_tab(tab) {
		this.active_tab = tab;
		this.body.find(".intelize-tab").removeClass("active");
		this.body.find(`.intelize-tab[data-tab="${tab}"]`).addClass("active");
		this.body.find(".intelize-panel").addClass("hidden");
		this.body.find(`.intelize-panel[data-panel="${tab}"]`).removeClass("hidden");
		this.load_tab(tab);
	}

	refresh() {
		this.load_overview(); // always refresh counts/strip
		this.load_tab(this.active_tab);
	}

	load_tab(tab) {
		if (tab === "overview") return this.load_overview();
		if (tab === "payments") return this.load_payments();
		if (tab === "references") return this.load_references();
		if (tab === "logs") return this.load_logs();
	}

	// ---------- Overview ----------
	load_overview() {
		frappe.call({
			method: `${IP_METHOD}.get_overview`,
			args: this.get_filters(),
			callback: (r) => r.message && this.render_overview(r.message),
		});
	}

	render_overview(d) {
		this.body.find('.intelize-count[data-count="payments"]').text(d.payments.total || "");
		this.body.find('.intelize-count[data-count="references"]').text(d.references.total || "");
		this.render_settings_strip(d.settings);

		const cur = frappe.defaults.get_default("currency") || "";
		const card = (val, label, color) => `
			<div class="intelize-card intelize-card-${color}">
				<div class="intelize-card-value">${val}</div>
				<div class="intelize-card-label">${label}</div>
			</div>`;

		const p = d.payments;
		const r = d.references;
		const hero = (val, label, sub, color, icon) => `
			<div class="intelize-hero-card intelize-hero-${color}">
				<div class="intelize-hero-icon"><i class="fa ${icon}"></i></div>
				<div class="intelize-hero-body">
					<div class="intelize-hero-value">${val}</div>
					<div class="intelize-hero-label">${label}</div>
					${sub ? `<div class="intelize-hero-sub">${sub}</div>` : ""}
				</div>
			</div>`;
		const html = `
			<div class="intelize-hero">
				${hero(
					r.total,
					__("References"),
					`${r.active} ${__("active")} &middot; ${r.draft} ${__("draft")}`,
					"red",
					"fa-hashtag"
				)}
				${hero(
					p.total,
					__("Payments"),
					`${p.processed} ${__("processed")} &middot; ${p.pending} ${__("unlinked")}`,
					"blue",
					"fa-exchange"
				)}
				${hero(
					format_currency(p.amount, cur),
					__("Payments Amount"),
					__("in selected period"),
					"green",
					"fa-money"
				)}
			</div>
			<div class="intelize-group-title">${__("References")}</div>
			<div class="intelize-cards">
				${card(r.total, __("Total"), "blue")}
				${card(r.draft, __("Draft"), "orange")}
				${card(r.active, __("Active"), "green")}
				${card(r.disabled, __("Disabled"), "red")}
				${card(r.completed, __("Completed"), "purple")}
			</div>
			<div class="intelize-group-title">${__("Payments")}</div>
			<div class="intelize-cards">
				${card(p.total, __("Total"), "blue")}
				${card(p.processed, __("Processed"), "green")}
				${card(p.ready, __("Ready (no PE)"), "orange")}
				${card(p.pending, __("Unlinked"), "red")}
				${card(format_currency(p.amount, cur), __("Total Amount"), "purple")}
			</div>`;
		this.body.find('.intelize-panel[data-panel="overview"]').html(html);
	}

	render_settings_strip(s) {
		const $strip = this.body.find(".intelize-settings-strip");
		const $sub = this.body.find(".intelize-header-sub");

		if (!s || !s.configured) {
			$sub.text(__("Not connected"));
			this.body.find(".intelize-brand").addClass("intelize-brand-off");
			$strip.html(
				`<span class="intelize-pill intelize-pill-red"><span class="intelize-dot"></span>${__(
					"Settings not configured / not enabled"
				)}</span>`
			);
			return;
		}

		this.body.find(".intelize-brand").removeClass("intelize-brand-off");
		$sub.html(
			[
				s.base_url
					? `<span class="intelize-host">${frappe.utils.escape_html(s.base_url)}</span>`
					: "",
				s.entity_number
					? `<span class="intelize-sub-sep">&middot;</span>${__("Entity")} <b>${frappe.utils.escape_html(
							s.entity_number
					  )}</b>`
					: "",
			].join("")
		);

		const parts = [
			`<span class="intelize-pill intelize-pill-green"><span class="intelize-dot"></span>${__("Enabled")}</span>`,
			`<span class="intelize-pill">${__("Auto PE")}: <b>${
				s.auto_generate_payment_entry ? __("On") : __("Off")
			}</b></span>`,
			s.errors_24h
				? `<span class="intelize-pill intelize-pill-red"><span class="intelize-dot"></span>${s.errors_24h} ${__(
						"errors (24h)"
				  )}</span>`
				: `<span class="intelize-pill intelize-pill-green"><span class="intelize-dot"></span>${__(
						"No errors (24h)"
				  )}</span>`,
		];
		$strip.html(parts.join(""));
	}

	// ---------- Payments ----------
	load_payments() {
		const $p = this.body.find('.intelize-panel[data-panel="payments"]');
		$p.html(`<div class="text-muted">${__("Loading...")}</div>`);
		frappe.call({
			method: `${IP_METHOD}.get_payments`,
			args: this.get_filters(),
			callback: (r) => this.render_payments(r.message || []),
		});
	}

	render_payments(rows) {
		const $p = this.body.find('.intelize-panel[data-panel="payments"]');
		if (!rows.length) {
			$p.html(`<div class="intelize-empty">${__("No payments for this period.")}</div>`);
			return;
		}
		const badge = { Processed: "green", Ready: "orange", Pending: "red" };
		const body = rows
			.map((p) => {
				const action =
					p.status === "Ready"
						? `<button class="btn btn-xs btn-danger intelize-red-btn intelize-gen-pe" data-name="${frappe.utils.escape_html(p.name)}">${__("Generate PE")}</button>`
						: p.payment_entry
						? `<a href="/app/payment-entry/${encodeURIComponent(p.payment_entry)}">${frappe.utils.escape_html(p.payment_entry)}</a>`
						: `<span class="text-muted">&mdash;</span>`;
				return `<tr>
					<td><a href="/app/intelize-payment/${encodeURIComponent(p.name)}">${frappe.utils.escape_html(p.name)}</a></td>
					<td>${frappe.utils.escape_html(p.id || "")}</td>
					<td>${frappe.datetime.str_to_user(p.date) || ""} ${p.time ? `<span class="text-muted">${p.time}</span>` : ""}</td>
					<td>${frappe.utils.escape_html(p.reference_number || "")}</td>
					<td class="text-right">${format_currency(p.paid_amount)}</td>
					<td>${p.sales_invoice ? `<a href="/app/sales-invoice/${encodeURIComponent(p.sales_invoice)}">${frappe.utils.escape_html(p.sales_invoice)}</a>` : '<span class="text-muted">&mdash;</span>'}</td>
					<td><span class="indicator-pill ${badge[p.status] || "gray"}">${__(p.status)}</span></td>
					<td class="text-right">${action}</td>
				</tr>`;
			})
			.join("");
		$p.html(this.table(
			[__("Payment"), __("Intelize ID"), __("Date"), __("Reference"), __("Amount"), __("Sales Invoice"), __("Status"), __("Action")],
			body,
			["", "", "", "", "text-right", "", "", "text-right"]
		));
		$p.find(".intelize-gen-pe").on("click", (e) =>
			this.generate_payment_entry($(e.currentTarget).attr("data-name"))
		);
	}

	// ---------- References ----------
	load_references() {
		const $p = this.body.find('.intelize-panel[data-panel="references"]');
		$p.html(`<div class="text-muted">${__("Loading...")}</div>`);
		frappe.call({
			method: `${IP_METHOD}.get_references`,
			args: this.get_filters(),
			callback: (r) => this.render_references(r.message || []),
		});
	}

	render_references(rows) {
		const $p = this.body.find('.intelize-panel[data-panel="references"]');
		if (!rows.length) {
			$p.html(`<div class="intelize-empty">${__("No references for this period.")}</div>`);
			return;
		}
		const badge = { Draft: "orange", Active: "green", Disabled: "red", Completed: "blue", Cancelled: "gray" };
		const body = rows
			.map((r) => {
				const source = r.quotation
					? `<a href="/app/quotation/${encodeURIComponent(r.quotation)}">${frappe.utils.escape_html(r.quotation)}</a>`
					: r.sales_invoice
					? `<a href="/app/sales-invoice/${encodeURIComponent(r.sales_invoice)}">${frappe.utils.escape_html(r.sales_invoice)}</a>`
					: '<span class="text-muted">&mdash;</span>';
				let actions = `<a class="btn btn-xs btn-default" href="/app/intelize-references/${encodeURIComponent(r.name)}">${__("Open")}</a>`;
				if (r.docstatus === 1 && !r.expired) {
					if (r.status !== "Active")
						actions += ` <button class="btn btn-xs btn-default intelize-ref-action" data-name="${frappe.utils.escape_html(r.name)}" data-action="Activate">${__("Activate")}</button>`;
					if (r.status !== "Disabled")
						actions += ` <button class="btn btn-xs btn-default intelize-ref-action" data-name="${frappe.utils.escape_html(r.name)}" data-action="Disable">${__("Disable")}</button>`;
				}
				const due = frappe.datetime.str_to_user(r.due_date) || "";
				return `<tr>
					<td><a href="/app/intelize-references/${encodeURIComponent(r.name)}">${frappe.utils.escape_html(r.reference || r.name)}</a></td>
					<td class="text-right">${format_currency(r.amount)}</td>
					<td>${r.expired ? `<span class="intelize-expired">${due}</span>` : due}</td>
					<td>${source}</td>
					<td><span class="indicator-pill ${badge[r.state] || "gray"}">${__(r.state)}</span></td>
					<td class="text-right intelize-actions">${actions}</td>
				</tr>`;
			})
			.join("");
		$p.html(this.table(
			[__("Reference"), __("Amount"), __("Due Date"), __("Source"), __("State"), __("Actions")],
			body,
			["", "text-right", "", "", "", "text-right"]
		));
		$p.find(".intelize-ref-action").on("click", (e) => {
			const $b = $(e.currentTarget);
			this.change_reference_status($b.attr("data-name"), $b.attr("data-action"));
		});
	}

	// ---------- Logs ----------
	load_logs() {
		const $p = this.body.find('.intelize-panel[data-panel="logs"]');
		$p.html(`<div class="text-muted">${__("Loading...")}</div>`);
		frappe.call({
			method: `${IP_METHOD}.get_logs`,
			args: { limit: 40 },
			callback: (r) => this.render_logs(r.message || { reference_logs: [], error_logs: [] }),
		});
	}

	render_logs(d) {
		const ref = (d.reference_logs || [])
			.map((l) => {
				const color = l.status === "Success" ? "green" : "red";
				return `<div class="intelize-log">
					<span class="indicator-pill ${color}">${frappe.utils.escape_html(l.status || "")}</span>
					<span class="intelize-log-msg">${frappe.utils.escape_html(l.message || "")}</span>
					<span class="intelize-log-time text-muted">${frappe.datetime.comment_when(l.creation)}</span>
				</div>`;
			})
			.join("") || `<div class="text-muted">${__("No logs.")}</div>`;
		const err = (d.error_logs || [])
			.map(
				(l) => `<div class="intelize-log">
					<span class="indicator-pill red">${__("Error")}</span>
					<span class="intelize-log-msg">${frappe.utils.escape_html(l.error || "")}</span>
					<span class="intelize-log-time text-muted">${frappe.datetime.comment_when(l.creation)}</span>
				</div>`
			)
			.join("") || `<div class="text-muted">${__("No errors.")}</div>`;
		this.body.find('.intelize-panel[data-panel="logs"]').html(`
			<div class="row">
				<div class="col-md-6">
					<div class="intelize-subtitle">${__("Reference Logs")}</div>
					<div class="intelize-log-box">${ref}</div>
				</div>
				<div class="col-md-6">
					<div class="intelize-subtitle">${__("Fetch Error Logs")}</div>
					<div class="intelize-log-box">${err}</div>
				</div>
			</div>`);
	}

	// ---------- helpers / actions ----------
	table(headers, body_rows, aligns) {
		const ths = headers
			.map((h, i) => `<th class="${(aligns && aligns[i]) || ""}">${h}</th>`)
			.join("");
		return `<div class="intelize-glass"><div class="table-responsive"><table class="table intelize-table">
			<thead><tr>${ths}</tr></thead><tbody>${body_rows}</tbody></table></div></div>`;
	}

	fetch_now() {
		frappe.dom.freeze(__("Fetching payments from Intelize..."));
		frappe.call({
			method: `${IP_METHOD}.trigger_fetch`,
			callback: () => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: __("Fetch complete"), indicator: "green" });
				this.refresh();
			},
			error: () => frappe.dom.unfreeze(),
		});
	}

	generate_payment_entry(name) {
		frappe.confirm(__("Generate a Payment Entry for {0}?", [name]), () => {
			frappe.dom.freeze(__("Generating Payment Entry..."));
			frappe.call({
				method: `${IP_PAYMENT}.generate_payment_entry`,
				args: { name },
				callback: (r) => {
					frappe.dom.unfreeze();
					if (r.message && r.message.name)
						frappe.show_alert({
							message: __("Payment Entry {0} created", [r.message.name]),
							indicator: "green",
						});
					this.refresh();
				},
				error: () => frappe.dom.unfreeze(),
			});
		});
	}

	change_reference_status(name, action) {
		frappe.confirm(__("{0} reference {1}?", [__(action), name]), () => {
			frappe.dom.freeze(__("Updating status..."));
			frappe.call({
				method: `${IP_REFERENCE}.change_status`,
				args: { name, action },
				callback: () => {
					frappe.dom.unfreeze();
					this.load_references();
					this.load_overview();
				},
				error: () => frappe.dom.unfreeze(),
			});
		});
	}
}
