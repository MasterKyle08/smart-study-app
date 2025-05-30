/**
 * @file public/js/dashboard_app.js
 * @description JavaScript for the user dashboard (dashboard.html).
 * Handles fetching and displaying user sessions, and interactions within the session detail modal.
 */

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

    let currentOpenSessionId = null; // To store the ID of the session open in the modal

    // Check auth status - redirect if not logged in
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'index.html'; // Redirect to login/main page
        return; // Stop further execution
    }
    
    // Setup tabs for the session detail modal
    setupTabs('#sessionDetailModal .tabs');

    /**
     * Fetches and displays the user's study sessions.
     */
    async function loadUserSessions() {
        if (!sessionsListContainer || !loadingSessionsMessage) return;
        try {
            loadingSessionsMessage.textContent = 'Loading your sessions...';
            loadingSessionsMessage.classList.remove('hidden');
            sessionsListContainer.innerHTML = ''; // Clear previous content before adding loading message back if needed

            const response = await apiGetUserSessions(); // From api.js
            
            if (response.sessions && response.sessions.length > 0) {
                sessionsListContainer.innerHTML = ''; // Clear loading message
                response.sessions.forEach(session => {
                    const card = createSessionCard(session);
                    sessionsListContainer.appendChild(card);
                });
            } else {
                sessionsListContainer.innerHTML = '<p>You have no saved study sessions yet.</p>';
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
            const message = error.data?.message || error.message || 'Could not load your sessions. Please try again.';
            sessionsListContainer.innerHTML = `<p class="error-message">${message}</p>`;
             if (error.status === 401) { // Unauthorized, token might be invalid/expired
                localStorage.removeItem('authToken');
                localStorage.removeItem('userEmail');
                window.location.href = 'index.html'; // Redirect to login
            }
        } finally {
            loadingSessionsMessage.classList.add('hidden');
        }
    }

    /**
     * Creates an HTML card element for a single study session.
     * @param {object} session - The session data.
     * @returns {HTMLElement} The created card element.
     */
    function createSessionCard(session) {
        const card = document.createElement('div');
        card.className = 'session-card';
        card.dataset.sessionId = session.id;

        const title = document.createElement('h3');
        title.textContent = session.original_filename || 'Untitled Session';
        card.appendChild(title);

        const createdDate = new Date(session.created_at).toLocaleDateString();
        const createdTime = new Date(session.created_at).toLocaleTimeString();
        const createdP = document.createElement('p');
        createdP.innerHTML = `<strong>Created:</strong> ${createdDate} ${createdTime}`;
        card.appendChild(createdP);
        
        const summaryPreview = document.createElement('p');
        summaryPreview.className = 'summary-preview';
        summaryPreview.textContent = session.summary ? (session.summary.substring(0, 100) + '...') : 'No summary available.';
        card.appendChild(summaryPreview);

        card.addEventListener('click', () => openSessionDetailModal(session.id));
        return card;
    }

    /**
     * Opens the session detail modal and populates it with data for the given session ID.
     * @param {number} sessionId - The ID of the session to display.
     */
    async function openSessionDetailModal(sessionId) {
        currentOpenSessionId = sessionId;
        regenerateOptionsDiv.classList.add('hidden'); // Hide regen options initially
        clearMessage('regenerateStatus');

        try {
            showProcessingStatus("Loading session details...", true); // Use a generic status indicator
            const { session } = await apiGetSessionDetails(sessionId);
            hideProcessingStatus();

            modalTitle.textContent = session.original_filename || 'Session Details';
            modalOriginalFilename.textContent = session.original_filename || 'N/A';
            modalCreatedAt.textContent = new Date(session.created_at).toLocaleString();
            modalUpdatedAt.textContent = new Date(session.updated_at).toLocaleString();

            modalSummaryOutput.textContent = session.summary || 'No summary generated.';
            renderFlashcards(modalFlashcardsOutput, session.flashcards); // ui.js
            renderQuiz(modalQuizOutput, session.quiz); // ui.js
            modalOriginalTextOutput.textContent = session.extracted_text || 'Original text not available.';
            
            // Reset to the first tab (summary)
            document.querySelectorAll('#sessionDetailModal .tab-link').forEach(tl => tl.classList.remove('active'));
            document.querySelectorAll('#sessionDetailModal .tab-content').forEach(tc => tc.classList.remove('active'));
            document.querySelector('#sessionDetailModal .tab-link[data-tab="modalSummaryTab"]')?.classList.add('active');
            document.getElementById('modalSummaryTab')?.classList.add('active');


            toggleElementVisibility('sessionDetailModal', true);
        } catch (error) {
            hideProcessingStatus();
            console.error(`Failed to load session ${sessionId}:`, error);
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


    // --- Modal Actions ---
    if (regenerateButton) {
        regenerateButton.addEventListener('click', () => {
            regenerateOptionsDiv.classList.toggle('hidden');
            clearMessage('regenerateStatus');
        });
    }

    if (confirmRegenerateButton) {
        confirmRegenerateButton.addEventListener('click', async () => {
            if (!currentOpenSessionId) return;

            const formatsToRegen = Array.from(regenerateOptionsDiv.querySelectorAll('input[name="regenOutputFormat"]:checked'))
                                     .map(cb => cb.value);
            if (formatsToRegen.length === 0) {
                showMessage('regenerateStatus', 'Please select at least one format to regenerate.', 'error');
                return;
            }

            confirmRegenerateButton.disabled = true;
            confirmRegenerateButton.textContent = 'Regenerating...';
            showMessage('regenerateStatus', 'Regenerating content, please wait...', 'success'); // Using success for info style

            try {
                const { updatedSession } = await apiRegenerateSessionContent(currentOpenSessionId, formatsToRegen);
                showMessage('regenerateStatus', 'Content regenerated successfully!', 'success');
                
                // Update modal content with new data
                modalSummaryOutput.textContent = updatedSession.summary || 'No summary generated.';
                renderFlashcards(modalFlashcardsOutput, updatedSession.flashcards);
                renderQuiz(modalQuizOutput, updatedSession.quiz);
                modalUpdatedAt.textContent = new Date(updatedSession.updated_at).toLocaleString();

                // Refresh the main sessions list in the background to reflect update time or content change
                loadUserSessions(); 

            } catch (error) {
                console.error('Regeneration failed:', error);
                showMessage('regenerateStatus', `Regeneration failed: ${error.message}`, 'error');
            } finally {
                confirmRegenerateButton.disabled = false;
                confirmRegenerateButton.textContent = 'Confirm Regeneration';
                regenerateOptionsDiv.classList.add('hidden'); // Hide options after attempt
                // Uncheck boxes
                regenerateOptionsDiv.querySelectorAll('input[name="regenOutputFormat"]:checked').forEach(cb => cb.checked = false);
            }
        });
    }

    if (deleteSessionButton) {
        deleteSessionButton.addEventListener('click', async () => {
            if (!currentOpenSessionId) return;

            if (confirm(`Are you sure you want to delete this session? This action cannot be undone.`)) {
                deleteSessionButton.disabled = true;
                deleteSessionButton.textContent = 'Deleting...';
                try {
                    await apiDeleteSession(currentOpenSessionId);
                    alert('Session deleted successfully.');
                    toggleElementVisibility('sessionDetailModal', false);
                    currentOpenSessionId = null;
                    loadUserSessions(); // Refresh the list
                } catch (error) {
                    console.error('Deletion failed:', error);
                    alert(`Failed to delete session: ${error.message}`);
                } finally {
                    deleteSessionButton.disabled = false;
                    deleteSessionButton.textContent = 'Delete Session';
                }
            }
        });
    }
    
    // Logout button on dashboard
    const logoutBtnDashboard = document.getElementById('logoutButton');
    if (logoutBtnDashboard) {
        logoutBtnDashboard.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userEmail');
            window.location.href = 'index.html';
        });
    }

    // Set current year in footer
    setCurrentYear('currentYearDashboard');

    // Initial load of sessions
    loadUserSessions();
});
