"""Backfill Intelize Reference statuses.

Historically ``status`` defaulted to ``Active`` at creation and was never updated
again, so drafts claimed to be Active, past-due references stayed Active forever,
and ``Completed`` was never written by anything. This realigns existing rows with
the states the app now maintains.
"""

import frappe
from frappe.utils import flt, nowdate


def execute():
	frappe.reload_doc(
		"isoft_intelize_integration", "doctype", "intelize_references", force=True
	)

	# 1. unsubmitted references are not live with Intelize
	drafts = frappe.db.sql(
		"""update `tabIntelize References`
		set status = 'Draft'
		where docstatus = 0 and (status is null or status != 'Draft')"""
	)

	# 2. fully-paid references close, regardless of due date
	completed = 0
	refs = frappe.get_all(
		"Intelize References",
		filters={"docstatus": 1, "status": ["in", ("Active", "Disabled")]},
		fields=["name", "amount"],
		limit_page_length=0,
	)
	for ref in refs:
		amount = flt(ref.amount)
		if amount <= 0:
			continue
		paid = flt(
			frappe.db.get_value(
				"Intelize Payment", {"intelize_references": ref.name}, "sum(paid_amount)"
			)
		)
		if paid + 0.005 >= amount:
			frappe.db.set_value(
				"Intelize References", ref.name, "status", "Completed", update_modified=False
			)
			completed += 1

	# 3. everything still open past its due date is expired
	expired = frappe.db.sql(
		"""update `tabIntelize References`
		set status = 'Expired'
		where docstatus = 1 and status in ('Active', 'Disabled') and due_date < %s""",
		nowdate(),
	)

	frappe.db.commit()
	print(f"Intelize References backfill: {completed} completed, expired/draft rows realigned")
