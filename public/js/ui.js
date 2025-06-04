// Smart Study UI Script - Merged Version
// Combines features from old_ui.js (detailed flashcards) and new_ui.js (quiz system, UI enhancements)
console.log("Smart Study UI Script Loaded - Version: MERGED_FLASHCARD_QUIZ_1.0");

// --- Global Variables ---
// For Flashcards (primarily from old_ui.js)
let currentFlashcardIndex = 0;
let allFlashcardsData = [];
let currentFlashcardChatHistory = [];
let flashcardContext = 'main'; // Used by old_ui.js flashcard system
let markedForReview = []; // Used by old_ui.js flashcard system
let flashcardStates = {}; // Used by old_ui.js flashcard system

// For Quiz (primarily from new_ui.js)
window.currentQuizData = null;
window.currentQuizQuestionIndex = 0;
window.userQuizAnswers = [];
window.quizQuestionStates = [];
window.currentQuizOptions = {
    questionTypes: ['multiple_choice'],
    numQuestions: 'ai_choice',
    difficulty: 'medium'
};
window.currentQuizTextContext = "";
window.originalFullQuizData = null;

// General state variables
window.lastProcessedResults = null; // Holds the latest results from processing
window.currentKeywordsForHighlighting = []; // Keywords for highlighting in text
window.currentExtractedTextForQuiz = ""; // Extracted text specifically for quiz generation

// --- UI Helper Functions (Merged) ---

/**
 * Toggles the visibility of an HTML element.
 * Handles modals differently based on the presence of a 'group' class.
 * Origin: old_ui.js (more comprehensive with forceShow and modal distinction)
 * @param {string} elementId - The ID of the element to toggle.
 * @param {boolean} [forceShow] - If true, shows the element; if false, hides it. If undefined, toggles.
 */
function toggleElementVisibility(elementId, forceShow) {
    const element = document.getElementById(elementId);
    if (element) {
        // Check if the element is a modal (e.g., flashcard study modal)
        // This specific check for 'group' class was in old_ui.js, assuming it's for Tailwind group components or similar.
        const isModal = element.classList.contains('group');
        if (isModal) {
            if (typeof forceShow === 'boolean') {
                element.dataset.visible = forceShow ? 'true' : 'false';
                // Typically, modals might have their own visibility classes or rely on JS to show/hide
                // Forcing Tailwind's hidden class based on forceShow
                element.classList.toggle('hidden', !forceShow);
            } else {
                const currentlyVisible = element.dataset.visible === 'true';
                element.dataset.visible = currentlyVisible ? 'false' : 'true';
                element.classList.toggle('hidden');
            }
        } else {
            // For non-modal elements
            if (typeof forceShow === 'boolean') {
                element.classList.toggle('hidden', !forceShow);
            } else {
                element.classList.toggle('hidden');
            }
        }
    }
}

/**
 * Displays a message to the user.
 * Origin: new_ui.js (more styling options, duration)
 * @param {string} elementId - The ID of the element where the message will be shown.
 * @param {string} message - The message text.
 * @param {'success' | 'error' | 'warning'} [type='success'] - The type of message.
 * @param {number} [duration=0] - How long to display the message in ms (0 for indefinite).
 */
function showMessage(elementId, message, type = 'success', duration = 0) {
    const element = document.getElementById(elementId);
    if (element) {
        // Reset classes first
        element.className = 'p-3 rounded-md shadow-sm text-sm font-medium block my-2'; // Added block and margin
        if (type === 'error') {
            element.classList.add('bg-red-100', 'border', 'border-red-300', 'text-red-700');
        } else if (type === 'warning') {
            element.classList.add('bg-yellow-100', 'border', 'border-yellow-300', 'text-yellow-700');
        } else { // success
            element.classList.add('bg-green-100', 'border', 'border-green-300', 'text-green-700');
        }
        element.textContent = message;
        element.classList.remove('hidden');

        if (duration > 0) {
            setTimeout(() => clearMessage(elementId), duration);
        }
    }
}

/**
 * Clears a message displayed by showMessage.
 * Origin: new_ui.js
 * @param {string} elementId - The ID of the message element.
 */
function clearMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = '';
        element.className = ''; // Clear all classes
        element.classList.add('hidden'); // Add hidden back
    }
}

/**
 * Shows a processing status message.
 * Origin: new_ui.js (generic elementId)
 * @param {string} elementId - The ID of the status element.
 * @param {string} message - The status message.
 * @param {boolean} [showSpinner=false] - Whether to show a spinner.
 */
function showProcessingStatus(elementId, message, showSpinner = false) {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.innerHTML = `${message}${showSpinner ? ' <div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 ml-2 align-middle"></div>' : ''}`;
        statusElement.className = 'p-3 rounded-md shadow-sm text-sm font-medium bg-blue-50 border border-blue-200 text-blue-700 my-2'; // Added margin
        statusElement.classList.remove('hidden');
    }
}

/**
 * Hides a processing status message.
 * Origin: new_ui.js
 * @param {string} elementId - The ID of the status element.
 */
function hideProcessingStatus(elementId) {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.classList.add('hidden');
        statusElement.innerHTML = '';
    }
}

/**
 * Sets the current year in a given HTML element.
 * Origin: Both files (identical)
 * @param {string} elementId - The ID of the element (e.g., a span).
 */
function setCurrentYear(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = new Date().getFullYear();
    }
}

/**
 * Sets up tab navigation for a given container.
 * Origin: new_ui.js (more robust with disabled state handling)
 * @param {string} tabLinkContainerSelector - CSS selector for the container of tab links.
 */
function setupTabs(tabLinkContainerSelector) {
    const tabLinkContainer = document.querySelector(tabLinkContainerSelector);
    if (!tabLinkContainer) return;

    const tabLinks = Array.from(tabLinkContainer.querySelectorAll('.tab-link'));

    tabLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            if (link.classList.contains('opacity-50') || link.disabled) {
                event.preventDefault();
                return;
            }
            const targetId = link.dataset.tab;

            // Deactivate all tabs and hide their content
            tabLinks.forEach(tl => tl.removeAttribute('data-active'));
            tabLinks.forEach(tlInner => {
                const contentId = tlInner.dataset.tab;
                const contentEl = document.getElementById(contentId);
                if (contentEl) {
                    contentEl.classList.add('hidden');
                    contentEl.removeAttribute('data-active');
                }
            });

            // Activate the clicked tab and show its content
            link.dataset.active = "true";
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.dataset.active = "true";
            }
        });
    });
}

/**
 * Processes text for display, escaping HTML, applying markdown (strong, em), and highlighting keywords.
 * Origin: old_ui.js (more feature-rich: handles markdown)
 * @param {string} text - The text to process.
 * @param {string[]} [keywordsToHighlight=[]] - An array of keywords to highlight.
 * @returns {string} Processed HTML string.
 */
function processTextForDisplay(text, keywordsToHighlight = []) {
    if (!text) return '';
    let escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // Apply simple markdown: **bold** and *italic*
    let html = escapedText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');

    if (keywordsToHighlight && keywordsToHighlight.length > 0) {
        keywordsToHighlight.forEach(keyword => {
            if (keyword) { // Ensure keyword is not empty or null
                const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
                const regex = new RegExp(`(${escapedKeyword})`, 'gi');
                html = html.replace(regex, (match) => `<span class="highlighted-keyword">${match}</span>`);
            }
        });
    }
    return html;
}

/**
 * Updates navigation elements based on login state.
 * Origin: new_ui.js (slightly cleaner implementation)
 * @param {boolean} isLoggedIn - Whether the user is logged in.
 * @param {string} [userEmail=''] - The user's email if logged in.
 */
function updateNav(isLoggedIn, userEmail = '') {
    const loginNavButton = document.getElementById('loginNavButton');
    const registerNavButton = document.getElementById('registerNavButton');
    const dashboardNavButton = document.getElementById('dashboardNavButton');
    const logoutNavButton = document.getElementById('logoutNavButton');
    const userActionsSection = document.getElementById('userActions'); // From old_ui.js, ensure it exists or is handled
    const userEmailSpan = document.getElementById('userEmail');

    if (isLoggedIn) {
        if (loginNavButton) loginNavButton.classList.add('hidden');
        if (registerNavButton) registerNavButton.classList.add('hidden');
        if (dashboardNavButton) dashboardNavButton.classList.remove('hidden');
        if (logoutNavButton) logoutNavButton.classList.remove('hidden');
        if (userActionsSection) userActionsSection.classList.remove('hidden'); // Kept from old_ui.js logic
        if (userEmailSpan) userEmailSpan.textContent = userEmail;
    } else {
        if (loginNavButton) loginNavButton.classList.remove('hidden');
        if (registerNavButton) registerNavButton.classList.remove('hidden');
        if (dashboardNavButton) dashboardNavButton.classList.add('hidden');
        if (logoutNavButton) logoutNavButton.classList.add('hidden');
        if (userActionsSection) userActionsSection.classList.add('hidden'); // Kept from old_ui.js logic
        if (userEmailSpan) userEmailSpan.textContent = '';
    }
}


// --- Results Display and Core Logic (Merged) ---

/**
 * Renders the summary text, potentially with accordions for sections.
 * Origin: new_ui.js (similar to summary part of old_ui.js displayResults)
 * @param {HTMLElement} container - The HTML element to render the summary into.
 * @param {string} summaryText - The summary text.
 */
