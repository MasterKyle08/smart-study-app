/**
 * @file public/js/main.js
 * @description Main JavaScript file for index.html. Initializes UI components and event listeners.
 */

document.addEventListener('DOMContentLoaded', () => {
    setupTabs('#resultsSection .tabs'); 

    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const contentElement = document.getElementById(targetId);
            if (contentElement) {
                const textToCopy = (contentElement.tagName === 'TEXTAREA' || contentElement.tagName === 'INPUT') 
                                    ? contentElement.value 
                                    : contentElement.innerText; 
                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                        const originalText = event.target.textContent;
                        event.target.textContent = 'Copied!';
                        setTimeout(() => event.target.textContent = originalText, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy text: ', err);
                        try { 
                            const textArea = document.createElement("textarea");
                            textArea.value = textToCopy;
                            textArea.style.position = "fixed"; 
                            textArea.style.left = "-9999px";
                            textArea.style.top = "0";
                            document.body.appendChild(textArea);
                            textArea.focus(); 
                            textArea.select(); 
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            const originalText = event.target.textContent;
                            event.target.textContent = 'Copied!';
                            setTimeout(() => event.target.textContent = originalText, 1500);
                        } catch (execErr) {
                            console.error('Fallback copy failed: ', execErr);
                            alert('Failed to copy text. Please try manually.');
                        }
                    });
            }
        });
    });

    document.querySelectorAll('.download-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const filename = event.target.dataset.filename || 'download.txt';
            const contentElement = document.getElementById(targetId);
            if (contentElement) {
                const textToDownload = (contentElement.tagName === 'TEXTAREA' || contentElement.tagName === 'INPUT')
                                        ? contentElement.value
                                        : contentElement.innerText; 
                const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; 
                a.download = filename; 
                document.body.appendChild(a);
                a.click(); 
                document.body.removeChild(a); 
                URL.revokeObjectURL(url);
            }
        });
    });
    
    setCurrentYear('currentYear');

    const explainButton = document.getElementById('explainSelectedSummaryTextButton');
    const explanationOutput = document.getElementById('explanationOutput');
    const summaryOutputBox = document.getElementById('summaryOutput'); 
    const resultsSection = document.getElementById('resultsSection'); 
    const summaryTab = document.getElementById('summaryTab'); 

    if (explainButton && explanationOutput && summaryOutputBox && resultsSection && summaryTab) {
        document.addEventListener('selectionchange', () => {
            const selection = document.getSelection();
            if (selection && selection.toString().trim().length > 0 &&
                summaryOutputBox.contains(selection.anchorNode) &&
                summaryOutputBox.contains(selection.focusNode) &&
                !resultsSection.classList.contains('hidden') &&
                summaryTab.classList.contains('active')
            ) {
                explainButton.classList.remove('hidden');
            } else {
                explainButton.classList.add('hidden');
            }
        });
        
        summaryOutputBox.addEventListener('mousedown', () => { 
            // explainButton.classList.add('hidden'); // selectionchange will handle this
            explanationOutput.classList.add('hidden');
            explanationOutput.innerHTML = '';
        });

        explainButton.addEventListener('click', async () => {
            const selectedText = document.getSelection().toString().trim();
            if (!selectedText) {
                explainButton.classList.add('hidden'); 
                return;
            }

            explainButton.disabled = true;
            explainButton.textContent = 'Explaining...';
            explanationOutput.classList.add('hidden'); 
            explanationOutput.innerHTML = ''; 

            try {
                showProcessingStatus('Getting explanation...', true); 
                const { explanation } = await apiExplainSnippet(selectedText);
                explanationOutput.innerHTML = processTextForDisplay(explanation); 
                explanationOutput.classList.remove('hidden');
                hideProcessingStatus(); 
            } catch (error) {
                console.error('Error explaining text:', error);
                explanationOutput.innerHTML = `<p class="error-message">Error: ${error.message || 'Could not get explanation.'}</p>`;
                explanationOutput.classList.remove('hidden');
                showMessage('processingStatus', `Explanation error: ${error.message || 'Could not get explanation.'}`, 'error');
            } finally {
                explainButton.disabled = false;
                explainButton.textContent = 'Explain Selection';
            }
        });
    }
});