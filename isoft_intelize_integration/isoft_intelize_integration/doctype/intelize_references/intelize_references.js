frappe.ui.form.on('Intelize References', {
    refresh: function(frm) {
        // Check if reference is not a 9-digit number or is '000000000'
        if (!/^\d{9}$/.test(frm.doc.reference) || frm.doc.reference === '000000000') {
            // Generate a random 9-digit number
            let randomReference = Math.floor(100000000 + Math.random() * 900000000);
            frm.set_value('reference', randomReference);
        }

        // surface the lifecycle status in the page indicator, not just the field
        const status_colors = {
            Draft: "orange",
            Active: "green",
            Disabled: "red",
            Completed: "blue",
            Expired: "gray",
        };
        if (frm.doc.status && frm.doc.docstatus !== 2) {
            frm.page.set_indicator(__(frm.doc.status), status_colors[frm.doc.status] || "gray");
        }

        if (frm.doc.docstatus === 1 && frm.doc.due_date) {
            let currentDate = frappe.datetime.now_date();
            if (currentDate <= frm.doc.due_date && cur_frm.doc.status != 'Completed') {
                if (cur_frm.doc.status == 'Disabled') {
                    frm.add_custom_button(__('Activate'), function() {
                        frappe.call({
                            method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references.change_status",
                            args: {
                                name: frm.doc.name,
                                action: "Activate"
                            },
                            callback: function(response) {
                                frm.reload_doc();
                            }
                        });
                    });
                }
                if (cur_frm.doc.status == 'Active') {
                    frm.add_custom_button(__('Disable'), function() {
                        frappe.call({
                            method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_references.intelize_references.change_status",
                            args: {
                                name: frm.doc.name,
                                action: "Disable"
                            },
                            callback: function(response) {
                                frm.reload_doc();
                            }
                        });
                    });
                }
                       /*  frm.add_custom_button(__('Test'), function() {
                        frappe.call({
                            method: "isoft_intelize_integration.isoft_intelize_integration.doctype.intelize_payment.intelize_payment.fetch_payment_data",
                            args: {
   
                            },
                            callback: function(response) {
                                console.log(response);
                            }
                        });
                    }); */
            }
        }

    }
});
