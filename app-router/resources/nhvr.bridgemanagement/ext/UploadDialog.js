// ============================================================
// NHVR - Mass Upload Dialog Extension
// Custom controller extension for bulk CSV upload
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/TextArea",
    "sap/m/FileUploader",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Text",
    "sap/m/Link"
], function (ControllerExtension, Dialog, Button, VBox, TextArea,
             FileUploader, Select, Item, MessageBox, MessageToast, Text, Link) {
    "use strict";

    return ControllerExtension.extend("nhvr.bridgemanagement.ext.UploadDialog", {

        // ── Open Upload Dialog ────────────────────────────────────
        openUploadDialog: function (uploadType) {
            const sTitle    = uploadType === "BRIDGE" ? "Upload Bridges" : "Upload Restrictions";

            this._uploadType = uploadType;

            if (!this._uploadDialog) {
                this._csvTextArea = new TextArea({
                    id      : "csvInput",
                    rows    : 15,
                    cols    : 80,
                    width   : "100%",
                    growing : true,
                    placeholder: "Paste CSV data here or upload a file..."
                });

                this._uploadDialog = new Dialog({
                    title       : sTitle,
                    contentWidth: "700px",
                    content: [
                        new VBox({
                            items: [
                                new Text({
                                    text: "Download the template below, fill in your data, then paste or upload:"
                                }),
                                new Link({
                                    text    : "Download Template CSV",
                                    press   : this._downloadTemplate.bind(this)
                                }),
                                new FileUploader({
                                    uploadUrl   : "",
                                    style       : "Emphasized",
                                    name        : "file",
                                    change      : this._onFileChange.bind(this)
                                }),
                                this._csvTextArea
                            ],
                            class: "sapUiSmallMargin"
                        })
                    ],
                    buttons: [
                        new Button({
                            text    : "Upload",
                            type    : "Emphasized",
                            press   : this._performUpload.bind(this)
                        }),
                        new Button({
                            text    : "Cancel",
                            press   : () => this._uploadDialog.close()
                        })
                    ]
                });
            } else {
                this._uploadDialog.setTitle(sTitle);
                this._csvTextArea.setValue("");
            }

            this.getView().addDependent(this._uploadDialog);
            this._uploadDialog.open();
        },

        // ── Read file into textarea ───────────────────────────────
        _onFileChange: function (oEvent) {
            const file = oEvent.getParameter("files")[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                this._csvTextArea.setValue(e.target.result);
            };
            reader.readAsText(file);
        },

        // ── Generate and download template CSV ───────────────────
        _downloadTemplate: function () {
            let header, example;

            if (this._uploadType === "BRIDGE") {
                header  = "bridgeId,name,region,state,structureType,material,latitude,longitude,routeCode,condition,inspectionDate,yearBuilt,conditionScore,spanLengthM,deckWidthM,clearanceHeightM";
                example = "BRG-001,Hume Bridge,New South Wales,NSW,Beam,Concrete,-34.0000,150.0000,HWY-31,GOOD,2024-01-15,1985,75,25.5,8.5,5.2";
            } else {
                header  = "bridgeId,vehicleClassCode,restrictionType,value,unit,validFromDate,validToDate,validFromTime,validToTime,dayOfWeek,permitRequired,notes";
                example = "BRG-001,BDOUBLE,MASS,42.5,t,2024-01-01,2024-12-31,,,MON,TUE,WED,THU,FRI,false,Standard B-Double mass restriction";
            }

            const csvContent    = header + "\n" + example;
            const blob          = new Blob([csvContent], { type: "text/csv" });
            const url           = URL.createObjectURL(blob);
            const a             = document.createElement("a");
            a.href              = url;
            a.download          = `template_${this._uploadType.toLowerCase()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        },

        // ── Perform the upload ────────────────────────────────────
        _performUpload: function () {
            const csvData = this._csvTextArea.getValue();
            if (!csvData.trim()) {
                MessageBox.warning("Please provide CSV data before uploading.");
                return;
            }

            const oModel    = this.getView().getModel();
            const actionName = this._uploadType === "BRIDGE"
                ? "BridgeManagementService.massUploadBridges"
                : "BridgeManagementService.massUploadRestrictions";

            oModel.bindContext(`/${actionName}(...)`).invoke({
                csvData
            }).then(result => {
                const { status, successCount, failureCount, errors } = result || {};

                if (status === 'SUCCESS') {
                    MessageToast.show(`Upload successful! ${successCount} records created/updated.`);
                } else {
                    MessageBox.warning(
                        `Upload completed with issues.\n✓ ${successCount} succeeded\n✗ ${failureCount} failed\n\nErrors:\n${errors}`,
                        { title: "Upload Result" }
                    );
                }

                this._uploadDialog.close();
                oModel.refresh();
            }).catch(err => {
                MessageBox.error("Upload failed: " + (err.message || "Unknown error"));
            });
        }
    });
});
