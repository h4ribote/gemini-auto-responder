// ==UserScript==
// @name         Gemini Auto-Responder via FastAPI
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Converts response HTML to Markdown before sending to the server.
// @author       h4ribote
// @match        https://gemini.google.com/app*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @require      https://unpkg.com/turndown/dist/turndown.js
// ==/UserScript==

(function() {
    'use strict';

    const API_BASE_URL = 'http://127.0.0.1:8000/api';
    const POLLING_INTERVAL = 3000;

    let pollingTimer;
    let isProcessing = false;

    const turndownService = new TurndownService({
        headingStyle: 'atx', // h1 -> # h1
        hr: '---',
        bulletListMarker: '*',
        codeBlockStyle: 'fenced' // ```
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
        if (isProcessing) return;

        console.log('Checking for new task...');
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_BASE_URL}/get_prompt`,
            onload: function(response) {
                const data = JSON.parse(response.responseText);
                if (data && data.task_id && data.prompt) {
                    isProcessing = true;
                    console.log(`New task found: ID=${data.task_id}`);
                    stopPolling();
                    processGeminiPrompt(data.prompt, data.task_id);
                }
            },
            onerror: function(response) {
                console.error('Could not connect to FastAPI server.', response);
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
                    }, 200);
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
            url: `${API_BASE_URL}/receive_response`,
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
        if (pollingTimer) clearInterval(pollingTimer);
        pollingTimer = setInterval(checkForNewTask, POLLING_INTERVAL);
        console.log(`Polling started. Checking every ${POLLING_INTERVAL / 1000} seconds.`);
    }

    function stopPolling() {
        clearInterval(pollingTimer);
        console.log('Polling stopped.');
    }

    console.log('Gemini Auto-Responder (Markdown Converter) script loaded.');
    startPolling();

})();
