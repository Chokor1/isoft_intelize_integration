from . import __version__ as app_version

app_name = "isoft_intelize_integration"
app_title = "Isoft Intelize Integration"
app_publisher = "Abbass Chokor"
app_description = "Intelize payment gateway integration for ERPNext"
app_icon = "octicon octicon-credit-card"
app_color = "blue"
app_email = "abbasschokor225@gmail.com"
app_license = "MIT"

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
