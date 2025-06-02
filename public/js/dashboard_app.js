document.addEventListener('DOMContentLoaded', () => {
    const sessionsListContainer = document.getElementById('sessionsList');
    const loadingSessionsMessage = document.getElementById('loadingSessions');
    const sessionDetailModal = document.getElementById('sessionDetailModal');
    const closeModalButton = document.getElementById('closeSessionDetailModalButton');
    const modalTitle = document.getElementById('sessionModalTitle');
    const modalOriginalFilename = document.getElementById('modalOriginalFilename');
    const modalCreatedAt = document.getElementById('modalCreatedAt');
    const modalUpdatedAt = document.getElementById('modalUpdatedAt');
    const modalSummaryOutput = document.getElementById('modalSummaryOutput');
    const modalFlashcardsOutput = document.getElementById('modalFlashcardsOutput');
    const modalQuizOutput = document.getElementById('modalQuizOutput');
    const modalOriginalTextOutput = document.getElementById('modalOriginalTextOutput');
    const regenerateButton = document.getElementById('regenerateButton');
    const regenerateOptionsDiv = document.getElementById('regenerateOptions');
    const confirmRegenerateButton = document.getElementById('confirmRegenerateButton');
    const regenerateStatus = document.getElementById('regenerateStatus');
    const deleteSessionButton = document.getElementById('deleteSessionButton');
    const modalSummaryRegenOptionsDiv = document.getElementById('modalSummaryRegenOptions');
    const modalSummaryKeywordsInput = document.getElementById('modalSummaryKeywords');
    const modalSummaryAudienceSelect = document.getElementById('modalSummaryAudience');
    const modalSummaryNegativeKeywordsInput = document.getElementById('modalSummaryNegativeKeywords');
    const modalExplainButton = document.getElementById('modalExplainSelectedSummaryTextButton');
    const modalExplanationOutput = document.getElementById('modalExplanationOutput');
    const modalExplainInstruction = document.getElementById('modalExplainInstruction'); 

    let currentOpenSessionId = null;
    let currentKeywordsForModalHighlighting = [];

    if (!localStorage.getItem('authToken')) {
        window.location.href = 'index.html'; 
        return; 
    }
    setupTabs('#sessionDetailModal .tabs');

    async function loadUserSessions() {
        if (!sessionsListContainer || !loadingSessionsMessage) return;
        try {
            loadingSessionsMessage.textContent = 'Loading your sessions...';
            loadingSessionsMessage.classList.remove('hidden');
            sessionsListContainer.innerHTML = ''; 

            const response = await apiGetUserSessions(); 
            
            if (response.sessions && response.sessions.length > 0) {
                sessionsListContainer.innerHTML = ''; 
                response.sessions.forEach(session => {
                    sessionsListContainer.appendChild(createSessionCard(session));
                });
            } else {
                sessionsListContainer.innerHTML = '<p class="text-slate-500 col-span-full text-center py-5">You have no saved study sessions yet.</p>';
            }
        } catch (error) {
            const message = error.data?.message || error.message || 'Could not load your sessions. Please try again.';
            sessionsListContainer.innerHTML = `<p class="error-message col-span-full text-center py-5">${message}</p>`;
             if (error.status === 401) { 
                localStorage.removeItem('authToken'); 
                localStorage.removeItem('userEmail');
                window.location.href = 'index.html';
            }
        } finally {
            loadingSessionsMessage.classList.add('hidden');
        }
    }

    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'session-card bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out overflow-hidden cursor-pointer flex flex-col';
        card.dataset.sessionId = session.id;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'p-6 flex-grow';

        const title = document.createElement('h3');
        title.className = 'text-xl font-semibold text-indigo-700 mb-2 truncate';
        title.textContent = session.original_filename || 'Untitled Session';
        contentDiv.appendChild(title);

        const createdP = document.createElement('p');
        createdP.className = 'text-xs text-slate-500 mb-1';
        const createdDate = new Date(session.created_at);
        createdP.innerHTML = `<strong>Created:</strong> ${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        contentDiv.appendChild(createdP);
        
        const summaryPreview = document.createElement('p');
        summaryPreview.className = 'summary-preview text-slate-600 mt-3 text-sm leading-relaxed h-20 overflow-hidden relative';
        summaryPreview.textContent = session.summary ? (session.summary.substring(0, 120) + (session.summary.length > 120 ? '...' : '')) : 'No summary available.';
        const fadeSpan = document.createElement('span');
        fadeSpan.className = 'absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-white to-transparent';
        if (session.summary && session.summary.length > 120) {
            summaryPreview.appendChild(fadeSpan);
        }
        contentDiv.appendChild(summaryPreview);
        card.appendChild(contentDiv);

        const footerDiv = document.createElement('div');
        footerDiv.className = 'bg-slate-50 px-6 py-3 border-t border-slate-200';
        const viewDetailsButton = document.createElement('button');
        viewDetailsButton.className = 'text-sm font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none';
        viewDetailsButton.textContent = 'View Details';
        footerDiv.appendChild(viewDetailsButton);
        card.appendChild(footerDiv);

        card.addEventListener('click', () => openSessionDetailModal(session.id));
        return card;
    }
    
    function renderModalSummary(summaryText, keywordsToHighlight = []) {
        modalSummaryOutput.innerHTML = ''; 
        if(modalExplainInstruction) modalExplainInstruction.classList.add('hidden');

        if (!summaryText) {
            modalSummaryOutput.innerHTML = '<p class="text-slate-500">No summary generated.</p>';
            return;
        }
        
        const lines = summaryText.trim().split('\n');
        let currentSectionDetails = null;
        let sectionContentHtml = '';
        let firstHeadingFound = false;

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('### ')) { 
                firstHeadingFound = true;
                if (currentSectionDetails) { 
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'p-3 border-t border-slate-200';
                    contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsToHighlight);
                    currentSectionDetails.appendChild(contentDiv);
                    modalSummaryOutput.appendChild(currentSectionDetails);
                }
                currentSectionDetails = document.createElement('details');
                currentSectionDetails.className = 'bg-white border border-slate-200 rounded-md mb-3 overflow-hidden';
                currentSectionDetails.open = true; 
                const summaryTitle = document.createElement('summary');
                summaryTitle.className = 'p-3 font-semibold cursor-pointer hover:bg-slate-50 list-none flex justify-between items-center';
                summaryTitle.innerHTML = processTextForDisplay(trimmedLine.substring(4), keywordsToHighlight); 
                currentSectionDetails.appendChild(summaryTitle);
                sectionContentHtml = ''; 
            } else {
                sectionContentHtml += line + '\n';
            }
        });

        if (firstHeadingFound && currentSectionDetails) {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'p-3 border-t border-slate-200';
            contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsToHighlight);
            currentSectionDetails.appendChild(contentDiv);
            modalSummaryOutput.appendChild(currentSectionDetails);
        } else if (sectionContentHtml.trim()) { 
             const currentContentLines = sectionContentHtml.trim().split('\n');
             const isBulleted = currentContentLines.some(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
             if(isBulleted) {
                let firstBulletIdx = currentContentLines.findIndex(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
                const relevantLines = firstBulletIdx !== -1 ? currentContentLines.slice(firstBulletIdx) : [];
                if(relevantLines.length > 0) {
                    const ul = document.createElement('ul');
                    ul.className = 'list-disc list-inside space-y-1';
                    relevantLines.forEach(l => {
                        const trimmedL = l.trim();
                        if (trimmedL.startsWith('* ') || trimmedL.startsWith('- ')) {
                            const li = document.createElement('li');
                            li.innerHTML = processTextForDisplay(trimmedL.substring(2), keywordsToHighlight);
                            ul.appendChild(li);
                        } else if (trimmedL) {
                            const li = document.createElement('li');
                            li.innerHTML = processTextForDisplay(trimmedL, keywordsToHighlight);
                            ul.appendChild(li);
                        }
                    });
                    modalSummaryOutput.appendChild(ul);
                } else { 
                     modalSummaryOutput.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsToHighlight);
                }
             } else {
                modalSummaryOutput.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsToHighlight);
             }
        }
        if (modalSummaryOutput.innerHTML.trim() !== "" && modalExplainInstruction) {
            modalExplainInstruction.classList.remove('hidden');
        }
    }

    async function openSessionDetailModal(sessionId) {
        currentOpenSessionId = sessionId;
        regenerateOptionsDiv.classList.add('hidden'); 
        modalSummaryRegenOptionsDiv.classList.add('hidden');
        clearMessage('regenerateStatus');
        if(modalExplanationOutput) {
             modalExplanationOutput.classList.add('hidden');
             modalExplanationOutput.innerHTML = '';
        }
        if(modalExplainButton) modalExplainButton.classList.add('hidden');
        if(modalExplainInstruction) modalExplainInstruction.classList.add('hidden');

        regenerateOptionsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        modalSummaryKeywordsInput.value = '';
        modalSummaryAudienceSelect.value = '';
        modalSummaryNegativeKeywordsInput.value = '';
        document.querySelector('input[name="modalSummaryLength"][value="medium"]').checked = true;
        document.querySelector('input[name="modalSummaryStyle"][value="paragraph"]').checked = true;

        try {
            showMessage('regenerateStatus', 'Loading session details...', 'success');
            const { session } = await apiGetSessionDetails(sessionId);
            clearMessage('regenerateStatus');

            modalTitle.textContent = session.original_filename || 'Session Details';
            modalOriginalFilename.textContent = session.original_filename || 'N/A';
            modalCreatedAt.textContent = new Date(session.created_at).toLocaleString();
            modalUpdatedAt.textContent = new Date(session.updated_at).toLocaleString();
            
            currentKeywordsForModalHighlighting = []; 
            renderModalSummary(session.summary, currentKeywordsForModalHighlighting);
            renderFlashcards(modalFlashcardsOutput, session.flashcards, currentKeywordsForModalHighlighting); 
            renderQuiz(modalQuizOutput, session.quiz, currentKeywordsForModalHighlighting); 
            modalOriginalTextOutput.textContent = session.extracted_text || 'Original text not available.';
            
            document.querySelectorAll('#sessionDetailModal .tab-link').forEach(tl => tl.removeAttribute('data-active'));
            document.querySelectorAll('#sessionDetailModal .tab-content').forEach(tc => { tc.classList.add('hidden'); tc.removeAttribute('data-active'); });
            
            const firstTabLink = document.querySelector('#sessionDetailModal .tab-link[data-tab="modalSummaryTab"]');
            const firstTabContent = document.getElementById('modalSummaryTab');
            if(firstTabLink) firstTabLink.dataset.active = "true";
            if(firstTabContent) {
                firstTabContent.classList.remove('hidden');
                firstTabContent.dataset.active = "true";
            }
            toggleElementVisibility('sessionDetailModal', true);
        } catch (error) {
            clearMessage('regenerateStatus');
            alert(`Error: ${error.message || 'Could not load session details.'}`);
             if (error.status === 401) { 
                localStorage.removeItem('authToken'); 
                localStorage.removeItem('userEmail'); 
                window.location.href = 'index.html';
            }
        }
    }
    
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            toggleElementVisibility('sessionDetailModal', false);
            currentOpenSessionId = null;
        });
    }
    if (sessionDetailModal) {
         sessionDetailModal.addEventListener('click', (event) => {
            if (event.target === sessionDetailModal) {
                toggleElementVisibility('sessionDetailModal', false);
                currentOpenSessionId = null;
            }
        });
    }

    if (regenerateButton) {
        regenerateButton.addEventListener('click', () => {
            regenerateOptionsDiv.classList.toggle('hidden');
            clearMessage('regenerateStatus');
            if (!document.querySelector('input[name="regenOutputFormat"][value="summary"]').checked) {
                modalSummaryRegenOptionsDiv.classList.add('hidden');
            }
        });
    }
    
    const regenSummaryCheckbox = document.querySelector('input[name="regenOutputFormat"][value="summary"]');
    if (regenSummaryCheckbox) {
        regenSummaryCheckbox.addEventListener('change', (event) => {
            modalSummaryRegenOptionsDiv.classList.toggle('hidden', !event.target.checked);
        });
    }

    if (confirmRegenerateButton) {
        confirmRegenerateButton.addEventListener('click', async () => {
            if (!currentOpenSessionId) return;
            const formatsToRegen = Array.from(regenerateOptionsDiv.querySelectorAll('input[name="regenOutputFormat"]:checked')).map(cb => cb.value);
            if (formatsToRegen.length === 0) { 
                showMessage('regenerateStatus', 'Please select at least one format to regenerate.', 'error');
                return; 
            }

            let slp, ssp, sks, sap, snk; 
            if (formatsToRegen.includes('summary')) {
                slp = document.querySelector('input[name="modalSummaryLength"]:checked')?.value;
                ssp = document.querySelector('input[name="modalSummaryStyle"]:checked')?.value;
                sks = modalSummaryKeywordsInput.value.trim();
                sap = modalSummaryAudienceSelect.value;
                snk = modalSummaryNegativeKeywordsInput.value.trim();
                currentKeywordsForModalHighlighting = sks.split(',').map(k => k.trim()).filter(k => k);
            }

            confirmRegenerateButton.disabled = true; 
            confirmRegenerateButton.textContent = 'Regenerating...';
            showMessage('regenerateStatus', 'Regenerating content, please wait...', 'success');
            if(modalExplanationOutput) modalExplanationOutput.classList.add('hidden');

            try {
                const { updatedSession } = await apiRegenerateSessionContent(
                    currentOpenSessionId, formatsToRegen,
                    slp, ssp, sks, sap, snk
                );
                showMessage('regenerateStatus', 'Content regenerated successfully!', 'success');
                renderModalSummary(updatedSession.summary, currentKeywordsForModalHighlighting);
                renderFlashcards(modalFlashcardsOutput, updatedSession.flashcards, currentKeywordsForModalHighlighting);
                renderQuiz(modalQuizOutput, updatedSession.quiz, currentKeywordsForModalHighlighting);
                modalUpdatedAt.textContent = new Date(updatedSession.updated_at).toLocaleString();
                loadUserSessions(); 
            } catch (error) {
                showMessage('regenerateStatus', `Regeneration failed: ${error.message || 'Unknown error'}`, 'error');
            } finally {
                confirmRegenerateButton.disabled = false; 
                confirmRegenerateButton.textContent = 'Confirm Regeneration';
            }
        });
    }

    if (deleteSessionButton) {
        deleteSessionButton.addEventListener('click', async () => {
            if (!currentOpenSessionId || !confirm(`Are you sure you want to delete this session? This action cannot be undone.`)) return;
            
            deleteSessionButton.disabled = true; 
            deleteSessionButton.textContent = 'Deleting...';
            try {
                await apiDeleteSession(currentOpenSessionId);
                alert('Session deleted successfully.');
                toggleElementVisibility('sessionDetailModal', false); 
                currentOpenSessionId = null;
                loadUserSessions(); 
            } catch (error) {
                alert(`Failed to delete session: ${error.message}`);
            } finally {
                deleteSessionButton.disabled = false; 
                deleteSessionButton.textContent = 'Delete Session';
            }
        });
    }
    
    if (modalSummaryOutput && modalExplainButton && modalExplanationOutput) {
        document.addEventListener('selectionchange', () => { 
            if (sessionDetailModal.classList.contains('hidden') || !document.getElementById('modalSummaryTab')?.dataset.active) {
                if(modalExplainButton) modalExplainButton.classList.add('hidden');
                return;
            }
            const selection = document.getSelection();
            if (selection && selection.toString().trim().length > 0 && modalSummaryOutput.contains(selection.anchorNode) && modalSummaryOutput.contains(selection.focusNode)) {
                if(modalExplainButton) modalExplainButton.classList.remove('hidden');
            } else {
                if(modalExplainButton) modalExplainButton.classList.add('hidden');
            }
        });
        modalSummaryOutput.addEventListener('mousedown', () => { 
            if(modalExplainButton) modalExplainButton.classList.add('hidden');
            if(modalExplanationOutput) {
                modalExplanationOutput.classList.add('hidden');
                modalExplanationOutput.innerHTML = '';
            }
        });
        modalExplainButton.addEventListener('click', async () => {
            const selectedText = document.getSelection().toString().trim();
            if (!selectedText) { if(modalExplainButton) modalExplainButton.classList.add('hidden'); return; }
            modalExplainButton.disabled = true; modalExplainButton.textContent = 'Explaining...';
            modalExplanationOutput.classList.add('hidden'); modalExplanationOutput.innerHTML = '';
            try {
                showMessage('regenerateStatus', 'Getting explanation...', 'success'); 
                const { explanation } = await apiExplainSnippet(selectedText);
                modalExplanationOutput.innerHTML = processTextForDisplay(explanation); 
                modalExplanationOutput.classList.remove('hidden');
                clearMessage('regenerateStatus');
            } catch (error) {
                modalExplanationOutput.innerHTML = `<p class="error-message">Error: ${error.message || 'Could not get explanation.'}</p>`;
                modalExplanationOutput.classList.remove('hidden');
                showMessage('regenerateStatus', `Explanation error: ${error.message || 'Could not get explanation.'}`, 'error');
            } finally {
                modalExplainButton.disabled = false; modalExplainButton.textContent = 'Explain';
            }
        });
    }

    const logoutBtnDashboard = document.getElementById('logoutButton');
    if (logoutBtnDashboard) {
        logoutBtnDashboard.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userEmail');
            window.location.href = 'index.html';
        });
    }

    setCurrentYear('currentYearDashboard');
    loadUserSessions();
});