function renderSummary(container, summaryText) {
    if (!container || !summaryText) {
        if(container) container.innerHTML = '<p class="text-slate-500 text-sm p-4">No summary available.</p>';
        return;
    }

    const lines = summaryText.trim().split('\n');
    let currentSectionDetails = null;
    let sectionContentHtml = '';
    let firstHeadingFound = false;

    container.innerHTML = ''; // Clear previous summary

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('### ')) { // Markdown H3 for section titles
            firstHeadingFound = true;
            if (currentSectionDetails) { // Append previous section
                const contentDiv = document.createElement('div');
                contentDiv.className = 'details-accordion-content'; // Style for content within <details>
                contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
                currentSectionDetails.appendChild(contentDiv);
                container.appendChild(currentSectionDetails);
            }
            // Start new section
            currentSectionDetails = document.createElement('details');
            currentSectionDetails.className = 'details-accordion'; // Style for <details>
            currentSectionDetails.open = true; // Default to open
            const summaryTitle = document.createElement('summary');
            summaryTitle.className = 'details-accordion-summary'; // Style for <summary>
            summaryTitle.innerHTML = processTextForDisplay(trimmedLine.substring(4), window.currentKeywordsForHighlighting || []);
            currentSectionDetails.appendChild(summaryTitle);
            sectionContentHtml = ''; // Reset content for new section
        } else {
            sectionContentHtml += line + '\n';
        }
    });

    // Append the last section or the whole text if no headings
    if (firstHeadingFound && currentSectionDetails) {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'details-accordion-content';
        contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
        currentSectionDetails.appendChild(contentDiv);
        container.appendChild(currentSectionDetails);
    } else if (sectionContentHtml.trim()) { // If no "###" headings, display as plain text or bulleted list
        const currentContentLines = sectionContentHtml.trim().split('\n');
        const isBulleted = currentContentLines.some(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));

        if (isBulleted) {
            let firstBulletIdx = currentContentLines.findIndex(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
            const relevantLines = firstBulletIdx !== -1 ? currentContentLines.slice(firstBulletIdx) : currentContentLines; // Use all if no bullet found but still marked as bulleted

            if (relevantLines.length > 0) {
                const ul = document.createElement('ul');
                ul.className = 'list-disc list-inside space-y-1 pl-1';
                relevantLines.forEach(l => {
                    const trimmedL = l.trim();
                    if (trimmedL.startsWith('* ') || trimmedL.startsWith('- ')) {
                        const li = document.createElement('li');
                        li.innerHTML = processTextForDisplay(trimmedL.substring(2), window.currentKeywordsForHighlighting || []);
                        ul.appendChild(li);
                    } else if (trimmedL) { // Handle lines that might not start with a bullet but are part of the list
                        const li = document.createElement('li');
                        li.innerHTML = processTextForDisplay(trimmedL, window.currentKeywordsForHighlighting || []);
                        ul.appendChild(li);
                    }
                });
                container.appendChild(ul);
            } else { // Fallback if bullet check was misleading
                 container.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
            }
        } else { // Plain text
            container.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
        }
    }

    const explainInstruction = document.getElementById('explainInstruction'); // From old_ui.js
    if (container.innerHTML.trim() !== "" && explainInstruction) {
        explainInstruction.classList.remove('hidden');
    } else if (explainInstruction) {
        explainInstruction.classList.add('hidden');
    }
}


/**
 * Displays the processed results (summary, flashcards, quiz) in their respective tabs.
 * Merged: Base from new_ui.js, flashcard handling from old_ui.js, quiz from new_ui.js.
 * @param {object} results - The object containing summary, flashcards, quiz data, etc.
 */
function displayResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutputRaw = document.getElementById('flashcardsOutputRaw'); // Textarea for raw flashcard data
    const launchFlashcardModalBtnMain = document.getElementById('launchFlashcardModalBtn-main'); // Button to launch flashcard modal
    const flashcardsOutputPlaceholder = document.querySelector('#flashcardsTab .output-box-flashcards-placeholder'); // Placeholder for flashcard info (from old_ui.js)

    const startQuizBtn = document.getElementById('startQuizBtn');
    const quizReadyMessage = document.getElementById('quizReadyMessage');

    // Tab content elements
    const summaryTabContent = document.getElementById('summaryTab');
    const flashcardsTabContent = document.getElementById('flashcardsTab');
    const quizTabContent = document.getElementById('quizTab');

    // Tab link elements
    const summaryTabLink = document.querySelector('#resultsSection .tab-link[data-tab="summaryTab"]');
    const flashcardsTabLink = document.querySelector('#resultsSection .tab-link[data-tab="flashcardsTab"]');
    const quizTabLink = document.querySelector('#resultsSection .tab-link[data-tab="quizTab"]');

    // Elements from old_ui.js for explanation feature (if still used)
    const explainButton = document.getElementById('explainSelectedSummaryTextButton');
    const explanationOutput = document.getElementById('explanationOutput');
    const explainInstruction = document.getElementById('explainInstruction');


    if (!resultsSection) return;
    resultsSection.classList.remove('hidden');
    window.lastProcessedResults = results; // Store for later use (e.g., flashcards)
    window.currentExtractedTextForQuiz = results.extractedText || window.currentExtractedTextForQuiz; // For quiz regeneration
    window.currentKeywordsForHighlighting = results.summaryKeywords || []; // From old_ui.js logic

    // Clear old explanation outputs if they exist
    if (explainButton) explainButton.classList.add('hidden');
    if (explanationOutput) { explanationOutput.innerHTML = ''; explanationOutput.classList.add('hidden');}
    if (explainInstruction) explainInstruction.classList.add('hidden');


    let firstAvailableTabLink = null;

    // --- Summary Handling ---
    if (summaryOutput && results.summary) {
        renderSummary(summaryOutput, results.summary); // Uses the merged renderSummary
        if (summaryTabContent) summaryTabContent.classList.remove('hidden'); // Should be handled by tab click
        if (summaryTabLink) {
            summaryTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            summaryTabLink.disabled = false;
            if (!firstAvailableTabLink) firstAvailableTabLink = summaryTabLink;
        }
    } else {
        if (summaryOutput) summaryOutput.innerHTML = '<p class="text-slate-500 text-sm p-4">No summary generated.</p>';
        if (summaryTabContent) summaryTabContent.classList.add('hidden');
        if (summaryTabLink) {
            summaryTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden');
            summaryTabLink.disabled = true;
        }
        if (explainInstruction) explainInstruction.classList.add('hidden');
    }

    // --- Flashcards Handling (Using old_ui.js logic for interactivity) ---
    if (results.flashcards && Array.isArray(results.flashcards) && results.flashcards.length > 0) {
        if (flashcardsOutputRaw) flashcardsOutputRaw.value = JSON.stringify(results.flashcards, null, 2);
        if (flashcardsOutputPlaceholder) flashcardsOutputPlaceholder.innerHTML = `<p class="text-slate-600 text-sm">Total ${results.flashcards.length} flashcards generated. Click "Study Flashcards" to begin.</p>`;

        if (launchFlashcardModalBtnMain) {
            launchFlashcardModalBtnMain.classList.remove('hidden');
            // Re-attach event listener to prevent multiple bindings and use the detailed flashcard renderer
            const newBtn = launchFlashcardModalBtnMain.cloneNode(true);
            launchFlashcardModalBtnMain.parentNode.replaceChild(newBtn, launchFlashcardModalBtnMain);
            document.getElementById('launchFlashcardModalBtn-main').onclick = () => {
                const flashcardModalContent = document.getElementById('flashcardModalContent-main');
                if (flashcardModalContent && window.lastProcessedResults && window.lastProcessedResults.flashcards) {
                    // Call the DETAILED renderInteractiveFlashcards from old_ui.js
                    renderInteractiveFlashcards(flashcardModalContent, window.lastProcessedResults.flashcards, window.currentKeywordsForHighlighting, 'main');
                    toggleElementVisibility('flashcardStudyModal-main', true); // Ensure this modal ID is correct
                } else {
                    showMessage('flashcard-messages', "No flashcards data available or modal content area not found.", 'error', 3000); // Use showMessage instead of alert
                }
            };
        }
        if (flashcardsTabContent) flashcardsTabContent.classList.remove('hidden'); // Should be handled by tab click
        if (flashcardsTabLink) {
            flashcardsTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            flashcardsTabLink.disabled = false;
            if (!firstAvailableTabLink) firstAvailableTabLink = flashcardsTabLink;
        }
    } else {
        if (flashcardsOutputRaw) flashcardsOutputRaw.value = '';
        if (flashcardsOutputPlaceholder) flashcardsOutputPlaceholder.innerHTML = '<p class="text-slate-500 text-sm p-4">No flashcards available to display.</p>';
        if (launchFlashcardModalBtnMain) launchFlashcardModalBtnMain.classList.add('hidden');
        if (flashcardsTabContent) flashcardsTabContent.classList.add('hidden');
        if (flashcardsTabLink) {
            flashcardsTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden');
            flashcardsTabLink.disabled = true;
        }
    }

    // --- Quiz Handling (Using new_ui.js system) ---
    window.currentQuizOptions = results.quizOptions || {
        questionTypes: ['multiple_choice'],
        numQuestions: 'ai_choice',
        difficulty: 'medium'
    };

    if (results.quiz && Array.isArray(results.quiz) && results.quiz.length > 0) {
        // Initialize quiz data for the new system
        window.currentQuizData = results.quiz.map(q => ({
            ...q,
            chatHistory: [],
            detailedExplanationContent: null,
            detailedExplanationFetched: false,
            aiFeedback: null,
            previousStateBeforeMark: null
        }));
        if (startQuizBtn) {
            startQuizBtn.disabled = false;
            startQuizBtn.textContent = 'Start Quiz';
        }
        if(quizReadyMessage) quizReadyMessage.textContent = `A quiz with ${results.quiz.length} questions is ready. You can start it or customize options below to generate a new one.`;

        if (quizTabContent) quizTabContent.classList.remove('hidden'); // Should be handled by tab click
        if (quizTabLink) {
            quizTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            quizTabLink.disabled = false;
            if (!firstAvailableTabLink) firstAvailableTabLink = quizTabLink;
        }
        initializeQuizSystem(); // Initialize the new quiz system UI
    } else {
        window.currentQuizData = null;
        if (startQuizBtn) {
            startQuizBtn.disabled = true; // Or enable if text is available for generation
            startQuizBtn.textContent = 'Start Quiz (No Quiz Data)';
        }
        if(quizReadyMessage) quizReadyMessage.textContent = 'No quiz was generated. You can customize options below and generate one.';
        if (quizTabContent) quizTabContent.classList.add('hidden');
        if (quizTabLink) {
            quizTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden');
            quizTabLink.disabled = true;
        }
        initializeQuizSystem(); // Still initialize to show options for generation
    }

    // Activate the first available tab
    const allTabLinks = document.querySelectorAll('#resultsSection .tab-link');
    allTabLinks.forEach(tl => {
        tl.removeAttribute('data-active');
        const contentPane = document.getElementById(tl.dataset.tab);
        if (contentPane) contentPane.classList.add('hidden'); // Hide all initially
    });

    if (firstAvailableTabLink) {
        firstAvailableTabLink.click(); // Programmatically click the first valid tab link
    } else {
        // No content at all
        resultsSection.innerHTML = '<p class="text-center text-slate-500 p-6">No materials were generated. Please try different options or a different file.</p>';
    }
}


// --- Flashcard System (from old_ui.js) ---
// This is the more detailed flashcard system.

/**
 * Renders interactive flashcards in a modal.
 * Origin: old_ui.js
 * @param {HTMLElement} modalContentContainer - The container element within the modal for flashcard content.
 * @param {Array<object>} flashcards - Array of flashcard objects {term, definition}.
 * @param {Array<string>} [keywordsToHighlight=[]] - Keywords to highlight (not directly used in old_ui.js flashcards but good to keep).
 * @param {string} [context='main'] - Context for element IDs (e.g., 'main' or 'dashboard').
 */
