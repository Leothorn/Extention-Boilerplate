// Handle communication with backend
async function sendToBackend(message, prompt) {
    try {
        const response = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message,
                system_prompt: prompt 
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error communicating with backend:', error);
        return { success: false, error: error.message };
    }
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'queryGemini') {
        sendToBackend(request.text, request.prompt)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
}); 