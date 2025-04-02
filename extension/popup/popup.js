import { FileUploader } from './components/FileUploader.js';
import storage from './storage.js';

// API base URL for backend
const API_BASE_URL = 'http://localhost:5001';

// Default prompts for different file types
// Note: Custom prompts are no longer supported - these defaults will always be used
const DEFAULT_PROMPTS = {
    pdf: "Summarize the document and translsate to frnech",
    csv: "Analyze this CSV data and provide insights on the patterns, trends, and key statistics.",
    image: "Describe what you see in this image in detail.",
    default: "Please analyze this file and provide a comprehensive summary."
};

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

// Helper function to download summary as a text file
function downloadSummary(fileId, fileName, summaryText) {
    // Create a blob with the summary text
    const blob = new Blob([summaryText], { type: 'text/plain' });
    
    // Create a temporary anchor element
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `${fileName.replace(/\.[^/.]+$/, '')}_summary.txt`;
    
    // Trigger the download
    document.body.appendChild(downloadLink);
    downloadLink.click();
    
    // Clean up
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadLink.href);
    
    addMessage(`Downloaded summary for ${fileName}`, 'success');
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

// Get default prompt based on file type
function getDefaultPrompt(fileType, fileName) {
    if (fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
        return DEFAULT_PROMPTS.pdf;
    } else if (fileType.includes('csv') || fileName.toLowerCase().endsWith('.csv')) {
        return DEFAULT_PROMPTS.csv;
    } else if (fileType.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
        return DEFAULT_PROMPTS.image;
    }
    return DEFAULT_PROMPTS.default;
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
        
        // Collapsible sections
        const fileColumn = document.getElementById('fileColumn');
        const chatColumn = document.getElementById('chatColumn');
        const toggleFiles = document.getElementById('toggleFiles');
        const toggleChat = document.getElementById('toggleChat');
        
        // Initialize columns as expanded
        fileColumn.classList.add('expanded');
        chatColumn.classList.add('expanded');
        
        // Toggle file section
        toggleFiles.addEventListener('click', (event) => {
            const isExpanded = fileColumn.classList.contains('expanded');
            
            // Toggle classes
            fileColumn.classList.toggle('collapsed');
            fileColumn.classList.toggle('expanded');
            
            // If we're collapsing, make chat expand
            if (isExpanded) {
                chatColumn.classList.add('auto-expand');
            } else {
                chatColumn.classList.remove('auto-expand');
            }
            
            // Ensure the toggle button's focus doesn't interfere with animation
            toggleFiles.blur();
            
            // Prevent event from bubbling to the column
            event.stopPropagation();
        });

        // Toggle chat section
        toggleChat.addEventListener('click', (event) => {
            const isExpanded = chatColumn.classList.contains('expanded');
            
            // Toggle classes
            chatColumn.classList.toggle('collapsed');
            chatColumn.classList.toggle('expanded');
            
            // If we're collapsing, make files expand
            if (isExpanded) {
                fileColumn.classList.add('auto-expand');
            } else {
                fileColumn.classList.remove('auto-expand');
            }
            
            // Ensure the toggle button's focus doesn't interfere with animation
            toggleChat.blur();
            
            // Prevent event from bubbling to the column
            event.stopPropagation();
        });

        // Initialize collapsible functionality
        function setupCollapsibleColumns() {
            // Make entire collapsed panel clickable - BUT exclude the toggle button area
            fileColumn.addEventListener('click', (event) => {
                // Only proceed if the column is collapsed and the click wasn't on/inside the toggle button
                if (fileColumn.classList.contains('collapsed') && 
                    !event.target.closest('.toggle-section')) {
                    toggleFiles.click();
                    event.stopPropagation();
                }
            });
            
            chatColumn.addEventListener('click', (event) => {
                // Only proceed if the column is collapsed and the click wasn't on/inside the toggle button
                if (chatColumn.classList.contains('collapsed') && 
                    !event.target.closest('.toggle-section')) {
                    toggleChat.click();
                    event.stopPropagation();
                }
            });
        }

        // Setup collapsible functionality
        setupCollapsibleColumns();

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

        // Get all file summaries to include in chat context
        async function getAllFileSummaries() {
            try {
                const files = await storage.getFiles();
                const summariesPromises = files.map(async (file) => {
                    const summary = await storage.getSummary(file.id);
                    if (summary && summary.text) {
                        return {
                            id: file.id,
                            name: file.name, 
                            text: summary.text
                        };
                    }
                    return null;
                });
                
                const results = await Promise.all(summariesPromises);
                return results.filter(summary => summary !== null);
            } catch (error) {
                console.error('Error getting file summaries:', error);
                return [];
            }
        }

        // Create a context string with all file summaries
        function createContextWithSummaries(summaries) {
            if (!summaries || summaries.length === 0) {
                return "You are a helpful AI assistant specialized in analyzing documents.";
            }
            
            let context = "You are a helpful AI assistant specialized in analyzing documents. ";
            context += "You have access to the following document summaries:\n\n";
            
            summaries.forEach((summary, index) => {
                context += `DOCUMENT ${index + 1}: ${summary.name}\n`;
                context += `SUMMARY: ${summary.text}\n\n`;
            });
            
            context += "When answering questions, use information from these documents when relevant.";
            return context;
        }

        // Send message on button click
        sendButton.addEventListener('click', async () => {
            const message = userInput.value.trim();
            if (!message) return;
            
            // Add user message to chat
            addMessage(`You: ${message}`, 'user');
            userInput.value = '';
            
            try {
                // Get all file summaries to include in context
                const allFileSummaries = await getAllFileSummaries();
                const contextWithSummaries = createContextWithSummaries(allFileSummaries);
                
                // Send message to API
                const response = await fetch(`${API_BASE_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: message,
                        system_prompt: contextWithSummaries
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
                    statusSpan.className = 'file-status retrieved';
                    fileItem.classList.add('retrieved');
                    
                    // Hide prompt section
                    const promptDiv = fileContainer.querySelector('.file-prompt');
                    if (promptDiv) {
                        promptDiv.style.display = 'none';
                    }

                    // Load and display summary if available
                    const summary = await storage.getSummary(fileData.id);
                    if (summary) {
                        const summaryDiv = fileContainer.querySelector('.file-summary');
                        // Check if summary is an object with text property or just a string
                        const summaryText = typeof summary === 'object' && summary.text ? 
                            summary.text : 
                            (typeof summary === 'string' ? summary : '');
                        
                        // If there's a prompt in the summary, use it
                        if (typeof summary === 'object' && summary.prompt) {
                        const promptInput = fileContainer.querySelector('.prompt-input');
                            if (promptInput) {
                                promptInput.value = summary.prompt;
                            }
                        }
                        
                        // Update the summary textarea if we have text
                        if (summaryText) {
                            const summaryTextarea = summaryDiv.querySelector('.summary-text');
                        summaryTextarea.textContent = summaryText;
                        
                        summaryDiv.style.display = 'block';
                        fileItem.classList.remove('retrieved');
                        fileItem.classList.add('completed');
                        statusSpan.textContent = 'Completed';
                            statusSpan.className = 'file-status completed';
                            
                            // Show download button for completed files
                            const downloadBtn = fileContainer.querySelector('.download-summary');
                            if (downloadBtn) {
                                downloadBtn.style.display = 'inline-flex';
                                downloadBtn.addEventListener('click', () => {
                                    downloadSummary(fileData.id, fileData.name, summaryText);
                                });
                            }
                        }
                    }
                    
                    // Add event listeners to all buttons
                    const applyPromptButton = fileContainer.querySelector('.apply-prompt');
                    if (applyPromptButton) {
                        // Always use default prompt
                        applyPromptButton.addEventListener('click', () => {
                            const defaultPrompt = getDefaultPrompt(fileData.type, fileData.name);
                            reprocessFile(fileData.id, defaultPrompt);
                        });
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
            
            // Set default prompt based on file type
            const defaultPrompt = getDefaultPrompt(fileData.type, fileData.name);
            
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
                    <button class="download-summary" title="Download summary" style="display: none;">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                    </button>
                    <button class="delete-file" title="Delete file">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            `;
            
            // Add prompt section
            const promptDiv = document.createElement('div');
            promptDiv.className = 'file-prompt';
            promptDiv.style.display = 'none'; // Hide the prompt section
            promptDiv.innerHTML = `
                <div class="prompt-header">Custom Prompt:</div>
                <textarea class="prompt-input" placeholder="Enter custom prompt for this file...">${fileData.prompt || defaultPrompt}</textarea>
                <button class="apply-prompt" title="Apply this prompt">Apply Prompt</button>
            `;
            
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'file-summary';
            summaryDiv.innerHTML = `
                <div class="summary-header">Summary:</div>
                <textarea class="summary-text" readonly></textarea>
            `;
            summaryDiv.style.display = 'none';
            
            fileContainer.appendChild(fileItem);
            fileContainer.appendChild(promptDiv);
            fileContainer.appendChild(summaryDiv);

            // Add button handlers
            const deleteButton = fileItem.querySelector('.delete-file');
            deleteButton.addEventListener('click', () => deleteFile(fileData.id));

            const reprocessButton = fileItem.querySelector('.reprocess-file');
            reprocessButton.addEventListener('click', () => {
                const defaultPrompt = getDefaultPrompt(fileData.type, fileData.name);
                reprocessFile(fileData.id, defaultPrompt);
            });
            
            // Add apply prompt button handler (no longer used but keep for compatibility)
            const applyPromptButton = promptDiv.querySelector('.apply-prompt');
            if (applyPromptButton) {
                applyPromptButton.addEventListener('click', () => {
                    const defaultPrompt = getDefaultPrompt(fileData.type, fileData.name);
                    reprocessFile(fileData.id, defaultPrompt);
                });
            }

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

        // Reprocess a file with a custom prompt
        async function reprocessFile(fileId, prompt) {
            try {
                // Get files list for basic metadata
                const files = await storage.getFiles();
                const fileMetadata = files.find(f => f.id === fileId);
                
                if (!fileMetadata) {
                    throw new Error('File not found');
                }
                
                // Get the FULL file data including file content
                const fileData = await storage.getFile(fileId);
                
                if (!fileData) {
                    throw new Error('File data not found in storage');
                }
                
                console.log('Reprocessing file data:', {
                    id: fileData.id,
                    name: fileData.name,
                    size: fileData.size,
                    type: fileData.type,
                    hasFileData: !!fileData.fileData,
                    fileDataLength: fileData.fileData ? fileData.fileData.byteLength : 0
                });
                
                const fileContainer = document.getElementById(`file-${fileId}`);
                const statusSpan = fileContainer.querySelector('.file-status');
                statusSpan.textContent = 'Processing...';
                statusSpan.className = 'file-status processing';
                
                // Check if we have the file data and recreate the File object
                let fileToSend;
                if (fileData.fileData) {
                    console.log('Recreating File from ArrayBuffer');
                    try {
                        // Create a blob from the ArrayBuffer
                        const blob = new Blob([fileData.fileData], {type: fileData.type || 'application/pdf'});
                        fileToSend = new File([blob], fileData.name, { 
                            type: fileData.type || 'application/pdf',
                            lastModified: fileData.lastModified || new Date().getTime()
                        });
                        console.log('File recreated successfully:', {
                            name: fileToSend.name,
                            size: fileToSend.size,
                            type: fileToSend.type
                        });
                    } catch (error) {
                        console.error("Error recreating file from stored data:", error);
                        throw new Error("Could not recreate file from storage. Please upload the file again.");
                    }
                } else {
                    console.error('No file data available in storage record:', fileData);
                    throw new Error("File data not available. Please upload the file again.");
                }
                
                // Process the file with the backend
                const formData = new FormData();
                formData.append('file', fileToSend);
                formData.append('prompt', prompt); // Add custom prompt to FormData
                
                console.log(`Reprocessing file ${fileData.name} with prompt: ${prompt}`);
                
                const response = await fetch(`${API_BASE_URL}/process_file`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Save the summary along with the prompt
                    await storage.saveSummary(fileId, {
                        text: data.analysis.text,
                        prompt: prompt
                    });
                    
                    // Update the UI
                    const summaryDiv = fileContainer.querySelector('.file-summary');
                    const summaryTextarea = summaryDiv.querySelector('.summary-text');
                    summaryTextarea.textContent = data.analysis.text;
                    
                    summaryDiv.style.display = 'block';
                    statusSpan.textContent = 'Completed';
                    statusSpan.className = 'file-status completed';
                    
                    // Show and enable download button
                    const downloadBtn = fileContainer.querySelector('.download-summary');
                    if (downloadBtn) {
                        downloadBtn.style.display = 'inline-flex';
                        downloadBtn.addEventListener('click', () => {
                            downloadSummary(fileId, fileData.name, data.analysis.text);
                        });
                    }
                    
                    addMessage(`File processed: ${fileData.name}`, 'success');
                        } else {
                    statusSpan.textContent = 'Error';
                    statusSpan.className = 'file-status error';
                    addMessage(`Error processing file: ${data.error || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                console.error('Error reprocessing file:', error);
                addMessage(`Error reprocessing file: ${error.message}`, 'error');
                
                const fileContainer = document.getElementById(`file-${fileId}`);
                if (fileContainer) {
                    const statusSpan = fileContainer.querySelector('.file-status');
                    statusSpan.textContent = 'Error';
                    statusSpan.className = 'file-status error';
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
                    
                    // Get default prompt based on file type
                    const defaultPrompt = getDefaultPrompt(file.type, file.name);
                    
                    console.log('Preparing to save file:', { 
                        name: file.name, 
                        size: file.size, 
                        type: file.type,
                        id: fileId
                    });
                    
                    // Create file container first so user sees immediate feedback
                    const fileContainer = createFileContainer({
                        id: fileId,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        prompt: defaultPrompt
                    });
                    
                    fileList.appendChild(fileContainer);
                    
                    // Update status to show it's been uploaded
                    const statusSpan = fileContainer.querySelector('.file-status');
                    statusSpan.textContent = 'Uploaded';
                    statusSpan.className = 'file-status uploaded';
                    
                    // Save file to storage with all required data
                    const savedFileData = await storage.saveFile({
                        id: fileId,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        file: file,
                        prompt: defaultPrompt
                    });
                    
                    console.log('File saved to storage:', {
                        id: savedFileData.id,
                        hasData: !!savedFileData.data,
                        dataLength: savedFileData.data ? savedFileData.data.length : 0
                    });
                    
                    // Get the prompt from the input
                    const promptInput = fileContainer.querySelector('.prompt-input');
                    const prompt = defaultPrompt; // Always use default prompt, ignoring custom input
                    
                    // Process the file with the backend
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('prompt', prompt); // Add the prompt parameter to the form data
                    
                    statusSpan.textContent = 'Processing...';
                    statusSpan.className = 'file-status processing';
                    
                    const response = await fetch(`${API_BASE_URL}/process_file`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        // Save the summary along with the prompt used
                        await storage.saveSummary(fileId, {
                            text: data.analysis.text,
                            prompt: prompt
                        });
                        
                        console.log('File summary saved:', {
                            id: fileId,
                            textLength: data.analysis.text.length,
                prompt: prompt
            });

                        // Update the UI
                        const summaryDiv = fileContainer.querySelector('.file-summary');
                        const summaryTextarea = summaryDiv.querySelector('.summary-text');
                        summaryTextarea.textContent = data.analysis.text;
                        
                        summaryDiv.style.display = 'block';
                        statusSpan.textContent = 'Completed';
                        statusSpan.className = 'file-status completed';
                        
                        // Show and enable download button
                        const downloadBtn = fileContainer.querySelector('.download-summary');
                        if (downloadBtn) {
                            downloadBtn.style.display = 'inline-flex';
                            downloadBtn.addEventListener('click', () => {
                                downloadSummary(fileId, file.name, data.analysis.text);
                            });
                        }
                        
                        addMessage(`File processed: ${file.name}`, 'success');
            } else {
                        statusSpan.textContent = 'Error';
                        statusSpan.className = 'file-status error';
                        addMessage(`Error processing file: ${data.error || 'Unknown error'}`, 'error');
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    addMessage(`Error processing file ${file.name}: ${error.message}`, 'error');
                    
                    // Find the file container and update status
                    const fileContainers = Array.from(fileList.querySelectorAll('.file-container'));
                    const fileContainer = fileContainers.find(container => {
                        const nameSpan = container.querySelector('.file-name');
                        return nameSpan && nameSpan.textContent === file.name;
                    });
                    
                    if (fileContainer) {
                        const statusSpan = fileContainer.querySelector('.file-status');
                        if (statusSpan) {
                            statusSpan.textContent = 'Error';
                            statusSpan.className = 'file-status error';
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Extension initialization error:', error);
        addMessage(`Initialization error: ${error.message}`, 'error');
    }
}); 