function renderInteractiveFlashcards(modalContentContainer, flashcards, keywordsToHighlight = [], context = 'main') {
    modalContentContainer.innerHTML = ''; // Clear previous content
    allFlashcardsData = [...flashcards]; // Store flashcards globally for this system
    currentFlashcardIndex = 0;
    currentFlashcardChatHistory = []; // Reset chat history for this session
    flashcardContext = context; // Set context for ID generation
    markedForReview = allFlashcardsData.map(() => false); // Reset marked for review states
    flashcardStates = {}; // Reset individual card states (flip, answer, feedback)
    allFlashcardsData.forEach((card, idx) => {
        flashcardStates[idx] = {
            isFlipped: false,
            userAnswer: '',
            aiFeedback: '',
            isCorrect: null // Can be true, false, or 'partial'
        };
    });

    if (!allFlashcardsData || allFlashcardsData.length === 0) {
        modalContentContainer.innerHTML = `<p class="text-slate-500 text-sm p-4 text-center">No flashcards to display.</p>`;
        return;
    }

    const flashcardWrapper = document.createElement('div');
    flashcardWrapper.className = 'flex flex-col items-center w-full h-full p-1 sm:p-2'; // Added padding

    // Top controls: Shuffle, Counter, Reset
    const topControlsDiv = document.createElement('div');
    topControlsDiv.className = 'flex items-center justify-between w-full mb-2 px-1';
    topControlsDiv.innerHTML = `
        <button id="shuffleFlashcardsBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Shuffle</button>
        <span id="flashcardCounter-${flashcardContext}" class="text-xs text-slate-600">1 / ${allFlashcardsData.length}</span>
        <button id="resetFlashcardsBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Reset</button>
    `;
    flashcardWrapper.appendChild(topControlsDiv);

    // Progress bar (dots)
    const progressBarContainer = document.createElement('div');
    progressBarContainer.id = `flashcardProgressBar-${flashcardContext}`;
    progressBarContainer.className = 'w-full flex justify-center space-x-1 mb-3 px-1';
    flashcardWrapper.appendChild(progressBarContainer);

    // Card scene for flipping
    const cardScene = document.createElement('div');
    cardScene.id = `flashcardScene-${flashcardContext}`;
    cardScene.className = 'flashcard-modal-scene w-full flex-grow'; // Ensure this takes up space

    const cardInner = document.createElement('div');
    cardInner.id = `flashcardInner-${flashcardContext}`;
    cardInner.className = 'flashcard-modal-inner'; // Handles the 3D flip

    cardScene.appendChild(cardInner);
    flashcardWrapper.appendChild(cardScene);

    // Navigation controls: Prev, Mark, Next
    const navControlsDiv = document.createElement('div');
    navControlsDiv.className = 'flex items-center justify-between w-full mt-3 mb-3 px-1';
    navControlsDiv.innerHTML = `
        <button id="prevFlashcardBtn-${flashcardContext}" class="flashcard-modal-nav-btn">&larr; Prev</button>
        <button id="markReviewBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Mark for Review</button>
        <button id="nextFlashcardBtn-${flashcardContext}" class="flashcard-modal-nav-btn">Next &rarr;</button>
    `;
    flashcardWrapper.appendChild(navControlsDiv);

    // AI Chat container (initially hidden)
    const aiChatContainer = document.createElement('div');
    aiChatContainer.id = `flashcardAiChatContainer-${flashcardContext}`;
    aiChatContainer.className = 'w-full mt-3 p-3 bg-slate-50 rounded-lg shadow-inner border border-slate-200 hidden';
    aiChatContainer.innerHTML = `
        <h4 class="text-sm font-semibold text-slate-700 mb-1.5">AI Helper</h4>
        <div id="flashcardAiChatMessages-${flashcardContext}" class="h-28 overflow-y-auto border border-slate-200 rounded-md p-2 mb-1.5 text-xs space-y-1 bg-white"></div>
        <div class="flex space-x-2">
            <input type="text" id="flashcardAiChatInput-${flashcardContext}" class="form-input flex-grow text-xs !py-1.5" placeholder="Ask a follow-up question...">
            <button id="flashcardAiChatSendBtn-${flashcardContext}" class="px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-md shadow-sm">Send</button>
        </div>
        <p id="flashcardAiChatStatus-${flashcardContext}" class="text-xs text-slate-500 mt-1"></p>
    `;
    flashcardWrapper.appendChild(aiChatContainer);

    modalContentContainer.appendChild(flashcardWrapper);
    updateProgressBar(); // Initial call
    displayFlashcard(currentFlashcardIndex); // Display the first card
    setupFlashcardEventListeners(); // Set up main event listeners for buttons outside the card
}

/**
 * Updates the progress bar for flashcards.
 * Origin: old_ui.js
 */
function updateProgressBar() {
    const progressBarContainer = document.getElementById(`flashcardProgressBar-${flashcardContext}`);
    if (!progressBarContainer) return;
    progressBarContainer.innerHTML = ''; // Clear existing dots

    allFlashcardsData.forEach((card, idx) => {
        const dot = document.createElement('span');
        dot.className = 'flashcard-progress-dot cursor-pointer'; // Base class
        dot.dataset.index = idx;

        const state = flashcardStates[idx];
        if (idx === currentFlashcardIndex) {
            dot.classList.add('current');
        } else if (state && state.isCorrect === true) {
            dot.classList.add('correct');
        } else if (state && state.isCorrect === 'partial') {
            dot.classList.add('partial');
        } else if (state && state.isCorrect === false) {
            dot.classList.add('incorrect');
        } else if (markedForReview[idx]) {
            dot.classList.add('marked');
        } else {
            dot.classList.add('default');
        }

        dot.addEventListener('click', () => {
            currentFlashcardIndex = idx;
            displayFlashcard(currentFlashcardIndex);
        });
        progressBarContainer.appendChild(dot);
    });
}

/**
 * Displays a specific flashcard by index.
 * Origin: old_ui.js
 * @param {number} index - The index of the flashcard to display.
 */
function displayFlashcard(index) {
    const cardInner = document.getElementById(`flashcardInner-${flashcardContext}`);
    const counter = document.getElementById(`flashcardCounter-${flashcardContext}`);
    const prevBtn = document.getElementById(`prevFlashcardBtn-${flashcardContext}`);
    const nextBtn = document.getElementById(`nextFlashcardBtn-${flashcardContext}`);
    const aiChatContainer = document.getElementById(`flashcardAiChatContainer-${flashcardContext}`);
    const aiChatMessages = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
    const markReviewBtn = document.getElementById(`markReviewBtn-${flashcardContext}`);

    if (!cardInner || !allFlashcardsData[index]) return;

    const cardData = allFlashcardsData[index];
    const cardState = flashcardStates[index] || { isFlipped: false, userAnswer: '', aiFeedback: '', isCorrect: null };

    cardInner.innerHTML = ''; // Clear previous card faces
    if (aiChatMessages && !cardState.isFlipped) aiChatMessages.innerHTML = ''; // Clear chat if flipping to front
    if (aiChatContainer && !cardState.isFlipped) aiChatContainer.classList.add('hidden'); // Hide chat if flipping to front

    // Front face of the card
    const frontFace = document.createElement('div');
    frontFace.className = 'flashcard-modal-face flashcard-modal-front';
    frontFace.innerHTML = `
        <div class="p-4 sm:p-6 flex flex-col items-center justify-center h-full text-center">
            <p class="text-md sm:text-lg font-semibold text-indigo-700 mb-3 sm:mb-4 leading-tight">${processTextForDisplay(cardData.term)}</p>
            <textarea id="flashcardUserAnswer-${flashcardContext}" class="form-textarea w-full max-w-xs h-20 text-sm p-2 border-slate-300 rounded-md shadow-sm mb-3 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Type your answer here...">${cardState.isFlipped ? '' : cardState.userAnswer || ''}</textarea>
            <button id="submitFlashcardAnswerBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-green-500 hover:bg-green-600 focus:ring-green-400">Submit & Flip</button>
        </div>
    `;

    // Back face of the card
    const backFace = document.createElement('div');
    backFace.className = 'flashcard-modal-face flashcard-modal-back';
    backFace.innerHTML = `
        <div class="p-4 sm:p-6 flex flex-col h-full">
            <div class="flex-grow space-y-2 overflow-y-auto mb-3 pr-1 text-sm">
                <div id="flashcardUserFeedback-${flashcardContext}" class="p-2 rounded-md">${cardState.aiFeedback ? processTextForDisplay(cardState.aiFeedback) : ''}</div>
                <div>
                    <strong class="block font-semibold text-indigo-700 mb-1">Correct Answer:</strong>
                    <p class="text-slate-700">${processTextForDisplay(cardData.definition)}</p>
                </div>
            </div>
            <div class="mt-auto pt-2 flex flex-wrap gap-2 justify-between items-center border-t border-slate-200">
                <button id="explainFlashcardBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-sky-500 hover:bg-sky-600 focus:ring-sky-400 text-xs">Explain More</button>
                <button id="flipToFrontBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-slate-500 hover:bg-slate-600 focus:ring-slate-400 text-xs">Flip to Front</button>
            </div>
        </div>
    `;

    cardInner.appendChild(frontFace);
    cardInner.appendChild(backFace);

    // Apply flip state and feedback styling
    if (cardState.isFlipped) {
        cardInner.classList.add('[transform:rotateY(180deg)]'); // Tailwind JIT class for flip
        const feedbackDiv = backFace.querySelector(`#flashcardUserFeedback-${flashcardContext}`);
        if (feedbackDiv && cardState.aiFeedback) {
            if (cardState.isCorrect === true) {
                feedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-green-50 border border-green-200 text-green-700';
            } else if (cardState.isCorrect === 'partial') {
                feedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-yellow-50 border border-yellow-200 text-yellow-700';
            } else { // false or null
                feedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-red-50 border border-red-200 text-red-700';
            }
        }
    } else {
        cardInner.classList.remove('[transform:rotateY(180deg)]');
    }

    // Update counter and button states
    if (counter) counter.textContent = `${index + 1} / ${allFlashcardsData.length}`;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === allFlashcardsData.length - 1;
    if (markReviewBtn) {
        markReviewBtn.textContent = markedForReview[index] ? "Unmark" : "Mark for Review";
        markReviewBtn.classList.toggle('bg-yellow-400', markedForReview[index]);
        markReviewBtn.classList.toggle('hover:bg-yellow-500', markedForReview[index]);
        markReviewBtn.classList.toggle('text-yellow-800', markedForReview[index]);
        markReviewBtn.classList.toggle('font-semibold', markedForReview[index]);

        markReviewBtn.classList.toggle('bg-slate-200', !markedForReview[index]);
        markReviewBtn.classList.toggle('hover:bg-slate-300', !markedForReview[index]);
        markReviewBtn.classList.toggle('text-slate-600', !markedForReview[index]);
    }

    updateProgressBar();
    setupCardActionListeners(); // Set up listeners for buttons on the card itself
}

