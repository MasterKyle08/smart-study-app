// Smart Study UI Script - AI Feedback & Interactions Update
console.log("Smart Study UI Script Loaded - Version: AI_FEEDBACK_MERGED_2.3-statefix-enhanced");

// --- Global Variables ---
// Flashcard related
let currentFlashcardIndex = 0;
let allFlashcardsData = []; 
let flashcardContext = 'main'; 
let markedForReview = []; 
let flashcardStates = {}; // Stores state like {isFlipped, userAnswer, aiFeedback, correctness, chatHistory: []}

// Quiz related
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

// General application state
window.lastProcessedResults = null; 
window.currentKeywordsForHighlighting = []; 

// --- UI Helper Functions ---
function toggleElementVisibility(elementId, forceShow) {
    const element = document.getElementById(elementId);
    if (!element) {
        return;
    }
    const usesDataVisible = typeof element.dataset.visible !== 'undefined';
    const currentlyVisible = usesDataVisible ? element.dataset.visible === 'true' : !element.classList.contains('hidden');
    const show = typeof forceShow === 'boolean' ? forceShow : !currentlyVisible;

    if (usesDataVisible) {
        element.dataset.visible = show ? 'true' : 'false';
    }
    element.classList.toggle('hidden', !show);
}

function showMessage(elementId, message, type = 'success', duration = 0) {
    const element = document.getElementById(elementId);
    if (!element) {
        return;
    }
    element.className = 'p-3 rounded-md shadow-sm text-sm font-medium block my-2 transition-opacity duration-300 ease-in-out'; 
    const typeClasses = {
        success: ['bg-green-100', 'border', 'border-green-300', 'text-green-700'],
        error: ['bg-red-100', 'border', 'border-red-300', 'text-red-700'],
        warning: ['bg-yellow-100', 'border', 'border-yellow-300', 'text-yellow-700']
    };
    element.classList.add(...(typeClasses[type] || typeClasses.success));
    element.textContent = message;
    element.classList.remove('hidden', 'opacity-0'); 
    element.classList.add('opacity-100');

    if (duration > 0) {
        setTimeout(() => {
            element.classList.remove('opacity-100');
            element.classList.add('opacity-0');
            setTimeout(() => clearMessage(elementId), 300); 
        }, duration);
    }
}

function clearMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = '';
        element.className = ''; 
        element.classList.add('hidden', 'opacity-0'); 
    }
}

function showProcessingStatus(elementId, message, showSpinner = false) {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.innerHTML = `${message}${showSpinner ? ' <div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 ml-2 align-middle"></div>' : ''}`;
        statusElement.className = 'p-3 rounded-md shadow-sm text-sm font-medium bg-blue-50 border border-blue-200 text-blue-700 my-2 block';
        statusElement.classList.remove('hidden');
    }
}

function hideProcessingStatus(elementId) {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.classList.add('hidden');
        statusElement.innerHTML = '';
    }
}

function setCurrentYear(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = new Date().getFullYear();
}

function setupTabs(tabLinkContainerSelector) {
    const tabLinkContainer = document.querySelector(tabLinkContainerSelector);
    if (!tabLinkContainer) return;
    const tabLinks = Array.from(tabLinkContainer.querySelectorAll('.tab-link'));
    tabLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            if (link.classList.contains('opacity-50') || link.disabled) { event.preventDefault(); return; }
            const targetId = link.dataset.tab;
            tabLinks.forEach(tl => tl.removeAttribute('data-active'));
            const tabSystemContainer = tabLinkContainer.closest('#resultsSection') || tabLinkContainer.closest('#sessionDetailModal');
            const contentPanes = tabSystemContainer ? tabSystemContainer.querySelectorAll('.tab-content') : [];
            
            contentPanes.forEach(pane => { pane.classList.add('hidden'); pane.removeAttribute('data-active'); });
            link.dataset.active = "true";
            const targetContent = document.getElementById(targetId);
            if (targetContent) { targetContent.classList.remove('hidden'); targetContent.dataset.active = "true"; }
        });
    });
}

