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
    const modalFlashcardsOutputPlaceholder = document.querySelector('#modalFlashcardsTab .output-box-flashcards-placeholder');
    const modalFlashcardsOutputRaw = document.getElementById('modalFlashcardsOutputRaw');
    const launchFlashcardModalBtnModal = document.getElementById('launchFlashcardModalBtn-modal'); 

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

    const customConfirmModal = document.getElementById('customConfirmModal');
    const customConfirmModalTitle = document.getElementById('customConfirmModalTitle');
    const customConfirmModalMessage = document.getElementById('customConfirmModalMessage');
    const customConfirmModalYes = document.getElementById('customConfirmModalYes');
    const customConfirmModalNo = document.getElementById('customConfirmModalNo');
    let sessionToDeleteId = null;
    let cardElementToDelete = null;


    let currentOpenSessionId = null;
    let currentKeywordsForModalHighlighting = [];
    window.currentDashboardSessionData = null; 

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
            if(loadingSessionsMessage) loadingSessionsMessage.classList.add('hidden');
        }
    }

    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out overflow-hidden flex flex-col';
        card.dataset.sessionId = session.id;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'p-5 sm:p-6 flex-grow';

        const title = document.createElement('h3');
        title.className = 'text-lg sm:text-xl font-semibold text-indigo-700 mb-1.5 sm:mb-2 truncate';
        title.textContent = session.original_filename || 'Untitled Session';
        contentDiv.appendChild(title);

        const createdP = document.createElement('p');
        createdP.className = 'text-xs text-slate-500 mb-1';
        // Assuming session.created_at is like "YYYY-MM-DD HH:MM:SS" (UTC from SQLite)
        // Append 'Z' to ensure it's parsed as UTC by the Date constructor
        const createdDate = new Date(session.created_at.includes('Z') ? session.created_at : session.created_at + 'Z');
        createdP.innerHTML = `<strong>Created:</strong> ${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        contentDiv.appendChild(createdP);
        
        const summaryPreview = document.createElement('p');
        summaryPreview.className = 'text-slate-600 mt-2 sm:mt-3 text-sm leading-relaxed h-16 sm:h-20 overflow-hidden relative';
        summaryPreview.textContent = session.summary ? (session.summary.substring(0, 100) + (session.summary.length > 100 ? '...' : '')) : 'No summary available.';
        const fadeSpan = document.createElement('span');
        fadeSpan.className = 'absolute bottom-0 left-0 w-full h-6 sm:h-8 bg-gradient-to-t from-white to-transparent';
        if (session.summary && session.summary.length > 100) {
            summaryPreview.appendChild(fadeSpan);
        }
        contentDiv.appendChild(summaryPreview);
        card.appendChild(contentDiv);

        const footerDiv = document.createElement('div');
        footerDiv.className = 'bg-slate-50 px-5 sm:px-6 py-2.5 sm:py-3 border-t border-slate-200 flex justify-between items-center';
        
        const viewDetailsButton = document.createElement('button');
        viewDetailsButton.className = 'text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none';
        viewDetailsButton.textContent = 'View Details';
        viewDetailsButton.addEventListener('click', (e) => {
            e.stopPropagation(); 
            openSessionDetailModal(session.id);
        });
        footerDiv.appendChild(viewDetailsButton);

        const deleteCardButton = document.createElement('button');
        deleteCardButton.className = 'text-xs sm:text-sm font-medium text-red-500 hover:text-red-700 focus:outline-none';
        deleteCardButton.textContent = 'Delete';
        deleteCardButton.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            sessionToDeleteId = session.id;
            cardElementToDelete = card;
            if(customConfirmModalTitle) customConfirmModalTitle.textContent = "Delete Session?";
            if(customConfirmModalMessage) customConfirmModalMessage.textContent = `Are you sure you want to delete the session "${session.original_filename || 'Untitled Session'}"? This action cannot be undone.`;
            if(customConfirmModal) toggleElementVisibility('customConfirmModal', true);
        });
        footerDiv.appendChild(deleteCardButton);
        card.appendChild(footerDiv);

        contentDiv.addEventListener('click', () => openSessionDetailModal(session.id));
        title.addEventListener('click', () => openSessionDetailModal(session.id)); 

        return card;
    }

    if(customConfirmModalNo) {
        customConfirmModalNo.addEventListener('click', () => {
            toggleElementVisibility('customConfirmModal', false);
            sessionToDeleteId = null;
            cardElementToDelete = null;
        });
    }

    if(customConfirmModalYes) {
        customConfirmModalYes.addEventListener('click', async () => {
            if (sessionToDeleteId && cardElementToDelete) {
                try {
                    await apiDeleteSession(sessionToDeleteId);
                    cardElementToDelete.remove();
                    if (sessionsListContainer && sessionsListContainer.children.length === 0) {
                        sessionsListContainer.innerHTML = '<p class="text-slate-500 col-span-full text-center py-5">You have no saved study sessions yet.</p>';
                    }
                } catch (error) {
                    showMessage('loadingSessionsMessage', `Failed to delete session: ${error.message}`, 'error'); 
                } finally {
                    toggleElementVisibility('customConfirmModal', false);
                    sessionToDeleteId = null;
                    cardElementToDelete = null;
                }
            }
        });
    }
    
    function renderModalSummary(summaryText, keywordsToHighlight = []) {
        if (!modalSummaryOutput) return;
        modalSummaryOutput.innerHTML = ''; 
        if(modalExplainInstruction) modalExplainInstruction.classList.add('hidden');

        if (!summaryText) {
            modalSummaryOutput.innerHTML = '<p class="text-slate-500 text-sm">No summary generated.</p>';
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
                    contentDiv.className = 'details-accordion-content';
                    contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsToHighlight);
                    currentSectionDetails.appendChild(contentDiv);
                    modalSummaryOutput.appendChild(currentSectionDetails);
                }
                currentSectionDetails = document.createElement('details');
                currentSectionDetails.className = 'details-accordion';
                currentSectionDetails.open = true; 
                const summaryTitle = document.createElement('summary');
                summaryTitle.className = 'details-accordion-summary';
                summaryTitle.innerHTML = processTextForDisplay(trimmedLine.substring(4), keywordsToHighlight); 
                currentSectionDetails.appendChild(summaryTitle);
                sectionContentHtml = ''; 
            } else {
                sectionContentHtml += line + '\n';
            }
        });

        if (firstHeadingFound && currentSectionDetails) {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'details-accordion-content';
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
                    ul.className = 'list-disc list-inside space-y-1 pl-1';
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
        if(regenerateOptionsDiv) regenerateOptionsDiv.classList.add('hidden'); 
        if(modalSummaryRegenOptionsDiv) modalSummaryRegenOptionsDiv.classList.add('hidden');
        if(regenerateStatus) clearMessage('regenerateStatus');
        if(modalExplanationOutput) {
             modalExplanationOutput.classList.add('hidden');
             modalExplanationOutput.innerHTML = '';
        }
        if(modalExplainButton) modalExplainButton.classList.add('hidden');
        if(modalExplainInstruction) modalExplainInstruction.classList.add('hidden');

        if(regenerateOptionsDiv) regenerateOptionsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        if(modalSummaryKeywordsInput) modalSummaryKeywordsInput.value = '';
        if(modalSummaryAudienceSelect) modalSummaryAudienceSelect.value = '';
        if(modalSummaryNegativeKeywordsInput) modalSummaryNegativeKeywordsInput.value = '';
        
        const mediumLengthRadio = document.querySelector('input[name="modalSummaryLength"][value="medium"]');
        if(mediumLengthRadio) mediumLengthRadio.checked = true;
        const paragraphStyleRadio = document.querySelector('input[name="modalSummaryStyle"][value="paragraph"]');
        if(paragraphStyleRadio) paragraphStyleRadio.checked = true;

        try {
            if(regenerateStatus) showMessage('regenerateStatus', 'Loading session details...', 'success');
            const { session } = await apiGetSessionDetails(sessionId);
            window.currentDashboardSessionData = session; 
            if(regenerateStatus) clearMessage('regenerateStatus');

            if(modalTitle) modalTitle.textContent = session.original_filename || 'Session Details';
            if(modalOriginalFilename) modalOriginalFilename.textContent = session.original_filename || 'N/A';
            
            // Ensure timestamps are parsed as UTC before converting to local
            if(modalCreatedAt && session.created_at) modalCreatedAt.textContent = new Date(session.created_at.includes('Z') ? session.created_at : session.created_at + 'Z').toLocaleString();
            if(modalUpdatedAt && session.updated_at) modalUpdatedAt.textContent = new Date(session.updated_at.includes('Z') ? session.updated_at : session.updated_at + 'Z').toLocaleString();
            
            currentKeywordsForModalHighlighting = []; 
            if(modalSummaryOutput) renderModalSummary(session.summary, currentKeywordsForModalHighlighting);
            
            if (session.flashcards && Array.isArray(session.flashcards) && session.flashcards.length > 0) {
                if (modalFlashcardsOutputRaw) modalFlashcardsOutputRaw.value = JSON.stringify(session.flashcards, null, 2);
                if (modalFlashcardsOutputPlaceholder) modalFlashcardsOutputPlaceholder.innerHTML = `<p class="text-slate-600 text-sm">Total ${session.flashcards.length} flashcards. Click "Study These Flashcards" to begin.</p>`;
                if (launchFlashcardModalBtnModal) {
                    launchFlashcardModalBtnModal.classList.remove('hidden');
                    launchFlashcardModalBtnModal.onclick = () => { 
                        const flashcardModalContent = document.getElementById('flashcardModalContent-modal');
                        if (flashcardModalContent && window.currentDashboardSessionData && window.currentDashboardSessionData.flashcards) {
                            renderInteractiveFlashcards(flashcardModalContent, window.currentDashboardSessionData.flashcards, [], 'modal');
                            toggleElementVisibility('flashcardStudyModal-modal', true);
                        } else {
                            alert("No flashcards to study for this session or modal content area not found.");
                        }
                    };
                }
            } else {
                if (modalFlashcardsOutputPlaceholder) modalFlashcardsOutputPlaceholder.innerHTML = '<p class="text-slate-500 text-sm">No flashcards available for this session.</p>';
                if (launchFlashcardModalBtnModal) launchFlashcardModalBtnModal.classList.add('hidden');
                if (modalFlashcardsOutputRaw) modalFlashcardsOutputRaw.value = '';
            }

            if(modalQuizOutput) renderQuiz(modalQuizOutput, session.quiz, currentKeywordsForModalHighlighting); 
            if(modalOriginalTextOutput) modalOriginalTextOutput.textContent = session.extracted_text || 'Original text not available.';
            
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
            if(regenerateStatus) clearMessage('regenerateStatus');
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
            window.currentDashboardSessionData = null;
        });
    }
    if (sessionDetailModal) {
         sessionDetailModal.addEventListener('click', (event) => {
            if (event.target === sessionDetailModal) {
                toggleElementVisibility('sessionDetailModal', false);
                currentOpenSessionId = null;
                window.currentDashboardSessionData = null;
            }
        });
    }
    
     const closeFlashcardStudyModalBtnModal = document.getElementById('closeFlashcardModalBtn-modal');
     if(closeFlashcardStudyModalBtnModal) {
        closeFlashcardStudyModalBtnModal.addEventListener('click', () => {
            toggleElementVisibility('flashcardStudyModal-modal', false);
        });
     }

    if (regenerateButton) {
        regenerateButton.addEventListener('click', () => {
            if(regenerateOptionsDiv) regenerateOptionsDiv.classList.toggle('hidden');
            if(regenerateStatus) clearMessage('regenerateStatus');
            const summaryCheckbox = document.querySelector('input[name="regenOutputFormat"][value="summary"]');
            if (summaryCheckbox && !summaryCheckbox.checked && modalSummaryRegenOptionsDiv) {
                modalSummaryRegenOptionsDiv.classList.add('hidden');
            }
        });
    }
    
    const regenSummaryCheckbox = document.querySelector('input[name="regenOutputFormat"][value="summary"]');
    if (regenSummaryCheckbox && modalSummaryRegenOptionsDiv) {
        regenSummaryCheckbox.addEventListener('change', (event) => {
            modalSummaryRegenOptionsDiv.classList.toggle('hidden', !event.target.checked);
        });
    }

    if (confirmRegenerateButton) {
        confirmRegenerateButton.addEventListener('click', async () => {
            if (!currentOpenSessionId) return;
            const formatsToRegen = Array.from(regenerateOptionsDiv.querySelectorAll('input[name="regenOutputFormat"]:checked')).map(cb => cb.value);
            if (formatsToRegen.length === 0) { 
                if(regenerateStatus) showMessage('regenerateStatus', 'Please select at least one format to regenerate.', 'error');
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
            if(regenerateStatus) showMessage('regenerateStatus', 'Regenerating content, please wait...', 'success');
            if(modalExplanationOutput) modalExplanationOutput.classList.add('hidden');

            try {
                const { updatedSession } = await apiRegenerateSessionContent(
                    currentOpenSessionId, formatsToRegen,
                    slp, ssp, sks, sap, snk
                );
                window.currentDashboardSessionData = updatedSession; 
                if(regenerateStatus) showMessage('regenerateStatus', 'Content regenerated successfully!', 'success');
                if(modalSummaryOutput) renderModalSummary(updatedSession.summary, currentKeywordsForModalHighlighting);
                
                if (updatedSession.flashcards && updatedSession.flashcards.length > 0) {
                    if (modalFlashcardsOutputRaw) modalFlashcardsOutputRaw.value = JSON.stringify(updatedSession.flashcards, null, 2);
                     if (modalFlashcardsOutputPlaceholder) modalFlashcardsOutputPlaceholder.innerHTML = `<p class="text-slate-600 text-sm">Total ${updatedSession.flashcards.length} flashcards. Click "Study These Flashcards" to begin.</p>`;
                    if (launchFlashcardModalBtnModal) launchFlashcardModalBtnModal.classList.remove('hidden');
                } else {
                    if (modalFlashcardsOutputPlaceholder) modalFlashcardsOutputPlaceholder.innerHTML = '<p class="text-slate-500 text-sm">No flashcards available for this session.</p>';
                    if (launchFlashcardModalBtnModal) launchFlashcardModalBtnModal.classList.add('hidden');
                    if (modalFlashcardsOutputRaw) modalFlashcardsOutputRaw.value = '';
                }

                if(modalQuizOutput) renderQuiz(modalQuizOutput, updatedSession.quiz, currentKeywordsForModalHighlighting);
                if(modalUpdatedAt && updatedSession.updated_at) modalUpdatedAt.textContent = new Date(updatedSession.updated_at.includes('Z') ? updatedSession.updated_at : updatedSession.updated_at + 'Z').toLocaleString();
                loadUserSessions(); 
            } catch (error) {
                if(regenerateStatus) showMessage('regenerateStatus', `Regeneration failed: ${error.message || 'Unknown error'}`, 'error');
            } finally {
                confirmRegenerateButton.disabled = false; 
                confirmRegenerateButton.textContent = 'Confirm Regeneration';
            }
        });
    }

    if (deleteSessionButton) { 
        deleteSessionButton.addEventListener('click', async () => {
            if (!currentOpenSessionId) return; 
            
            sessionToDeleteId = currentOpenSessionId; 
            cardElementToDelete = document.querySelector(`.bg-white[data-session-id="${currentOpenSessionId}"]`); 
            
            if(customConfirmModalTitle) customConfirmModalTitle.textContent = "Delete Session?";
            const sessionData = window.currentDashboardSessionData || { original_filename: 'this session' };
            if(customConfirmModalMessage) customConfirmModalMessage.textContent = `Are you sure you want to delete the session "${sessionData.original_filename || 'Untitled Session'}"? This action cannot be undone.`;
            if(customConfirmModal) toggleElementVisibility('customConfirmModal', true);
        });
    }
    
    if (modalSummaryOutput && modalExplainButton && modalExplanationOutput) {
        document.addEventListener('selectionchange', () => { 
            const modalSummaryTab = document.getElementById('modalSummaryTab');
            if (!sessionDetailModal || sessionDetailModal.dataset.visible !== 'true' || !modalSummaryTab || modalSummaryTab.dataset.active !== 'true') {
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
                if(regenerateStatus) showMessage('regenerateStatus', 'Getting explanation...', 'success'); 
                const { explanation } = await apiExplainSnippet(selectedText);
                modalExplanationOutput.innerHTML = processTextForDisplay(explanation); 
                modalExplanationOutput.classList.remove('hidden');
                if(regenerateStatus) clearMessage('regenerateStatus');
            } catch (error) {
                modalExplanationOutput.innerHTML = `<p class="error-message p-3 rounded-md">Error: ${error.message || 'Could not get explanation.'}</p>`;
                modalExplanationOutput.classList.remove('hidden');
                if(regenerateStatus) showMessage('regenerateStatus', `Explanation error: ${error.message || 'Could not get explanation.'}`, 'error');
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
