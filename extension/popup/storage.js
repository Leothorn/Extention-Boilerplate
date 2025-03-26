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

    // Convert file to data URL for storage
    async fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    // Save file metadata and content
    async saveFile(fileData) {
        await this.init();
        
        try {
            // Convert file to data URL if it's a File object
            let storedFileData = { ...fileData };
            
            // If it's a File object, keep a reference and store data URL
            if (fileData.file instanceof File) {
                storedFileData.data = await this.fileToDataURL(fileData.file);
                // Note: Chrome storage will maintain the actual File reference in memory
                // but it won't be serialized to storage
            }
            
            return new Promise((resolve) => {
                chrome.storage.local.get(['files'], (result) => {
                    const files = result.files || [];
                    const existingIndex = files.findIndex(f => f.id === fileData.id);
                    
                    if (existingIndex >= 0) {
                        files[existingIndex] = storedFileData;
                    } else {
                        files.push(storedFileData);
                    }
                    
                    chrome.storage.local.set({ files }, () => {
                        resolve(storedFileData);
                    });
                });
            });
        } catch (error) {
            console.error('Error saving file:', error);
            throw error;
        }
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

    // Get a specific file by id
    async getFile(fileId) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['files'], (result) => {
                const files = result.files || [];
                const file = files.find(f => f.id === fileId);
                resolve(file || null);
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
    
    // Update prompt for a file
    async updatePrompt(fileId, prompt) {
        await this.init();
        
        return new Promise((resolve) => {
            chrome.storage.local.get(['summaries'], (result) => {
                const summaries = result.summaries || {};
                if (summaries[fileId]) {
                    // Update the prompt while preserving the existing summary
                    summaries[fileId] = {
                        ...summaries[fileId],
                        prompt: prompt
                    };
                } else {
                    // Create a new entry with just the prompt
                    summaries[fileId] = { prompt };
                }
                
                chrome.storage.local.set({ summaries }, () => {
                    resolve(true);
                });
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