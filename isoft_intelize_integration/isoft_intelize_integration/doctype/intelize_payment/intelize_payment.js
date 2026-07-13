// Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Intelize Payment', {
	refresh: function(frm) {
        if(frm.doc.docstatus = 1 && !frm.doc.sales_invoice)
        frm.add_custom_button(__('Link To Sales Invoice'), function() {
            // Create a dialog for selecting the Sales Invoice
            const dialog = new frappe.ui.Dialog({
                title: 'Link To Sales Invoice',
                fields: [
                    {
                        fieldtype: 'Link',
                        fieldname: 'sales_invoice',
                        options: 'Sales Invoice', // Set options to the Sales Invoice DocType
                        label: 'Sales Invoice',
                        reqd: 1
                    }
                ],
                primary_action_label: 'Link',
                primary_action(values) {
                    if (values.sales_invoice) {
                        frm.set_value('sales_invoice', values.sales_invoice); // Set the value in the field
                        frm.save(); // Save the form
                        frappe.show_alert(`Linked to Sales Invoice: ${values.sales_invoice}`, 5);
                    }
                    dialog.hide();
                }
            });
            dialog.show();
        });
        
         if(frm.doc.sales_invoice && !frm.doc.payment_entry)
        frm.add_custom_button(__('Create Payment Entry'), function() {
                        frappe.call({
                method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment.generate_payment_entry", 
                args: {
                    name: frm.doc.name 
                },
                callback: function(response) {
                    if (response.message) {
                    console.log(response);
                        frappe.show_alert(`Payment Entry Created: ${response.message.name}`, 5);
                        frm.reload_doc();
                    } else {
                        frappe.show_alert("Error creating Payment Entry.", 5);
                    }
                },
                error: function(err) {
                    frappe.show_alert("An error occurred: " + err.message, 5);
                }
            });
 
        });
        
            /*   frm.add_custom_button(__('Test API'), function() {
                        frappe.call({
                method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment.fetch_payment_data", 
                callback: function(response) {
                    if (response.message) {
                    console.log(response);
                    } else {
                        frappe.show_alert("Error creating Payment Entry.", 5);
                    }
                },
                error: function(err) {
                    frappe.show_alert("An error occurred: " + err.message, 5);
                }
            });

        }); */
    }
});