function processTextForDisplay(text, keywordsToHighlight = []) {
    if (text === null || typeof text === 'undefined') return '';
    let escapedText = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    let html = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
    if (keywordsToHighlight && keywordsToHighlight.length > 0) {
        keywordsToHighlight.forEach(keyword => {
            if (keyword && keyword.trim() !== "") {
                const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedKeyword})`, 'gi');
                html = html.replace(regex, (match) => `<span class="highlighted-keyword">${match}</span>`);
            }
        });
    }
    return html.replace(/\n/g, '<br>');
}

function updateNav(isLoggedIn, userEmail = '') {
    const loginNavButton = document.getElementById('loginNavButton');
    const registerNavButton = document.getElementById('registerNavButton');
    const dashboardNavButton = document.getElementById('dashboardNavButton');
    const logoutNavButton = document.getElementById('logoutNavButton');
    const userActionsSection = document.getElementById('userActions');
    const userEmailSpan = document.getElementById('userEmail');

    if (isLoggedIn) {
        if (loginNavButton) loginNavButton.classList.add('hidden');
        if (registerNavButton) registerNavButton.classList.add('hidden');
        if (dashboardNavButton) dashboardNavButton.classList.remove('hidden');
        if (logoutNavButton) logoutNavButton.classList.remove('hidden');
        if(userActionsSection && userEmailSpan && (window.location.pathname.endsWith('index.html') || window.location.pathname === '/')) {
            userEmailSpan.textContent = userEmail;
            userActionsSection.classList.remove('hidden');
        }
    } else {
        if (loginNavButton) loginNavButton.classList.remove('hidden');
        if (registerNavButton) registerNavButton.classList.remove('hidden');
        if (dashboardNavButton) dashboardNavButton.classList.add('hidden');
        if (logoutNavButton) logoutNavButton.classList.add('hidden');
        if (userActionsSection) userActionsSection.classList.add('hidden');
        if (userEmailSpan) userEmailSpan.textContent = '';
    }
}

function renderSummary(container, summaryText) {
    if (!container) return;
    container.innerHTML = '';
    const explainInstructionElement = document.getElementById('explainInstruction') || document.getElementById('modalExplainInstruction');
    if (!summaryText) {
        container.innerHTML = '<p class="text-slate-500 text-sm p-4">No summary available.</p>';
        if (explainInstructionElement) explainInstructionElement.classList.add('hidden');
        return;
    }
    container.innerHTML = processTextForDisplay(summaryText, window.currentKeywordsForHighlighting || []);
    if (container.innerHTML.trim() !== "" && explainInstructionElement) {
        explainInstructionElement.classList.remove('hidden');
    } else if (explainInstructionElement) {
        explainInstructionElement.classList.add('hidden');
    }
}

function displayResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutputRaw = document.getElementById('flashcardsOutputRaw');
    const launchFlashcardModalBtnMain = document.getElementById('launchFlashcardModalBtn-main');
    const flashcardPlaceholderTextEl = document.getElementById('flashcardPlaceholderText'); 

    const startQuizBtn = document.getElementById('startQuizBtn');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const summaryTabLink = document.querySelector('#resultsSection .tab-link[data-tab="summaryTab"]');
    const flashcardsTabLink = document.querySelector('#resultsSection .tab-link[data-tab="flashcardsTab"]');
    const quizTabLink = document.querySelector('#resultsSection .tab-link[data-tab="quizTab"]');

    if (!resultsSection) return;
    resultsSection.classList.remove('hidden');
    window.lastProcessedResults = results;
    window.currentExtractedTextForQuiz = results.extractedText || "";
    window.currentKeywordsForHighlighting = results.summaryKeywords || [];
    
    window.currentQuizData = null;
    window.originalFullQuizData = null;
    window.currentQuizQuestionIndex = 0;
    window.userQuizAnswers = [];
    window.quizQuestionStates = [];

    ['explainSelectedSummaryTextButton', 'explanationOutput', 'explainInstruction'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); if(id === 'explanationOutput') el.innerHTML = ''; }
    });

    let firstAvailableTabLink = null;

    if (summaryOutput && results.summary) {
        renderSummary(summaryOutput, results.summary);
        if (summaryTabLink) { summaryTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden'); summaryTabLink.disabled = false; if (!firstAvailableTabLink) firstAvailableTabLink = summaryTabLink; }
    } else {
        if (summaryOutput) summaryOutput.innerHTML = '<p class="text-slate-500 text-sm p-4">No summary generated.</p>';
        if (summaryTabLink) { summaryTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden'); summaryTabLink.disabled = true; }
    }

    if (results.flashcards && Array.isArray(results.flashcards) && results.flashcards.length > 0) {
        allFlashcardsData = results.flashcards; 
        if (flashcardsOutputRaw) flashcardsOutputRaw.value = JSON.stringify(results.flashcards, null, 2);
        if (flashcardPlaceholderTextEl) {
            flashcardPlaceholderTextEl.textContent = `Total ${results.flashcards.length} flashcards generated. Click "Study Flashcards" to begin.`;
        }
        if (launchFlashcardModalBtnMain) {
            launchFlashcardModalBtnMain.classList.remove('hidden');
            const newBtn = launchFlashcardModalBtnMain.cloneNode(true); 
            launchFlashcardModalBtnMain.parentNode.replaceChild(newBtn, launchFlashcardModalBtnMain);
            newBtn.onclick = () => {
                const modalContent = document.getElementById('flashcardModalContent-main');
                if (modalContent) {
                    renderInteractiveFlashcards(modalContent, allFlashcardsData, window.currentKeywordsForHighlighting, 'main');
                    toggleElementVisibility('flashcardStudyModal-main', true);
                }
            };
        }
        if (flashcardsTabLink) { flashcardsTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden'); flashcardsTabLink.disabled = false; if (!firstAvailableTabLink) firstAvailableTabLink = flashcardsTabLink; }
    } else {
        allFlashcardsData = [];
        if (flashcardsOutputRaw) flashcardsOutputRaw.value = '';
        if (flashcardPlaceholderTextEl) {
            flashcardPlaceholderTextEl.textContent = 'No flashcards available to display.';
        }
        if (launchFlashcardModalBtnMain) launchFlashcardModalBtnMain.classList.add('hidden');
        if (flashcardsTabLink) { flashcardsTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden'); flashcardsTabLink.disabled = true; }
    }

    window.currentQuizOptions = results.quizOptions || window.currentQuizOptions;

    if (results.quiz && Array.isArray(results.quiz) && results.quiz.length > 0) {
        window.currentQuizData = results.quiz.map(q => ({ ...q, chatHistory: [], detailedExplanationContent: null, detailedExplanationFetched: false, aiFeedback: null, correctness: null, previousStateBeforeMark: null, isExplanationVisible: false, isChatVisible: false })); 
        window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData));
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null); 
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered'); 
        if (quizTabLink) { quizTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden'); quizTabLink.disabled = false; if (!firstAvailableTabLink) firstAvailableTabLink = quizTabLink; }
    } else {
        if (quizTabLink) { quizTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden'); quizTabLink.disabled = true; }
    }
    initializeQuizSystem(); 

    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => { tl.removeAttribute('data-active'); document.getElementById(tl.dataset.tab)?.classList.add('hidden'); });
    if (firstAvailableTabLink) firstAvailableTabLink.click();
    else resultsSection.innerHTML = '<p class="text-center text-slate-500 p-6">No materials were generated.</p>';
}

// --- Flashcard System (Interactive with AI Feedback) ---
function renderInteractiveFlashcards(modalContentContainer, flashcards, keywordsToHighlight = [], currentContext = 'main') {
    modalContentContainer.innerHTML = '';
    allFlashcardsData = [...flashcards];
    currentFlashcardIndex = 0;
    flashcardContext = currentContext;
    markedForReview = allFlashcardsData.map(() => false);
    flashcardStates = {};
    allFlashcardsData.forEach((_, idx) => { 
        flashcardStates[idx] = { 
            isFlipped: false, 
            userAnswer: '', 
            aiFeedback: '', 
            correctness: null, 
            chatHistory: [] 
        }; 
    });

    if (!allFlashcardsData || allFlashcardsData.length === 0) {
        modalContentContainer.innerHTML = `<p class="text-slate-500 text-sm p-4 text-center">No flashcards to display.</p>`;
        return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col items-center w-full h-full p-1 sm:p-2';
    wrapper.innerHTML = `
        <div class="flex items-center justify-between w-full mb-2 px-1">
            <button id="shuffleFlashcardsBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Shuffle</button>
            <span id="flashcardCounter-${flashcardContext}" class="text-xs text-slate-600">1 / ${allFlashcardsData.length}</span>
            <button id="resetFlashcardsBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Reset Deck</button>
        </div>
        <div id="flashcardProgressBar-${flashcardContext}" class="w-full flex justify-center space-x-1 mb-3 px-1 flex-wrap"></div>
        <div id="flashcardScene-${flashcardContext}" class="flashcard-modal-scene w-full flex-grow">
            <div id="flashcardInner-${flashcardContext}" class="flashcard-modal-inner"></div>
        </div>
        <div class="flex items-center justify-between w-full mt-3 mb-3 px-1">
            <button id="prevFlashcardBtn-${flashcardContext}" class="flashcard-modal-nav-btn">&larr; Prev</button>
            <button id="markReviewBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Mark for Review</button>
            <button id="nextFlashcardBtn-${flashcardContext}" class="flashcard-modal-nav-btn">Next &rarr;</button>
        </div>
        <div id="flashcardAiChatContainer-${flashcardContext}" class="w-full mt-3 p-3 bg-slate-50 rounded-lg shadow-inner border border-slate-200 hidden">
            <h4 class="text-sm font-semibold text-slate-700 mb-1.5">AI Helper</h4>
            <div id="flashcardAiChatMessages-${flashcardContext}" class="h-28 overflow-y-auto border border-slate-200 rounded-md p-2 mb-1.5 text-xs space-y-1 bg-white"></div>
            <div class="flex space-x-2">
                <input type="text" id="flashcardAiChatInput-${flashcardContext}" class="form-input flex-grow text-xs !py-1.5" placeholder="Ask about this card...">
                <button id="flashcardAiChatSendBtn-${flashcardContext}" class="px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-md shadow-sm">Send</button>
            </div>
            <p id="flashcardAiChatStatus-${flashcardContext}" class="text-xs text-slate-500 mt-1"></p>
        </div>
    `;
    modalContentContainer.appendChild(wrapper);
    updateProgressBar();
    displayFlashcard(currentFlashcardIndex);
    setupFlashcardEventListeners();
}

function updateProgressBar() {
    const progressBarContainer = document.getElementById(`flashcardProgressBar-${flashcardContext}`);
    if (!progressBarContainer) return;
    progressBarContainer.innerHTML = '';
    allFlashcardsData.forEach((_, idx) => {
        const dot = document.createElement('span');
        dot.className = 'flashcard-progress-dot cursor-pointer';
        dot.dataset.index = idx;
        const state = flashcardStates[idx];
        if (idx === currentFlashcardIndex) dot.classList.add('current');
        else if (state && state.correctness === 'correct') dot.classList.add('correct');
        else if (state && state.correctness === 'partial') dot.classList.add('partial');
        else if (state && state.correctness === 'incorrect') dot.classList.add('incorrect');
        else if (markedForReview[idx]) dot.classList.add('marked');
        else dot.classList.add('default');
        dot.onclick = () => { currentFlashcardIndex = idx; displayFlashcard(idx); };
        progressBarContainer.appendChild(dot);
    });
}

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
    const cardState = flashcardStates[index]; 

    cardInner.innerHTML = '';
    
    if (aiChatContainer) {
        const shouldShowChat = cardState.isFlipped && cardState.chatHistory && cardState.chatHistory.length > 0;
        aiChatContainer.classList.toggle('hidden', !shouldShowChat);
        if (shouldShowChat && aiChatMessages) {
            renderFlashcardChatHistory(aiChatMessages, cardState.chatHistory);
        } else if (aiChatMessages) {
            aiChatMessages.innerHTML = ''; 
        }
    }
    
    const frontFace = document.createElement('div');
    frontFace.className = 'flashcard-modal-face flashcard-modal-front';
    frontFace.innerHTML = `
        <div class="p-4 sm:p-6 flex flex-col items-center justify-center h-full text-center">
            <p class="text-md sm:text-lg font-semibold text-indigo-700 mb-3 sm:mb-4 leading-tight">${processTextForDisplay(cardData.term)}</p>
            <textarea id="flashcardUserAnswer-${flashcardContext}" class="form-textarea w-full max-w-xs h-20 text-sm p-2 border-slate-300 rounded-md shadow-sm mb-3 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Type your answer here...">${cardState.isFlipped ? '' : cardState.userAnswer || ''}</textarea>
            <button id="submitFlashcardAnswerBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-green-500 hover:bg-green-600 focus:ring-green-400">Submit & Flip</button>
        </div>`;
    const backFace = document.createElement('div');
    backFace.className = 'flashcard-modal-face flashcard-modal-back';
    backFace.innerHTML = `
        <div class="p-4 sm:p-6 flex flex-col h-full">
            <div class="flex-grow space-y-2 overflow-y-auto mb-3 pr-1 text-sm">
                <div id="flashcardUserFeedback-${flashcardContext}" class="p-2 rounded-md text-xs">${cardState.aiFeedback ? processTextForDisplay(cardState.aiFeedback) : ''}</div>
                <div><strong class="block font-semibold text-indigo-700 mb-1">Correct Answer:</strong><p class="text-slate-700">${processTextForDisplay(cardData.definition)}</p></div>
            </div>
            <div class="mt-auto pt-2 flex flex-wrap gap-2 justify-between items-center border-t border-slate-200">
                <button id="explainFlashcardBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-sky-500 hover:bg-sky-600 focus:ring-sky-400 text-xs">Explain More</button>
                <button id="flipToFrontBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-slate-500 hover:bg-slate-600 focus:ring-slate-400 text-xs">Flip to Front</button>
            </div>
        </div>`;
    cardInner.appendChild(frontFace); cardInner.appendChild(backFace);

    cardInner.classList.toggle('[transform:rotateY(180deg)]', cardState.isFlipped);
    const feedbackDiv = backFace.querySelector(`#flashcardUserFeedback-${flashcardContext}`);
    if (feedbackDiv && cardState.aiFeedback) {
        let feedbackClasses = 'text-xs p-2 rounded-md mb-2 ';
        if (cardState.correctness === 'correct') feedbackClasses += 'bg-green-50 border border-green-200 text-green-700';
        else if (cardState.correctness === 'partial') feedbackClasses += 'bg-yellow-50 border border-yellow-200 text-yellow-700';
        else feedbackClasses += 'bg-red-50 border border-red-200 text-red-700';
        feedbackDiv.className = feedbackClasses;
    }

    if (counter) counter.textContent = `${index + 1} / ${allFlashcardsData.length}`;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === allFlashcardsData.length - 1;
    if (markReviewBtn) {
        markReviewBtn.textContent = markedForReview[index] ? "Unmark" : "Mark for Review";
        markReviewBtn.classList.toggle('bg-yellow-400', markedForReview[index]);markReviewBtn.classList.toggle('hover:bg-yellow-500', markedForReview[index]);markReviewBtn.classList.toggle('text-yellow-800', markedForReview[index]);markReviewBtn.classList.toggle('font-semibold', markedForReview[index]);
        markReviewBtn.classList.toggle('bg-slate-200', !markedForReview[index]);markReviewBtn.classList.toggle('hover:bg-slate-300', !markedForReview[index]);markReviewBtn.classList.toggle('text-slate-600', !markedForReview[index]);
    }
    updateProgressBar();
    setupCardActionListeners();
}

function setupCardActionListeners() {
    const cardInner = document.getElementById(`flashcardInner-${flashcardContext}`);
    const submitBtn = document.getElementById(`submitFlashcardAnswerBtn-${flashcardContext}`);
    const explainBtn = document.getElementById(`explainFlashcardBtn-${flashcardContext}`);
    const flipToFrontBtn = document.getElementById(`flipToFrontBtn-${flashcardContext}`);
    const userAnswerTextarea = document.getElementById(`flashcardUserAnswer-${flashcardContext}`);
    const userFeedbackDiv = document.getElementById(`flashcardUserFeedback-${flashcardContext}`);
    const aiChatContainer = document.getElementById(`flashcardAiChatContainer-${flashcardContext}`);
    const aiChatStatus = document.getElementById(`flashcardAiChatStatus-${flashcardContext}`);

    if (userAnswerTextarea) userAnswerTextarea.onkeydown = (e) => { if (e.key === ' ') e.stopPropagation(); };

    if (submitBtn && cardInner && userAnswerTextarea && userFeedbackDiv) {
        submitBtn.onclick = async () => {
            const userAnswer = userAnswerTextarea.value;
            flashcardStates[currentFlashcardIndex].userAnswer = userAnswer;
            userFeedbackDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Getting feedback...</span>`;
            userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-slate-100 border border-slate-200';
            cardInner.classList.add('[transform:rotateY(180deg)]');
            flashcardStates[currentFlashcardIndex].isFlipped = true;
            try {
                const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "submit_answer", userAnswer, null, flashcardStates[currentFlashcardIndex].chatHistory);
                flashcardStates[currentFlashcardIndex].aiFeedback = result.feedback;
                flashcardStates[currentFlashcardIndex].correctness = result.correctness; 
            } catch (error) {
                console.error("Error getting flashcard feedback:", error);
                flashcardStates[currentFlashcardIndex].aiFeedback = `Error: ${error.message || 'Could not get feedback.'}`;
                flashcardStates[currentFlashcardIndex].correctness = "incorrect"; 
            }
            displayFlashcard(currentFlashcardIndex); 
        };
    }

    if (explainBtn && aiChatContainer && aiChatStatus) {
        explainBtn.onclick = async () => {
            aiChatContainer.classList.remove('hidden');
            const cardChatHistory = flashcardStates[currentFlashcardIndex].chatHistory || [];
            addMessageToChat('AI', 'Getting explanation...', 'system', flashcardContext, cardChatHistory); 
            aiChatStatus.textContent = 'Getting explanation...';
            try {
                const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "request_explanation", null, null, cardChatHistory); 
                addMessageToChat('AI', result.explanation, 'ai', flashcardContext, cardChatHistory);
                // Add explanation to the card's chat history
                flashcardStates[currentFlashcardIndex].chatHistory.push({role: "model", parts: [{text: result.explanation}]});
                aiChatStatus.textContent = '';
                document.getElementById(`flashcardAiChatInput-${flashcardContext}`)?.focus();
            } catch (error) {
                console.error("Error getting flashcard explanation:", error);
                addMessageToChat('AI', `Error: ${error.message || 'Could not get explanation.'}`, 'error', flashcardContext, cardChatHistory);
                aiChatStatus.textContent = `Error getting explanation.`;
            }
        };
    }

    if (flipToFrontBtn && cardInner) {
        flipToFrontBtn.onclick = () => {
            cardInner.classList.remove('[transform:rotateY(180deg)]');
            flashcardStates[currentFlashcardIndex].isFlipped = false;
            if (userAnswerTextarea) userAnswerTextarea.value = flashcardStates[currentFlashcardIndex].userAnswer || '';
            // If chat was visible, hide it, but its history is preserved in flashcardStates[index].chatHistory
            if (aiChatContainer && !aiChatContainer.classList.contains('hidden')) {
                 aiChatContainer.classList.add('hidden');
            }
            updateProgressBar();
        };
    }
}

function setupFlashcardEventListeners() {
    const prevBtn = document.getElementById(`prevFlashcardBtn-${flashcardContext}`);
    const nextBtn = document.getElementById(`nextFlashcardBtn-${flashcardContext}`);
    const aiChatInput = document.getElementById(`flashcardAiChatInput-${flashcardContext}`);
    const aiChatSendBtn = document.getElementById(`flashcardAiChatSendBtn-${flashcardContext}`);
    const aiChatStatus = document.getElementById(`flashcardAiChatStatus-${flashcardContext}`);
    const shuffleBtn = document.getElementById(`shuffleFlashcardsBtn-${flashcardContext}`);
    const markReviewBtn = document.getElementById(`markReviewBtn-${flashcardContext}`);
    const resetBtn = document.getElementById(`resetFlashcardsBtn-${flashcardContext}`);

    if (prevBtn) prevBtn.onclick = () => { if (currentFlashcardIndex > 0) { currentFlashcardIndex--; displayFlashcard(currentFlashcardIndex); } };
    if (nextBtn) nextBtn.onclick = () => { if (currentFlashcardIndex < allFlashcardsData.length - 1) { currentFlashcardIndex++; displayFlashcard(currentFlashcardIndex); } };
    
    const sendChatMessage = async () => {
        if (!aiChatInput || !aiChatStatus) return;
        const userQuery = aiChatInput.value.trim();
        if (!userQuery) return;
        
        let cardChatHistory = flashcardStates[currentFlashcardIndex].chatHistory || [];
        
        addMessageToChat('You', userQuery, 'user', flashcardContext, cardChatHistory); 
        cardChatHistory.push({ role: "user", parts: [{ text: userQuery }] });
        flashcardStates[currentFlashcardIndex].chatHistory = cardChatHistory; 

        aiChatInput.value = '';
        aiChatStatus.textContent = 'AI is thinking...';
        try {
            const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "chat_message", null, userQuery, cardChatHistory); 
            addMessageToChat('AI', result.chatResponse, 'ai', flashcardContext, result.updatedChatHistory);
            flashcardStates[currentFlashcardIndex].chatHistory = result.updatedChatHistory; 
            aiChatStatus.textContent = '';
        } catch (error) {
            console.error("Error in flashcard chat:", error);
            addMessageToChat('AI', `Error: ${error.message || 'Chat unavailable.'}`, 'error', flashcardContext, cardChatHistory);
            aiChatStatus.textContent = 'Error in chat.';
            // Remove the user's last message if AI call failed and it's in the local array
            const lastUserMsgIndex = cardChatHistory.map(m => m.role === 'user' && m.parts[0].text === userQuery).lastIndexOf(true);
            if (lastUserMsgIndex > -1) cardChatHistory.splice(lastUserMsgIndex, 1);
            flashcardStates[currentFlashcardIndex].chatHistory = cardChatHistory; 
        }
    };
    if (aiChatSendBtn) aiChatSendBtn.onclick = sendChatMessage;
    if (aiChatInput) aiChatInput.onkeypress = (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); } };

    if (shuffleBtn) {
        shuffleBtn.onclick = () => {
            let combined = allFlashcardsData.map((card, i) => ({ card, state: flashcardStates[i], marked: markedForReview[i] }));
            for (let i = combined.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [combined[i], combined[j]] = [combined[j], combined[i]]; }
            allFlashcardsData = combined.map(item => item.card);
            const newFlashcardStates = {}; 
            combined.forEach((item, i) => { newFlashcardStates[i] = item.state; });
            flashcardStates = newFlashcardStates;
            markedForReview = combined.map(item => item.marked);
            currentFlashcardIndex = 0; displayFlashcard(currentFlashcardIndex);
        };
    }
    if (markReviewBtn) {
        markReviewBtn.onclick = () => {
            markedForReview[currentFlashcardIndex] = !markedForReview[currentFlashcardIndex];
            displayFlashcard(currentFlashcardIndex); 
        };
    }
    if (resetBtn) {
        resetBtn.onclick = () => {
            let originalSource = (flashcardContext === 'main' && window.lastProcessedResults) ? window.lastProcessedResults.flashcards : 
                                  (flashcardContext === 'modal' && window.currentDashboardSessionData) ? window.currentDashboardSessionData.flashcards : allFlashcardsData;
            allFlashcardsData = [...(originalSource || [])];
            markedForReview = allFlashcardsData.map(() => false);
            flashcardStates = {}; allFlashcardsData.forEach((_, idx) => { flashcardStates[idx] = { isFlipped: false, userAnswer: '', aiFeedback: '', correctness: null, chatHistory: [] }; });
            currentFlashcardIndex = 0; displayFlashcard(currentFlashcardIndex);
        };
    }
}

function addMessageToChat(sender, message, type, context, chatHistoryArrayRef) { 
    const messagesDiv = document.getElementById(`flashcardAiChatMessages-${context}`); 
    if (!messagesDiv) return;
    const messageEl = document.createElement('div');
    let senderClass = 'text-slate-700'; let messageBgClass = 'bg-white'; let textAlignClass = 'mr-auto';
    if (type === 'user') { senderClass = 'text-blue-600 font-semibold'; messageBgClass = 'bg-blue-50'; textAlignClass = 'ml-auto'; }
    else if (type === 'ai') { senderClass = 'text-indigo-600 font-semibold'; messageBgClass = 'bg-indigo-50'; }
    else if (type === 'system' || type === 'error') { senderClass = 'text-slate-500 italic'; messageBgClass = 'bg-slate-100'; if (type === 'error') senderClass = 'text-red-500 italic';}
    messageEl.className = `p-1.5 rounded-md ${messageBgClass} max-w-[85%] ${textAlignClass} mb-1`;
    messageEl.innerHTML = `<strong class="${senderClass}">${sender}:</strong> ${processTextForDisplay(message)}`;
    messagesDiv.appendChild(messageEl); messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderFlashcardChatHistory(messagesDiv, chatHistory) { 
    if (!messagesDiv || !chatHistory) return;
    messagesDiv.innerHTML = ''; 
    chatHistory.forEach(msg => {
        const messageEl = document.createElement('div');
        let senderClass = 'text-slate-700'; let messageBgClass = 'bg-white'; let textAlignClass = 'mr-auto';
        if (msg.role === 'user') { senderClass = 'text-blue-600 font-semibold'; messageBgClass = 'bg-blue-50'; textAlignClass = 'ml-auto'; }
        else if (msg.role === 'model' || msg.role === 'AI') { senderClass = 'text-indigo-600 font-semibold'; messageBgClass = 'bg-indigo-50'; }
        messageEl.className = `p-1.5 rounded-md ${messageBgClass} max-w-[85%] ${textAlignClass} mb-1`;
        messageEl.innerHTML = `<strong class="${senderClass}">${msg.role === 'user' ? 'You' : 'AI'}:</strong> ${processTextForDisplay(msg.parts[0].text)}`;
        messagesDiv.appendChild(messageEl);
    });
    if (messagesDiv.children.length > 0) messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// --- Quiz System (Integrated with AI Feedback) ---
function initializeQuizSystem() {
    const startQuizBtn = document.getElementById('startQuizBtn');
    const regenerateQuizBtn = document.getElementById('regenerateQuizWithOptionsBtn');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizOptionsContainer = document.getElementById('quizOptionsGroup') || quizSetupView;

    if (startQuizBtn) {
        const newBtn = startQuizBtn.cloneNode(true);
        startQuizBtn.parentNode.replaceChild(newBtn, startQuizBtn);
        newBtn.onclick = () => handleStartQuiz(false);
    }
    if (regenerateQuizBtn) {
        const newRegenBtn = regenerateQuizBtn.cloneNode(true);
        regenerateQuizBtn.parentNode.replaceChild(newRegenBtn, regenerateQuizBtn);
        newRegenBtn.onclick = () => handleStartQuiz(true);
    }
    if (quizOptionsContainer) {
        const defaultQType = quizOptionsContainer.querySelector('input[name="quizQuestionTypeOption"][value="multiple_choice"]');
        if (defaultQType && !quizOptionsContainer.querySelector('input[name="quizQuestionTypeOption"]:checked')) defaultQType.checked = true;
        const defaultNumQ = quizOptionsContainer.querySelector('input[name="quizNumQuestionsOption"][value="ai_choice"]');
        if (defaultNumQ && !quizOptionsContainer.querySelector('input[name="quizNumQuestionsOption"]:checked')) defaultNumQ.checked = true;
        const defaultDiff = quizOptionsContainer.querySelector('input[name="quizDifficultyOption"][value="medium"]');
        if (defaultDiff && !quizOptionsContainer.querySelector('input[name="quizDifficultyOption"]:checked')) defaultDiff.checked = true;
    }
    updateQuizStartButtonState();
}

function updateQuizStartButtonState() {
    const startQuizBtn = document.getElementById('startQuizBtn');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const customizeDetails = document.querySelector('#quizSetupView details');
    if (!startQuizBtn || !quizReadyMessage) return;
    if (window.currentQuizData && window.currentQuizData.length > 0) {
        startQuizBtn.disabled = false;
        startQuizBtn.textContent = `Start Quiz (${window.currentQuizData.length} questions)`;
        quizReadyMessage.textContent = `A quiz with ${window.currentQuizData.length} questions is ready.`;
        if(customizeDetails) customizeDetails.open = false;
    } else {
        startQuizBtn.disabled = !(window.currentExtractedTextForQuiz && window.currentExtractedTextForQuiz.trim() !== "");
        startQuizBtn.textContent = 'Generate & Start Quiz';
        quizReadyMessage.textContent = 'Customize options below to generate a quiz.';
        if(customizeDetails) customizeDetails.open = true;
    }
    quizReadyMessage.classList.remove('hidden');
    startQuizBtn.classList.remove('hidden');
}

async function handleStartQuiz(forceRegenerate = false) {
    const quizLoadingStatus = document.getElementById('quizLoadingStatus');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const startQuizBtn = document.getElementById('startQuizBtn');

    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
    if(quizSetupView) quizSetupView.classList.add('hidden');
    if(quizLoadingStatus) showProcessingStatus('quizLoadingStatus', 'Preparing quiz...', true);
    if(startQuizBtn) startQuizBtn.disabled = true;

    try {
        let quizDataToUse;
        const optionsContainer = document.getElementById('quizOptionsGroup') || document.getElementById('quizSetupView');

        if (forceRegenerate || !window.currentQuizData || window.currentQuizData.length === 0) {
            const textToUse = window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
            if (!textToUse || textToUse.trim() === "") throw new Error("No text available to generate quiz.");
            window.currentQuizTextContext = textToUse;

            const questionTypes = Array.from(optionsContainer.querySelectorAll('input[name="quizQuestionTypeOption"]:checked')).map(cb => cb.value);
            const numQuestions = optionsContainer.querySelector('input[name="quizNumQuestionsOption"]:checked')?.value || 'ai_choice';
            const difficulty = optionsContainer.querySelector('input[name="quizDifficultyOption"]:checked')?.value || 'medium';
            if (questionTypes.length === 0) {
                showMessage('quizLoadingStatus', 'Please select at least one question type.', 'error', 3000);
                if(quizSetupView) quizSetupView.classList.remove('hidden'); if(startQuizBtn) startQuizBtn.disabled = false;
                return;
            }
            window.currentQuizOptions = { questionTypes, numQuestions, difficulty };
            const generatedQuizResponse = await apiGenerateQuiz(textToUse, window.currentQuizOptions);
            quizDataToUse = generatedQuizResponse.quiz;
        } else {
            quizDataToUse = window.currentQuizData;
            window.currentQuizTextContext = window.currentQuizTextContext || window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
        }

        if (!quizDataToUse || quizDataToUse.length === 0) throw new Error("Failed to load or generate quiz data.");
        window.currentQuizData = quizDataToUse.map(q => ({ ...q, chatHistory: [], detailedExplanationContent: null, detailedExplanationFetched: false, aiFeedback: null, correctness: null, previousStateBeforeMark: null, isExplanationVisible: false, isChatVisible: false }));
        window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData));
        window.currentQuizQuestionIndex = 0;
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
        renderQuizInterface();
        if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');
    } catch (error) {
        console.error("Error starting quiz:", error);
        if(quizLoadingStatus) showMessage('quizLoadingStatus', `Error: ${error.message}`, 'error', 5000);
        if(quizSetupView) quizSetupView.classList.remove('hidden');
    } finally {
        const qiv = quizInterfaceContainer && !quizInterfaceContainer.classList.contains('hidden');
        const qsv = quizSetupView && !quizSetupView.classList.contains('hidden');
        if (quizLoadingStatus && (qiv || qsv)) hideProcessingStatus('quizLoadingStatus');
        if(startQuizBtn) updateQuizStartButtonState();
    }
}

function renderQuizInterface() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    if (!quizInterfaceContainer || !window.currentQuizData || window.currentQuizData.length === 0) {
        quizInterfaceContainer.innerHTML = '<p class="text-slate-500 p-4">Error: Quiz data is missing.</p>';
        return;
    }
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    if (!question || typeof question !== 'object') {
        console.error("Invalid question data at index:", window.currentQuizQuestionIndex, window.currentQuizData);
        quizInterfaceContainer.innerHTML = '<p class="text-red-500 p-4">Error: Invalid question data. Please try regenerating the quiz.</p>';
        return;
    }
    
    const questionState = window.quizQuestionStates[window.currentQuizQuestionIndex];
    const isAnswered = questionState !== 'unanswered' && questionState !== 'skipped' && questionState !== 'marked';
    const isMarked = questionState === 'marked';
    const userAnswer = window.userQuizAnswers[window.currentQuizQuestionIndex];
    let optionsHtml = '';
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    if (!question.questionType) {
        console.error("Question is missing 'questionType' property:", question);
        optionsHtml = `<p class="text-red-500">Error: Could not display question because its type is unknown.</p>`;
    } else if (question.questionType === 'multiple_choice') {
        if (!Array.isArray(question.options)) {
            console.error("Multiple choice question is missing 'options' array:", question);
            optionsHtml = `<p class="text-red-500">Error: Multiple choice options are missing for this question.</p>`;
        } else {
            optionsHtml = question.options.map((option, idx) => `
            <label class="quiz-option-label flex items-center p-3 rounded-lg transition-colors duration-150 text-sm
                ${isAnswered || isMarked ? 'opacity-70 cursor-not-allowed' : 'hover:bg-indigo-50 cursor-pointer'}
                ${question.correctness === 'correct' && option === question.correctAnswer ? 'bg-green-100 border-green-400 text-green-700' : ''}
                ${(question.correctness === 'incorrect' || question.correctness === 'partial') && option === userAnswer && option !== question.correctAnswer ? 'bg-red-100 border-red-400 text-red-700' : ''}
                ${!isAnswered && !isMarked && option === userAnswer ? 'bg-indigo-100 border-indigo-400' : 'border-slate-300'}">
                <input type="radio" name="quizOption" value="${escapeHtml(option)}" 
                    ${option === userAnswer ? 'checked' : ''} ${isAnswered || isMarked ? 'disabled' : ''} 
                    class="form-radio h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 mr-3" 
                    onchange="window.handleQuizAnswerSelection(this.value, 'multiple_choice')">
                <span class="font-medium mr-1.5">${alphabet[idx]}.</span>
                <span>${processTextForDisplay(option)}</span>
            </label>`).join('');
        }
    } else if (question.questionType === 'select_all_that_apply' || question.questionType === 'select_all') {
        if (!Array.isArray(question.options)) {
            console.error("'Select all' question is missing 'options' array:", question);
            optionsHtml = `<p class="text-red-500">Error: 'Select all' options are missing for this question.</p>`;
        } else {
            optionsHtml = question.options.map((option, idx) => `
            <label class="quiz-option-label flex items-center p-3 rounded-lg transition-colors duration-150 text-sm
                ${isAnswered || isMarked ? 'opacity-70 cursor-not-allowed' : 'hover:bg-indigo-50 cursor-pointer'}
                ${isAnswered && Array.isArray(question.correctAnswer) && question.correctAnswer.includes(option) ? 'bg-green-100 border-green-400 text-green-700' : ''}
                ${isAnswered && Array.isArray(userAnswer) && userAnswer.includes(option) && Array.isArray(question.correctAnswer) && !question.correctAnswer.includes(option) ? 'bg-red-100 border-red-400 text-red-700' : ''}
                ${!isAnswered && !isMarked && Array.isArray(userAnswer) && userAnswer.includes(option) ? 'bg-indigo-100 border-indigo-400' : 'border-slate-300'}">
                <input type="checkbox" name="quizOption" value="${escapeHtml(option)}" 
                    ${Array.isArray(userAnswer) && userAnswer.includes(option) ? 'checked' : ''} ${isAnswered || isMarked ? 'disabled' : ''} 
                    class="form-checkbox h-4 w-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500 mr-3" 
                    onchange="window.handleQuizAnswerSelection(this.value, 'select_all_that_apply')">
                <span>${processTextForDisplay(option)}</span>
            </label>`).join('');
        }
    } else if (question.questionType === 'short_answer') {
        optionsHtml = `<textarea id="shortAnswerText" class="form-textarea w-full rounded-lg border-slate-300 shadow-sm text-sm p-2" rows="3" placeholder="Type your answer here..." ${isAnswered || isMarked ? 'disabled' : ''} oninput="window.handleQuizAnswerSelection(this.value, 'short_answer')">${escapeHtml(userAnswer || '')}</textarea>`;
    } else {
        console.error("Unknown question type found:", question.questionType, question);
        optionsHtml = `<p class="text-red-500">Error: Could not display question. Unknown type: ${escapeHtml(question.questionType)}</p>`;
    }

    quizInterfaceContainer.innerHTML = `
        <div class="quiz-question-display p-4 sm:p-6 bg-white rounded-xl shadow-xl border border-slate-200">
            <div class="flex justify-between items-start mb-4"><h4 class="quiz-question-text text-base sm:text-lg font-semibold text-slate-800">${processTextForDisplay(question.questionText)}</h4><span class="text-xs sm:text-sm text-slate-500 whitespace-nowrap">Q ${window.currentQuizQuestionIndex + 1}/${window.currentQuizData.length}</span></div>
            <div class="space-y-3 mb-6">${optionsHtml}</div>
            <div id="quizAnswerFeedback" class="mt-4 hidden text-sm"></div>
            <div id="quizDetailedExplanation" class="mt-4 p-3 bg-sky-50 border border-sky-200 rounded-md ${question.isExplanationVisible ? '' : 'hidden'}"></div>
            <div id="quizQuestionChatContainer" class="mt-4 space-y-2 ${question.isChatVisible ? '' : 'hidden'}">
                <div id="quizQuestionChatHistory" class="max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-md bg-slate-50 text-xs"></div>
                <div class="flex space-x-2"><input type="text" id="quizChatInput" class="form-input flex-grow rounded-lg border-slate-300 shadow-sm text-sm p-2" placeholder="Ask..."><button onclick="window.handleQuizChatSend()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white text-xs sm:text-sm px-3 py-1.5">Send</button></div>
            </div>
            <div class="mt-6 flex flex-wrap gap-2 justify-between items-center">
                <div class="flex flex-wrap gap-2"><button onclick="window.handleQuizAnswerSubmission()" class="quiz-nav-button bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm" ${isAnswered || isMarked ? 'disabled' : ''}>Check Answer</button><button onclick="window.toggleDetailedExplanation()" class="quiz-nav-button bg-sky-500 hover:bg-sky-600 text-white text-xs sm:text-sm ${!isAnswered ? 'hidden' : ''}">Explanation</button><button onclick="window.toggleQuizQuestionChat()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white text-xs sm:text-sm ${!isAnswered ? 'hidden' : ''}">Chat</button></div>
                <button onclick="window.regenerateCurrentQuizQuestion()" class="quiz-nav-button bg-orange-500 hover:bg-orange-600 text-white text-xs ${!isAnswered ? 'hidden' : ''}">Regenerate Q</button>
            </div>
        </div>
        <div class="flex justify-center items-center mt-6 space-x-1 quiz-progress-dots flex-wrap">${window.currentQuizData.map((_, idx) => `<button class="w-2.5 h-2.5 rounded-full focus:outline-none m-0.5 ${idx === window.currentQuizQuestionIndex ? 'bg-indigo-600 ring-2 ring-indigo-300' : window.quizQuestionStates[idx] === 'correct' ? 'bg-green-500' : window.quizQuestionStates[idx] === 'incorrect' ? 'bg-red-500' : window.quizQuestionStates[idx] === 'partial' ? 'bg-yellow-500' :  window.quizQuestionStates[idx] === 'marked' ? 'bg-purple-500' : window.quizQuestionStates[idx] === 'skipped' ? 'bg-slate-400' : 'bg-slate-300 hover:bg-slate-400'}" onclick="window.jumpToQuizQuestion(${idx})"></button>`).join('')}</div>
        <div class="mt-8 flex flex-col sm:flex-row justify-between items-center gap-3"><button onclick="window.previousQuizQuestion()" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white w-full sm:w-auto" ${window.currentQuizQuestionIndex === 0 ? 'disabled' : ''}>Previous</button><div class="flex space-x-2 w-full sm:w-auto justify-center"><button onclick="window.markQuestionForReview()" class="quiz-nav-button bg-purple-500 hover:bg-purple-600 text-white text-xs sm:text-sm flex-grow sm:flex-grow-0">${isMarked ? 'Unmark' : 'Mark'}</button>${!isAnswered && !isMarked ? `<button onclick="window.skipQuestion()" class="quiz-nav-button bg-gray-400 hover:bg-gray-500 text-white text-xs sm:text-sm flex-grow sm:flex-grow-0">Skip</button>` : ''}</div>${window.currentQuizQuestionIndex === window.currentQuizData.length - 1 ? `<button onclick="window.finishQuiz()" class="quiz-nav-button bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">Finish</button>` : `<button onclick="window.nextQuizQuestion()" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white w-full sm:w-auto">Next</button>`}</div>`;

    if(isAnswered && question.aiFeedback) displayQuizAnswerFeedbackUI(userAnswer, question);
    
    const explanationDiv = document.getElementById('quizDetailedExplanation');
    if (explanationDiv && question.isExplanationVisible) { // Check visibility state
        if (question.detailedExplanationFetched && question.detailedExplanationContent) {
            explanationDiv.innerHTML = `<p class="font-medium text-slate-700">Detailed Explanation:</p><p class="mt-1">${processTextForDisplay(question.detailedExplanationContent)}</p>`;
        } else if (question.detailedExplanationFetched && !question.detailedExplanationContent) {
             explanationDiv.innerHTML = `<p class="text-slate-500">No detailed explanation available.</p>`;
        } // If not fetched yet, toggleDetailedExplanation will handle it.
    }
    
    const chatContainer = document.getElementById('quizQuestionChatContainer');
    if (chatContainer && question.isChatVisible) { // Check visibility state
        renderQuizChatHistory();
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe === null || unsafe === undefined ? "" : String(unsafe);
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.handleQuizAnswerSelection = function(value, type) {
    const index = window.currentQuizQuestionIndex;
    if (window.quizQuestionStates[index] === 'marked' || (window.quizQuestionStates[index] !== 'unanswered' && window.quizQuestionStates[index] !== 'skipped')) return;
    if (type === 'select_all_that_apply') {
        window.userQuizAnswers[index] = window.userQuizAnswers[index] || [];
        const optionIdx = window.userQuizAnswers[index].indexOf(value);
        if (optionIdx === -1) window.userQuizAnswers[index].push(value);
        else window.userQuizAnswers[index].splice(optionIdx, 1);
    } else {
        window.userQuizAnswers[index] = value;
    }
    if (type !== 'short_answer') renderQuizInterface(); 
}

window.handleQuizAnswerSubmission = async function() {
    const index = window.currentQuizQuestionIndex;
    const question = window.currentQuizData[index];
    const userAnswer = window.userQuizAnswers[index];
    const feedbackElementId = 'quizAnswerFeedback';

    if (window.quizQuestionStates[index] === 'marked') { showMessage(feedbackElementId, 'Unmark question to submit answer.', 'warning', 3000); return; }
    if (userAnswer === null || (Array.isArray(userAnswer) && userAnswer.length === 0) || (typeof userAnswer === 'string' && userAnswer.trim() === '')) { showMessage(feedbackElementId, 'Please provide an answer.', 'warning', 3000); return; }

    showProcessingStatus(feedbackElementId, 'Checking answer...', true);
    try {
        const response = await apiGetQuizAnswerFeedback(question, userAnswer); 
        window.quizQuestionStates[index] = response.correctness; 
        question.aiFeedback = response.feedback; 
        question.correctness = response.correctness; 
        hideProcessingStatus(feedbackElementId);
        renderQuizInterface(); 
    } catch (error) {
        console.error("Error submitting quiz answer:", error);
        showMessage(feedbackElementId, `Error: ${error.message || 'Could not submit answer.'}`, 'error', 5000);
        question.aiFeedback = `Error: ${error.message || 'Could not get feedback.'}`; 
        question.correctness = 'incorrect'; 
        window.quizQuestionStates[index] = 'incorrect'; 
        hideProcessingStatus(feedbackElementId);
        renderQuizInterface(); 
    }
}

function displayQuizAnswerFeedbackUI(userAnswer, question) {
    const feedbackDiv = document.getElementById('quizAnswerFeedback');
    if (!feedbackDiv || !question.aiFeedback) return;
    
    let feedbackHtml = `<p class="font-semibold mb-1">Feedback:</p><p>${processTextForDisplay(question.aiFeedback)}</p>`;
    feedbackDiv.innerHTML = feedbackHtml;
    
    feedbackDiv.className = `mt-4 p-3 rounded-md text-sm ${
        question.correctness === 'correct' ? 'bg-green-50 border-green-200 text-green-700' :
        question.correctness === 'partial' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
        'bg-red-50 border-red-200 text-red-700'}`;
    feedbackDiv.classList.remove('hidden');
}

window.toggleDetailedExplanation = async function() {
    const explanationDiv = document.getElementById('quizDetailedExplanation');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    const feedbackElementId = 'quizAnswerFeedback'; 
    if (!explanationDiv || !question) return;

    question.isExplanationVisible = !explanationDiv.classList.contains('hidden'); // Get current visual state
    question.isExplanationVisible = !question.isExplanationVisible; // Toggle the desired state

    explanationDiv.classList.toggle('hidden', !question.isExplanationVisible);

    if (question.isExplanationVisible) {
        if (!question.detailedExplanationFetched) { 
            showProcessingStatus(feedbackElementId, 'Fetching explanation...', true);
            try {
                const response = await apiGetQuizQuestionDetailedExplanation(question); 
                question.detailedExplanationContent = response.explanation;
                question.detailedExplanationFetched = true; 
                hideProcessingStatus(feedbackElementId);
            } catch (error) { 
                console.error("Error fetching detailed explanation:", error); 
                showMessage(feedbackElementId, `Error: ${error.message}`, 'error', 3000); 
                hideProcessingStatus(feedbackElementId); 
                question.detailedExplanationContent = "Could not load explanation."; // Show error in place
            }
        }
        explanationDiv.innerHTML = `<p class="font-medium text-slate-700">Detailed Explanation:</p><p class="mt-1">${processTextForDisplay(question.detailedExplanationContent || "Loading...")}</p>`;
    }
}

window.toggleQuizQuestionChat = function() {
    const chatContainer = document.getElementById('quizQuestionChatContainer');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    if (!chatContainer || !question) return;
    
    question.isChatVisible = !chatContainer.classList.contains('hidden'); // Get current visual state
    question.isChatVisible = !question.isChatVisible; // Toggle desired state
    
    chatContainer.classList.toggle('hidden', !question.isChatVisible);

    if (question.isChatVisible) { 
        renderQuizChatHistory(); 
        document.getElementById('quizChatInput')?.focus(); 
    }
}

function renderQuizChatHistory() {
    const chatHistoryDiv = document.getElementById('quizQuestionChatHistory');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    question.chatHistory = question.chatHistory || [];
    if (!chatHistoryDiv) return;
    chatHistoryDiv.innerHTML = question.chatHistory.map(msg => `<p class="${msg.role === 'user' ? 'text-blue-600 text-right' : 'text-indigo-700 text-left'} p-1"><strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong> ${processTextForDisplay(msg.parts[0].text)}</p>`).join('');
    if (chatHistoryDiv.children.length > 0) chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
}

window.handleQuizChatSend = async function() {
    const chatInput = document.getElementById('quizChatInput');
    const feedbackElementId = 'quizAnswerFeedback';
    if (!chatInput) return;
    const userQuery = chatInput.value.trim();
    if (!userQuery) return;
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    question.chatHistory = question.chatHistory || [];
    question.chatHistory.push({ role: "user", parts: [{ text: userQuery }] });
    renderQuizChatHistory();
    chatInput.value = ''; chatInput.disabled = true;
    try {
        const response = await apiChatAboutQuizQuestion(question, question.chatHistory.slice(0, -1), userQuery); 
        question.chatHistory.push({ role: "model", parts: [{ text: response.chatResponse }] }); 
        renderQuizChatHistory();
    } catch (error) { console.error("Error in quiz chat:", error); showMessage(feedbackElementId, `Chat error: ${error.message}`, 'error', 3000); question.chatHistory.pop(); renderQuizChatHistory(); }
    finally { chatInput.disabled = false; chatInput.focus(); }
}

window.regenerateCurrentQuizQuestion = async function() {
    const index = window.currentQuizQuestionIndex;
    const originalQuestion = window.currentQuizData[index];
    const statusElementId = 'quizAnswerFeedback'; 
    showProcessingStatus(statusElementId, 'Regenerating question...', true);
    try {
        const newQuestionData = await apiRegenerateQuizQuestion(originalQuestion, window.currentQuizTextContext, originalQuestion.difficulty || window.currentQuizOptions.difficulty); 
        window.currentQuizData[index] = { ...newQuestionData.question, id: originalQuestion.id, chatHistory: [], detailedExplanationContent: null, detailedExplanationFetched: false, aiFeedback: null, correctness: null, previousStateBeforeMark: null, isExplanationVisible: false, isChatVisible: false };
        window.userQuizAnswers[index] = null; window.quizQuestionStates[index] = 'unanswered';
        
        document.getElementById('quizDetailedExplanation')?.classList.add('hidden'); 
        document.getElementById('quizQuestionChatContainer')?.classList.add('hidden');
        renderQuizInterface();
        showMessage(statusElementId, 'Question regenerated.', 'success', 3000);
    } catch (error) { console.error("Error regenerating quiz question:", error); showMessage(statusElementId, `Error: ${error.message}`, 'error', 5000);}
    finally { hideProcessingStatus(statusElementId); }
}

window.previousQuizQuestion = function() { if (window.currentQuizQuestionIndex > 0) { window.currentQuizQuestionIndex--; renderQuizInterface(); } }
window.nextQuizQuestion = function() { if (window.currentQuizQuestionIndex < window.currentQuizData.length - 1) { window.currentQuizQuestionIndex++; renderQuizInterface(); } }
window.jumpToQuizQuestion = function(index) { if (index >= 0 && index < window.currentQuizData.length) { window.currentQuizQuestionIndex = index; renderQuizInterface(); } }
window.markQuestionForReview = function() {
    const index = window.currentQuizQuestionIndex; const question = window.currentQuizData[index];
    if (window.quizQuestionStates[index] === 'marked') { window.quizQuestionStates[index] = question.previousStateBeforeMark || 'unanswered'; question.previousStateBeforeMark = null; }
    else { question.previousStateBeforeMark = window.quizQuestionStates[index]; window.quizQuestionStates[index] = 'marked'; }
    renderQuizInterface();
}
window.skipQuestion = function() {
    const index = window.currentQuizQuestionIndex;
    if (window.quizQuestionStates[index] !== 'skipped' && window.quizQuestionStates[index] !== 'correct' && window.quizQuestionStates[index] !== 'incorrect' && window.quizQuestionStates[index] !== 'partial') { window.quizQuestionStates[index] = 'skipped'; }
    if (window.currentQuizQuestionIndex < window.currentQuizData.length - 1) nextQuizQuestion(); else finishQuiz();
}

window.finishQuiz = function() { 
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    if (!quizResultsContainer) return;
    document.getElementById('quizInterfaceContainer')?.classList.add('hidden');
    document.getElementById('quizSetupView')?.classList.add('hidden');
    quizResultsContainer.classList.remove('hidden');
    let score = 0, correctAnswers = 0, hasPartial = false;
    window.currentQuizData.forEach((_, i) => {
        if (window.quizQuestionStates[i] === 'correct') { score++; correctAnswers++; }
        else if (window.quizQuestionStates[i] === 'partial') { score += 0.5; hasPartial = true; }
    });
    const total = window.currentQuizData.length;
    const percentage = total > 0 ? (score / total) * 100 : 0;
    let msg = percentage >= 80 ? "Excellent work!" : percentage >= 60 ? "Great job!" : "Good effort!";
    quizResultsContainer.innerHTML = `
        <div class="p-4 sm:p-6 bg-white rounded-xl shadow-xl text-center">
            <h3 class="text-xl sm:text-2xl font-semibold text-slate-800 mb-3">Quiz Completed!</h3>
            <p class="text-lg text-indigo-600 font-bold mb-2">Score: ${hasPartial ? score.toFixed(1) : score} / ${total} (${percentage.toFixed(1)}%)</p>
            <p class="text-slate-600 mb-6">${msg}</p>
            <div class="text-left my-6 max-h-60 overflow-y-auto border border-slate-200 rounded-md p-3 bg-slate-50">
                ${window.currentQuizData.map((q, i) => `<div class="py-2 border-b last:border-b-0 text-sm flex justify-between items-center"><span><span class="font-medium">Q${i+1}:</span> ${processTextForDisplay(q.questionText.substring(0,50))}...</span><span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${window.quizQuestionStates[i] === 'correct' ? 'bg-green-100 text-green-700' : window.quizQuestionStates[i] === 'incorrect' ? 'bg-red-100 text-red-700' : window.quizQuestionStates[i] === 'partial' ? 'bg-yellow-100 text-yellow-700' : window.quizQuestionStates[i] === 'marked' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}">${window.quizQuestionStates[i].replace(/^\w/, c => c.toUpperCase())}</span></div>`).join('')}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                <button onclick="window.retryIncorrectQuestions()" class="quiz-nav-button bg-orange-500 hover:bg-orange-600 text-white w-full">Retry Incorrect/Partial</button>
                <button onclick="window.retryAllQuestions()" class="quiz-nav-button bg-blue-500 hover:bg-blue-600 text-white w-full">Retry All</button>
                <button onclick="window.startNewQuizSameSettings()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white w-full">New Quiz (Same Settings)</button>
                <button onclick="window.changeQuizSettingsAndStartNew()" class="quiz-nav-button bg-indigo-500 hover:bg-indigo-600 text-white w-full">Change Settings & New Quiz</button>
            </div>
        </div>`;
    updateQuizStartButtonState();
}
window.retryIncorrectQuestions = function() {
    const incorrect = window.originalFullQuizData.filter((_, i) => window.quizQuestionStates[i] === 'incorrect' || window.quizQuestionStates[i] === 'partial');
    if (incorrect.length > 0) {
        window.currentQuizData = JSON.parse(JSON.stringify(incorrect)).map(q => ({...q, chatHistory:[], detailedExplanationContent:null, detailedExplanationFetched:false, aiFeedback:null, correctness:null, previousStateBeforeMark:null, isExplanationVisible: false, isChatVisible: false}));
        window.currentQuizQuestionIndex = 0; window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null); window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
        document.getElementById('quizResultsContainer').classList.add('hidden'); renderQuizInterface(); document.getElementById('quizInterfaceContainer').classList.remove('hidden');
    } else { showMessage('quizLoadingStatus', 'No incorrect/partial questions to retry!', 'success', 3000); }
}
window.retryAllQuestions = function() {
    if (!window.originalFullQuizData || window.originalFullQuizData.length === 0) { showMessage('quizLoadingStatus', 'No original quiz to retry.', 'error', 3000); return; }
    window.currentQuizData = JSON.parse(JSON.stringify(window.originalFullQuizData)).map(q => ({...q, chatHistory:[], detailedExplanationContent:null, detailedExplanationFetched:false, aiFeedback:null, correctness:null, previousStateBeforeMark:null, isExplanationVisible: false, isChatVisible: false}));
    window.currentQuizQuestionIndex = 0; window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null); window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
    document.getElementById('quizResultsContainer').classList.add('hidden'); renderQuizInterface(); document.getElementById('quizInterfaceContainer').classList.remove('hidden');
}
window.startNewQuizSameSettings = async function() {
    if (!window.currentQuizTextContext) { showMessage('quizLoadingStatus', 'Missing original text context.', 'error', 3000); return; }
    if (!window.currentQuizOptions || Object.keys(window.currentQuizOptions).length === 0) window.currentQuizOptions = { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
    document.getElementById('quizResultsContainer')?.classList.add('hidden');
    await handleStartQuiz(true);
}
window.changeQuizSettingsAndStartNew = function() {
    document.getElementById('quizResultsContainer')?.classList.add('hidden');
    document.getElementById('quizInterfaceContainer')?.classList.add('hidden');
    const quizSetupView = document.getElementById('quizSetupView');
    if(quizSetupView) {
        quizSetupView.classList.remove('hidden');
        const customizeDetails = quizSetupView.querySelector('details');
        if(customizeDetails) customizeDetails.open = true;
    }
    window.currentQuizData = null; window.originalFullQuizData = null; 
    initializeQuizSystem(); 
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('resultsSection')) setupTabs('#resultsSection .tabs');
    if(document.getElementById('currentYear')) setCurrentYear('currentYear');
    if(document.getElementById('quizSetupView')) initializeQuizSystem();

    const mainExplainButton = document.getElementById('explainSelectedSummaryTextButton');
    const mainExplanationOutput = document.getElementById('explanationOutput');
    const mainSummaryOutputBox = document.getElementById('summaryOutput');
    const mainResultsSection = document.getElementById('resultsSection');
    const mainSummaryTab = document.getElementById('summaryTab');

    if (mainExplainButton && mainExplanationOutput && mainSummaryOutputBox && mainResultsSection && mainSummaryTab) {
        document.addEventListener('selectionchange', () => {
            const selection = document.getSelection();
            if (selection && selection.toString().trim().length > 0 &&
                mainSummaryOutputBox.contains(selection.anchorNode) &&
                mainSummaryOutputBox.contains(selection.focusNode) &&
                !mainResultsSection.classList.contains('hidden') &&
                mainSummaryTab.dataset.active === "true") {
                mainExplainButton.classList.remove('hidden');
            } else {
                mainExplainButton.classList.add('hidden');
            }
        });
        mainSummaryOutputBox.addEventListener('mousedown', () => {
            mainExplainButton.classList.add('hidden');
            mainExplanationOutput.classList.add('hidden');
            mainExplanationOutput.innerHTML = '';
        });
        mainExplainButton.addEventListener('click', async () => {
            const selectedText = document.getSelection().toString().trim();
            if (!selectedText) { mainExplainButton.classList.add('hidden'); return; }
            mainExplainButton.disabled = true; mainExplainButton.textContent = 'Explaining...';
            mainExplanationOutput.classList.add('hidden'); mainExplanationOutput.innerHTML = '';
            try {
                showProcessingStatus('processingStatus', 'Getting explanation...', true); 
                const { explanation } = await apiExplainSnippet(selectedText); 
                mainExplanationOutput.innerHTML = processTextForDisplay(explanation);
                mainExplanationOutput.classList.remove('hidden');
                hideProcessingStatus('processingStatus');
            } catch (error) {
                mainExplanationOutput.innerHTML = `<p class="error-message p-3 rounded-md">Error: ${error.message || 'Could not get explanation.'}</p>`;
                mainExplanationOutput.classList.remove('hidden');
                showMessage('processingStatus', `Explanation error: ${error.message}`, 'error');
            } finally {
                mainExplainButton.disabled = false; mainExplainButton.textContent = 'Explain';
            }
        });
    }
    const closeFlashcardModalBtnMain = document.getElementById('closeFlashcardModalBtn-main');
    if (closeFlashcardModalBtnMain) closeFlashcardModalBtnMain.onclick = () => toggleElementVisibility('flashcardStudyModal-main', false);
    const flashcardStudyModalMain = document.getElementById('flashcardStudyModal-main');
    if (flashcardStudyModalMain) flashcardStudyModalMain.onclick = (event) => { if (event.target === flashcardStudyModalMain) toggleElementVisibility('flashcardStudyModal-main', false); };
});

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
window.renderInteractiveFlashcards = renderInteractiveFlashcards; 
window.updateNav = updateNav; 
window.initializeQuizSystem = initializeQuizSystem;
window.escapeHtml = escapeHtml;
