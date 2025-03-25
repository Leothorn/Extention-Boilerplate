// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processText') {
        // Handle text processing
        sendResponse({ success: true });
    }
});

// Initialize when the content script loads
function initialize() {
    console.log('Gemini Assistant Extension initialized');
    // Add any initialization logic here
}

initialize(); 