/**
 * Sets up event listeners for actions on the current flashcard (submit, explain, flip to front).
 * Origin: old_ui.js
 */
function setupCardActionListeners() {
    const cardInner = document.getElementById(`flashcardInner-${flashcardContext}`);
    const submitBtn = document.getElementById(`submitFlashcardAnswerBtn-${flashcardContext}`);
    const explainBtn = document.getElementById(`explainFlashcardBtn-${flashcardContext}`);
    const flipToFrontBtn = document.getElementById(`flipToFrontBtn-${flashcardContext}`);
    const userAnswerTextarea = document.getElementById(`flashcardUserAnswer-${flashcardContext}`);
    const userFeedbackDiv = document.getElementById(`flashcardUserFeedback-${flashcardContext}`); // On the back
    const aiChatContainer = document.getElementById(`flashcardAiChatContainer-${flashcardContext}`);
    const aiChatStatus = document.getElementById(`flashcardAiChatStatus-${flashcardContext}`);

    // Prevent spacebar from triggering modal-level keydown listeners if textarea is focused
    if (userAnswerTextarea) {
        userAnswerTextarea.addEventListener('keydown', (event) => {
            if (event.key === ' ' || event.keyCode === 32) {
                event.stopPropagation();
            }
        });
    }

    if (submitBtn && cardInner && userAnswerTextarea && userFeedbackDiv) {
        submitBtn.onclick = async () => {
            const userAnswer = userAnswerTextarea.value;
            flashcardStates[currentFlashcardIndex].userAnswer = userAnswer;

            // Show loading state on feedback div and flip card
            userFeedbackDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Getting feedback...</span>`;
            userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-slate-100 border border-slate-200'; // Neutral loading style
            cardInner.classList.add('[transform:rotateY(180deg)]');
            flashcardStates[currentFlashcardIndex].isFlipped = true;

            try {
                // Replace with actual API call if available
                // const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "submit_answer", userAnswer);
                // Mocking API call for now
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
                const mockFeedback = `Feedback for your answer: "${userAnswer}". This is a mock response.`;
                const result = { feedback: mockFeedback };
                // End mock

                flashcardStates[currentFlashcardIndex].aiFeedback = result.feedback;
                userFeedbackDiv.innerHTML = processTextForDisplay(result.feedback);

                // Determine correctness based on feedback (example logic)
                const feedbackText = result.feedback.toLowerCase();
                if (feedbackText.includes("partially correct")) {
                    userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-yellow-50 border border-yellow-200 text-yellow-700';
                    flashcardStates[currentFlashcardIndex].isCorrect = 'partial';
                } else if (feedbackText.includes("correct")) {
                    userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-green-50 border border-green-200 text-green-700';
                    flashcardStates[currentFlashcardIndex].isCorrect = true;
                } else {
                    userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-red-50 border border-red-200 text-red-700';
                    flashcardStates[currentFlashcardIndex].isCorrect = false;
                }
            } catch (error) {
                console.error("Error getting flashcard feedback:", error);
                const errorMessage = `Error: ${error.message || 'Could not get feedback.'}`;
                flashcardStates[currentFlashcardIndex].aiFeedback = errorMessage;
                flashcardStates[currentFlashcardIndex].isCorrect = false;
                userFeedbackDiv.innerHTML = `<span class="text-red-600">${errorMessage}</span>`;
                userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-red-50 border border-red-200';
            }
            updateProgressBar();
        };
    }

    if (explainBtn && aiChatContainer && aiChatStatus) {
        explainBtn.onclick = async () => {
            aiChatContainer.classList.remove('hidden');
            addMessageToChat('AI', 'Getting explanation...', 'system');
            aiChatStatus.textContent = 'Getting explanation...';
            try {
                // Replace with actual API call
                // const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "request_explanation");
                // Mocking API call
                await new Promise(resolve => setTimeout(resolve, 500));
                const mockExplanation = `This is a mock explanation for "${allFlashcardsData[currentFlashcardIndex].term}".`;
                const result = { explanation: mockExplanation };
                // End mock

                addMessageToChat('AI', result.explanation, 'ai');
                currentFlashcardChatHistory.push({ role: "model", parts: [{ text: result.explanation }] });
                aiChatStatus.textContent = '';
            } catch (error) {
                console.error("Error getting flashcard explanation:", error);
                addMessageToChat('AI', `Error: ${error.message || 'Could not get explanation.'}`, 'error');
                aiChatStatus.textContent = `Error getting explanation.`;
            }
        };
    }

    if (flipToFrontBtn && cardInner) {
        flipToFrontBtn.onclick = () => {
            cardInner.classList.remove('[transform:rotateY(180deg)]');
            flashcardStates[currentFlashcardIndex].isFlipped = false;
            // User answer is kept on the front for review, feedback is cleared visually by hiding chat
            if (userAnswerTextarea) userAnswerTextarea.value = flashcardStates[currentFlashcardIndex].userAnswer || '';
            if (aiChatContainer) aiChatContainer.classList.add('hidden');
            const chatMessages = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
            if (chatMessages) chatMessages.innerHTML = ''; // Clear chat messages
            currentFlashcardChatHistory = []; // Reset chat history for this card face
            updateProgressBar(); // Reflects that card is no longer "answered" in the same way
        };
    }
}

/**
 * Sets up main event listeners for flashcard modal controls (prev, next, shuffle, etc.).
 * Origin: old_ui.js
 */
function setupFlashcardEventListeners() {
    const prevBtn = document.getElementById(`prevFlashcardBtn-${flashcardContext}`);
    const nextBtn = document.getElementById(`nextFlashcardBtn-${flashcardContext}`);
    const aiChatInput = document.getElementById(`flashcardAiChatInput-${flashcardContext}`);
    const aiChatSendBtn = document.getElementById(`flashcardAiChatSendBtn-${flashcardContext}`);
    const aiChatStatus = document.getElementById(`flashcardAiChatStatus-${flashcardContext}`);
    const shuffleBtn = document.getElementById(`shuffleFlashcardsBtn-${flashcardContext}`);
    const markReviewBtn = document.getElementById(`markReviewBtn-${flashcardContext}`);
    const resetBtn = document.getElementById(`resetFlashcardsBtn-${flashcardContext}`);

    if (prevBtn) {
        prevBtn.onclick = () => {
            if (currentFlashcardIndex > 0) {
                currentFlashcardIndex--;
                displayFlashcard(currentFlashcardIndex);
            }
        };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (currentFlashcardIndex < allFlashcardsData.length - 1) {
                currentFlashcardIndex++;
                displayFlashcard(currentFlashcardIndex);
            }
        };
    }

    const sendChatMessage = async () => {
        if (!aiChatInput || !aiChatStatus) return;
        const userQuery = aiChatInput.value.trim();
        if (!userQuery) return;
        addMessageToChat('You', userQuery, 'user');
        currentFlashcardChatHistory.push({ role: "user", parts: [{ text: userQuery }] });
        aiChatInput.value = '';
        aiChatStatus.textContent = 'AI is thinking...';
        try {
            // Replace with actual API call
            // const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "chat_message", null, userQuery, currentFlashcardChatHistory);
            // Mocking API call
            await new Promise(resolve => setTimeout(resolve, 500));
            const mockResponse = `Mock AI response to: "${userQuery}"`;
            const result = { chatResponse: mockResponse, updatedChatHistory: [...currentFlashcardChatHistory, {role: "model", parts: [{text: mockResponse}]}] };
            // End mock

            addMessageToChat('AI', result.chatResponse, 'ai');
            currentFlashcardChatHistory = result.updatedChatHistory; // Update history with AI response
            aiChatStatus.textContent = '';
        } catch (error) {
            console.error("Error in flashcard chat:", error);
            addMessageToChat('AI', `Error: ${error.message || 'Chat unavailable.'}`, 'error');
            aiChatStatus.textContent = 'Error in chat.';
            // Remove user message from history if AI call failed
            currentFlashcardChatHistory.pop();
        }
    };

    if (aiChatSendBtn) aiChatSendBtn.onclick = sendChatMessage;
    if (aiChatInput) aiChatInput.onkeypress = (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); } };

    if (shuffleBtn) {
        shuffleBtn.onclick = () => {
            // Combine cards with their states and marked status for shuffling
            let combined = allFlashcardsData.map((card, i) => ({
                card,
                state: flashcardStates[i] || { isFlipped: false, userAnswer: '', aiFeedback: '', isCorrect: null },
                marked: markedForReview[i] || false
            }));

            // Fisher-Yates shuffle
            for (let i = combined.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [combined[i], combined[j]] = [combined[j], combined[i]];
            }

            // Update global arrays from shuffled data
            allFlashcardsData = combined.map(item => item.card);
            flashcardStates = {};
            combined.forEach((item, i) => { flashcardStates[i] = item.state; });
            markedForReview = combined.map(item => item.marked);

            currentFlashcardIndex = 0; // Go to the first card of the shuffled deck
            displayFlashcard(currentFlashcardIndex);
        };
    }
    if (markReviewBtn) {
        markReviewBtn.onclick = () => {
            markedForReview[currentFlashcardIndex] = !markedForReview[currentFlashcardIndex];
            displayFlashcard(currentFlashcardIndex); // Re-render to update button text/style
            updateProgressBar(); // Update dot style
        };
    }
    if (resetBtn) {
        resetBtn.onclick = () => {
            let originalFlashcards;
            // Determine original source of flashcards based on context (main page or dashboard)
            if (flashcardContext === 'main' && window.lastProcessedResults && window.lastProcessedResults.flashcards) {
                originalFlashcards = window.lastProcessedResults.flashcards;
            } else if (flashcardContext === 'modal' && window.currentDashboardSessionData && window.currentDashboardSessionData.flashcards) { // Assuming currentDashboardSessionData exists
                originalFlashcards = window.currentDashboardSessionData.flashcards;
            } else {
                // Fallback: if original source isn't clear, just re-shuffle current set or do nothing
                if (shuffleBtn) shuffleBtn.click(); // Or simply return
                return;
            }
            allFlashcardsData = [...originalFlashcards];
            markedForReview = allFlashcardsData.map(() => false);
            flashcardStates = {};
            allFlashcardsData.forEach((card, idx) => {
                flashcardStates[idx] = { isFlipped: false, userAnswer: '', aiFeedback: '', isCorrect: null };
            });
            currentFlashcardIndex = 0;
            displayFlashcard(currentFlashcardIndex);
        };
    }
}

/**
 * Adds a message to the flashcard AI chat interface.
 * Origin: old_ui.js
 * @param {string} sender - 'You' or 'AI'.
 * @param {string} message - The message text.
 * @param {'user' | 'ai' | 'system' | 'error'} type - The type of message for styling.
 */
function addMessageToChat(sender, message, type) {
    const messagesDiv = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
    if (!messagesDiv) return;
    const messageEl = document.createElement('div');
    let senderClass = 'text-slate-700';
    let messageBgClass = 'bg-white';
    let textAlignClass = 'mr-auto'; // Default to AI/system messages on left

    if (type === 'user') {
        senderClass = 'text-blue-600 font-semibold';
        messageBgClass = 'bg-blue-50';
        textAlignClass = 'ml-auto'; // User messages on right
    } else if (type === 'ai') {
        senderClass = 'text-indigo-600 font-semibold';
        messageBgClass = 'bg-indigo-50';
    } else if (type === 'system' || type === 'error') {
        senderClass = 'text-slate-500 italic';
        messageBgClass = 'bg-slate-100';
        if (type === 'error') senderClass = 'text-red-500 italic';
    }

    messageEl.className = `p-1.5 rounded-md ${messageBgClass} max-w-[85%] ${textAlignClass} mb-1`;
    messageEl.innerHTML = `<strong class="${senderClass}">${sender}:</strong> ${processTextForDisplay(message)}`; // Use processTextForDisplay for consistency
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
}


// --- Quiz System (from new_ui.js) ---
// This is the more advanced, interactive quiz system.

/**
 * Initializes the quiz system UI elements and default states.
 * Origin: new_ui.js
 */
function initializeQuizSystem() {
    const startQuizBtn = document.getElementById('startQuizBtn');
    const regenerateQuizBtn = document.getElementById('regenerateQuizWithOptionsBtn');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const customizeDetails = quizSetupView ? quizSetupView.querySelector('details') : null;

    if (startQuizBtn) {
        startQuizBtn.onclick = () => handleStartQuiz(false); // False means don't force regenerate if data exists
        startQuizBtn.textContent = 'Start Quiz';
    }
    if (regenerateQuizBtn) {
        regenerateQuizBtn.onclick = () => handleStartQuiz(true); // True means force regenerate with current options
    }

    // Set default quiz options in the UI
    const defaultQuestionTypeCheckbox = document.querySelector('#quizSetupView input[name="quizQuestionTypeOption"][value="multiple_choice"]');
    if (defaultQuestionTypeCheckbox) defaultQuestionTypeCheckbox.checked = true;

    const defaultNumQuestionsRadio = document.querySelector('#quizSetupView input[name="quizNumQuestionsOption"][value="ai_choice"]');
    if (defaultNumQuestionsRadio) defaultNumQuestionsRadio.checked = true;

    const defaultDifficultyRadio = document.querySelector('#quizSetupView input[name="quizDifficultyOption"][value="medium"]');
    if (defaultDifficultyRadio) defaultDifficultyRadio.checked = true;

    // Update UI based on whether quiz data is already available
    if (window.currentQuizData && window.currentQuizData.length > 0) {
        if(startQuizBtn) {
            startQuizBtn.disabled = false;
            startQuizBtn.textContent = `Start Quiz (${window.currentQuizData.length} questions)`;
        }
        if(quizReadyMessage) {
             quizReadyMessage.textContent = `A quiz with ${window.currentQuizData.length} questions is ready.`;
             quizReadyMessage.classList.remove('hidden');
        }
        if(startQuizBtn) startQuizBtn.classList.remove('hidden');
        if(customizeDetails) customizeDetails.open = false; // Collapse options if quiz is ready
    } else {
         if(startQuizBtn) {
            // Enable if text is available for generation, otherwise disable
            startQuizBtn.disabled = !(window.currentExtractedTextForQuiz && window.currentExtractedTextForQuiz.trim() !== "");
            startQuizBtn.textContent = 'Start Quiz';
         }
        if(quizReadyMessage) {
            quizReadyMessage.textContent = 'Customize options below to generate a quiz.';
            quizReadyMessage.classList.remove('hidden');
        }
        if(startQuizBtn) startQuizBtn.classList.remove('hidden');
        if(customizeDetails) customizeDetails.open = true; // Expand options if no quiz
    }

    // Ensure correct views are shown/hidden
    if(quizSetupView) quizSetupView.classList.remove('hidden');
    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
}

/**
 * Handles starting or regenerating a quiz.
 * Origin: new_ui.js
 * @param {boolean} [forceRegenerate=false] - Whether to force regeneration of the quiz.
 */
async function handleStartQuiz(forceRegenerate = false) {
    const quizLoadingStatus = document.getElementById('quizLoadingStatus');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const startQuizBtn = document.getElementById('startQuizBtn');

    // Hide other views, show loading
    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
    if(quizSetupView) quizSetupView.classList.add('hidden');
    if(quizLoadingStatus) showProcessingStatus('quizLoadingStatus', 'Preparing quiz...', true);
    if(startQuizBtn) startQuizBtn.disabled = true;

    try {
        let quizDataToUse;
        if (forceRegenerate) {
            const textToUse = window.currentQuizTextContext || window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
            if (!textToUse || textToUse.trim() === "") {
                throw new Error("No text content available to generate a new quiz from.");
            }
            window.currentQuizTextContext = textToUse; // Ensure it's set for future regenerations

            const questionTypes = Array.from(document.querySelectorAll('#quizSetupView input[name="quizQuestionTypeOption"]:checked')).map(cb => cb.value);
            const numQuestions = document.querySelector('#quizSetupView input[name="quizNumQuestionsOption"]:checked')?.value || 'ai_choice';
            const difficulty = document.querySelector('#quizSetupView input[name="quizDifficultyOption"]:checked')?.value || 'medium';

            if (questionTypes.length === 0) {
                showMessage('quizLoadingStatus', 'Please select at least one question type.', 'error', 3000);
                if(quizSetupView) quizSetupView.classList.remove('hidden'); // Show setup again
                if(startQuizBtn) startQuizBtn.disabled = false;
                return;
            }

            window.currentQuizOptions = { questionTypes, numQuestions, difficulty };
            // const generatedQuiz = await apiGenerateQuiz(textToUse, window.currentQuizOptions); // Actual API call
            // Mocking API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            const generatedQuiz = { quiz: [ { id: 'q1', questionType: 'multiple_choice', questionText: 'Mock Q1: What is 2+2?', options: ['3', '4', '5'], correctAnswer: '4', briefExplanation: 'Basic addition.'} ]};
            // End mock
            quizDataToUse = generatedQuiz.quiz;
        } else { // Not forcing regenerate, try to use existing data
            if (!window.currentQuizData || window.currentQuizData.length === 0) {
                 // No existing data, try to generate new based on current context/options
                 const textToUse = window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
                 if (!textToUse || textToUse.trim() === "") {
                    throw new Error("No pre-generated quiz data and no text available to generate a new one.");
                 }
                 window.currentQuizTextContext = textToUse;
                 const optionsToUse = window.currentQuizOptions || { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
                 // const generatedQuiz = await apiGenerateQuiz(textToUse, optionsToUse); // Actual API call
                 // Mocking API call
                await new Promise(resolve => setTimeout(resolve, 1000));
                const generatedQuiz = { quiz: [ { id: 'q1', questionType: 'multiple_choice', questionText: 'Mock Q1 (existing attempt): What is 2+2?', options: ['3', '4', '5'], correctAnswer: '4', briefExplanation: 'Basic addition.'} ]};
                // End mock
                 quizDataToUse = generatedQuiz.quiz;
                 window.currentQuizOptions = optionsToUse; // Store options used
            } else {
                 quizDataToUse = window.currentQuizData; // Use existing data
                 // Ensure context is still set if user wants to regenerate individual questions later
                 window.currentQuizTextContext = window.currentQuizTextContext || window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
            }
        }

        if (!quizDataToUse || quizDataToUse.length === 0) {
            throw new Error("Failed to load or generate quiz data.");
        }

        // Prepare quiz data with necessary states
        window.currentQuizData = quizDataToUse.map(q => ({
            ...q,
            chatHistory: q.chatHistory || [],
            detailedExplanationContent: q.detailedExplanationContent || null,
            detailedExplanationFetched: q.detailedExplanationFetched || false,
            aiFeedback: q.aiFeedback || null,
            previousStateBeforeMark: q.previousStateBeforeMark || null // For marked questions
        }));
        window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData)); // For retries

        window.currentQuizQuestionIndex = 0;
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');

        renderQuizInterface();
        if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');

    } catch (error) {
        console.error("Error handling start quiz:", error);
        showMessage('quizLoadingStatus', `Error: ${error.message}`, 'error', 5000);
        if(quizSetupView) quizSetupView.classList.remove('hidden'); // Show setup again on error
    } finally {
        // Hide loading status only if quiz interface is shown or setup is shown again
        const quizInterfaceVisible = quizInterfaceContainer && !quizInterfaceContainer.classList.contains('hidden');
        const quizSetupVisible = quizSetupView && !quizSetupView.classList.contains('hidden');
        if (quizLoadingStatus && (quizInterfaceVisible || quizSetupVisible)) {
            hideProcessingStatus('quizLoadingStatus');
        }
        if(startQuizBtn) startQuizBtn.disabled = false;
    }
}

/**
 * Renders the main quiz interface for the current question.
 * Origin: new_ui.js
 */
function renderQuizInterface() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    if (!quizInterfaceContainer || !window.currentQuizData || window.currentQuizData.length === 0) {
        quizInterfaceContainer.innerHTML = '<p class="text-slate-500 p-4">Error: Quiz data is missing.</p>';
        return;
    }

    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    const questionState = window.quizQuestionStates[window.currentQuizQuestionIndex];
    const isAnswered = questionState !== 'unanswered' && questionState !== 'skipped' && questionState !== 'marked';
    const isMarked = questionState === 'marked';
    const userAnswer = window.userQuizAnswers[window.currentQuizQuestionIndex];

    let optionsHtml = '';
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // For MCQs

    // Generate HTML for options based on question type
    if (question.questionType === 'multiple_choice') {
        optionsHtml = question.options.map((option, idx) => `
            <label class="quiz-option-label ${isAnswered || isMarked ? 'cursor-not-allowed' : 'hover:bg-indigo-50'}
                ${isAnswered && option === question.correctAnswer ? 'bg-green-100 border-green-400 text-green-700' : ''}
                ${isAnswered && option === userAnswer && option !== question.correctAnswer ? 'bg-red-100 border-red-400 text-red-700' : ''}
                ${!isAnswered && !isMarked && option === userAnswer ? 'bg-indigo-100 border-indigo-400' : 'border-slate-300'}
            ">
                <input type="radio" name="quizOption" value="${escapeHtml(option)}"
                    ${option === userAnswer ? 'checked' : ''}
                    ${isAnswered || isMarked ? 'disabled' : ''}
                    class="form-radio quiz-option-input sr-only"
                    onchange="handleQuizAnswerSelection('${escapeHtml(option)}', 'multiple_choice')"
                >
                <span class="font-medium mr-1.5">${alphabet[idx]}.</span>
                <span>${processTextForDisplay(option)}</span>
            </label>
        `).join('');
    } else if (question.questionType === 'select_all') {
        optionsHtml = question.options.map((option, idx) => `
            <label class="quiz-option-label ${isAnswered || isMarked ? 'cursor-not-allowed' : 'hover:bg-indigo-50'}
                ${isAnswered && question.correctAnswer.includes(option) ? 'bg-green-100 border-green-400 text-green-700' : ''}
                ${isAnswered && userAnswer?.includes(option) && !question.correctAnswer.includes(option) ? 'bg-red-100 border-red-400 text-red-700' : ''}
                ${!isAnswered && !isMarked && userAnswer?.includes(option) ? 'bg-indigo-100 border-indigo-400' : 'border-slate-300'}
            ">
                <input type="checkbox" name="quizOption" value="${escapeHtml(option)}"
                    ${userAnswer?.includes(option) ? 'checked' : ''}
                    ${isAnswered || isMarked ? 'disabled' : ''}
                    class="form-checkbox quiz-option-input sr-only"
                    onchange="handleQuizAnswerSelection('${escapeHtml(option)}', 'select_all')"
                >
                <span class="font-medium mr-1.5">${alphabet[idx]}.</span>
                <span>${processTextForDisplay(option)}</span>
            </label>
        `).join('');
    } else if (question.questionType === 'short_answer') {
        optionsHtml = `
            <textarea id="shortAnswerText" class="form-textarea w-full rounded-lg border-slate-300 shadow-sm text-sm" rows="3" placeholder="Type your answer here..." ${isAnswered || isMarked ? 'disabled' : ''} oninput="handleQuizAnswerSelection(this.value, 'short_answer')">${userAnswer || ''}</textarea>
        `;
    } else { // Fallback for unknown question types
        optionsHtml = '<p class="text-red-500">Unsupported question type.</p>';
    }

    // Main quiz interface HTML structure
    const quizHtml = `
        <div class="quiz-question-display p-4 sm:p-6 bg-white rounded-xl shadow-lg">
            <div class="flex justify-between items-start mb-4">
                <h4 class="quiz-question-text text-base sm:text-lg font-semibold text-slate-800">${processTextForDisplay(question.questionText)}</h4>
                <span class="text-xs sm:text-sm text-slate-500 whitespace-nowrap">Question ${window.currentQuizQuestionIndex + 1} of ${window.currentQuizData.length}</span>
            </div>
            <div class="space-y-3 mb-6">${optionsHtml}</div>

            <div id="quizAnswerFeedback" class="mt-4 hidden text-sm"></div>
            <div id="quizDetailedExplanation" class="mt-4 hidden text-sm p-3 bg-sky-50 border border-sky-200 rounded-md"></div>
            <div id="quizQuestionChatContainer" class="mt-4 hidden space-y-2">
                <div id="quizQuestionChatHistory" class="max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-md bg-slate-50 text-xs"></div>
                <div class="flex space-x-2">
                    <input type="text" id="quizChatInput" class="form-input flex-grow rounded-lg border-slate-300 shadow-sm text-sm" placeholder="Ask about this question...">
                    <button onclick="handleQuizChatSend()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white">Send</button>
                </div>
            </div>

            <div class="mt-6 flex flex-wrap gap-2 justify-between items-center">
                <div class="flex flex-wrap gap-2">
                    <button onclick="handleQuizAnswerSubmission()" class="quiz-nav-button bg-indigo-600 hover:bg-indigo-700 text-white" ${isAnswered || isMarked ? 'disabled' : ''}>Check Answer</button>
                    <button onclick="toggleDetailedExplanation()" class="quiz-nav-button bg-sky-500 hover:bg-sky-600 text-white ${!isAnswered ? 'hidden' : ''}">Toggle Explanation</button>
                    <button onclick="toggleQuizQuestionChat()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white ${!isAnswered ? 'hidden' : ''}">Chat About Question</button>
                </div>
                <button onclick="regenerateCurrentQuizQuestion()" class="quiz-nav-button bg-orange-500 hover:bg-orange-600 text-white text-xs ${!isAnswered ? 'hidden' : ''}">Regenerate This Question</button>
            </div>
        </div>

        <div class="flex justify-center items-center mt-6 space-x-1 quiz-progress-dots">
            ${window.currentQuizData.map((_, idx) => `
                <button
                    class="w-2.5 h-2.5 rounded-full transition-colors duration-200 focus:outline-none
                        ${idx === window.currentQuizQuestionIndex ? 'bg-indigo-600 ring-2 ring-indigo-400 ring-offset-1' :
                        window.quizQuestionStates[idx] === 'correct' ? 'bg-green-500' :
                        window.quizQuestionStates[idx] === 'incorrect' ? 'bg-red-500' :
                        window.quizQuestionStates[idx] === 'partial' ? 'bg-yellow-500' :
                        window.quizQuestionStates[idx] === 'marked' ? 'bg-purple-500' :
                        window.quizQuestionStates[idx] === 'skipped' ? 'bg-slate-400' :
                        'bg-slate-300 hover:bg-slate-400'}"
                    onclick="jumpToQuizQuestion(${idx})"
                    aria-label="Go to question ${idx + 1}"
                ></button>
            `).join('')}
        </div>

        <div class="mt-8 flex justify-between">
            <button onclick="previousQuizQuestion()" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white" ${window.currentQuizQuestionIndex === 0 ? 'disabled' : ''}>Previous</button>
            <div class="flex space-x-2">
                 <button onclick="markQuestionForReview()" class="quiz-nav-button bg-purple-500 hover:bg-purple-600 text-white text-xs">${isMarked ? 'Unmark' : 'Mark for Review'}</button>
                 ${!isAnswered && !isMarked ? `<button onclick="skipQuestion()" class="quiz-nav-button bg-gray-400 hover:bg-gray-500 text-white text-xs">Skip</button>` : ''}
            </div>
            ${window.currentQuizQuestionIndex === window.currentQuizData.length - 1
                ? `<button onclick="finishQuiz()" class="quiz-nav-button bg-green-600 hover:bg-green-700 text-white">Finish Quiz</button>`
                : `<button onclick="nextQuizQuestion()" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white">Next</button>`
            }
        </div>
    `;
    quizInterfaceContainer.innerHTML = quizHtml;

    // Restore state for answered questions (feedback, explanation visibility)
    if(isAnswered) {
        displayQuizAnswerFeedbackUI(window.userQuizAnswers[window.currentQuizQuestionIndex], window.currentQuizData[window.currentQuizQuestionIndex]);
        const explanationDiv = document.getElementById('quizDetailedExplanation');
        if (explanationDiv && question.detailedExplanationFetched && question.detailedExplanationContent && !explanationDiv.classList.contains('hidden')) { // Check if it was meant to be visible
            explanationDiv.innerHTML = `<p class="font-medium text-slate-700">Detailed Explanation:</p><p class="mt-1">${processTextForDisplay(question.detailedExplanationContent)}</p>`;
            // explanationDiv.classList.remove('hidden'); // Already checked
        }
    }
    // Restore chat history if chat was open
    const chatContainer = document.getElementById('quizQuestionChatContainer');
    if (question.chatHistory && question.chatHistory.length > 0 && chatContainer && !chatContainer.classList.contains('hidden')) {
        renderQuizChatHistory();
    }
}


/**
 * Escapes HTML special characters in a string.
 * Origin: new_ui.js (helper for quiz options)
 * @param {string} unsafe - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe; // Handle non-string inputs gracefully
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/**
 * Handles user's answer selection for a quiz question.
 * Origin: new_ui.js
 * @param {string | string[]} value - The selected answer value(s).
 * @param {'multiple_choice' | 'select_all' | 'short_answer'} type - The type of question.
 */
window.handleQuizAnswerSelection = function(value, type) {
    const index = window.currentQuizQuestionIndex;
    // Prevent changing answer if already submitted or marked (unless unmarking)
    if (window.quizQuestionStates[index] === 'marked' || (window.quizQuestionStates[index] !== 'unanswered' && window.quizQuestionStates[index] !== 'skipped')) {
        return;
    }

    if (type === 'select_all') {
        window.userQuizAnswers[index] = window.userQuizAnswers[index] || []; // Initialize if null
        const optionIndex = window.userQuizAnswers[index].indexOf(value);
        if (optionIndex === -1) { // Add if not present
            window.userQuizAnswers[index].push(value);
        } else { // Remove if present (deselect)
            window.userQuizAnswers[index].splice(optionIndex, 1);
        }
    } else { // For multiple_choice and short_answer
        window.userQuizAnswers[index] = value;
    }

    // For MCQs and Select All, re-render to show selection, but not for short answer as user types
    if (type !== 'short_answer') {
      renderQuizInterface();
    }
}

/**
 * Handles submission of a quiz answer.
 * Origin: new_ui.js
 */
window.handleQuizAnswerSubmission = async function() {
    const index = window.currentQuizQuestionIndex;
    const question = window.currentQuizData[index];
    const userAnswer = window.userQuizAnswers[index];
    const feedbackElementId = 'quizAnswerFeedback'; // For showMessage/showProcessingStatus

    if (window.quizQuestionStates[index] === 'marked') {
        showMessage(feedbackElementId, 'This question is marked for review. Unmark to submit an answer.', 'warning', 3000);
        return;
    }

    if (userAnswer === null || (Array.isArray(userAnswer) && userAnswer.length === 0) || (typeof userAnswer === 'string' && userAnswer.trim() === '')) {
        showMessage(feedbackElementId, 'Please select or type an answer.', 'warning', 3000);
        return;
    }

    try {
        showProcessingStatus(feedbackElementId, 'Checking answer...', true);
        // const response = await apiGetQuizAnswerFeedback(question, userAnswer); // Actual API call
        // Mocking API
        await new Promise(resolve => setTimeout(resolve, 500));
        let mockFeedbackText = "Your answer is incorrect.";
        if ( (question.questionType === 'multiple_choice' && userAnswer === question.correctAnswer) ||
             (question.questionType === 'short_answer' && userAnswer.toLowerCase().includes(question.correctAnswer.toLowerCase())) ) {
            mockFeedbackText = "Correct!";
        } else if (question.questionType === 'select_all' && userAnswer && question.correctAnswer && userAnswer.sort().join(',') === question.correctAnswer.sort().join(',')) {
            mockFeedbackText = "Correct!";
        } else if (userAnswer === "partial") { // for testing partial
            mockFeedbackText = "Partially correct.";
        }
        const response = { feedback: mockFeedbackText };
        // End mock

        if (response.feedback.toLowerCase().includes('correct!')) {
            window.quizQuestionStates[index] = 'correct';
        } else if (response.feedback.toLowerCase().includes('partially correct')) {
            window.quizQuestionStates[index] = 'partial';
        } else {
            window.quizQuestionStates[index] = 'incorrect';
        }
        question.aiFeedback = response.feedback; // Store AI feedback
        hideProcessingStatus(feedbackElementId);
        renderQuizInterface(); // Re-render to show feedback and disable options
        // displayQuizAnswerFeedbackUI is called within renderQuizInterface if answered

    } catch (error) {
        console.error("Error submitting quiz answer:", error);
        showMessage(feedbackElementId, `Error: ${error.message || 'Could not submit answer.'}`, 'error', 5000);
        hideProcessingStatus(feedbackElementId); // Ensure loading is hidden on error
    }
}

/**
 * Displays feedback for a submitted quiz answer within the UI.
 * Origin: new_ui.js
 * @param {string | string[]} userAnswer - The user's answer.
 * @param {object} question - The quiz question object.
 */
function displayQuizAnswerFeedbackUI(userAnswer, question) {
    const feedbackDiv = document.getElementById('quizAnswerFeedback');
    if (!feedbackDiv) return;

    let feedbackHtml = `<p class="font-semibold mb-1">Your Answer vs. Correct Answer:</p>`;

    if (question.questionType === 'multiple_choice') {
        feedbackHtml += `<p>Your choice: <span class="font-medium">${processTextForDisplay(userAnswer)}</span></p>`;
        feedbackHtml += `<p>Correct answer: <span class="font-medium text-green-600">${processTextForDisplay(question.correctAnswer)}</span></p>`;
    } else if (question.questionType === 'select_all') {
        feedbackHtml += `<p>Your selection(s): <span class="font-medium">${userAnswer && userAnswer.length > 0 ? userAnswer.map(opt => processTextForDisplay(opt)).join(', ') : 'None'}</span></p>`;
        feedbackHtml += `<p>Correct selection(s): <span class="font-medium text-green-600">${question.correctAnswer.map(opt => processTextForDisplay(opt)).join(', ')}</span></p>`;
    } else if (question.questionType === 'short_answer') {
        feedbackHtml += `<p>Your answer: <span class="font-medium">${processTextForDisplay(userAnswer)}</span></p>`;
        feedbackHtml += `<p>Suggested answer: <span class="font-medium text-green-600">${processTextForDisplay(question.correctAnswer)}</span></p>`;
    }

    // Add AI feedback or brief explanation
    if (question.aiFeedback) {
        feedbackHtml += `<p class="mt-2 pt-2 border-t border-slate-200">AI Feedback: ${processTextForDisplay(question.aiFeedback)}</p>`;
    } else if (question.briefExplanation) { // Fallback to brief explanation if no AI feedback
        feedbackHtml += `<p class="mt-2 pt-2 border-t border-slate-200">Explanation: ${processTextForDisplay(question.briefExplanation)}</p>`;
    }

    feedbackDiv.innerHTML = feedbackHtml;
    // Style feedback div based on correctness
    feedbackDiv.className = `mt-4 p-3 rounded-md text-sm ${
        window.quizQuestionStates[window.currentQuizQuestionIndex] === 'correct' ? 'bg-green-50 border-green-200 text-green-700' :
        window.quizQuestionStates[window.currentQuizQuestionIndex] === 'partial' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
        'bg-red-50 border-red-200 text-red-700' // Incorrect or other states
    }`;
    feedbackDiv.classList.remove('hidden');
}


/**
 * Toggles the display of detailed explanation for a quiz question.
 * Origin: new_ui.js
 */
window.toggleDetailedExplanation = async function() {
    const explanationDiv = document.getElementById('quizDetailedExplanation');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    const feedbackElementId = 'quizAnswerFeedback'; // For status messages

    if (!explanationDiv) return;

    if (explanationDiv.classList.contains('hidden') || !question.detailedExplanationFetched) {
        if (!question.detailedExplanationContent) { // Fetch if not already fetched
            try {
                showProcessingStatus(feedbackElementId, 'Fetching explanation...', true); // Show status near feedback
                // const response = await apiGetQuizQuestionDetailedExplanation(question); // Actual API call
                // Mocking API
                await new Promise(resolve => setTimeout(resolve, 500));
                const response = { explanation: `This is a mock detailed explanation for question: ${question.questionText.substring(0,20)}...` };
                // End mock
                question.detailedExplanationContent = response.explanation;
                hideProcessingStatus(feedbackElementId);
            } catch (error) {
                console.error("Error fetching detailed explanation:", error);
                showMessage(feedbackElementId, `Error fetching explanation: ${error.message}`, 'error', 3000);
                hideProcessingStatus(feedbackElementId);
                return;
            }
        }
        explanationDiv.innerHTML = `<p class="font-medium text-slate-700">Detailed Explanation:</p><p class="mt-1">${processTextForDisplay(question.detailedExplanationContent)}</p>`;
        explanationDiv.classList.remove('hidden');
        question.detailedExplanationFetched = true;
    } else {
        explanationDiv.classList.add('hidden');
    }
}

/**
 * Toggles the visibility of the chat interface for a quiz question.
 * Origin: new_ui.js
 */
window.toggleQuizQuestionChat = function() {
    const chatContainer = document.getElementById('quizQuestionChatContainer');
    if (!chatContainer) return;
    chatContainer.classList.toggle('hidden');
    if (!chatContainer.classList.contains('hidden')) {
        renderQuizChatHistory(); // Populate chat history if opening
        document.getElementById('quizChatInput')?.focus();
    }
}

/**
 * Renders the chat history for the current quiz question.
 * Origin: new_ui.js
 */
function renderQuizChatHistory() {
    const chatHistoryDiv = document.getElementById('quizQuestionChatHistory');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    question.chatHistory = question.chatHistory || []; // Ensure chatHistory array exists

    if (!chatHistoryDiv) return;
    chatHistoryDiv.innerHTML = question.chatHistory.map(msg =>
        `<p class="${msg.role === 'user' ? 'text-blue-600 text-right' : 'text-green-700 text-left'} p-1"><strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong> ${processTextForDisplay(msg.parts[0].text)}</p>`
    ).join('');
    if (chatHistoryDiv.children.length > 0) {
      chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight; // Scroll to latest message
    }
}

/**
 * Handles sending a chat message related to a quiz question.
 * Origin: new_ui.js
 */
window.handleQuizChatSend = async function() {
    const chatInput = document.getElementById('quizChatInput');
    const feedbackElementId = 'quizAnswerFeedback'; // For status/error messages
    if (!chatInput) return;

    const userQuery = chatInput.value.trim();
    if (!userQuery) return;

    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    question.chatHistory = question.chatHistory || [];

    let tempUserMessage = { role: "user", parts: [{ text: userQuery }] }; // Store temporarily

    try {
        chatInput.disabled = true;
        question.chatHistory.push(tempUserMessage);
        renderQuizChatHistory(); // Show user's message immediately
        chatInput.value = ''; // Clear input

        // const response = await apiChatAboutQuizQuestion(question, question.chatHistory.slice(0, -1), userQuery); // Actual API call
        // Mocking API
        await new Promise(resolve => setTimeout(resolve, 500));
        const response = { chatResponse: `Mock AI reply to: "${userQuery}"` };
        // End mock

        // Update with actual AI response
        question.chatHistory.push({ role: "model", parts: [{ text: response.chatResponse }] });
        renderQuizChatHistory();

    } catch (error) {
        console.error("Error in quiz chat:", error);
        showMessage(feedbackElementId, `Chat error: ${error.message || 'Could not send message.'}`, 'error', 3000);
        // Remove the user's message if AI call failed, so they can retry
        const userMsgIndex = question.chatHistory.findIndex(msg => msg.parts[0].text === tempUserMessage.parts[0].text && msg.role === 'user');
        if (userMsgIndex > -1) question.chatHistory.splice(userMsgIndex, 1);
        renderQuizChatHistory(); // Re-render without the failed user message
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
}

/**
 * Regenerates the current quiz question.
 * Origin: new_ui.js
 */
window.regenerateCurrentQuizQuestion = async function() {
    const index = window.currentQuizQuestionIndex;
    const originalQuestion = window.currentQuizData[index];
    const statusElementId = 'quizLoadingStatus'; // Use a general loading status for this

    try {
        showProcessingStatus(statusElementId, 'Regenerating question...', true);
        // const newQuestionData = await apiRegenerateQuizQuestion(originalQuestion, window.currentQuizTextContext, originalQuestion.difficulty || window.currentQuizOptions.difficulty); // Actual API
        // Mocking API
        await new Promise(resolve => setTimeout(resolve, 500));
        const newQuestionData = { question: { id: originalQuestion.id, questionType: 'multiple_choice', questionText: `Regenerated Mock Q: ${Math.random()}`, options: ['A', 'B', 'C'], correctAnswer: 'A', briefExplanation: 'New explanation.' }};
        // End mock

        // Replace current question data with new data, reset states
        window.currentQuizData[index] = {
            ...newQuestionData.question,
            id: originalQuestion.id, // Keep original ID if needed for tracking
            chatHistory: [],
            detailedExplanationContent: null,
            detailedExplanationFetched: false,
            aiFeedback: null,
            previousStateBeforeMark: null
        };
        window.userQuizAnswers[index] = null;
        window.quizQuestionStates[index] = 'unanswered';

        hideProcessingStatus(statusElementId);
        clearMessage('quizAnswerFeedback'); // Clear any old feedback
        document.getElementById('quizDetailedExplanation')?.classList.add('hidden');
        document.getElementById('quizQuestionChatContainer')?.classList.add('hidden');
        renderQuizInterface(); // Re-render with the new question
        showMessage(statusElementId, 'Question regenerated.', 'success', 3000);

    } catch (error) {
        console.error("Error regenerating quiz question:", error);
        showMessage(statusElementId, `Error regenerating question: ${error.message}`, 'error', 5000);
        hideProcessingStatus(statusElementId);
    }
}

// --- Quiz Navigation and Lifecycle Functions (from new_ui.js) ---
window.previousQuizQuestion = function() {
    if (window.currentQuizQuestionIndex > 0) {
        window.currentQuizQuestionIndex--;
        renderQuizInterface();
    }
}

window.nextQuizQuestion = function() {
    if (window.currentQuizQuestionIndex < window.currentQuizData.length - 1) {
        window.currentQuizQuestionIndex++;
        renderQuizInterface();
    }
}

window.jumpToQuizQuestion = function(index) {
    if (index >= 0 && index < window.currentQuizData.length) {
        window.currentQuizQuestionIndex = index;
        renderQuizInterface();
    }
}

window.markQuestionForReview = function() {
    const index = window.currentQuizQuestionIndex;
    const question = window.currentQuizData[index];

    if (window.quizQuestionStates[index] === 'marked') { // Unmarking
        window.quizQuestionStates[index] = question.previousStateBeforeMark || 'unanswered'; // Restore previous state
        question.previousStateBeforeMark = null;
    } else { // Marking
        question.previousStateBeforeMark = window.quizQuestionStates[index]; // Save current state
        window.quizQuestionStates[index] = 'marked';
    }
    renderQuizInterface(); // Re-render to update UI (button text, input disabled states)
}

window.skipQuestion = function() {
    const index = window.currentQuizQuestionIndex;
    if (window.quizQuestionStates[index] !== 'skipped' && window.quizQuestionStates[index] !== 'correct' && window.quizQuestionStates[index] !== 'incorrect' && window.quizQuestionStates[index] !== 'partial') {
        window.quizQuestionStates[index] = 'skipped';
    }
    // Move to next or finish
    if (window.currentQuizQuestionIndex < window.currentQuizData.length - 1) {
        nextQuizQuestion();
    } else {
        finishQuiz();
    }
}

window.finishQuiz = function() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizSetupView = document.getElementById('quizSetupView'); // To hide setup view

    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    if(quizResultsContainer) quizResultsContainer.classList.remove('hidden');
    if(quizSetupView) quizSetupView.classList.add('hidden'); // Ensure setup is hidden

    let score = 0;
    let correctAnswers = 0;
    // let attemptedQuestions = 0; // Not used in current display logic but could be
    let hasPartialPoints = false;

    window.currentQuizData.forEach((question, index) => {
        const state = window.quizQuestionStates[index];
        if (state === 'correct') {
            score++;
            correctAnswers++;
        } else if (state === 'partial') {
            score += 0.5; // Example partial score
            hasPartialPoints = true;
        }
        // Only count 'correct', 'partial', 'incorrect' as attempted for score calculation
        // Skipped/Marked are not directly scored unless they had a prior state.
    });

    const totalQuestions = window.currentQuizData.length;
    const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
    const scoreDisplay = hasPartialPoints ? score.toFixed(1) : score.toFixed(0);

    let encouragingMessage = "Good effort! Keep practicing.";
    if (percentage >= 80) encouragingMessage = "Excellent work! You've mastered this material.";
    else if (percentage >= 60) encouragingMessage = "Great job! You're getting there.";

    quizResultsContainer.innerHTML = `
        <div class="p-4 sm:p-6 bg-white rounded-xl shadow-xl text-center">
            <h3 class="text-xl sm:text-2xl font-semibold text-slate-800 mb-3">Quiz Completed!</h3>
            <p class="text-lg text-indigo-600 font-bold mb-2">Your Score: ${scoreDisplay} / ${totalQuestions} (${percentage.toFixed(1)}%)</p>
            <p class="text-slate-600 mb-6">${encouragingMessage}</p>

            <div class="text-left my-6 max-h-60 overflow-y-auto border border-slate-200 rounded-md p-3 bg-slate-50">
                <h4 class="text-md font-semibold text-slate-700 mb-2">Review Your Answers:</h4>
                ${window.currentQuizData.map((q, i) => `
                    <div class="py-2 border-b border-slate-200 last:border-b-0 text-sm flex justify-between items-center">
                        <span><span class="font-medium">Q${i+1}:</span> ${processTextForDisplay(q.questionText.substring(0,50))}...</span>
                        <span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold
                            ${window.quizQuestionStates[i] === 'correct' ? 'bg-green-100 text-green-700' :
                              window.quizQuestionStates[i] === 'incorrect' ? 'bg-red-100 text-red-700' :
                              window.quizQuestionStates[i] === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                              window.quizQuestionStates[i] === 'marked' ? 'bg-purple-100 text-purple-700' :
                              window.quizQuestionStates[i] === 'skipped' ? 'bg-slate-200 text-slate-600' :
                              'bg-gray-100 text-gray-500'}">
                            ${window.quizQuestionStates[i].replace(/^\w/, c => c.toUpperCase())}
                        </span>
                    </div>
                `).join('')}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                <button onclick="retryIncorrectQuestions()" class="quiz-nav-button bg-orange-500 hover:bg-orange-600 text-white w-full">Retry Incorrect/Partial</button>
                <button onclick="retryAllQuestions()" class="quiz-nav-button bg-blue-500 hover:bg-blue-600 text-white w-full">Retry All Questions</button>
                <button onclick="startNewQuizSameSettings()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white w-full">New Quiz (Same Material & Settings)</button>
                <button onclick="changeQuizSettingsAndStartNew()" class="quiz-nav-button bg-indigo-500 hover:bg-indigo-600 text-white w-full">Change Settings & New Quiz</button>
            </div>
        </div>
    `;
    const startQuizBtn = document.getElementById('startQuizBtn');
    if (startQuizBtn) { // Update main start button text
        startQuizBtn.disabled = !(window.currentExtractedTextForQuiz && window.currentExtractedTextForQuiz.trim() !== "");
        startQuizBtn.textContent = 'Start New Quiz';
    }
}

window.retryIncorrectQuestions = function() {
    const incorrectOrPartialQuestionsData = window.originalFullQuizData.filter((q, index) => {
        const state = window.quizQuestionStates[index];
        return state === 'incorrect' || state === 'partial';
    });

    if (incorrectOrPartialQuestionsData.length > 0) {
        window.currentQuizData = incorrectOrPartialQuestionsData.map(q => ({ // Reset states for retry
            ...q,
            chatHistory: [], detailedExplanationContent: null, detailedExplanationFetched: false, aiFeedback: null, previousStateBeforeMark: null
        }));
        window.currentQuizQuestionIndex = 0;
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
        document.getElementById('quizResultsContainer').classList.add('hidden');
        renderQuizInterface();
        document.getElementById('quizInterfaceContainer').classList.remove('hidden');
    } else {
        showMessage('quizLoadingStatus', 'No incorrect or partially correct questions to retry!', 'success', 3000); // Use a general status area
    }
}

window.retryAllQuestions = function() {
    if (!window.originalFullQuizData || window.originalFullQuizData.length === 0) {
        showMessage('quizLoadingStatus', 'No original quiz data to retry.', 'error', 3000);
        return;
    }
    // Deep clone original data and reset states
    window.currentQuizData = JSON.parse(JSON.stringify(window.originalFullQuizData)).map(q => ({
        ...q,
        chatHistory: [], detailedExplanationContent: null, detailedExplanationFetched: false, aiFeedback: null, previousStateBeforeMark: null
    }));
    window.currentQuizQuestionIndex = 0;
    window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
    window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');

    document.getElementById('quizResultsContainer').classList.add('hidden');
    renderQuizInterface();
    document.getElementById('quizInterfaceContainer').classList.remove('hidden');
}

window.startNewQuizSameSettings = async function() {
    if (!window.currentQuizTextContext) {
        showMessage('quizLoadingStatus', 'Cannot start new quiz: missing original text context.', 'error', 3000);
        return;
    }
    // Ensure currentQuizOptions are set, if not, use defaults
    if (!window.currentQuizOptions || Object.keys(window.currentQuizOptions).length === 0) {
        window.currentQuizOptions = { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
    }
    document.getElementById('quizResultsContainer')?.classList.add('hidden');
    await handleStartQuiz(true); // Force regenerate with same settings
}

window.changeQuizSettingsAndStartNew = function() {
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    // const quizReadyMessage = document.getElementById('quizReadyMessage'); // Not directly used here
    // const startQuizBtn = document.getElementById('startQuizBtn'); // Not directly used here
    const customizeDetails = quizSetupView ? quizSetupView.querySelector('details') : null;

    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
    if(quizSetupView) quizSetupView.classList.remove('hidden'); // Show setup view
    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');

    // document.getElementById('quizReadyMessage')?.classList.add('hidden'); // Hide ready message
    // document.getElementById('startQuizBtn')?.classList.add('hidden'); // Hide main start button, rely on regenerate button in setup
    if(customizeDetails) customizeDetails.open = true; // Expand options

    window.currentQuizData = null; // Clear old quiz data

    // Optionally reset UI options to defaults, or leave them as user last set
    const defaultQuestionTypeCheckbox = document.querySelector('#quizSetupView input[name="quizQuestionTypeOption"][value="multiple_choice"]');
    if (defaultQuestionTypeCheckbox && !document.querySelector('#quizSetupView input[name="quizQuestionTypeOption"]:checked')) {
        defaultQuestionTypeCheckbox.checked = true; // Ensure at least one is checked if none are
    }
    // Similar for numQuestions and difficulty if needed
}


// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    initializeQuizSystem(); // Initialize quiz system on page load
    setupTabs('#resultsSection .tabs'); // Setup main results tabs
    setCurrentYear('currentYear'); // Set current year in footer or elsewhere
    // Any other initializations
});

// --- Expose functions to global window object if called from HTML onclick or needed globally ---
// Many are already assigned (e.g., window.handleQuizAnswerSubmission = function() {...})
// Ensure all functions intended for global access are exposed.
window.toggleElementVisibility = toggleElementVisibility;
window.showMessage = showMessage;
window.clearMessage = clearMessage;
window.showProcessingStatus = showProcessingStatus;
window.hideProcessingStatus = hideProcessingStatus;
window.setCurrentYear = setCurrentYear;
window.setupTabs = setupTabs;
window.processTextForDisplay = processTextForDisplay;
window.displayResults = displayResults;
window.renderSummary = renderSummary;
window.renderInteractiveFlashcards = renderInteractiveFlashcards; // From old_ui.js, now global
window.updateNav = updateNav;

// Quiz system functions are already exposed via window.functionName = ... in new_ui.js
// Flashcard helper functions (updateProgressBar, displayFlashcard, etc.) are mostly internal
// to renderInteractiveFlashcards but are defined globally in this merged file.
