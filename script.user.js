// ==UserScript==
// @name         Gemini Auto-Responder
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Adds an always-visible settings panel to configure server URL and polling interval.
// @author       h4ribote
// @match        https://gemini.google.com/app*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      127.0.0.1
// @connect      localhost
// @require      https://unpkg.com/turndown/dist/turndown.js
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULTS = {
        isEnabled: false,
        serverUrl: 'http://127.0.0.1:8000/api',
        pollingInterval: 3000
    };

    let settings = {};
    let pollingTimer;
    let isProcessing = false;

    const turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '*',
        codeBlockStyle: 'fenced'
    });

    turndownService.addRule('geminiCodeBlock', {
        filter: function (node, options) {
            return node.nodeName === 'CODE-BLOCK';
        },
        replacement: function (content, node, options) {
            const langElement = node.querySelector('.code-block-decoration > span');
            const lang = langElement ? langElement.textContent.trim().toLowerCase() : '';
            const codeElement = node.querySelector('pre > code');
            const code = codeElement ? codeElement.textContent : '';
            return '\n```' + lang + '\n' + code + '\n```\n';
        }
    });

    turndownService.addRule('geminiHr', {
        filter: ['hr'],
        replacement: function (content, node, options) {
            return '\n---\n';
        }
    });

    function checkForNewTask() {
        if (isProcessing || !settings.isEnabled) {
            return;
        }

        console.log('Checking for new task...');
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${settings.serverUrl}/get_prompt`,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data && data.task_id && data.prompt) {
                        isProcessing = true;
                        console.log(`New task found: ID=${data.task_id}`);
                        stopPolling();
                        processGeminiPrompt(data.prompt, data.task_id);
                    }
                } catch (e) {
                    console.error("Failed to parse server response:", e);
                }
            },
            onerror: function(response) {
                console.error('Could not connect to FastAPI server.', response);
                settings.isEnabled = false;
                updateToggleState();
                stopPolling();
                alert('サーバーへの接続に失敗しました。設定を確認し、スクリプトを再度有効にしてください。');
            }
        });
    }

    async function processGeminiPrompt(promptText, taskId) {
        try {
            const inputArea = document.querySelector('div.ql-editor.textarea');
            if (!inputArea) throw new Error("Could not find Gemini's input area.");
            inputArea.innerText = promptText;

            await new Promise(resolve => setTimeout(resolve, 500));
            const sendButton = document.querySelector('button[aria-label="Send message"], button[aria-label="プロンプトを送信"]');
            if (!sendButton || sendButton.disabled) throw new Error("Could not find or click the send button.");
            sendButton.click();

            console.log("Waiting for Gemini's response...");
            const responseMarkdown = await waitForResponseAndConvertToMarkdown();
            console.log(`Response converted to Markdown for task ${taskId}.`);

            sendResponseToServer(responseMarkdown, taskId);

        } catch (error) {
            console.error(`An error occurred during processing task ${taskId}:`, error);
            isProcessing = false;
            startPolling();
        }
    }

    function waitForResponseAndConvertToMarkdown() {
        return new Promise((resolve, reject) => {
            const micButtonSelector = '.mic-button-container';
            const observer = new MutationObserver((mutations, obs) => {
                const micContainer = document.querySelector(micButtonSelector);
                if (micContainer && !micContainer.classList.contains('hidden')) {
                    console.log("Response complete trigger detected.");
                    obs.disconnect();

                    setTimeout(() => {
                        try {
                            const responseElements = document.querySelectorAll('.response-content .markdown');
                            if (responseElements.length > 0) {
                                const latestResponseElement = responseElements[responseElements.length - 1];
                                const htmlContent = latestResponseElement.innerHTML;

                                console.log("Converting HTML to Markdown...");
                                const markdown = turndownService.turndown(htmlContent);
                                resolve(markdown);
                            } else {
                                reject(new Error("Could not find response element."));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    }, 500);
                    return;
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        });
    }

    function sendResponseToServer(markdown, taskId) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${settings.serverUrl}/receive_response`,
            data: JSON.stringify({ response: markdown, task_id: taskId }),
            headers: { 'Content-Type': 'application/json' },
            onload: function(response) {
                console.log(`Response for task ${taskId} successfully sent to server.`);
                isProcessing = false;
                startPolling();
            },
            onerror: function(response) {
                console.error(`Failed to send response for task ${taskId}.`, response);
                isProcessing = false;
                startPolling();
            }
        });
    }

    function startPolling() {
        stopPolling();
        if (settings.isEnabled) {
            pollingTimer = setInterval(checkForNewTask, settings.pollingInterval);
            console.log(`Polling started. Checking every ${settings.pollingInterval / 1000} seconds.`);
        } else {
            console.log('Polling is disabled.');
        }
    }

    function stopPolling() {
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = null;
        console.log('Polling stopped.');
    }

    function createSettingsPanel() {
        const panelHTML = `
            <div id="gar-settings-panel" class="gar-panel">
                <div id="gar-panel-header">
                    <span>Auto Responder Settings</span>
                </div>
                <div id="gar-panel-content">
                    <div class="gar-form-group">
                        <label for="gar-enabled-toggle">Enable Script</label>
                        <label class="gar-switch">
                            <input type="checkbox" id="gar-enabled-toggle">
                            <span class="gar-slider gar-round"></span>
                        </label>
                    </div>
                    <div class="gar-form-group">
                        <label for="gar-server-url">Server URL</label>
                        <input type="text" id="gar-server-url">
                    </div>
                    <div class="gar-form-group">
                        <label for="gar-polling-interval">Polling Interval (ms)</label>
                        <input type="number" id="gar-polling-interval" min="500" step="100">
                    </div>
                    <button id="gar-save-button">Save & Restart Polling</button>
                    <div id="gar-status" class="gar-status-hidden"></div>
                </div>
            </div>
        `;

        const panelContainer = document.createElement('div');
        panelContainer.innerHTML = panelHTML;
        document.body.appendChild(panelContainer);

        document.getElementById('gar-save-button').addEventListener('click', saveSettings);
        document.getElementById('gar-enabled-toggle').addEventListener('change', handleToggleChange);
    }

    function addPanelStyles() {
        GM_addStyle(`
            #gar-settings-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 300px;
                background-color: #282a36;
                color: #f8f8f2;
                border: 1px solid #44475a;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                z-index: 9999;
                font-family: sans-serif;
                font-size: 14px;
                transition: all 0.3s ease-in-out;
                overflow: hidden;
            }
            #gar-panel-header {
                display: flex;
                align-items: center;
                padding: 10px 15px;
                background-color: #44475a;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
            }
            #gar-panel-header span {
                font-weight: bold;
            }
            #gar-panel-content {
                padding: 15px;
                border-top: 1px solid #44475a;
            }
            .gar-form-group {
                margin-bottom: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .gar-form-group label {
                margin-right: 10px;
            }
            .gar-form-group input[type="text"], .gar-form-group input[type="number"] {
                width: 160px;
                padding: 5px;
                background: #3b3d4a;
                border: 1px solid #6272a4;
                color: #f8f8f2;
                border-radius: 4px;
            }
            #gar-save-button {
                width: 100%;
                padding: 10px;
                background-color: #50fa7b;
                color: #282a36;
                border: none;
                border-radius: 4px;
                font-weight: bold;
                cursor: pointer;
                margin-top: 10px;
            }
            #gar-save-button:hover {
                opacity: 0.9;
            }
            #gar-status {
                margin-top: 10px;
                text-align: center;
                font-size: 12px;
                color: #50fa7b;
                transition: opacity 0.5s;
            }
            .gar-status-hidden {
                opacity: 0;
            }
            /* Toggle Switch CSS */
            .gar-switch { position: relative; display: inline-block; width: 50px; height: 24px; }
            .gar-switch input { opacity: 0; width: 0; height: 0; }
            .gar-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; }
            .gar-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
            input:checked + .gar-slider { background-color: #50fa7b; }
            input:focus + .gar-slider { box-shadow: 0 0 1px #50fa7b; }
            input:checked + .gar-slider:before { transform: translateX(26px); }
            .gar-slider.gar-round { border-radius: 24px; }
            .gar-slider.gar-round:before { border-radius: 50%; }
        `);
    }

    function loadSettings() {
        settings.isEnabled = false;
        settings.serverUrl = GM_getValue('serverUrl', DEFAULTS.serverUrl);
        settings.pollingInterval = GM_getValue('pollingInterval', DEFAULTS.pollingInterval);

        document.getElementById('gar-enabled-toggle').checked = settings.isEnabled;
        document.getElementById('gar-server-url').value = settings.serverUrl;
        document.getElementById('gar-polling-interval').value = settings.pollingInterval;
    }

    function saveSettings() {
        const newServerUrl = document.getElementById('gar-server-url').value.trim();
        const newPollingInterval = parseInt(document.getElementById('gar-polling-interval').value, 10);

        if (!newServerUrl) {
            alert('Server URL cannot be empty.');
            return;
        }
        if (isNaN(newPollingInterval) || newPollingInterval < 100) {
            alert('Polling interval must be a number and at least 100ms.');
            return;
        }

        GM_setValue('serverUrl', newServerUrl);
        GM_setValue('pollingInterval', newPollingInterval);

        settings.serverUrl = newServerUrl;
        settings.pollingInterval = newPollingInterval;

        const statusDiv = document.getElementById('gar-status');
        statusDiv.textContent = 'Settings saved!';
        statusDiv.classList.remove('gar-status-hidden');
        setTimeout(() => statusDiv.classList.add('gar-status-hidden'), 2000);

        startPolling();
    }

    function handleToggleChange(event) {
        const isEnabled = event.target.checked;
        settings.isEnabled = isEnabled;

        if (isEnabled) {
            startPolling();
        } else {
            stopPolling();
        }
    }

    function updateToggleState() {
        document.getElementById('gar-enabled-toggle').checked = settings.isEnabled;
    }

    function init() {
        console.log('Gemini Auto-Responder script loaded.');
        addPanelStyles();
        createSettingsPanel();
        loadSettings();
        startPolling();
    }

    window.addEventListener('load', init, false);

})();
