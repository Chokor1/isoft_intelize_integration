import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate


def _require_role():
	allowed = {"System Manager", "Accounts Manager", "Accounts User"}
	if not (allowed & set(frappe.get_roles())):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


@frappe.whitelist()
def get_dashboard_data(from_date=None, to_date=None):
	"""Return summary cards + the payments table for the Intelize dashboard."""
	_require_role()

	filters = {}
	if from_date and to_date:
		filters["date"] = ["between", [getdate(from_date), getdate(to_date)]]
	elif from_date:
		filters["date"] = [">=", getdate(from_date)]
	elif to_date:
		filters["date"] = ["<=", getdate(to_date)]

	payments = frappe.get_all(
		"Intelize Payment",
		filters=filters,
		fields=[
			"name",
			"id",
			"date",
			"time",
			"reference_number",
			"paid_amount",
			"intelize_references",
			"sales_invoice",
			"payment_entry",
		],
		order_by="date desc, modified desc",
		limit_page_length=500,
	)

	total = len(payments)
	processed = sum(1 for p in payments if p.get("payment_entry"))
	linked_no_pe = sum(
		1 for p in payments if p.get("sales_invoice") and not p.get("payment_entry")
	)
	unlinked = sum(1 for p in payments if not p.get("sales_invoice"))
	total_amount = sum(flt(p.get("paid_amount")) for p in payments)

	for p in payments:
		if p.get("payment_entry"):
			p["status"] = "Processed"
		elif p.get("sales_invoice"):
			p["status"] = "Ready"
		else:
			p["status"] = "Pending"

	return {
		"cards": {
			"total": total,
			"processed": processed,
			"ready": linked_no_pe,
			"pending": unlinked,
			"total_amount": total_amount,
		},
		"payments": payments,
	}


@frappe.whitelist()
def get_logs(limit=20):
	"""Recent reference logs and fetch error logs for the monitoring panel."""
	_require_role()
	limit = min(int(limit or 20), 100)

	reference_logs = frappe.get_all(
		"Intelize Reference Log",
		fields=["name", "intelize_reference", "status", "message", "creation"],
		order_by="creation desc",
		limit_page_length=limit,
	)
	error_logs = frappe.get_all(
		"Fetch Intelize Payments Error Log",
		fields=["name", "error", "creation"],
		order_by="creation desc",
		limit_page_length=limit,
	)
	return {"reference_logs": reference_logs, "error_logs": error_logs}


@frappe.whitelist()
def trigger_fetch():
	"""Run the Intelize payment fetch on demand from the dashboard button."""
	_require_role()
	from isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment import (
		fetch_payment_data,
	)

	fetch_payment_data()
	return {"ok": True, "ran_at": nowdate()}
