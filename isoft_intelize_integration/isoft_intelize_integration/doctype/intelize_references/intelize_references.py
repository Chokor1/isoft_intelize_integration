import requests
import json
from frappe.model.document import Document
import frappe
from frappe import throw
from frappe.utils import (
	cint,
	cstr,
	flt,
	getdate,
	nowdate,
)

class IntelizeReferences(Document):
    def on_submit(self):
        settings = frappe.db.get_value("Intelize Settings", {'enabled': 1}, 
            ["base_url", "api_token", "max_amount_per_reference"], as_dict=1)
        
        if not settings:
            frappe.throw("Intelize Settings are not properly configured or not enabled.")
        
        base_url = settings.get("base_url")
        token_api = settings.get("api_token")
        max_amount = settings.get("max_amount_per_reference")

        if self.amount < 0:
            frappe.throw("Amount cannot be less or equal to zero!")
        
        if not self.reference.isdigit() or len(self.reference) != 9:
            frappe.throw("Reference number must be exactly 9 digits and contain only numbers 0 to 9!")
                
        data = {
            "tipo_de_registro": 1,
            "num_referencia": self.reference,  
            "indicador_de_produtos": 1,  
            "data_limite_pagamento": self.due_date,  
            "indicador_produto_id": "1"
        }
        
        if self.amount > 0 and self.amount <= max_amount:
            data["montante_fixo"] = self.amount
        else:
            data["montante_limitado_para_pagamento_longo"] = self.amount

        headers = {
            'Authorization': f'Bearer {token_api}',
            'Content-Type': 'application/json'
        }

        try:
            api_url = f"{base_url}/v1/auth/referencias"
            response = requests.post(api_url, headers=headers, data=json.dumps(data))

            if response.status_code == 200 or response.status_code == 201:
                json_response = response.json()
                
                if 'info' in json_response and 'num_referencia' in json_response['info']:
                    num_referencia = json_response['info']['num_referencia']
                    frappe.msgprint(f"Reference created successfully! Reference number: {num_referencia}")
                else:
                    frappe.throw("Failed to create reference!")
            else:
                frappe.throw(f"Failed to create reference. API responded with: {response.text}")

        except requests.exceptions.RequestException as e:
            frappe.throw(f"An error occurred while creating reference: {str(e)}")

@frappe.whitelist()
def get_all_references():
    references = frappe.get_all("Intelize References", fields=["reference"])
    return [ref['reference'] for ref in references]
    
@frappe.whitelist()
def change_status(name, action):
    doc = frappe.get_doc("Intelize References", name)
    
    if doc.docstatus != 1:
        throw("You can only change the status of submitted documents.")
    
    current_date = frappe.utils.nowdate()
    
    if getdate(current_date) > getdate(doc.due_date):
        throw("Cannot change the status as the due date has already passed.")
    
    if action == "Activate":
        doc.status = "Active"
        api_url = f"/v1/auth/referencias/activar/{doc.reference}"
    elif action == "Disable":
        doc.status = "Disabled"
        api_url = f"/v1/auth/referencias/desactivar/{doc.reference}"
    else:
        throw("Invalid action. Action must be either 'Activate' or 'Disable'.")

    doc.save(ignore_permissions=True)
    
    settings = frappe.db.get_value("Intelize Settings", {'enabled': 1}, ["base_url", "api_token"], as_dict=1)
    if not settings:
        throw("Intelize Settings are not properly configured or not enabled.")
    
    base_url = settings.get("base_url")
    token_api = settings.get("api_token")
    
    headers = {
        'Authorization': f'Bearer {token_api}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.patch(f"{base_url}{api_url}", headers=headers)

        if response.status_code == 200 or response.status_code == 201:
            frappe.msgprint(f"The status of reference {doc.reference} has been changed to {doc.status}.")
        else:
            throw(f"Failed to change status in the external system. API responded with: {response.text}")

    except requests.exceptions.RequestException as e:
        throw(f"An error occurred while changing the status: {str(e)}")
    




        

        

       



