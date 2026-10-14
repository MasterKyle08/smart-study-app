document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const processButton = document.getElementById('processButton');
    const filePreviewContainer = document.getElementById('filePreviewContainer');
    const summaryOptionsGroup = document.getElementById('summaryOptionsGroup');
    const quizOptionsGroup = document.getElementById('quizOptionsGroup');
    const pasteNotesInput = document.getElementById('pasteNotesInput');

    if (!dropZone || !fileInput || !processButton || !filePreviewContainer || !summaryOptionsGroup || !quizOptionsGroup) {
        return;
    }

    let filesToProcess = [];
    let pendingVisionFromPdf = [];
    let ocrWorkerPromise = null;
    let ocrStatus = null;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const MAX_FILES=5,MAX_TOTAL_BYTES=30*1024*1024;
    let extractionDeadline=0;
    function checkExtraction(){if(Date.now()>extractionDeadline)throw new Error('Reading took too long. Upload fewer or smaller pages.');}
    async function bounded(promise){const remaining=extractionDeadline-Date.now();if(remaining<=0){checkExtraction();}let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Reading took too long. Upload fewer or smaller pages.')),remaining);})]);}finally{clearTimeout(timer);}}
    const MAX_OCR_PDF_PAGES = 8;
    const MAX_VISION_IMAGES = 3;
    const MIME_FROM_EXT = {
        pdf: 'application/pdf',
        txt: 'text/plain',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const outputFormatCheckboxes = document.querySelectorAll('input[name="outputFormat"]');
    function toggleOptionsVisibility() {
        const summarySelected = document.querySelector('input[name="outputFormat"][value="summary"]').checked;
        const quizSelected = document.querySelector('input[name="outputFormat"][value="quiz"]').checked;
        const allSelected = document.querySelector('input[name="outputFormat"][value="all"]').checked;
        summaryOptionsGroup.classList.toggle('hidden', !(summarySelected || allSelected));
        quizOptionsGroup.classList.toggle('hidden', !(quizSelected || allSelected));
    }
    outputFormatCheckboxes.forEach((checkbox) => checkbox.addEventListener('change', toggleOptionsVisibility));
    toggleOptionsVisibility();

    const defaultQuizTypeCheckbox = document.querySelector('#quizOptionsGroup input[name="quizQuestionTypeOption"][value="multiple_choice"]');
    if (defaultQuizTypeCheckbox) defaultQuizTypeCheckbox.checked = true;
    const defaultQuizNumRadio = document.querySelector('#quizOptionsGroup input[name="quizNumQuestionsOption"][value="ai_choice"]');
    if (defaultQuizNumRadio) defaultQuizNumRadio.checked = true;
    const defaultQuizDifficultyRadio = document.querySelector('#quizOptionsGroup input[name="quizDifficultyOption"][value="medium"]');
    if (defaultQuizDifficultyRadio) defaultQuizDifficultyRadio.checked = true;

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('is-dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));
    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('is-dragover');
        handleFiles(Array.from(event.dataTransfer.files || []));
    });
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', (event) => {
        handleFiles(Array.from(event.target.files || []));
        fileInput.value = '';
    });
    if (pasteNotesInput) {
        pasteNotesInput.addEventListener('input', updateProcessButtonState);
    }

    function getFileType(file) {
        if (file.type && MIME_FROM_EXT[file.name.split('.').pop().toLowerCase()] !== undefined) {
            return file.type;
        }
        if (file.type) return file.type;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        return MIME_FROM_EXT[ext] || '';
    }

    function isValidFile(file) {
        const type = getFileType(file);
        return ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(type) && file.size <= MAX_FILE_SIZE;
    }

    function handleFiles(newFiles) {
        newFiles.forEach((file) => {
            if (isValidFile(file)) {
                if(filesToProcess.length>=MAX_FILES||filesToProcess.reduce((n,item)=>n+item.size,0)+file.size>MAX_TOTAL_BYTES){window.showMessage('processingStatus','Use at most five files totaling 30 MB per upload.','error');return;}
                if (!filesToProcess.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
                    filesToProcess.push(file);
                } else if (typeof window.showMessage === 'function') {
                    window.showMessage('processingStatus', `File "${file.name}" is already added.`, 'error');
                }
            } else if (typeof window.showMessage === 'function') {
                window.showMessage('processingStatus', `Could not add ${file.name}. Use JPG, PNG, PDF, DOCX, or TXT under 10MB.`, 'error');
            }
        });
        renderFilePreviews();
        updateProcessButtonState();
    }

    function renderFilePreviews() {
        filePreviewContainer.innerHTML = '';
        if (filesToProcess.length === 0) {
            filePreviewContainer.classList.add('hidden');
            return;
        }
        filesToProcess.forEach((file, index) => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-chip';
            const label = document.createElement('span');
            label.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.innerHTML = '&times;';
            removeButton.title = 'Remove file';
            removeButton.className = 'file-chip-remove';
            removeButton.addEventListener('click', () => {
                filesToProcess.splice(index, 1);
                renderFilePreviews();
                updateProcessButtonState();
            });
            fileDiv.appendChild(label);
            fileDiv.appendChild(removeButton);
            filePreviewContainer.appendChild(fileDiv);
        });
        filePreviewContainer.classList.remove('hidden');
    }

    function setProgress(percent, label) {
        const wrap = document.getElementById('processingProgress');
        const bar = document.getElementById('processingProgressBar');
        const caption = document.getElementById('processingProgressLabel');
        if (!wrap || !bar) return;
        wrap.classList.remove('hidden');
        bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        if (caption) caption.textContent = label || '';
    }

    function hideProgress() {
        const wrap = document.getElementById('processingProgress');
        if (wrap) wrap.classList.add('hidden');
    }

    async function canvasToVisionImage(canvas) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] };
    }

    async function fileToVisionImage(file) {
        const bitmap = await bounded(createImageBitmap(file));
        try {
        const maxEdge = 1280;
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await canvasToVisionImage(canvas);
        } finally { bitmap.close(); }
    }

    function hasPasteText() {
        return Boolean(pasteNotesInput && pasteNotesInput.value.trim());
    }

    function updateProcessButtonState() {
        processButton.disabled = filesToProcess.length === 0 && !hasPasteText();
    }

    async function createOcrWorker(onStatus) {
        if (typeof Tesseract === 'undefined') {
            throw new Error('The OCR library failed to load. Refresh the page and try again.');
        }
        const logger = (message) => {
            if (!onStatus || !message) return;
            if (message.status === 'recognizing text') {
                onStatus(`Reading image text ${Math.round((message.progress || 0) * 100)}%...`);
            } else if (message.status) {
                onStatus(`OCR: ${message.status}...`);
            }
        };
        return Tesseract.createWorker('eng',1,{logger,workerPath:'/vendor/tesseract.js/worker.min.js',corePath:'/vendor/tesseract.js-core/',langPath:'https://tessdata.projectnaptha.com/4.0.0'});
    }

    async function ocrSource(source, onStatus) {
        ocrStatus = onStatus;
        if (!ocrWorkerPromise) ocrWorkerPromise = createOcrWorker(status => ocrStatus?.(status));
        const worker = await bounded(ocrWorkerPromise);
        try {
            const { data: { text } } = await bounded(worker.recognize(source));
            if((text||'').length>120000)throw new Error('This image exceeds the text limit. Use a smaller image.');
            return text || '';
        } finally {
            ocrStatus = null;
        }
    }

    async function renderPdfPageToCanvas(page) {
        const viewport = page.getViewport({ scale: 1.7 });
        if (viewport.width * viewport.height > 12000000) throw new Error('This PDF page is too large to render safely. Resize it or upload smaller pages.');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await bounded(page.render({ canvasContext: context, viewport }).promise);
        return canvas;
    }

    async function extractTextFromFile(file) {
        const type = getFileType(file);
        if (typeof window.showProcessingStatus === 'function') {
            window.showProcessingStatus('processingStatus', `Extracting text from ${file.name}...`, true);
        }

        if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            if (typeof mammoth === 'undefined') throw new Error('DOCX reader failed to load. Refresh and try again.');
            const arrayBuffer = await file.arrayBuffer();
            window.DocumentLimits.docx(arrayBuffer);
            const images = [];
            const htmlResult = await bounded(mammoth.convertToHtml({ arrayBuffer }, {
                convertImage: mammoth.images.imgElement(async (image) => {
                    if(images.length>=MAX_VISION_IMAGES||!['image/png','image/jpeg','image/webp'].includes(image.contentType))return {src:''};
                    const base64 = await bounded(image.read('base64'));
                    if (images.length < MAX_VISION_IMAGES && ['image/png', 'image/jpeg', 'image/webp'].includes(image.contentType) && base64.length <= 3000000) {
                        images.push({ mimeType: image.contentType || 'image/png', data: base64 });
                    }
                    return { src: `data:${image.contentType};base64,${base64}` };
                }),
            }));
            images.forEach((img) => {
                if (pendingVisionFromPdf.length < MAX_VISION_IMAGES) pendingVisionFromPdf.push(img);
            });
            const textResult = await bounded(mammoth.extractRawText({ arrayBuffer }));
            return (textResult.value || '') + (htmlResult.value && !textResult.value ? htmlResult.value.replace(/<[^>]+>/g, ' ') : '');
        }

        if (type === 'text/plain') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result || '');
                reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
                reader.readAsText(file);
            });
        }

        if (type === 'application/pdf') {
            const pdfjsLib = await window.loadPdfReader();
            if (!pdfjsLib) {
                throw new Error('PDF.js failed to load. Refresh the page and try again.');
            }
            const typedArray = new Uint8Array(await file.arrayBuffer());
            const loadingTask = pdfjsLib.getDocument({ data: typedArray, isEvalSupported: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', maxImageSize: 16000000 });
            try {
                const pdf = await bounded(loadingTask.promise);
                if(pdf.numPages>100)throw new Error('This PDF exceeds 100 pages. Split it into smaller uploads.');
                let fullText = '';
                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                    checkExtraction();
                    if (typeof window.showProcessingStatus === 'function') {
                        window.showProcessingStatus('processingStatus', `Reading PDF page ${pageNumber}/${pdf.numPages}...`, true);
                    }
                    const page = await bounded(pdf.getPage(pageNumber));
                    const textContent = await bounded(page.getTextContent());
                    const pageText = textContent.items.map((item) => item.str).join(' ').trim();
                    fullText += `[Source: ${file.name.replace(/[\]\n]/g,' ')} | Page: ${pageNumber}]\n${pageText}\n`;
                    if(fullText.length>120000)throw new Error('This PDF exceeds the text limit. Split it into smaller uploads.');
                }

                const compact = fullText.replace(/\[Source:[^\]\n]*\]/g,'').replace(/\s+/g, ' ').trim();
                const looksScanned = compact.length < Math.max(80, pdf.numPages * 40);
                if (looksScanned) {
                    const pagesToOcr = Math.min(pdf.numPages, MAX_OCR_PDF_PAGES);
                    let ocrText = '';
                    for (let pageNumber = 1; pageNumber <= pagesToOcr; pageNumber += 1) {
                        if (typeof window.showProcessingStatus === 'function') {
                            window.showProcessingStatus('processingStatus', `Worksheet looks scanned. OCRing PDF page ${pageNumber}/${pagesToOcr}...`, true);
                        }
                        const page = await bounded(pdf.getPage(pageNumber));
                        const canvas = await renderPdfPageToCanvas(page);
                        if (pendingVisionFromPdf.length < MAX_VISION_IMAGES) {
                            try { pendingVisionFromPdf.push(await canvasToVisionImage(canvas)); } catch (_err) { /* OCR still runs */ }
                        }
                        ocrText += `[Source: ${file.name.replace(/[\]\n]/g,' ')} | Page: ${pageNumber}]\n${await ocrSource(canvas, (status) => {
                            if (typeof window.showProcessingStatus === 'function') {
                                window.showProcessingStatus('processingStatus', `Page ${pageNumber}: ${status}`, true);
                            }
                        })}\n`;
                    }
                    if(ocrText.length>120000)throw new Error('Scanned text exceeds the upload limit. Split the PDF.');
                    if (pdf.numPages > MAX_OCR_PDF_PAGES) {
                        ocrText += `\n[Only the first ${MAX_OCR_PDF_PAGES} pages were scanned for handwritten or image-based PDFs.]\n`;
                    }
                    return ocrText;
                }
                return fullText;
            } finally { await loadingTask.destroy(); }
        }

        if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') {
            return ocrSource(file, (status) => {
                if (typeof window.showProcessingStatus === 'function') {
                    window.showProcessingStatus('processingStatus', status, true);
                }
            });
        }

        throw new Error(`Unsupported file type: ${file.name}`);
    }

    processButton.addEventListener('click', async () => {
        if (filesToProcess.length === 0 && !hasPasteText()) {
            if (typeof window.showMessage === 'function') window.showMessage('processingStatus', 'Add a file or paste some notes first.', 'error');
            return;
        }
        const outputFormats = Array.from(document.querySelectorAll('input[name="outputFormat"]:checked')).map((cb) => cb.value);
        if (outputFormats.length === 0) {
            if (typeof window.showMessage === 'function') window.showMessage('processingStatus', 'Select at least one output format.', 'error');
            return;
        }

        const summaryLengthPreference = document.querySelector('input[name="summaryLength"]:checked')?.value || 'medium';
        const summaryStylePreference = document.querySelector('input[name="summaryStyle"]:checked')?.value || 'paragraph';
        const summaryKeywords = document.getElementById('summaryKeywords').value.trim();
        const summaryAudiencePurpose = document.getElementById('summaryAudiencePurpose').value;
        const summaryNegativeKeywords = document.getElementById('summaryNegativeKeywords').value.trim();

        let quizQuestionTypes = Array.from(document.querySelectorAll('#quizOptionsGroup input[name="quizQuestionTypeOption"]:checked')).map((cb) => cb.value);
        if (quizQuestionTypes.length === 0) quizQuestionTypes = ['multiple_choice'];
        const quizNumQuestions = document.querySelector('#quizOptionsGroup input[name="quizNumQuestionsOption"]:checked')?.value || 'ai_choice';
        const quizDifficulty = document.querySelector('#quizOptionsGroup input[name="quizDifficultyOption"]:checked')?.value || 'medium';
        const quizOptions = {
            questionTypes: quizQuestionTypes,
            numQuestions: quizNumQuestions,
            difficulty: quizDifficulty,
        };

        processButton.disabled = true;
        setProgress(8, 'Starting...');
        if (typeof window.showProcessingStatus === 'function') window.showProcessingStatus('processingStatus', 'Starting...', true);
        document.getElementById('resultsSection').classList.add('hidden');
        if (typeof window.clearMessage === 'function') window.clearMessage('processingStatus');
        const explanationOutput = document.getElementById('explanationOutput');
        if (explanationOutput) {
            explanationOutput.classList.add('hidden');
            explanationOutput.innerHTML = '';
        }

        let combinedText = '';
        extractionDeadline=Date.now()+90000;
        let firstFileName = filesToProcess.length > 0 ? filesToProcess[0].name : 'pasted-notes.txt';
        let firstFileType = filesToProcess.length > 0 ? getFileType(filesToProcess[0]) : 'text/plain';
        const visionImages = [];
        pendingVisionFromPdf = [];

        try {
            for (let index = 0; index < filesToProcess.length; index += 1) {
                const file = filesToProcess[index];
                setProgress(12 + Math.round((index / Math.max(filesToProcess.length, 1)) * 40), `Reading ${file.name}...`);
                const text = await extractTextFromFile(file);
                combinedText += `[Source: ${file.name.replace(/[\]\n]/g,' ')}]\n${text}\n\n`;
                if(combinedText.length>120000)throw new Error('These files exceed the text limit. Split them into smaller uploads.');
                const type = getFileType(file);
                if (['image/jpeg', 'image/png', 'image/webp'].includes(type) && visionImages.length < MAX_VISION_IMAGES) {
                    try { visionImages.push(await fileToVisionImage(file)); } catch (_err) { /* keep OCR text */ }
                }
            }
            pendingVisionFromPdf.forEach((image) => {
                if (visionImages.length < MAX_VISION_IMAGES) visionImages.push(image);
            });
            if (hasPasteText()) {
                combinedText += `${pasteNotesInput.value.trim()}\n\n`;
            }

            const readableText=combinedText.replace(/\[Source:[^\]\n]*\]/g,'').replace(/\s+/g,' ').trim();
            if (readableText.length < 20 && !visionImages.length) {
                if (typeof window.showMessage === 'function') {
                    window.showMessage('processingStatus', 'Not enough readable text was found. If this is a photo or scanned worksheet, try a clearer image, or paste the notes instead.', 'error');
                }
                return;
            }

            window.currentExtractedTextForQuiz = combinedText.trim();
            if (combinedText.length > 120000) throw new Error('These notes exceed the upload limit. Split them into smaller uploads for complete coverage.');
            const neededVisionImages = readableText.length < 250 ? visionImages : [];
            setProgress(62, neededVisionImages.length ? 'Sending worksheet image(s) to Gemma 4 vision, then generating materials...' : 'Generating study materials...');
            if (typeof window.showProcessingStatus === 'function') {
                window.showProcessingStatus('processingStatus', neededVisionImages.length
                    ? 'Using Gemma 4 vision (1 extra request) plus generation...'
                    : 'Text extracted. Generating study materials... this can take up to a minute.', true);
            }
            window.currentKeywordsForHighlighting = summaryKeywords.split(',').map((keyword) => keyword.trim()).filter(Boolean);

            const results = await apiProcessContent(
                combinedText.trim(),
                filesToProcess.length > 1 ? 'Multiple files' : firstFileName,
                filesToProcess.length > 1 ? 'application/octet-stream' : firstFileType,
                outputFormats,
                summaryLengthPreference,
                summaryStylePreference,
                summaryKeywords,
                summaryAudiencePurpose,
                summaryNegativeKeywords,
                quizOptions,
                neededVisionImages
            );
            results.extractedText = combinedText.trim();
            results.quizOptions = quizOptions;
            setProgress(100, 'Done');
            if (typeof window.displayResults === 'function') window.displayResults(results);
            if (typeof window.hideProcessingStatus === 'function') window.hideProcessingStatus('processingStatus');
            hideProgress();
            filesToProcess = [];
            renderFilePreviews();
            if (pasteNotesInput) pasteNotesInput.value = '';
        } catch (error) {
            const message = error.data?.message || error.message || 'An error occurred during processing.';
            if (typeof window.showMessage === 'function') window.showMessage('processingStatus', message, 'error');
            hideProgress();
        } finally {
            if (ocrWorkerPromise) {
                ocrWorkerPromise.then(worker=>worker.terminate()).catch(()=>{});
                ocrWorkerPromise = null;
                ocrStatus = null;
            }
            updateProcessButtonState();
        }
    });

    updateProcessButtonState();
});
