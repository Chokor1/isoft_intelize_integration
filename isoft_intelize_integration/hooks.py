from . import __version__ as app_version

app_name = "isoft_intelize_integration"
app_title = "Isoft Intelize Integration"
app_publisher = "Abbass Chokor"
app_description = "Intelize payment gateway integration for ERPNext"
app_icon = "fa fa-italic"
app_color = "#dc2626"
app_email = "abbasschokor225@gmail.com"
app_license = "MIT"

# Includes in <head>
# ------------------
app_include_css = "/assets/isoft_intelize_integration/css/intelize.css"
app_include_js = [
	"/assets/isoft_intelize_integration/js/intelize_reference_modal.js",
	"/assets/isoft_intelize_integration/js/intelize_icon.js",
]

# Scheduled Tasks
# ---------------
# Poll the Intelize API for new payments every 5 minutes (moved from erpnext core).
scheduler_events = {
	"cron": {
		"0/5 * * * *": [
			"isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment.fetch_payment_data",
		]
	}
}

# Client Scripts
# --------------
# Adds a red "Create Intelize Reference" button to Quotation and Sales Invoice,
# shown only when the matching checkbox is enabled in Intelize Settings.
doctype_js = {
	"Quotation": "public/js/quotation.js",
	"Sales Invoice": "public/js/sales_invoice.js",
}

# Dashboard Connections
# ---------------------
# Re-add the "Intelize" connection group to core doctypes without touching their
# JSON. These are merged in frappe/model/meta.py and disappear automatically when
# this app is uninstalled.
override_doctype_dashboards = {
	"Sales Invoice": "isoft_intelize_integration.dashboard_overrides.get_sales_invoice_dashboard_data",
	"Payment Entry": "isoft_intelize_integration.dashboard_overrides.get_payment_entry_dashboard_data",
	"Quotation": "isoft_intelize_integration.dashboard_overrides.get_quotation_dashboard_data",
}
