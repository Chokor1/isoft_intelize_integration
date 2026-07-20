import requests
import json
from frappe.model.document import Document
import frappe
from frappe import throw
from frappe.utils import (
    flt,
    getdate,
    get_time,
    nowdate,
)
import datetime

class IntelizePayment(Document):
    pass

@frappe.whitelist()
def generate_payment_entry(name):

    doc = frappe.get_doc("Intelize Payment", name)

    settings = frappe.db.get_value("Intelize Settings", {'enabled': 1}, 
                                   ["mode_of_payment", "payment_entry_naming_series", "default_owner", "currency"], 
                                   as_dict=1)
    if not settings:
        frappe.throw(_("Intelize Settings not found or not enabled"))

    sales_invoice = frappe.db.get_value("Sales Invoice", doc.get('sales_invoice'), 
                                        ["customer", "company", "debit_to"], 
                                        as_dict=1)
    if not sales_invoice:
        frappe.throw(_("Sales Invoice not found"))

    customer = frappe.db.get_value("Customer", sales_invoice.get("customer"), 
                                   ["customer_name", "customer_primary_contact"], 
                                   as_dict=1)
    if not customer:
        frappe.throw(_("Customer not found"))

    mode_of_payment = frappe.db.get_value("Mode of Payment", settings.get("mode_of_payment"), ["type"], as_dict=1)
    if not mode_of_payment:
        frappe.throw(_("Mode of Payment not found"))

    mode_of_payment_account = frappe.db.get_value("Mode of Payment Account", {"parent": settings.get("mode_of_payment")}, 
                                                  ["default_account"], as_dict=1)
    if not mode_of_payment_account:
        frappe.throw(_("Mode of Payment Account not found"))

    party_account = frappe.db.get_value("Account", sales_invoice.get("debit_to"), 
                                        ["account_type", "account_currency"], 
                                        as_dict=1)
    if not party_account:
        frappe.throw(_("Party Account not found"))

    payment_account = frappe.db.get_value("Account", mode_of_payment_account.get("default_account"), 
                                          ["account_type", "account_currency"], 
                                          as_dict=1)
    if not payment_account:
        frappe.throw(_("Payment Account not found"))

    payment_entry = frappe.get_doc({
        "doctype": "Payment Entry",
        "payment_type": "Receive",  
        "naming_series": settings.get("payment_entry_naming_series"),
        "company": sales_invoice.get("company"),
        "posting_date": nowdate(),
        "mode_of_payment": settings.get("mode_of_payment"),
        "party_type": "Customer",
        "party": sales_invoice.get("customer"),
        "party_name": customer.get("customer_name"),
        "paid_from": sales_invoice.get("debit_to"),  
        "paid_to": mode_of_payment_account.get("default_account"),
        "paid_amount": flt(doc.get("paid_amount")),
        "received_amount": flt(doc.get("paid_amount")),
        "reference_no": doc.get("reference_number"),
        "reference_date": doc.get("date"),
        "remarks": f"Payment received against {doc.get('sales_invoice')}",
        "references": [{
            "reference_doctype": "Sales Invoice",
            "reference_name": doc.get("sales_invoice"),
            "total_amount": flt(doc.get("paid_amount")),
            "allocated_amount": flt(doc.get("paid_amount"))
        }]
    })

    payment_entry.insert(ignore_permissions=True)
    payment_entry.submit()
    frappe.db.set_value("Intelize Payment", doc.get('name'), "payment_entry", payment_entry.get('name'))

    frappe.db.commit()

    return payment_entry
    

@frappe.whitelist()
def fetch_payment_data():
    current_date = nowdate()

    last_payment_date = frappe.db.get_value("Intelize Payment", {}, "MAX(date)")

    if last_payment_date:
        start_date = last_payment_date
    else:
        current_year = datetime.datetime.now().year
        start_date = f"{current_year}-01-01"

    end_date = current_date

    settings = frappe.db.get_value("Intelize Settings", {'enabled': 1}, ["base_url", "api_token"], as_dict=1)
    
    if not settings:
        frappe.log_error("Intelize Settings not found or not enabled.", "Fetch Payment Data")
        return  

    base_url = settings.get("base_url")    
    token_api = settings.get("api_token")   
    api_url = f"{base_url}/v1/auth/pagamentos/dia-inicio/{start_date}/dia-final/{end_date}"   
    headers = {
        'Authorization': f'Bearer {token_api}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.get(api_url, headers=headers)
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            if "mensagem" in data and data["mensagem"]:
                for payment in data["mensagem"]:
                    if not frappe.db.exists("Intelize Payment", {"id": payment["id_pagamento"]}):
                        create_intelize_payment(payment)
        else:
            create_fetch_intelize_payment_error_log(f"Failed to fetch payment data. API responded with: {response.text}")

    except requests.exceptions.RequestException as e:
        create_fetch_intelize_payment_error_log(f"An error occurred while fetching payment data: {str(e)}")



def create_intelize_payment(payment_data):

    settings = frappe.db.get_value("Intelize Settings", {'enabled': 1}, ["auto_generate_payment_entry"], as_dict=1)
    
    if not settings:
        create_intelize_reference_log(payment_data['referencia_do_servico'], "Intelize Settings are not properly configured or not enabled.", "Failed")
        return
    
    auto_generate_payment_entry = settings.get("auto_generate_payment_entry", False)

    try:
        intelize_reference = frappe.db.get_value("Intelize References", 
                                                 {"reference": payment_data['referencia_do_servico']}, 
                                                 ["name"], 
                                                 as_dict=1)
        
        if not intelize_reference:
            create_intelize_reference_log(payment_data['referencia_do_servico'], "Intelize Reference not found.", "Failed")
            return
        
        doc = frappe.get_doc({
            "doctype": "Intelize Payment",
            "id": payment_data["id_pagamento"],
            "reference_number": payment_data['referencia_do_servico'],
            "date": getdate(payment_data["data_movimento"]),
            "time": get_time(payment_data["hora_do_movimento"]) if payment_data.get("hora_do_movimento") else None,
            "paid_amount": flt(payment_data["montante_da_operacao"]),
            "payment_entry": None, 
            "intelize_references": intelize_reference.get("name"),
            "sales_invoice": None
        })

        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        # close the reference once the payments cover its full amount
        from isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references import (
            update_completion_status,
        )

        update_completion_status(intelize_reference.get("name"))
        frappe.db.commit()

        create_intelize_reference_log(intelize_reference.get("name"),
                                      f"Intelize Payment with id_pagamento {payment_data['id_pagamento']} created successfully.", 
                                      "Success")

    except Exception as e:
        frappe.throw(f"An error occurred while creating the payment entry: {str(e)}")


def create_intelize_reference_log(intelize_reference, message, status):
    try:
        log_doc = frappe.get_doc({
            "doctype": "Intelize Reference Log",
            "intelize_reference": intelize_reference,
            "message": message,
            "status": status
        })
        
        log_doc.insert(ignore_permissions=True)
        
        frappe.db.commit()       
        
    except Exception as e:
        pass
        
def create_fetch_intelize_payment_error_log(error):
    try:
        log_doc = frappe.get_doc({
            "doctype": "Fetch Intelize Payments Error Log",
            "error": error,
        })
        
        log_doc.insert(ignore_permissions=True)
        
        frappe.db.commit()       
        
    except Exception as e:
        pass