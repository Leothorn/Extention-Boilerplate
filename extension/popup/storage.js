// Storage utilities for Chrome extension
const storage = {
    // Initialize storage module
    initialized: false,
    initPromise: null,

    // Initialize storage
    init() {
        if (this.initialized) return Promise.resolve();
        
        if (!this.initPromise) {
            this.initPromise = new Promise((resolve) => {
                console.log('Initializing storage...');
                // Create necessary storage structure if it doesn't exist
                chrome.storage.local.get(['files', 'summaries', 'chatHistory'], (result) => {
                    if (!result.files) {
                        chrome.storage.local.set({ files: [] });
                    }
                    if (!result.summaries) {
                        chrome.storage.local.set({ summaries: {} });
                    }
                    if (!result.chatHistory) {
                        chrome.storage.local.set({ chatHistory: [] });
                    }
                    this.initialized = true;
                    console.log('Storage initialized');
                    resolve();
                });
            });
        }
        
        return this.initPromise;
    },

    // Wait for storage to initialize
    waitForInit() {
        return this.init();
    },

    // Save file metadata
    async saveFile(fileData) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['files'], (result) => {
                const files = result.files || [];
                const existingIndex = files.findIndex(f => f.id === fileData.id);
                
                if (existingIndex >= 0) {
                    files[existingIndex] = fileData;
                } else {
                    files.push(fileData);
                }
                
                chrome.storage.local.set({ files }, () => {
                    resolve(fileData);
                });
            });
        });
    },

    // Get all saved files
    async getFiles() {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['files'], (result) => {
                resolve(result.files || []);
            });
        });
    },

    // Delete a file
    async deleteFile(fileId) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['files', 'summaries'], (result) => {
                const files = result.files || [];
                const summaries = result.summaries || {};
                
                // Remove file from files array
                const updatedFiles = files.filter(f => f.id !== fileId);
                
                // Remove summary if exists
                if (summaries[fileId]) {
                    delete summaries[fileId];
                }
                
                chrome.storage.local.set({ 
                    files: updatedFiles,
                    summaries: summaries
                }, () => {
                    resolve(true);
                });
            });
        });
    },

    // Save file summary
    async saveSummary(fileId, summary) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['summaries'], (result) => {
                const summaries = result.summaries || {};
                summaries[fileId] = summary;
                
                chrome.storage.local.set({ summaries }, () => {
                    resolve(true);
                });
            });
        });
    },

    // Get file summary
    async getSummary(fileId) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['summaries'], (result) => {
                const summaries = result.summaries || {};
                resolve(summaries[fileId] || null);
            });
        });
    },

    // Save chat message
    async saveChatMessage(message) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['chatHistory'], (result) => {
                const chatHistory = result.chatHistory || [];
                chatHistory.push({
                    ...message,
                    timestamp: new Date().toISOString()
                });
                
                chrome.storage.local.set({ chatHistory }, () => {
                    resolve(true);
                });
            });
        });
    },

    // Get chat history
    async getChatHistory() {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['chatHistory'], (result) => {
                resolve(result.chatHistory || []);
            });
        });
    },

    // Clear chat history
    async clearChatHistory() {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.set({ chatHistory: [] }, () => {
                resolve(true);
            });
        });
    }
};

// Export the storage object
export default storage; 