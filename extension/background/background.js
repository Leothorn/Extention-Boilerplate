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

// File storage service
const FileStorage = {
    // Store file data in chrome.storage.local
    async storeFile(fileData) {
        try {
            // Get existing files
            const result = await chrome.storage.local.get('storedFiles');
            const storedFiles = result.storedFiles || [];
            
            // Add new file
            storedFiles.push({
                name: fileData.name,
                type: fileData.type,
                size: fileData.size,
                lastModified: fileData.lastModified,
                data: fileData.data
            });
            
            // Store updated files
            await chrome.storage.local.set({ storedFiles });
            
            return { success: true, message: 'File stored successfully' };
        } catch (error) {
            console.error('Error storing file:', error);
            return { success: false, message: error.message };
        }
    },

    // Get all stored files
    async getStoredFiles() {
        try {
            const result = await chrome.storage.local.get('storedFiles');
            return result.storedFiles || [];
        } catch (error) {
            console.error('Error getting stored files:', error);
            return [];
        }
    },

    // Delete a specific file
    async deleteFile(fileName) {
        try {
            const result = await chrome.storage.local.get('storedFiles');
            const storedFiles = result.storedFiles || [];
            
            // Remove file by name
            const updatedFiles = storedFiles.filter(file => file.name !== fileName);
            
            // Store updated files
            await chrome.storage.local.set({ storedFiles: updatedFiles });
            
            return { success: true, message: 'File deleted successfully' };
        } catch (error) {
            console.error('Error deleting file:', error);
            return { success: false, message: error.message };
        }
    }
};

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'queryGemini') {
        sendToBackend(request.text, request.prompt)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
    
    if (request.action === 'storeFile') {
        FileStorage.storeFile(request.fileData)
            .then(response => sendResponse(response));
        return true; // Will respond asynchronously
    }
    
    if (request.action === 'getStoredFiles') {
        FileStorage.getStoredFiles()
            .then(files => sendResponse({ success: true, files }));
        return true;
    }
    
    if (request.action === 'deleteFile') {
        FileStorage.deleteFile(request.fileName)
            .then(response => sendResponse(response));
        return true;
    }
}); 