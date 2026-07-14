frappe.ui.form.on("Sales Invoice", {
	refresh(frm) {
		if (frm.is_new() || frm.doc.docstatus === 2) return;
		frappe.call({
			method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references.can_create_reference",
			args: { source_doctype: "Sales Invoice", source_name: frm.doc.name },
			callback(r) {
				if (r.message && r.message.show) {
					const $btn = frm.add_custom_button(__("Create Intelize Reference"), () => {
						isoft_intelize.open_reference_modal(frm, "sales_invoice");
					});
					$btn.removeClass("btn-default btn-secondary").addClass(
						"btn-danger intelize-red-btn"
					);
				}
			},
		});
	},
});
