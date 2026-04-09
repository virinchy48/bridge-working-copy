/**
 * HelpAssistantMixin.js
 *
 * A mixin for SAP UI5 controllers that adds the NHVR Help Assistant panel.
 * Include this in any controller by calling HelpAssistantMixin.apply(this)
 * inside onInit, or call individual methods directly.
 *
 * Features:
 *   - Screen-level contextual guide
 *   - Field-level help search (backed by HelpContent.js)
 *   - AI-like local assistant (rule-based NLP over help registry)
 *   - Text-to-Speech via Web Speech API (speechSynthesis)
 *   - Training tips overlay (shown in demo/training mode)
 *
 * Usage in a controller:
 *   sap.ui.define([..., "nhvr/bridgemanagement/util/HelpAssistantMixin"], function(..., HelpAssistantMixin) {
 *     return Controller.extend("...", Object.assign({
 *       onInit: function() { ... },
 *       ...
 *     }, HelpAssistantMixin));
 *   });
 */
sap.ui.define([
    "nhvr/bridgemanagement/util/HelpContent",
    "nhvr/bridgemanagement/util/ScreenHelp",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (HelpContent, ScreenHelp, JSONModel, MessageToast) {
    "use strict";

    const BASE = "/bridge-management";

    // ── TTS Utility ──────────────────────────────────────────────────
    function speak(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang  = "en-AU";
        utter.rate  = 0.95;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        // Prefer an Australian English voice if available
        const voices = window.speechSynthesis.getVoices();
        const auVoice = voices.find(v => v.lang === "en-AU") ||
                        voices.find(v => v.lang.startsWith("en-"));
        if (auVoice) utter.voice = auVoice;
        window.speechSynthesis.speak(utter);
    }

    function stopSpeech() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    // ── Local Assistant NLP ──────────────────────────────────────────
    function answerQuestion(question) {
        const q = question.toLowerCase().trim();

        // Screen-level guide keywords
        const screenKeywords = {
            home:               ["home","dashboard","main","overview","start"],
            bridges:            ["bridges","bridge list","all bridges","search bridge"],
            bridgeDetail:       ["bridge detail","bridge record","tabs","detail"],
            bridgeForm:         ["bridge form","create bridge","new bridge","edit bridge","add bridge"],
            restrictions:       ["restriction","restrictions","weight limit","height limit","speed limit"],
            inspectionDashboard:["inspection","inspections","schedule","due","overdue inspection"],
            inspectionCreate:   ["create inspection","new inspection","inspection order","add inspection"],
            defects:            ["defect","defects","structural","crack","damage"],
            massUpload:         ["mass upload","bulk upload","csv","import","upload file"],
            massEdit:           ["mass edit","bulk edit","batch update","edit multiple"],
            mapView:            ["map","geospatial","location","leaflet","cluster","map view"],
            reports:            ["report","reports","compliance","kpi","analytics","export"],
            adminConfig:        ["admin","config","admin config","role","lookup","attribute"],
            integrationHub:     ["integration","hub","external","banc","vicroads","connect"],
            vehicleCombinations:["vehicle","vehicle class","pc4","combination","heavy vehicle"],
            routeAssessment:    ["route","route assessment","corridor","road route"]
        };

        for (const [key, keywords] of Object.entries(screenKeywords)) {
            if (keywords.some(kw => q.includes(kw))) {
                const guide = ScreenHelp.getScreenHelp(key);
                if (guide) return { type: "screen", title: guide.title, text: guide.text };
            }
        }

        // Field-level help keywords
        const helpKeys = Object.keys(HelpContent.HELP);
        const matchedField = helpKeys.find(k => q.includes(k.toLowerCase()));
        if (matchedField) {
            const h = HelpContent.getHelp(matchedField);
            return { type: "field", title: h.label, text: `${h.helperText}\n\n${h.tooltip}` };
        }

        // Concept keywords
        if (q.includes("as 5100") || q.includes("condition rating"))
            return { type: "concept", title: "AS 5100 Condition Rating", text: "The AS 5100.7 condition rating is a 1–10 scale used to assess bridge structural health. Ratings 1–3 indicate Critical condition requiring immediate action. Ratings 4–5 are Poor. Ratings 6–7 are Fair. Ratings 8–10 are Good. This rating is set during formal Principal Inspections and drives maintenance prioritisation." };
        if (q.includes("xsuaa") || q.includes("role") || q.includes("permission"))
            return { type: "concept", title: "Roles & Permissions", text: "The system uses SAP XSUAA role collections. Roles include: NHVR_Admin (full access), NHVR_BridgeManager (create/edit bridges and restrictions), NHVR_Inspector (inspection orders and defects), NHVR_Operator (operational access), NHVR_Viewer (read-only), NHVR_Executive (dashboards). Your role is shown in the header." };
        if (q.includes("nhvr") || q.includes("what is"))
            return { type: "concept", title: "About NHVR Bridge System", text: "The NHVR Bridge Asset & Restriction Management System manages 2,126+ bridge assets across Australia's national road network. It enables NHVR engineers and planners to track bridge condition, manage load restrictions, schedule inspections, record defects, and assess vehicle route accessibility — all in one platform." };
        if (q.includes("bimm") || q.includes("austroads"))
            return { type: "concept", title: "AustRoads BIMM", text: "BIMM (Bridge Inspection and Maintenance Manual) is the AustRoads framework for bridge inspection. It defines defect categories, severity ratings, inspection types, and maintenance urgency levels. The NHVR system aligns with BIMM §4 for defect classification and AS 5100.7 for condition ratings." };
        if (q.includes("demo") || q.includes("training"))
            return { type: "concept", title: "Training / Demo Mode", text: "In Training mode, the system is connected to a demo database with synthetic data. You can safely explore, create, and edit records without affecting production data. The orange 'TRAINING ENVIRONMENT' banner is shown whenever you are in training mode." };

        return null;
    }

    // ── Mixin Object ─────────────────────────────────────────────────
    const Mixin = {

        // Call this from onInit to wire up demo mode detection
        _initHelpAssistant: function (screenKey) {
            this._helpScreenKey = screenKey || "home";
            this._fetchSystemInfo();
        },

        _fetchSystemInfo: function () {
            fetch(`${BASE}/getSystemInfo()`, { headers: { Accept: "application/json" } })
                .then(r => r.json())
                .then(info => {
                    this._systemInfo = info.value || info;
                    this._applyDemoMode(this._systemInfo);
                })
                .catch(() => { this._systemInfo = { mode: "production", isTraining: false }; });
        },

        _applyDemoMode: function (info) {
            if (!info || !info.isTraining) return;
            // Show training banner if present on view
            const banner = this.byId ? this.byId("trainingBanner") : null;
            if (banner) banner.setVisible(true);
        },

        // ── Open Help Panel ───────────────────────────────────────────
        onOpenHelp: function () {
            if (!this._helpFragment) {
                this._helpFragment = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "nhvr.bridgemanagement.view.fragments.HelpAssistant",
                    this
                );
                this.getView().addDependent(this._helpFragment);
            }
            const screenInfo = ScreenHelp.getScreenHelp(this._helpScreenKey);
            const helpModel  = new JSONModel({
                screenTitle:   screenInfo ? screenInfo.title : "Help",
                screenGuide:   screenInfo ? screenInfo.text  : "No guide available.",
                trainingTips:  screenInfo ? (screenInfo.trainingTips || "") : "",
                searchQuery:   "",
                fieldResult:   null,
                chatMessages:  [],
                audioEnabled:  !!(window.speechSynthesis),
                isPlaying:     false,
                isTraining:    this._systemInfo && this._systemInfo.isTraining
            });
            this._helpFragment.setModel(helpModel, "help");

            // Show training tips if in training mode
            const tipsBox = sap.ui.getCore().byId(this.getView().getId() + "--trainingTipsBox");
            if (tipsBox) {
                const isTraining = this._systemInfo && this._systemInfo.isTraining;
                tipsBox.setVisible(isTraining && !!(screenInfo && screenInfo.trainingTips));
                const tipsText = sap.ui.getCore().byId(this.getView().getId() + "--helpTrainingTips");
                if (tipsText && screenInfo) tipsText.setText(screenInfo.trainingTips || "");
            }

            this._helpFragment.open();
        },

        onCloseHelp: function () {
            stopSpeech();
            if (this._helpFragment) this._helpFragment.close();
        },

        onHelpDialogClose: function () {
            stopSpeech();
            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (model) model.setProperty("/isPlaying", false);
        },

        // ── Audio ─────────────────────────────────────────────────────
        onToggleAudio: function () {
            if (window.speechSynthesis && window.speechSynthesis.speaking) {
                stopSpeech();
                const model = this._helpFragment.getModel("help");
                model.setProperty("/isPlaying", false);
            } else {
                this.onReadGuide();
            }
        },

        onReadGuide: function () {
            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (!model) return;
            const text = model.getProperty("/screenGuide");
            if (text) {
                speak(text);
                model.setProperty("/isPlaying", true);
                if (window.speechSynthesis) {
                    window.speechSynthesis.getVoices();
                    const checkEnd = setInterval(() => {
                        if (!window.speechSynthesis.speaking) {
                            model.setProperty("/isPlaying", false);
                            clearInterval(checkEnd);
                        }
                    }, 500);
                }
            }
        },

        onReadFieldHelp: function () {
            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (!model) return;
            const result = model.getProperty("/fieldResult");
            if (result) speak(`${result.label}. ${result.helperText}. ${result.tooltip}`);
        },

        onStopSpeech: function () {
            stopSpeech();
            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (model) model.setProperty("/isPlaying", false);
        },

        // ── Field Search ──────────────────────────────────────────────
        onSearchFieldHelp: function (e) {
            const query = e.getParameter("query") || e.getSource().getValue();
            this._lookupFieldHelp(query);
        },

        onQuickFieldHelp: function (e) {
            const key = e.getSource().getText();
            this._lookupFieldHelp(key);
            // Switch to field tab
            const bar = sap.ui.getCore().byId(this.getView().getId() + "--helpTabBar");
            if (bar) bar.setSelectedKey("fields");
            const searchField = sap.ui.getCore().byId(this.getView().getId() + "--helpFieldSearch");
            if (searchField) searchField.setValue(key);
        },

        _lookupFieldHelp: function (query) {
            if (!query || !query.trim()) return;
            const model  = this._helpFragment && this._helpFragment.getModel("help");
            if (!model) return;
            const result = HelpContent.getHelp(query.trim());
            model.setProperty("/fieldResult", result.tooltip ? result : null);
            if (!result.tooltip) {
                MessageToast.show(`No help entry found for "${query}". Try a field name like bridgeId or conditionRating.`);
            }
        },

        onHelpTabChange: function () {
            stopSpeech();
            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (model) model.setProperty("/isPlaying", false);
        },

        // ── Help Index ────────────────────────────────────────────────
        onHelpIndexItemPress: function (e) {
            const item = e.getParameter("listItem");
            const key  = item.data("screenKey");
            if (!key) return;
            const guide = ScreenHelp.getScreenHelp(key);
            if (!guide) return;
            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (model) {
                model.setProperty("/screenTitle", guide.title);
                model.setProperty("/screenGuide", guide.text);
            }
            // Switch to guide tab
            const bar = sap.ui.getCore().byId(this.getView().getId() + "--helpTabBar");
            if (bar) bar.setSelectedKey("guide");
        },

        // ── AI Assistant ──────────────────────────────────────────────
        onChatSubmit: function () {
            const inputCtrl = sap.ui.getCore().byId(this.getView().getId() + "--chatInput");
            if (!inputCtrl) return;
            const question = (inputCtrl.getValue() || "").trim();
            if (!question) return;
            inputCtrl.setValue("");

            const model = this._helpFragment && this._helpFragment.getModel("help");
            if (!model) return;

            const msgs = model.getProperty("/chatMessages") || [];

            // Add user message
            msgs.push({ role: "user", text: question });
            model.setProperty("/chatMessages", [...msgs]);
            this._renderChatMessages(msgs);

            // Generate answer
            const answer = answerQuestion(question);
            const botText = answer
                ? `${answer.title}\n\n${answer.text}`
                : "I'm not sure about that. Try asking about a specific field name (e.g. 'conditionRating'), a screen name (e.g. 'bridges'), or a concept (e.g. 'AS 5100', 'roles', 'inspection'). You can also browse the Help Index tab.";

            setTimeout(() => {
                msgs.push({ role: "bot", text: botText });
                model.setProperty("/chatMessages", [...msgs]);
                this._renderChatMessages(msgs);
            }, 300);
        },

        _renderChatMessages: function (msgs) {
            const chatBox = sap.ui.getCore().byId(this.getView().getId() + "--chatMessages");
            if (!chatBox) return;

            // Remove all dynamic messages (keep first welcome) — snapshot to avoid live-ref mutation
            chatBox.getItems().slice(1).forEach(item => chatBox.removeItem(item));

            msgs.forEach(msg => {
                const isBot  = msg.role === "bot";
                const bubble = new sap.m.VBox()
                    .addStyleClass("nhvrChatBubble")
                    .addStyleClass(isBot ? "nhvrChatBubbleBot" : "nhvrChatBubbleUser");
                bubble.addItem(new sap.m.Text({ text: msg.text, wrapping: true }));

                const row = new sap.m.HBox({ alignItems: "Start" })
                    .addStyleClass("nhvrChatMsg")
                    .addStyleClass(isBot ? "nhvrChatMsgBot" : "nhvrChatMsgUser")
                    .addStyleClass("sapUiTinyMarginBottom");

                if (isBot) {
                    row.addItem(new sap.ui.core.Icon({ src: "sap-icon://sys-help", size: "1rem", color: "#1065B4" })
                        .addStyleClass("nhvrChatAvatar"));
                }
                row.addItem(bubble);
                chatBox.addItem(row);
            });

            // Scroll to bottom
            const scroll = sap.ui.getCore().byId(this.getView().getId() + "--chatScroll");
            if (scroll) {
                setTimeout(() => {
                    const dom = scroll.getDomRef();
                    if (dom) dom.scrollTop = dom.scrollHeight;
                }, 50);
            }
        }
    };

    return Mixin;
});
