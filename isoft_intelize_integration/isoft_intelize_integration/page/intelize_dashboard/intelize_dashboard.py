import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

ROLES = {"System Manager", "Accounts Manager", "Accounts User"}


def _require_role():
	if not (ROLES & set(frappe.get_roles())):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _date_filter(from_date=None, to_date=None, field="date"):
	f = {}
	if from_date and to_date:
		f[field] = ["between", [getdate(from_date), getdate(to_date)]]
	elif from_date:
		f[field] = [">=", getdate(from_date)]
	elif to_date:
		f[field] = ["<=", getdate(to_date)]
	return f


@frappe.whitelist()
def get_overview(from_date=None, to_date=None):
	"""Summary counts for payments, references and settings health."""
	_require_role()

	payments = frappe.get_all(
		"Intelize Payment",
		filters=_date_filter(from_date, to_date, "date"),
		fields=["paid_amount", "sales_invoice", "payment_entry"],
		limit_page_length=0,
	)
	p_total = len(payments)
	p_processed = sum(1 for p in payments if p.get("payment_entry"))
	p_ready = sum(1 for p in payments if p.get("sales_invoice") and not p.get("payment_entry"))
	p_pending = sum(1 for p in payments if not p.get("sales_invoice"))
	p_amount = sum(flt(p.get("paid_amount")) for p in payments)

	refs = frappe.get_all(
		"Intelize References",
		filters=_date_filter(from_date, to_date, "due_date"),
		fields=["status", "docstatus", "amount"],
		limit_page_length=0,
	)
	r_total = len(refs)
	r_draft = sum(1 for r in refs if r.get("docstatus") == 0)
	r_active = sum(1 for r in refs if r.get("docstatus") == 1 and r.get("status") == "Active")
	r_disabled = sum(1 for r in refs if r.get("status") == "Disabled")
	r_completed = sum(1 for r in refs if r.get("status") == "Completed")
	r_amount = sum(flt(r.get("amount")) for r in refs)

	s = frappe.db.get_value(
		"Intelize Settings",
		{"enabled": 1},
		["name", "base_url", "entity_number", "auto_generate_payment_entry"],
		as_dict=1,
	)
	errors_24h = frappe.db.count(
		"Fetch Intelize Payments Error Log",
		{"creation": [">=", frappe.utils.add_to_date(nowdate(), days=-1)]},
	)

	return {
		"payments": {
			"total": p_total,
			"processed": p_processed,
			"ready": p_ready,
			"pending": p_pending,
			"amount": p_amount,
		},
		"references": {
			"total": r_total,
			"draft": r_draft,
			"active": r_active,
			"disabled": r_disabled,
			"completed": r_completed,
			"amount": r_amount,
		},
		"settings": {
			"configured": bool(s),
			"entity_number": s.get("entity_number") if s else None,
			"base_url": s.get("base_url") if s else None,
			"auto_generate_payment_entry": bool(s.get("auto_generate_payment_entry")) if s else False,
			"errors_24h": errors_24h,
		},
	}


@frappe.whitelist()
def get_payments(from_date=None, to_date=None):
	_require_role()
	payments = frappe.get_all(
		"Intelize Payment",
		filters=_date_filter(from_date, to_date, "date"),
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
		limit_page_length=1000,
	)
	for p in payments:
		if p.get("payment_entry"):
			p["status"] = "Processed"
		elif p.get("sales_invoice"):
			p["status"] = "Ready"
		else:
			p["status"] = "Pending"
	return payments


@frappe.whitelist()
def get_references(from_date=None, to_date=None):
	_require_role()
	refs = frappe.get_all(
		"Intelize References",
		filters=_date_filter(from_date, to_date, "due_date"),
		fields=[
			"name",
			"reference",
			"status",
			"docstatus",
			"amount",
			"due_date",
			"quotation",
			"sales_invoice",
		],
		order_by="due_date desc, modified desc",
		limit_page_length=1000,
	)
	today = getdate(nowdate())
	for r in refs:
		if r.get("docstatus") == 0:
			r["state"] = "Draft"
		elif r.get("docstatus") == 2:
			r["state"] = "Cancelled"
		else:
			r["state"] = r.get("status") or "Submitted"
		r["expired"] = bool(r.get("due_date") and getdate(r.get("due_date")) < today)
	return refs


@frappe.whitelist()
def get_logs(limit=30):
	"""Recent reference logs and fetch error logs for the monitoring tab."""
	_require_role()
	limit = min(int(limit or 30), 200)

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
	"""Run the Intelize payment fetch on demand from the control panel button."""
	_require_role()
	from isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment import (
		fetch_payment_data,
	)

	fetch_payment_data()
	return {"ok": True, "ran_at": nowdate()}
