document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const processButton = document.getElementById('processButton');
    const filePreviewContainer = document.getElementById('filePreviewContainer');
    const summaryOptionsGroup = document.getElementById('summaryOptionsGroup');
    
    let filesToProcess = []; 

    if (!dropZone || !fileInput || !processButton || !filePreviewContainer || !summaryOptionsGroup) {
        return;
    }

    const outputFormatCheckboxes = document.querySelectorAll('input[name="outputFormat"]');
    function toggleSummaryOptionsVisibility() {
        const summarySelected = document.querySelector('input[name="outputFormat"][value="summary"]').checked;
        const allSelected = document.querySelector('input[name="outputFormat"][value="all"]').checked;
        summaryOptionsGroup.classList.toggle('hidden', !(summarySelected || allSelected));
    }
    outputFormatCheckboxes.forEach(checkbox => checkbox.addEventListener('change', toggleSummaryOptionsVisibility));
    toggleSummaryOptionsVisibility();

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('border-indigo-600', 'bg-indigo-100');
        dropZone.classList.remove('border-indigo-400', 'bg-indigo-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-600', 'bg-indigo-100');
        dropZone.classList.add('border-indigo-400', 'bg-indigo-50');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('border-indigo-600', 'bg-indigo-100');
        dropZone.classList.add('border-indigo-400', 'bg-indigo-50');
        const droppedFiles = Array.from(event.dataTransfer.files);
        handleFiles(droppedFiles);
    });

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
        const selectedFiles = Array.from(event.target.files);
        handleFiles(selectedFiles);
        fileInput.value = '';
    });

    function handleFiles(newFiles) {
        newFiles.forEach(file => {
            if (isValidFile(file)) {
                if (!filesToProcess.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
                    filesToProcess.push(file);
                } else {
                    showMessage('processingStatus', `File "${file.name}" is already added.`, 'error');
                }
            } else {
                showMessage('processingStatus', `Invalid file: ${file.name}. Please upload JPG, PNG, PDF, or TXT files under 10MB.`, 'error');
            }
        });
        renderFilePreviews();
        updateProcessButtonState();
    }

    function isValidFile(file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
        const maxSize = 10 * 1024 * 1024; 
        return allowedTypes.includes(file.type) && file.size <= maxSize;
    }

    function renderFilePreviews() {
        filePreviewContainer.innerHTML = '';
        if (filesToProcess.length === 0) {
            filePreviewContainer.classList.add('hidden');
            return;
        }
        
        filesToProcess.forEach((file, index) => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'bg-slate-100 p-3 rounded-md shadow flex justify-between items-center text-sm text-slate-700';
            fileDiv.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            
            const removeButton = document.createElement('button');
            removeButton.innerHTML = '&times;';
            removeButton.title = 'Remove file';
            removeButton.className = 'ml-3 text-red-500 hover:text-red-700 text-xl leading-none focus:outline-none';
            removeButton.addEventListener('click', () => {
                filesToProcess.splice(index, 1);
                renderFilePreviews();
                updateProcessButtonState();
            });
            
            fileDiv.appendChild(removeButton);
            filePreviewContainer.appendChild(fileDiv);
        });
        filePreviewContainer.classList.remove('hidden');
    }

    function updateProcessButtonState() {
        processButton.disabled = filesToProcess.length === 0;
    }

    async function extractTextFromFile(file) {
        showProcessingStatus(`Extracting text from ${file.name}...`, true);
        
        if (file.type === 'text/plain') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('Error reading TXT file.'));
                reader.readAsText(file);
            });
        } else if (file.type === 'application/pdf') {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library is not loaded.');
            }
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onload = async (e) => {
                    try {
                        const typedArray = new Uint8Array(e.target.result);
                        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            showProcessingStatus(`Processing PDF page ${i}/${pdf.numPages}...`, true);
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                        }
                        resolve(fullText);
                    } catch (err) {
                        reject(new Error('Error processing PDF file. It might be corrupted or password-protected.'));
                    }
                };
                reader.onerror = () => reject(new Error('Error reading PDF file.'));
                reader.readAsArrayBuffer(file);
            });
        } else if (file.type === 'image/jpeg' || file.type === 'image/png') {
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js library is not loaded.');
            }
            try {
                showProcessingStatus(`Initializing OCR for ${file.name}...`, true);
                const worker = await Tesseract.createWorker({
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const progress = (m.progress * 100).toFixed(0);
                            showProcessingStatus(`OCR: Recognizing text ${progress}%...`, true);
                        } else if (m.status) {
                             showProcessingStatus(`OCR Status: ${m.status}...`, true);
                        }
                    }
                });
                showProcessingStatus(`Loading language model (English) for ${file.name}...`, true);
                await worker.loadLanguage('eng');
                await worker.initialize('eng');
                showProcessingStatus(`Performing OCR on ${file.name}...`, true);
                const { data: { text } } = await worker.recognize(file);
                showProcessingStatus(`Terminating OCR worker for ${file.name}...`, true);
                await worker.terminate();
                return text;
            } catch (err) {
                let errorMessage = 'Error performing OCR on image.';
                if (err instanceof Error) {
                    errorMessage += ` Details: ${err.message}`;
                } else if (typeof err === 'string') {
                    errorMessage += ` Details: ${err}`;
                }
                throw new Error(errorMessage);
            }
        } else {
            throw new Error(`Unsupported file type: ${file.type}`);
        }
    }

    processButton.addEventListener('click', async () => {
        if (filesToProcess.length === 0) {
            showMessage('processingStatus', 'Please add files to process.', 'error');
            return;
        }
        const outputFormats = Array.from(document.querySelectorAll('input[name="outputFormat"]:checked')).map(cb => cb.value);
        if (outputFormats.length === 0) {
            showMessage('processingStatus', 'Please select at least one output format.', 'error');
            return;
        }
        
        const summaryLengthPreference = document.querySelector('input[name="summaryLength"]:checked')?.value || 'medium';
        const summaryStylePreference = document.querySelector('input[name="summaryStyle"]:checked')?.value || 'paragraph';
        const summaryKeywords = document.getElementById('summaryKeywords').value.trim();
        const summaryAudiencePurpose = document.getElementById('summaryAudiencePurpose').value;
        const summaryNegativeKeywords = document.getElementById('summaryNegativeKeywords').value.trim();

        processButton.disabled = true;
        showProcessingStatus('Starting processing...', true);
        document.getElementById('resultsSection').classList.add('hidden');
        clearMessage('processingStatus'); 
        const explanationOutput = document.getElementById('explanationOutput');
        if(explanationOutput) {
             explanationOutput.classList.add('hidden');
             explanationOutput.innerHTML = '';
        }

        let combinedText = '';
        let firstFileName = filesToProcess.length > 0 ? filesToProcess[0].name : "document";
        let firstFileType = filesToProcess.length > 0 ? filesToProcess[0].type : "text/plain";

        try {
            for (const file of filesToProcess) {
                const text = await extractTextFromFile(file);
                combinedText += text + "\n\n"; 
            }

            if (combinedText.trim() === "") {
                showMessage('processingStatus', 'No text could be extracted from the selected file(s).', 'error');
                processButton.disabled = false;
                return;
            }
            
            showProcessingStatus('Text extracted. Generating materials with AI...', true);
            window.currentKeywordsForHighlighting = summaryKeywords.split(',').map(k => k.trim()).filter(k => k);

            const results = await apiProcessContent(
                combinedText.trim(),
                filesToProcess.length > 1 ? "Multiple Files" : firstFileName,
                filesToProcess.length > 1 ? "application/octet-stream" : firstFileType,
                outputFormats,
                summaryLengthPreference, 
                summaryStylePreference,
                summaryKeywords, 
                summaryAudiencePurpose,
                summaryNegativeKeywords 
            );
            displayResults(results); 
            hideProcessingStatus();
            filesToProcess = []; 
            renderFilePreviews();
        } catch (error) {
            const message = error.data?.message || error.message || 'An error occurred during processing.';
            showMessage('processingStatus', message, 'error');
            hideProcessingStatus();
        } finally {
            updateProcessButtonState(); 
        }
    });
    updateProcessButtonState();
});
