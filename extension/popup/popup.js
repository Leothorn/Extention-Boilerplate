import { FileUploader } from './components/FileUploader.js';
import storage from './storage.js';

// API base URL for backend
const API_BASE_URL = 'http://localhost:5001';

// Test connection to backend
async function testConnection() {
    try {
        console.log('Testing connection to backend...');
        console.log('API URL:', `${API_BASE_URL}/test-connection`);
        
        const response = await fetch(`${API_BASE_URL}/test-connection`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors'
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Connection test failed:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Connection test response:', data);
        return data.status === 'connected';
    } catch (error) {
        console.error('Connection test failed with error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        return false;
    }
}

// Helper function to format file size
function formatFileSize(size) {
    if (size < 1024) return size + ' B';
    else if (size < 1048576) return (size / 1024).toFixed(1) + ' KB';
    else if (size < 1073741824) return (size / 1048576).toFixed(1) + ' MB';
    else return (size / 1073741824).toFixed(1) + ' GB';
}

// Helper function to add a message to the chat
function addMessage(message, type = 'info') {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Wait for storage to initialize
        await storage.waitForInit();
        
        // Get DOM elements
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const fileList = document.getElementById('fileList');
        const chatMessages = document.getElementById('chatMessages');
        const userInput = document.getElementById('userInput');
        const sendButton = document.getElementById('sendButton');

        // Test connection to backend
        const isConnected = await testConnection();
        if (isConnected) {
            addMessage('Connected to backend server', 'success');
        } else {
            addMessage('Failed to connect to backend server. Make sure it is running.', 'error');
        }

        // Load saved files and summaries
        await loadSavedFiles();

        // Handle file selection via click
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        // Handle file selection via drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        // Handle file input change
        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });

        // Send message on button click
        sendButton.addEventListener('click', async () => {
            const message = userInput.value.trim();
            if (!message) return;
            
            // Add user message to chat
            addMessage(`You: ${message}`, 'user');
            userInput.value = '';
            
            try {
                // Send message to API
                const response = await fetch(`${API_BASE_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: message,
                        system_prompt: "You are a helpful AI assistant specialized in analyzing documents."
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    addMessage(`Assistant: ${data.response}`, 'assistant');
                } else {
                    addMessage(`Error: ${data.error || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                addMessage(`Error: ${error.message}`, 'error');
            }
        });

        // Load saved files and their summaries
        async function loadSavedFiles() {
            try {
                const files = await storage.getFiles();
                files.forEach(async (fileData) => {
                    const fileContainer = createFileContainer(fileData);
                    fileList.appendChild(fileContainer);
                    
                    // Update status to "Retrieved"
                    const fileItem = fileContainer.querySelector('.file-item');
                    const statusSpan = fileItem.querySelector('.file-status');
                    statusSpan.textContent = 'Retrieved';
                    fileItem.classList.add('retrieved');

                    // Load and display summary if available
                    const summary = await storage.getSummary(fileData.id);
                    if (summary) {
                        const summaryDiv = fileContainer.querySelector('.file-summary');
                        const summaryText = typeof summary === 'object' ? summary.text : summary;
                        
                        // Update the summary textarea
                        const summaryTextarea = fileContainer.querySelector('.summary-text');
                        summaryTextarea.textContent = summaryText;
                        
                        summaryDiv.style.display = 'block';
                        fileItem.classList.remove('retrieved');
                        fileItem.classList.add('completed');
                        statusSpan.textContent = 'Completed';
                    }
                });
            } catch (error) {
                console.error('Error loading saved files:', error);
                addMessage('Error loading saved files', 'error');
            }
        }

        // Create file container
        function createFileContainer(fileData) {
            const fileContainer = document.createElement('div');
            fileContainer.className = 'file-container';
            fileContainer.id = `file-${fileData.id}`;
            fileContainer.dataset.fileId = fileData.id;
            
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-name">${fileData.name}</span>
                <span class="file-size">${formatFileSize(fileData.size)}</span>
                <span class="file-status">Pending</span>
                <div class="file-actions">
                    <button class="reprocess-file" title="Reprocess file">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                        </svg>
                    </button>
                    <button class="delete-file" title="Delete file">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            `;
            
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'file-summary';
            summaryDiv.innerHTML = `
                <div class="summary-header">Summary:</div>
                <textarea class="summary-text" readonly></textarea>
            `;
            summaryDiv.style.display = 'none';
            
            fileContainer.appendChild(fileItem);
            fileContainer.appendChild(summaryDiv);

            // Add button handlers
            const deleteButton = fileItem.querySelector('.delete-file');
            deleteButton.addEventListener('click', () => deleteFile(fileData.id));

            const reprocessButton = fileItem.querySelector('.reprocess-file');
            reprocessButton.addEventListener('click', () => reprocessFile(fileData.id));

            return fileContainer;
        }

        // Delete a file
        async function deleteFile(fileId) {
            try {
                await storage.deleteFile(fileId);
                const fileContainer = document.getElementById(`file-${fileId}`);
                if (fileContainer) {
                    fileContainer.remove();
                }
                addMessage('File deleted', 'info');
            } catch (error) {
                console.error('Error deleting file:', error);
                addMessage('Error deleting file', 'error');
            }
        }

        // Reprocess a file
        async function reprocessFile(fileId) {
            try {
                const files = await storage.getFiles();
                const fileData = files.find(f => f.id === fileId);
                
                if (!fileData) {
                    throw new Error('File not found');
                }
                
                const fileContainer = document.getElementById(`file-${fileId}`);
                const statusSpan = fileContainer.querySelector('.file-status');
                statusSpan.textContent = 'Processing...';
                
                // Process the file with the backend
                const formData = new FormData();
                formData.append('file', fileData.file);
                
                const response = await fetch(`${API_BASE_URL}/process_file`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Save the summary
                    await storage.saveSummary(fileId, data.analysis);
                    
                    // Update the UI
                    const summaryDiv = fileContainer.querySelector('.file-summary');
                    const summaryTextarea = summaryDiv.querySelector('.summary-text');
                    summaryTextarea.textContent = data.analysis.text;
                    
                    summaryDiv.style.display = 'block';
                    statusSpan.textContent = 'Completed';
                    
                    addMessage(`File processed: ${fileData.name}`, 'success');
                } else {
                    statusSpan.textContent = 'Error';
                    addMessage(`Error processing file: ${data.error || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                console.error('Error reprocessing file:', error);
                addMessage(`Error reprocessing file: ${error.message}`, 'error');
                
                const fileContainer = document.getElementById(`file-${fileId}`);
                if (fileContainer) {
                    const statusSpan = fileContainer.querySelector('.file-status');
                    statusSpan.textContent = 'Error';
                }
            }
        }

        // Handle file uploads
        async function handleFiles(files) {
            if (!files || files.length === 0) return;
            
            // Check connection first
            const isConnected = await testConnection();
            if (!isConnected) {
                addMessage('Cannot process files: not connected to backend server', 'error');
                return;
            }
            
            addMessage(`Processing ${files.length} file(s)...`, 'info');
            
            // Process each file
            for (const file of Array.from(files)) {
                try {
                    // Create a unique ID for the file
                    const fileId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    
                    // Save file to storage
                    await storage.saveFile({
                        id: fileId,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        file: file
                    });
                    
                    // Create UI for the file
                    const fileContainer = createFileContainer({
                        id: fileId,
                        name: file.name,
                        size: file.size,
                        type: file.type
                    });
                    
                    fileList.appendChild(fileContainer);
                    
                    // Process the file with the backend
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const statusSpan = fileContainer.querySelector('.file-status');
                    statusSpan.textContent = 'Processing...';
                    
                    const response = await fetch(`${API_BASE_URL}/process_file`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        // Save the summary
                        await storage.saveSummary(fileId, data.analysis);
                        
                        // Update the UI
                        const summaryDiv = fileContainer.querySelector('.file-summary');
                        const summaryTextarea = summaryDiv.querySelector('.summary-text');
                        summaryTextarea.textContent = data.analysis.text;
                        
                        summaryDiv.style.display = 'block';
                        statusSpan.textContent = 'Completed';
                        
                        addMessage(`File processed: ${file.name}`, 'success');
                    } else {
                        statusSpan.textContent = 'Error';
                        addMessage(`Error processing file: ${data.error || 'Unknown error'}`, 'error');
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    addMessage(`Error processing file ${file.name}: ${error.message}`, 'error');
                }
            }
        }
    } catch (error) {
        console.error('Extension initialization error:', error);
        addMessage(`Initialization error: ${error.message}`, 'error');
    }
}); 