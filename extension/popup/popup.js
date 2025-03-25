import { FileUploader } from './components/FileUploader.js';

// Initialize file uploader
const fileUploader = new FileUploader('fileUploader');

// Tab handling
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        const tabId = button.dataset.tab;
        document.getElementById(`${tabId}Tab`).classList.add('active');
    });
});

// Chat functionality
document.addEventListener('DOMContentLoaded', function() {
    const promptInput = document.getElementById('prompt');
    const input = document.getElementById('input');
    const sendButton = document.getElementById('send');
    const savePromptButton = document.getElementById('savePrompt');
    const clearHistoryButton = document.getElementById('clearHistory');
    const chatHistory = document.getElementById('chatHistory');

    // Load saved prompt from storage
    chrome.storage.local.get(['systemPrompt'], function(result) {
        if (result.systemPrompt) {
            promptInput.value = result.systemPrompt;
        }
    });

    // Load chat history from storage
    function loadChatHistory() {
        chrome.storage.local.get(['chatHistory'], function(result) {
            if (result.chatHistory) {
                displayChatHistory(result.chatHistory);
            }
        });
    }

    // Display chat history in the UI
    function displayChatHistory(history) {
        chatHistory.innerHTML = '';
        history.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${message.type}-message`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = message.content;
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date(message.timestamp).toLocaleString();
            
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(timeDiv);
            chatHistory.appendChild(messageDiv);
        });
        
        // Scroll to bottom
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // Save chat history to storage
    function saveChatHistory(history) {
        chrome.storage.local.set({ chatHistory: history });
    }

    // Add a new message to chat history
    function addMessageToHistory(content, type) {
        chrome.storage.local.get(['chatHistory'], function(result) {
            const history = result.chatHistory || [];
            history.push({
                content: content,
                type: type,
                timestamp: new Date().toISOString()
            });
            saveChatHistory(history);
            displayChatHistory(history);
        });
    }

    // Clear chat history
    clearHistoryButton.addEventListener('click', () => {
        chrome.storage.local.set({ chatHistory: [] }, () => {
            displayChatHistory([]);
        });
    });

    // Save prompt to storage
    savePromptButton.addEventListener('click', () => {
        const prompt = promptInput.value.trim();
        chrome.storage.local.set({ systemPrompt: prompt }, () => {
            savePromptButton.textContent = 'Prompt Saved!';
            setTimeout(() => {
                savePromptButton.textContent = 'Save Prompt';
            }, 2000);
        });
    });

    sendButton.addEventListener('click', async () => {
        const text = input.value.trim();
        const prompt = promptInput.value.trim();
        
        if (!text) return;

        // Show loading state
        sendButton.disabled = true;
        promptInput.disabled = true;
        input.disabled = true;

        // Add user message to history
        addMessageToHistory(text, 'user');

        try {
            // Send message to background script
            const response = await chrome.runtime.sendMessage({
                action: 'queryGemini',
                text: text,
                prompt: prompt
            });

            // Display response
            if (response.success) {
                addMessageToHistory(response.response, 'assistant');
            } else {
                const errorMessage = response.error || 'Unknown error occurred';
                addMessageToHistory(`Error: ${errorMessage}`, 'error');
                console.error('Chat error:', errorMessage);
            }
        } catch (error) {
            const errorMessage = error.message || 'Failed to send message';
            addMessageToHistory(`Error: ${errorMessage}`, 'error');
            console.error('Chat error:', error);
        } finally {
            // Reset UI state
            sendButton.disabled = false;
            promptInput.disabled = false;
            input.disabled = false;
            input.value = ''; // Clear input after sending
            input.focus(); // Focus back on input
        }
    });

    // Load chat history when popup opens
    loadChatHistory();
}); 