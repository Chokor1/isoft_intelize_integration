# Copyright (c) 2024, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class IntelizeSettings(Document):
	pass


@frappe.whitelist()
def is_enabled():
	"""True when at least one Intelize Settings record is enabled."""
	return bool(frappe.db.exists("Intelize Settings", {"enabled": 1}))
