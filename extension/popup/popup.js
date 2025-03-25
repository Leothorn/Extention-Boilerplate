import { FileUploader } from './components/FileUploader.js';

// Initialize file uploader
const fileUploader = new FileUploader('fileUploader');

// Chat functionality
const chatHistory = document.getElementById('chatHistory');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

// Load chat history
chrome.storage.local.get(['chatHistory'], (result) => {
    if (result.chatHistory) {
        result.chatHistory.forEach(message => {
            appendMessage(message.text, message.type);
        });
    }
});

// Send message
sendButton.addEventListener('click', async () => {
    const message = userInput.value.trim();
    if (!message) return;

    // Clear input
    userInput.value = '';

    // Add user message to chat
    appendMessage(message, 'user');

    // Save to history
    saveToHistory(message, 'user');

    try {
        // Send to backend
        const response = await fetch('http://localhost:5000/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        
        // Add assistant response to chat
        appendMessage(data.response, 'assistant');
        
        // Save to history
        saveToHistory(data.response, 'assistant');
    } catch (error) {
        console.error('Error:', error);
        appendMessage('Error: Could not connect to the backend server', 'error');
    }
});

// Enter key to send
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
    }
});

function appendMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    messageDiv.textContent = text;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function saveToHistory(text, type) {
    chrome.storage.local.get(['chatHistory'], (result) => {
        const history = result.chatHistory || [];
        history.push({ text, type, timestamp: new Date().toISOString() });
        chrome.storage.local.set({ chatHistory: history });
    });
}

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
                addMessageToHistory('Error: ' + (response.error || 'Unknown error'), 'assistant');
            }
        } catch (error) {
            addMessageToHistory('Error: ' + error.message, 'assistant');
        } finally {
            sendButton.disabled = false;
            promptInput.disabled = false;
            input.value = ''; // Clear input after sending
        }
    });

    // Load chat history when popup opens
    loadChatHistory();
}); 