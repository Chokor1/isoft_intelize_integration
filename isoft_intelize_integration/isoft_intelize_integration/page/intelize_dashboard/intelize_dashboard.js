frappe.pages["intelize-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Intelize Dashboard"),
		single_column: true,
	});

	const dashboard = new IntelizeDashboard(page);
	wrapper.intelize_dashboard = dashboard;
};

frappe.pages["intelize-dashboard"].on_page_show = function (wrapper) {
	if (wrapper.intelize_dashboard) {
		wrapper.intelize_dashboard.refresh();
	}
};

class IntelizeDashboard {
	constructor(page) {
		this.page = page;
		this.method_base =
			"isoft_intelize_integration.isoft_intelize_integration.page.intelize_dashboard.intelize_dashboard";
		this.payment_method_base =
			"isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment";
		this.make();
		this.refresh();
	}

	make() {
		// Filters
		this.from_date = this.page.add_field({
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
		});
		this.to_date = this.page.add_field({
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
		});

		this.from_date.$input.on("change", () => this.refresh());
		this.to_date.$input.on("change", () => this.refresh());

		this.page.set_primary_action(__("Refresh"), () => this.refresh(), "refresh");
		this.page.add_button(__("Fetch Now"), () => this.fetch_now(), { icon: "download" });
		this.page.add_menu_item(__("Open Intelize Settings"), () => {
			frappe.set_route("Form", "Intelize Settings", "Intelize Settings");
		});

		// Layout
		this.body = $(`
			<div class="intelize-dashboard">
				<div class="intelize-cards row"></div>
				<div class="intelize-section">
					<div class="intelize-section-title">${__("Payments")}</div>
					<div class="intelize-payments"></div>
				</div>
				<div class="intelize-section">
					<div class="intelize-section-title">${__("Monitoring")}</div>
					<div class="row">
						<div class="col-md-6 intelize-reference-logs"></div>
						<div class="col-md-6 intelize-error-logs"></div>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	get_filters() {
		return {
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
		};
	}

	refresh() {
		frappe.call({
			method: `${this.method_base}.get_dashboard_data`,
			args: this.get_filters(),
			callback: (r) => {
				if (r.message) {
					this.render_cards(r.message.cards);
					this.render_payments(r.message.payments);
				}
			},
		});
		frappe.call({
			method: `${this.method_base}.get_logs`,
			args: { limit: 20 },
			callback: (r) => {
				if (r.message) {
					this.render_reference_logs(r.message.reference_logs);
					this.render_error_logs(r.message.error_logs);
				}
			},
		});
	}

	render_cards(cards) {
		const currency = frappe.defaults.get_default("currency") || "";
		const defs = [
			{ key: "total", label: __("Total Payments"), color: "blue", value: cards.total },
			{ key: "processed", label: __("Processed"), color: "green", value: cards.processed },
			{ key: "ready", label: __("Ready (no PE)"), color: "orange", value: cards.ready },
			{ key: "pending", label: __("Unlinked"), color: "red", value: cards.pending },
			{
				key: "amount",
				label: __("Total Amount"),
				color: "purple",
				value: format_currency(cards.total_amount, currency),
			},
		];
		const html = defs
			.map(
				(d) => `
				<div class="col-sm">
					<div class="intelize-card intelize-card-${d.color}">
						<div class="intelize-card-value">${d.value}</div>
						<div class="intelize-card-label">${d.label}</div>
					</div>
				</div>`
			)
			.join("");
		this.body.find(".intelize-cards").html(html);
	}

	render_payments(payments) {
		const $c = this.body.find(".intelize-payments");
		if (!payments || !payments.length) {
			$c.html(`<div class="text-muted">${__("No payments found for this period.")}</div>`);
			return;
		}
		const badge = {
			Processed: "green",
			Ready: "orange",
			Pending: "red",
		};
		const rows = payments
			.map((p) => {
				const action =
					p.status === "Ready"
						? `<button class="btn btn-xs btn-primary intelize-gen-pe" data-name="${frappe.utils.escape_html(
								p.name
						  )}">${__("Generate PE")}</button>`
						: p.payment_entry
						? `<a href="/app/payment-entry/${encodeURIComponent(
								p.payment_entry
						  )}">${frappe.utils.escape_html(p.payment_entry)}</a>`
						: `<span class="text-muted">&mdash;</span>`;
				return `
				<tr>
					<td><a href="/app/intelize-payment/${encodeURIComponent(
						p.name
					)}">${frappe.utils.escape_html(p.name)}</a></td>
					<td>${frappe.datetime.str_to_user(p.date) || ""}</td>
					<td>${frappe.utils.escape_html(p.reference_number || "")}</td>
					<td class="text-right">${format_currency(p.paid_amount)}</td>
					<td>${
						p.sales_invoice
							? `<a href="/app/sales-invoice/${encodeURIComponent(
									p.sales_invoice
							  )}">${frappe.utils.escape_html(p.sales_invoice)}</a>`
							: '<span class="text-muted">&mdash;</span>'
					}</td>
					<td><span class="indicator-pill ${badge[p.status] || "gray"}">${__(
					p.status
				)}</span></td>
					<td class="text-right">${action}</td>
				</tr>`;
			})
			.join("");
		$c.html(`
			<div class="table-responsive">
				<table class="table table-bordered intelize-table">
					<thead><tr>
						<th>${__("Payment")}</th>
						<th>${__("Date")}</th>
						<th>${__("Reference")}</th>
						<th class="text-right">${__("Amount")}</th>
						<th>${__("Sales Invoice")}</th>
						<th>${__("Status")}</th>
						<th class="text-right">${__("Action")}</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>`);

		$c.find(".intelize-gen-pe").on("click", (e) => {
			const name = $(e.currentTarget).attr("data-name");
			this.generate_payment_entry(name);
		});
	}

	render_reference_logs(logs) {
		const $c = this.body.find(".intelize-reference-logs");
		let inner = `<div class="intelize-subtitle">${__("Reference Logs")}</div>`;
		if (!logs || !logs.length) {
			inner += `<div class="text-muted">${__("No logs.")}</div>`;
		} else {
			inner += logs
				.map((l) => {
					const color = l.status === "Success" ? "green" : "red";
					return `<div class="intelize-log">
						<span class="indicator-pill ${color}">${frappe.utils.escape_html(l.status || "")}</span>
						<span class="intelize-log-msg">${frappe.utils.escape_html(l.message || "")}</span>
						<span class="intelize-log-time text-muted">${frappe.datetime.comment_when(l.creation)}</span>
					</div>`;
				})
				.join("");
		}
		$c.html(inner);
	}

	render_error_logs(logs) {
		const $c = this.body.find(".intelize-error-logs");
		let inner = `<div class="intelize-subtitle">${__("Fetch Error Logs")}</div>`;
		if (!logs || !logs.length) {
			inner += `<div class="text-muted">${__("No errors.")}</div>`;
		} else {
			inner += logs
				.map(
					(l) => `<div class="intelize-log">
						<span class="indicator-pill red">${__("Error")}</span>
						<span class="intelize-log-msg">${frappe.utils.escape_html(l.error || "")}</span>
						<span class="intelize-log-time text-muted">${frappe.datetime.comment_when(l.creation)}</span>
					</div>`
				)
				.join("");
		}
		$c.html(inner);
	}

	fetch_now() {
		frappe.dom.freeze(__("Fetching payments from Intelize..."));
		frappe.call({
			method: `${this.method_base}.trigger_fetch`,
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
				method: `${this.payment_method_base}.generate_payment_entry`,
				args: { name },
				callback: (r) => {
					frappe.dom.unfreeze();
					if (r.message && r.message.name) {
						frappe.show_alert({
							message: __("Payment Entry {0} created", [r.message.name]),
							indicator: "green",
						});
					}
					this.refresh();
				},
				error: () => frappe.dom.unfreeze(),
			});
		});
	}
}
