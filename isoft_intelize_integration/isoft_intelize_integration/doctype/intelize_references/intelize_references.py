import requests
import json
import random
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
    def validate(self):
        # A reference only becomes Active once it has been registered with Intelize
        # on submit, so an unsubmitted document must not claim to be Active.
        if self.docstatus == 0:
            self.status = "Draft"

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
                    # registered with Intelize — it is live from now until the due date
                    self.db_set("status", "Expired" if getdate(self.due_date) < getdate(nowdate()) else "Active")
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
def get_generation_settings():
    """Return whether reference generation is enabled per source doctype.

    Reads the enabled Intelize Settings record so client scripts on Quotation /
    Sales Invoice can decide whether to show the "Create Intelize Reference" button.
    """
    s = frappe.db.get_value(
        "Intelize Settings",
        {"enabled": 1},
        ["generate_reference_on_quotation", "generate_reference_on_sales_invoice"],
        as_dict=1,
    ) or {}
    return {
        "quotation": bool(s.get("generate_reference_on_quotation")),
        "sales_invoice": bool(s.get("generate_reference_on_sales_invoice")),
    }


@frappe.whitelist()
def can_create_reference(source_doctype, source_name):
    """Whether the "Create Intelize Reference" button should show for a document.

    Returns ``show: False`` when generation is disabled for that source doctype, or
    when a (draft or submitted) Intelize Reference already exists for the document.
    """
    settings = get_generation_settings()
    field = "quotation" if source_doctype == "Quotation" else "sales_invoice"
    if not settings.get(field):
        return {"show": False}

    existing = frappe.db.get_value(
        "Intelize References", {field: source_name, "docstatus": ["<", 2]}, "name"
    )
    return {"show": not bool(existing), "existing": existing or None}


def _generate_next_reference():
    """Generate a unique random 9-digit reference (same logic as the Intelize References form)."""
    for _attempt in range(50):
        ref = str(random.randint(100000000, 999999999))
        if not frappe.db.exists("Intelize References", {"reference": ref}):
            return ref
    throw("Could not generate a unique reference number. Please try again.")


@frappe.whitelist()
def get_next_reference():
    """Preview of the auto-generated reference (shown read-only in the modal)."""
    return _generate_next_reference()


@frappe.whitelist()
def create_reference_from_source(source_doctype, source_name, amount, due_date, submit=0, reference=None):
    """Create (and optionally submit) an Intelize Reference from a Quotation / Sales Invoice.

    Uses the auto-generated ``reference`` shown in the modal; if it is missing, malformed,
    or already taken (race), a fresh unique number is generated server-side. When
    ``submit`` is truthy the document is submitted, triggering the Intelize API
    registration in ``on_submit``.
    """
    if source_doctype not in ("Quotation", "Sales Invoice"):
        throw("Unsupported source document type.")

    settings = get_generation_settings()
    key = "quotation" if source_doctype == "Quotation" else "sales_invoice"
    if not settings.get(key):
        throw(f"Reference generation is not enabled for {source_doctype} in Intelize Settings.")

    reference = cstr(reference).strip()
    if not (reference.isdigit() and len(reference) == 9) or frappe.db.exists(
        "Intelize References", {"reference": reference}
    ):
        reference = _generate_next_reference()

    doc = frappe.new_doc("Intelize References")
    doc.reference = reference
    doc.amount = flt(amount)
    doc.due_date = getdate(due_date)
    if source_doctype == "Quotation":
        doc.quotation = source_name
    else:
        doc.sales_invoice = source_name

    doc.insert()

    if cint(submit):
        doc.submit()

    return {"name": doc.name, "reference": doc.reference}

OPEN_STATUSES = ("Active", "Disabled")


def expire_due_references():
    """Flip submitted references past their due date to ``Expired``.

    Intelize stops accepting payments on a reference once ``due_date`` has passed,
    but nothing used to reflect that locally, so references stayed ``Active``
    forever. Runs daily; ``Completed`` and ``Cancelled`` documents are left alone
    because a paid reference stays paid regardless of its due date.
    """
    stale = frappe.get_all(
        "Intelize References",
        filters={
            "docstatus": 1,
            "status": ["in", OPEN_STATUSES],
            "due_date": ["<", nowdate()],
        },
        pluck="name",
        limit_page_length=0,
    )
    for name in stale:
        frappe.db.set_value("Intelize References", name, "status", "Expired", update_modified=False)

    if stale:
        frappe.db.commit()

    return len(stale)


def update_completion_status(reference_name):
    """Mark a reference ``Completed`` once payments cover its full amount.

    Called after an Intelize Payment is created. References registered as
    ``montante_limitado_para_pagamento_longo`` accept several partial payments, so
    completion is decided on the summed total, not on the first payment received.
    """
    ref = frappe.db.get_value(
        "Intelize References", reference_name, ["amount", "status", "docstatus"], as_dict=1
    )
    if not ref or ref.docstatus != 1 or ref.status == "Completed":
        return

    amount = flt(ref.amount)
    if amount <= 0:
        return

    paid = flt(
        frappe.db.get_value(
            "Intelize Payment",
            {"intelize_references": reference_name},
            "sum(paid_amount)",
        )
    )

    # tolerate rounding noise from the payment provider
    if paid + 0.005 >= amount:
        frappe.db.set_value("Intelize References", reference_name, "status", "Completed")


@frappe.whitelist()
def change_status(name, action):
    doc = frappe.get_doc("Intelize References", name)

    if doc.docstatus != 1:
        throw("You can only change the status of submitted documents.")

    if doc.status == "Completed":
        throw("This reference has already been paid in full and cannot be changed.")

    current_date = frappe.utils.nowdate()

    if getdate(current_date) > getdate(doc.due_date):
        throw("This reference expired on {0} and can no longer be activated or disabled.".format(
            frappe.utils.formatdate(doc.due_date)
        ))

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
    




        

        

       



