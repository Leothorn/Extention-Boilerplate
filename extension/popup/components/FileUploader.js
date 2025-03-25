export class FileUploader {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.setupDropZone();
        this.loadStoredFiles();
    }

    setupDropZone() {
        // Create drop zone
        const dropZone = document.createElement('div');
        dropZone.className = 'drop-zone';
        dropZone.innerHTML = `
            <div class="drop-zone-content">
                <p>Drag and drop PDF or CSV files here</p>
                <p>or</p>
                <input type="file" id="fileInput" accept=".pdf,.csv" multiple>
                <label for="fileInput" class="file-input-label">Select Files</label>
            </div>
            <div class="stored-files"></div>
        `;
        this.container.appendChild(dropZone);

        // Add event listeners
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        // Handle file input
        const fileInput = dropZone.querySelector('#fileInput');
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });
    }

    async handleFiles(files) {
        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.csv')) {
                alert('Only PDF and CSV files are supported');
                continue;
            }

            try {
                // Show processing state
                const fileElement = this.createFileElement(file, 'Processing...');
                this.container.querySelector('.stored-files').appendChild(fileElement);

                // Process file with backend
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('http://localhost:5000/process_file', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    // Store file and analysis
                    await this.storeFile({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        lastModified: file.lastModified,
                        data: await this.readFileAsDataURL(file),
                        analysis: data.analysis
                    });
                    
                    // Update UI with analysis
                    this.updateFileElement(fileElement, file, data.analysis);
                } else {
                    throw new Error(data.error || 'Failed to process file');
                }
            } catch (error) {
                console.error('Error processing file:', error);
                alert(`Error processing ${file.name}: ${error.message}`);
                // Remove failed file element
                fileElement.remove();
            }
        }
        this.loadStoredFiles();
    }

    createFileElement(file, status) {
        const fileElement = document.createElement('div');
        fileElement.className = 'stored-file';
        fileElement.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">${this.formatFileSize(file.size)}</span>
            <span class="file-status">${status}</span>
            <button class="delete-file" data-name="${file.name}">×</button>
        `;
        return fileElement;
    }

    updateFileElement(fileElement, file, analysis) {
        fileElement.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">${this.formatFileSize(file.size)}</span>
            <button class="view-analysis" data-analysis="${encodeURIComponent(analysis)}">View Analysis</button>
            <button class="delete-file" data-name="${file.name}">×</button>
        `;

        // Add view analysis handler
        const viewButton = fileElement.querySelector('.view-analysis');
        viewButton.addEventListener('click', () => {
            this.showAnalysis(analysis, file.name);
        });
    }

    showAnalysis(analysis, fileName) {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'analysis-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Analysis for ${fileName}</h3>
                    <button class="close-modal">×</button>
                </div>
                <div class="modal-body">
                    <pre>${analysis}</pre>
                </div>
            </div>
        `;

        // Add to document
        document.body.appendChild(modal);

        // Add close handler
        const closeButton = modal.querySelector('.close-modal');
        closeButton.addEventListener('click', () => {
            modal.remove();
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async storeFile(fileData) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'storeFile', fileData },
                (response) => {
                    if (response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response.message));
                    }
                }
            );
        });
    }

    async loadStoredFiles() {
        const storedFilesContainer = this.container.querySelector('.stored-files');
        storedFilesContainer.innerHTML = '';

        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getStoredFiles' }, resolve);
        });

        if (response.success) {
            response.files.forEach(file => {
                const fileElement = document.createElement('div');
                fileElement.className = 'stored-file';
                fileElement.innerHTML = `
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${this.formatFileSize(file.size)}</span>
                    <button class="view-analysis" data-analysis="${encodeURIComponent(file.analysis)}">View Analysis</button>
                    <button class="delete-file" data-name="${file.name}">×</button>
                `;
                storedFilesContainer.appendChild(fileElement);

                // Add view analysis handler
                const viewButton = fileElement.querySelector('.view-analysis');
                viewButton.addEventListener('click', () => {
                    this.showAnalysis(file.analysis, file.name);
                });
            });

            // Add delete handlers
            storedFilesContainer.querySelectorAll('.delete-file').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const fileName = e.target.dataset.name;
                    await this.deleteFile(fileName);
                    this.loadStoredFiles();
                });
            });
        }
    }

    async deleteFile(fileName) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'deleteFile', fileName },
                (response) => {
                    if (response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response.message));
                    }
                }
            );
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
} 
} 