"""Dashboard (Connections) overrides that re-add the Intelize group to core doctypes.

Each function receives the dashboard `data` dict already assembled by Frappe for the
target doctype and returns it with an extra "Intelize" transaction group appended.
Because this is wired through the ``override_doctype_dashboards`` hook, the group is
present only while this app is installed and vanishes on uninstall — the core
Sales Invoice / Payment Entry / Quotation JSON stays untouched.
"""

from frappe import _


def _add_group(data, label, items, non_standard_fieldnames=None):
	data = dict(data or {})
	data.setdefault("transactions", [])
	data.setdefault("non_standard_fieldnames", {})
	data.setdefault("internal_links", {})

	# Avoid duplicating the group if it is somehow already present.
	if not any(_(g.get("label")) == _(label) for g in data["transactions"]):
		data["transactions"].append({"label": _(label), "items": items})

	if non_standard_fieldnames:
		data["non_standard_fieldnames"].update(non_standard_fieldnames)

	return data


def get_sales_invoice_dashboard_data(data=None):
	# Intelize Payment links back via its `sales_invoice` field.
	return _add_group(
		data,
		"Intelize",
		["Intelize Payment"],
		{"Intelize Payment": "sales_invoice"},
	)


def get_payment_entry_dashboard_data(data=None):
	# Intelize Payment links back via its `payment_entry` field.
	return _add_group(
		data,
		"Intelize",
		["Intelize Payment"],
		{"Intelize Payment": "payment_entry"},
	)


def get_quotation_dashboard_data(data=None):
	# Intelize References links back via its `quotation` field.
	return _add_group(
		data,
		"Intelize",
		["Intelize References"],
		{"Intelize References": "quotation"},
	)
