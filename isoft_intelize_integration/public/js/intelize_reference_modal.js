frappe.provide("isoft_intelize");

/**
 * Opens the "Create Intelize Reference" modal, pre-filled from the source
 * Quotation / Sales Invoice, and creates (optionally submits) an Intelize Reference.
 */
isoft_intelize.open_reference_modal = function (frm, source_field) {
	const is_quotation = source_field === "quotation";
	const source_label = is_quotation ? __("Quotation") : __("Sales Invoice");
	const amount = frm.doc.rounded_total || frm.doc.grand_total || 0;
	const due_date =
		(is_quotation ? frm.doc.valid_till : frm.doc.due_date) ||
		frappe.datetime.add_days(frappe.datetime.get_today(), 30);

	const d = new frappe.ui.Dialog({
		title: __("Create Intelize Reference"),
		fields: [
			{ fieldtype: "HTML", fieldname: "source_info" },
			{
				fieldtype: "Data",
				fieldname: "reference",
				label: __("Reference"),
				read_only: 1,
				description: __("Auto-generated."),
			},
			{ fieldtype: "Column Break" },
			{
				fieldtype: "Currency",
				fieldname: "amount",
				label: __("Amount"),
				reqd: 1,
				default: amount,
			},
			{ fieldtype: "Section Break" },
			{
				fieldtype: "Date",
				fieldname: "due_date",
				label: __("Payment Due Date"),
				reqd: 1,
				default: due_date,
			},
		],
		primary_action_label: __("Create & Register"),
		primary_action(values) {
			create(values, 1);
		},
		secondary_action_label: __("Save as Draft"),
		secondary_action() {
			create(d.get_values(), 0);
		},
	});

	d.fields_dict.source_info.$wrapper.html(`
		<div class="intelize-modal-source">
			${__("Creating reference for")}
			<b>${source_label}</b>:
			<b>${frappe.utils.escape_html(frm.doc.name)}</b>
		</div>
	`);

	function create(values, do_submit) {
		if (!values) return; // mandatory validation failed (amount / due date)
		frappe.call({
			method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references.create_reference_from_source",
			args: {
				source_doctype: frm.doctype,
				source_name: frm.doc.name,
				reference: d.get_value("reference"),
				amount: values.amount,
				due_date: values.due_date,
				submit: do_submit ? 1 : 0,
			},
			freeze: true,
			freeze_message: do_submit
				? __("Registering reference with Intelize...")
				: __("Saving draft..."),
			callback(r) {
				if (r.message) {
					d.hide();
					frappe.show_alert({
						message: __("Intelize Reference {0} created", [
							r.message.reference || r.message.name,
						]),
						indicator: "green",
					});
					frappe.set_route("Form", "Intelize References", r.message.name);
				}
			},
		});
	}

	d.show();
	// make the primary button red to match the app theme
	d.get_primary_btn().removeClass("btn-primary").addClass("btn-danger intelize-red-btn");

	// Fill the read-only reference field with the next auto-generated number.
	frappe.call({
		method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references.get_next_reference",
		callback(r) {
			if (r.message) d.set_value("reference", r.message);
		},
	});
};
