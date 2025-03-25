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
                <p>Drag and drop files here</p>
                <p>or</p>
                <input type="file" id="fileInput" multiple>
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
            try {
                const fileData = await this.readFileAsDataURL(file);
                await this.storeFile({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    lastModified: file.lastModified,
                    data: fileData
                });
                this.loadStoredFiles();
            } catch (error) {
                console.error('Error handling file:', error);
                alert(`Error processing ${file.name}: ${error.message}`);
            }
        }
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
                    <button class="delete-file" data-name="${file.name}">×</button>
                `;
                storedFilesContainer.appendChild(fileElement);
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