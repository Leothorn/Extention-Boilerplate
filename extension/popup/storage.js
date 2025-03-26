// Storage utilities for Chrome extension using IndexedDB
const storage = {
    // Database properties
    dbName: 'PDFProcessorDB',
    dbVersion: 1,
    db: null,
    initialized: false,
    initPromise: null,

    // Database structure
    stores: {
        files: { name: 'files', keyPath: 'id' },
        summaries: { name: 'summaries', keyPath: 'id' }
    },

    // Initialize the database
    init() {
        if (this.initialized && this.db) return Promise.resolve(this.db);
        
        if (!this.initPromise) {
            console.log('Initializing IndexedDB storage...');
            this.initPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                // Create or upgrade database structure
                request.onupgradeneeded = (event) => {
                    console.log('Creating/upgrading IndexedDB database structure...');
                    const db = event.target.result;
                    
                    // Create object stores if they don't exist
                    if (!db.objectStoreNames.contains(this.stores.files.name)) {
                        db.createObjectStore(this.stores.files.name, { keyPath: this.stores.files.keyPath });
                        console.log(`Created "${this.stores.files.name}" object store`);
                    }
                    
                    if (!db.objectStoreNames.contains(this.stores.summaries.name)) {
                        db.createObjectStore(this.stores.summaries.name, { keyPath: this.stores.summaries.keyPath });
                        console.log(`Created "${this.stores.summaries.name}" object store`);
                    }
                };
                
                // Handle success
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.initialized = true;
                    console.log('IndexedDB storage initialized successfully');
                    resolve(this.db);
                };
                
                // Handle error
                request.onerror = (event) => {
                    console.error('Error initializing IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        }
        
        return this.initPromise;
    },

    // Wait for storage to initialize
    async waitForInit() {
        return this.init();
    },

    // Convert file to ArrayBuffer for storage
    async fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    // Get a store for transaction
    getStore(storeName, mode = 'readonly') {
        const transaction = this.db.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    },

    // Save file metadata and content
    async saveFile(fileData) {
        await this.init();
        
        try {
            console.log('Saving file to IndexedDB:', {
                id: fileData.id,
                name: fileData.name,
                size: fileData.size,
                type: fileData.type,
                hasFile: !!fileData.file,
                fileIsFile: fileData.file instanceof File
            });
            
            // Create a file record with all required data
            const fileRecord = {
                id: fileData.id,
                name: fileData.name,
                size: fileData.size,
                type: fileData.type,
                prompt: fileData.prompt || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // If we have a File object, convert it to ArrayBuffer for storage
            if (fileData.file instanceof File) {
                try {
                    console.log('Converting file to ArrayBuffer for storage...');
                    fileRecord.fileData = await this.fileToArrayBuffer(fileData.file);
                    console.log(`File converted successfully. Size: ${fileRecord.fileData.byteLength} bytes`);
                } catch (error) {
                    console.error('Error converting file:', error);
                    throw new Error('Failed to prepare file for storage: ' + error.message);
                }
            } else if (fileData.fileData) {
                fileRecord.fileData = fileData.fileData;
                console.log('Using provided file data');
            } else {
                console.warn('No file data available for storage');
            }
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.stores.files.name], 'readwrite');
                const store = transaction.objectStore(this.stores.files.name);
                
                // Save file record
                const request = store.put(fileRecord);
                
                request.onsuccess = () => {
                    console.log('File saved to IndexedDB successfully:', fileData.id);
                    resolve(fileRecord);
                };
                
                request.onerror = (event) => {
                    console.error('Error saving file to IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
                
                transaction.oncomplete = () => {
                    console.log('Transaction completed');
                };
                
                transaction.onerror = (event) => {
                    console.error('Transaction error:', event.target.error);
                };
            });
        } catch (error) {
            console.error('Error in saveFile:', error);
            throw error;
        }
    },

    // Get all saved files (without file data for performance)
    async getFiles() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.files.name], 'readonly');
            const store = transaction.objectStore(this.stores.files.name);
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                const files = event.target.result;
                console.log(`Retrieved ${files.length} files from IndexedDB`);
                
                // Return files without the large fileData property for UI listing
                const fileRecords = files.map(file => {
                    const { fileData, ...fileInfo } = file;
                    return {
                        ...fileInfo,
                        hasData: !!fileData,
                        dataSize: fileData ? fileData.byteLength : 0
                    };
                });
                
                resolve(fileRecords);
            };
            
            request.onerror = (event) => {
                console.error('Error retrieving files from IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Get a specific file by id (with full file data)
    async getFile(fileId) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.files.name], 'readonly');
            const store = transaction.objectStore(this.stores.files.name);
            const request = store.get(fileId);
            
            request.onsuccess = (event) => {
                const file = event.target.result;
                if (file) {
                    console.log(`Retrieved file from IndexedDB: ${fileId}`);
                    resolve(file);
                } else {
                    console.log(`File not found in IndexedDB: ${fileId}`);
                    resolve(null);
                }
            };
            
            request.onerror = (event) => {
                console.error('Error retrieving file from IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Delete a file
    async deleteFile(fileId) {
        await this.init();
        
        // Delete both the file and its summary
        const deleteFile = this.deleteFileRecord(fileId);
        const deleteSummary = this.deleteSummary(fileId);
        
        return Promise.all([deleteFile, deleteSummary])
            .then(() => {
                console.log(`File and summary deleted: ${fileId}`);
                return true;
            });
    },

    // Delete just the file record
    async deleteFileRecord(fileId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.files.name], 'readwrite');
            const store = transaction.objectStore(this.stores.files.name);
            const request = store.delete(fileId);
            
            request.onsuccess = () => {
                console.log(`File record deleted from IndexedDB: ${fileId}`);
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Error deleting file from IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Save file summary
    async saveSummary(fileId, summary) {
        await this.init();
        
        const summaryRecord = {
            id: fileId,
            text: summary.text || '',
            prompt: summary.prompt || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.summaries.name], 'readwrite');
            const store = transaction.objectStore(this.stores.summaries.name);
            const request = store.put(summaryRecord);
            
            request.onsuccess = () => {
                console.log(`Summary saved to IndexedDB: ${fileId}`);
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Error saving summary to IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Get file summary
    async getSummary(fileId) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.summaries.name], 'readonly');
            const store = transaction.objectStore(this.stores.summaries.name);
            const request = store.get(fileId);
            
            request.onsuccess = (event) => {
                const summary = event.target.result;
                if (summary) {
                    console.log(`Retrieved summary from IndexedDB: ${fileId}`);
                    resolve(summary);
                } else {
                    console.log(`Summary not found in IndexedDB: ${fileId}`);
                    resolve(null);
                }
            };
            
            request.onerror = (event) => {
                console.error('Error retrieving summary from IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },
    
    // Delete summary
    async deleteSummary(fileId) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.summaries.name], 'readwrite');
            const store = transaction.objectStore(this.stores.summaries.name);
            const request = store.delete(fileId);
            
            request.onsuccess = () => {
                console.log(`Summary deleted from IndexedDB: ${fileId}`);
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Error deleting summary from IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },
    
    // Update prompt for a file
    async updatePrompt(fileId, prompt) {
        await this.init();
        
        // First check if summary exists
        const summary = await this.getSummary(fileId);
        
        if (summary) {
            // Update existing summary
            return this.saveSummary(fileId, {
                ...summary,
                prompt: prompt
            });
        } else {
            // Create new summary with just prompt
            return this.saveSummary(fileId, {
                text: '',
                prompt: prompt
            });
        }
    },

    // Creates a File object from the stored ArrayBuffer
    async createFileFromStorage(fileRecord) {
        if (!fileRecord || !fileRecord.fileData) {
            throw new Error('No file data available');
        }
        
        // Create a new File object from the ArrayBuffer
        return new File(
            [fileRecord.fileData], 
            fileRecord.name, 
            { type: fileRecord.type }
        );
    }
};

// Export the storage object
export default storage; 