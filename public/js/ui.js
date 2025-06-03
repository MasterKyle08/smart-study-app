console.log("Smart Study UI Script Loaded - Version: FLASHCARD_DEBUG_1.0");

function showMessage(elementId, message, type = 'error') {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = ''; 
    element.classList.add(type === 'success' ? 'success-message' : 'error-message', 'block', 'mt-4', 'p-3', 'rounded-md');
    element.classList.remove('hidden');
  }
}

function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = '';
    element.className = '';
    element.classList.add('hidden', 'mt-4', 'text-sm');
  }
}

function toggleElementVisibility(elementId, forceShow) {
    const element = document.getElementById(elementId);
    if (element) {
        const isModal = element.id === 'authModal' || element.id === 'sessionDetailModal';
        if (isModal) {
            if (typeof forceShow === 'boolean') {
                element.dataset.visible = forceShow ? 'true' : 'false';
            } else { 
                element.dataset.visible = element.dataset.visible === 'true' ? 'false' : 'true';
            }
        } else { 
            if (typeof forceShow === 'boolean') {
                element.classList.toggle('hidden', !forceShow);
            } else {
                element.classList.toggle('hidden');
            }
        }
    }
}

function updateNav(isLoggedIn, userEmail = '') {
  const loginNavButton = document.getElementById('loginNavButton');
  const registerNavButton = document.getElementById('registerNavButton');
  const dashboardNavButton = document.getElementById('dashboardNavButton');
  const logoutNavButton = document.getElementById('logoutNavButton');
  const userActionsSection = document.getElementById('userActions');
  const userEmailSpan = document.getElementById('userEmail');

  if (loginNavButton) loginNavButton.classList.toggle('hidden', isLoggedIn);
  if (registerNavButton) registerNavButton.classList.toggle('hidden', isLoggedIn);
  if (dashboardNavButton) dashboardNavButton.classList.toggle('hidden', !isLoggedIn);
  if (logoutNavButton) logoutNavButton.classList.toggle('hidden', !isLoggedIn);
  
  if (userActionsSection) userActionsSection.classList.toggle('hidden', !isLoggedIn);
  if (userEmailSpan && isLoggedIn) {
    userEmailSpan.textContent = userEmail;
  }
}

function showProcessingStatus(message, showSpinner = true) {
    const statusDiv = document.getElementById('processingStatus');
    if (statusDiv) {
        let html = '';
        if (showSpinner) {
            html += '<div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 mr-2 align-middle"></div>';
        }
        html += `<span class="text-slate-600 align-middle">${message}</span>`;
        statusDiv.innerHTML = html;
        statusDiv.className = 'mt-6 text-center text-sm flex items-center justify-center';
        statusDiv.classList.remove('hidden', 'success-message', 'error-message'); 
    }
}

function hideProcessingStatus() {
    const statusDiv = document.getElementById('processingStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '';
        statusDiv.classList.add('hidden');
    }
}

function processTextForDisplay(text, keywordsToHighlight = []) {
    if (!text) return '';
    let escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    let html = escapedText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
        .replace(/\*(.*?)\*/g, '<em>$1</em>');       

    if (keywordsToHighlight && keywordsToHighlight.length > 0) {
        keywordsToHighlight.forEach(keyword => {
            if (keyword) { 
                const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedKeyword})`, 'gi');
                html = html.replace(regex, (match) => `<span class="highlighted-keyword">${match}</span>`);
            }
        });
    }
    return html;
}

let currentFlashcardIndex = 0;
let allFlashcards = [];
let currentFlashcardChatHistory = [];
let flashcardContext = 'main';
let isShuffleMode = false;
let markedForReview = new Set();

function renderFlashcards(container, flashcards, keywordsToHighlight = [], context = 'main') {
    console.log(`renderFlashcards called for context: ${context}. Number of flashcards: ${flashcards ? flashcards.length : 0}`);
    container.innerHTML = '';
    allFlashcards = flashcards;
    currentFlashcardIndex = 0;
    currentFlashcardChatHistory = [];
    flashcardContext = context;
    isShuffleMode = false;
    markedForReview.clear();

    if (!allFlashcards || !Array.isArray(allFlashcards) || allFlashcards.length === 0) {
        console.warn("No flashcards data or empty array. Displaying fallback message.");
        container.innerHTML = `<p class="text-slate-500 text-sm p-4">No flashcards available to display.</p>`;
        return;
    }

    const flashcardWrapper = document.createElement('div');
    flashcardWrapper.className = 'flex flex-col items-center w-full max-w-2xl mx-auto';
    
    // Progress dots
    const progressDotsContainer = document.createElement('div');
    progressDotsContainer.className = 'flashcard-progress';
    for (let i = 0; i < allFlashcards.length; i++) {
        const dot = document.createElement('div');
        dot.className = `flashcard-progress-dot ${i === 0 ? 'bg-indigo-600' : 'bg-slate-300'}`;
        progressDotsContainer.appendChild(dot);
    }
    flashcardWrapper.appendChild(progressDotsContainer);

    // Study controls
    const studyControls = document.createElement('div');
    studyControls.className = 'flashcard-study-controls';
    studyControls.innerHTML = `
        <button id="shuffleBtn-${flashcardContext}" class="flashcard-study-btn bg-purple-100 text-purple-700 hover:bg-purple-200">
            Shuffle
        </button>
        <button id="markReviewBtn-${flashcardContext}" class="flashcard-study-btn bg-amber-100 text-amber-700 hover:bg-amber-200">
            Mark for Review
        </button>
        <button id="resetBtn-${flashcardContext}" class="flashcard-study-btn bg-slate-100 text-slate-700 hover:bg-slate-200">
            Reset
        </button>
    `;
    flashcardWrapper.appendChild(studyControls);

    // Flashcard scene
    const cardScene = document.createElement('div');
    cardScene.id = `flashcardScene-${flashcardContext}`;
    cardScene.className = 'flashcard-scene';

    const cardInner = document.createElement('div');
    cardInner.id = `flashcardInner-${flashcardContext}`;
    cardInner.className = 'flashcard-inner';
    cardInner.tabIndex = 0;
    
    cardScene.appendChild(cardInner);
    flashcardWrapper.appendChild(cardScene);

    // Navigation controls
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center justify-between w-full mb-4 px-2';
    controlsDiv.innerHTML = `
        <button id="prevFlashcardBtn-${flashcardContext}" class="flashcard-nav-btn">← Previous</button>
        <span id="flashcardCounter-${flashcardContext}" class="text-sm font-medium text-slate-600">1 / ${allFlashcards.length}</span>
        <button id="nextFlashcardBtn-${flashcardContext}" class="flashcard-nav-btn">Next →</button>
    `;
    flashcardWrapper.appendChild(controlsDiv);
    
    // AI chat container
    const aiChatContainer = document.createElement('div');
    aiChatContainer.id = `flashcardAiChatContainer-${flashcardContext}`;
    aiChatContainer.className = 'w-full mt-4 p-4 bg-slate-50 rounded-lg shadow-sm hidden border border-slate-200';
    aiChatContainer.innerHTML = `
        <h4 class="text-md font-semibold text-slate-700 mb-2">AI Study Assistant</h4>
        <div id="flashcardAiChatMessages-${flashcardContext}" class="h-32 overflow-y-auto border border-slate-200 rounded-md p-2 mb-2 text-xs space-y-1.5 bg-white"></div>
        <div class="flex space-x-2">
            <input type="text" id="flashcardAiChatInput-${flashcardContext}" 
                class="form-input flex-grow text-xs rounded-md border-slate-300" 
                placeholder="Ask a question about this flashcard...">
            <button id="flashcardAiChatSendBtn-${flashcardContext}" 
                class="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-md shadow-sm transition-colors">
                Send
            </button>
        </div>
        <p id="flashcardAiChatStatus-${flashcardContext}" class="text-xs text-slate-500 mt-1"></p>
    `;
    flashcardWrapper.appendChild(aiChatContainer);
    
    container.appendChild(flashcardWrapper);
    displayFlashcard(currentFlashcardIndex);
    setupFlashcardEventListeners();
}

function displayFlashcard(index) {
    const cardInner = document.getElementById(`flashcardInner-${flashcardContext}`);
    const counter = document.getElementById(`flashcardCounter-${flashcardContext}`);
    const prevBtn = document.getElementById(`prevFlashcardBtn-${flashcardContext}`);
    const nextBtn = document.getElementById(`nextFlashcardBtn-${flashcardContext}`);
    const aiChatContainer = document.getElementById(`flashcardAiChatContainer-${flashcardContext}`);
    const aiChatMessages = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);

    if (!cardInner || !allFlashcards[index]) return;

    // Update progress dots
    document.querySelectorAll('.flashcard-progress-dot').forEach((dot, i) => {
        dot.className = `flashcard-progress-dot ${i === index ? 'bg-indigo-600' : markedForReview.has(i) ? 'bg-amber-400' : 'bg-slate-300'}`;
    });

    cardInner.innerHTML = ''; 
    cardInner.classList.remove('[transform:rotateY(180deg)]');

    const cardData = allFlashcards[index];
    currentFlashcardChatHistory = []; 
    if(aiChatMessages) aiChatMessages.innerHTML = '';
    if(aiChatContainer) aiChatContainer.classList.add('hidden');

    const frontFace = document.createElement('div');
    frontFace.className = 'flashcard-face flashcard-front';
    frontFace.innerHTML = `
        <div class="p-6 flex flex-col items-center justify-center h-full text-center">
            <p class="text-lg sm:text-xl font-semibold text-indigo-700 mb-4">${processTextForDisplay(cardData.term)}</p>
            <textarea id="flashcardUserAnswer-${flashcardContext}" 
                class="form-textarea w-full max-w-md h-24 text-sm p-3 border-slate-300 rounded-lg shadow-sm mb-4 resize-none" 
                placeholder="Type your answer here..."></textarea>
            <button id="submitFlashcardAnswerBtn-${flashcardContext}" 
                class="flashcard-action-btn bg-green-500 hover:bg-green-600 focus:ring-green-400">
                Check Answer
            </button>
        </div>
    `;
    
    const backFace = document.createElement('div');
    backFace.className = 'flashcard-face flashcard-back';
    backFace.innerHTML = `
        <div class="p-6 flex flex-col h-full">
            <div class="flex-grow space-y-3 overflow-y-auto mb-4 pr-1">
                <div id="flashcardUserFeedback-${flashcardContext}" class="text-sm p-3 rounded-md hidden"></div>
                <div>
                    <strong class="block text-base font-semibold text-indigo-700 mb-2">Correct Answer:</strong>
                    <p class="text-base text-slate-700 leading-relaxed">${processTextForDisplay(cardData.definition)}</p>
                </div>
            </div>
            <div class="flashcard-controls">
                <button id="explainFlashcardBtn-${flashcardContext}" 
                    class="flashcard-action-btn bg-sky-500 hover:bg-sky-600 focus:ring-sky-400">
                    Get Explanation
                </button>
                <button id="flipToFrontBtn-${flashcardContext}" 
                    class="flashcard-action-btn bg-slate-500 hover:bg-slate-600 focus:ring-slate-400">
                    Try Again
                </button>
            </div>
        </div>
    `;

    cardInner.appendChild(frontFace);
    cardInner.appendChild(backFace);

    if(counter) counter.textContent = `${index + 1} / ${allFlashcards.length}`;
    if(prevBtn) prevBtn.disabled = index === 0;
    if(nextBtn) nextBtn.disabled = index === allFlashcards.length - 1;

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

    if (submitBtn && cardInner && userAnswerTextarea && userFeedbackDiv) {
        submitBtn.onclick = async () => {
            const userAnswer = userAnswerTextarea.value;
            userFeedbackDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Checking your answer...</span>`;
            userFeedbackDiv.className = 'text-sm p-3 rounded-md mb-3 bg-slate-100 border border-slate-200';
            userFeedbackDiv.classList.remove('hidden');
            cardInner.classList.add('[transform:rotateY(180deg)]');

            try {
                const result = await apiFlashcardInteract(allFlashcards[currentFlashcardIndex], "submit_answer", userAnswer);
                userFeedbackDiv.innerHTML = processTextForDisplay(result.feedback);
                if (result.feedback.toLowerCase().includes("correct")) {
                    userFeedbackDiv.className = 'text-sm p-3 rounded-md mb-3 bg-green-50 border border-green-200 text-green-700';
                } else if (result.feedback.toLowerCase().includes("partially")) {
                    userFeedbackDiv.className = 'text-sm p-3 rounded-md mb-3 bg-yellow-50 border border-yellow-200 text-yellow-700';
                } else {
                    userFeedbackDiv.className = 'text-sm p-3 rounded-md mb-3 bg-red-50 border border-red-200 text-red-700';
                }
            } catch (error) {
                userFeedbackDiv.innerHTML = `<span class="text-red-600">Error: ${error.message}</span>`;
                userFeedbackDiv.className = 'text-sm p-3 rounded-md mb-3 bg-red-50 border border-red-200';
            }
        };
    }

    if (explainBtn && aiChatContainer && aiChatStatus) {
        explainBtn.onclick = async () => {
            aiChatContainer.classList.remove('hidden');
            addMessageToChat('AI', 'Getting detailed explanation...', 'system');
            aiChatStatus.textContent = 'Getting explanation...';
            try {
                const result = await apiFlashcardInteract(allFlashcards[currentFlashcardIndex], "request_explanation");
                addMessageToChat('AI', result.explanation, 'ai');
                currentFlashcardChatHistory.push({role: "model", parts: [{text: result.explanation}]});
                aiChatStatus.textContent = '';
            } catch (error) {
                addMessageToChat('AI', `Error: ${error.message}`, 'error');
                aiChatStatus.textContent = 'Failed to get explanation.';
            }
        };
    }

    if (flipToFrontBtn && cardInner) {
        flipToFrontBtn.onclick = () => {
            cardInner.classList.remove('[transform:rotateY(180deg)]');
            if(userAnswerTextarea) userAnswerTextarea.value = '';
            if(userFeedbackDiv) {
                userFeedbackDiv.innerHTML = '';
                userFeedbackDiv.classList.add('hidden');
            }
            if(aiChatContainer) aiChatContainer.classList.add('hidden');
            const chatMessages = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
            if(chatMessages) chatMessages.innerHTML = '';
            currentFlashcardChatHistory = [];
        };
    }
}

function setupFlashcardEventListeners() {
    const prevBtn = document.getElementById(`prevFlashcardBtn-${flashcardContext}`);
    const nextBtn = document.getElementById(`nextFlashcardBtn-${flashcardContext}`);
    const shuffleBtn = document.getElementById(`shuffleBtn-${flashcardContext}`);
    const markReviewBtn = document.getElementById(`markReviewBtn-${flashcardContext}`);
    const resetBtn = document.getElementById(`resetBtn-${flashcardContext}`);
    const aiChatInput = document.getElementById(`flashcardAiChatInput-${flashcardContext}`);
    const aiChatSendBtn = document.getElementById(`flashcardAiChatSendBtn-${flashcardContext}`);
    const cardInner = document.getElementById(`flashcardInner-${flashcardContext}`);

    if(prevBtn) {
        prevBtn.onclick = () => {
            if (currentFlashcardIndex > 0) {
                currentFlashcardIndex--;
                displayFlashcard(currentFlashcardIndex);
            }
        };
    }

    if(nextBtn) {
        nextBtn.onclick = () => {
            if (currentFlashcardIndex < allFlashcards.length - 1) {
                currentFlashcardIndex++;
                displayFlashcard(currentFlashcardIndex);
            }
        };
    }

    if(shuffleBtn) {
        shuffleBtn.onclick = () => {
            isShuffleMode = !isShuffleMode;
            shuffleBtn.classList.toggle('bg-purple-500');
            shuffleBtn.classList.toggle('text-white');
            if(isShuffleMode) {
                allFlashcards = [...allFlashcards].sort(() => Math.random() - 0.5);
                currentFlashcardIndex = 0;
                displayFlashcard(currentFlashcardIndex);
            }
        };
    }

    if(markReviewBtn) {
        markReviewBtn.onclick = () => {
            if(markedForReview.has(currentFlashcardIndex)) {
                markedForReview.delete(currentFlashcardIndex);
            } else {
                markedForReview.add(currentFlashcardIndex);
            }
            displayFlashcard(currentFlashcardIndex);
        };
    }

    if(resetBtn) {
        resetBtn.onclick = () => {
            isShuffleMode = false;
            markedForReview.clear();
            currentFlashcardIndex = 0;
            shuffleBtn.classList.remove('bg-purple-500', 'text-white');
            displayFlashcard(currentFlashcardIndex);
        };
    }

    if(cardInner) {
        cardInner.addEventListener('keydown', (e) => {
            if(e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                cardInner.classList.toggle('[transform:rotateY(180deg)]');
            } else if(e.key === 'ArrowLeft' && currentFlashcardIndex > 0) {
                currentFlashcardIndex--;
                displayFlashcard(currentFlashcardIndex);
            } else if(e.key === 'ArrowRight' && currentFlashcardIndex < allFlashcards.length - 1) {
                currentFlashcardIndex++;
                displayFlashcard(currentFlashcardIndex);
            }
        });
    }
    
    const sendChatMessage = async () => {
        if (!aiChatInput) return;
        const userQuery = aiChatInput.value.trim();
        if (!userQuery) return;

        addMessageToChat('You', userQuery, 'user');
        aiChatInput.value = '';
        const aiChatStatus = document.getElementById(`flashcardAiChatStatus-${flashcardContext}`);
        if(aiChatStatus) aiChatStatus.textContent = 'AI is thinking...';

        try {
            const result = await apiFlashcardInteract(
                allFlashcards[currentFlashcardIndex],
                "chat_message",
                null,
                userQuery,
                currentFlashcardChatHistory
            );
            addMessageToChat('AI', result.chatResponse, 'ai');
            currentFlashcardChatHistory = result.updatedChatHistory;
            if(aiChatStatus) aiChatStatus.textContent = '';
        } catch (error) {
            addMessageToChat('AI', `Error: ${error.message}`, 'error');
            if(aiChatStatus) aiChatStatus.textContent = 'Error in chat.';
        }
    };

    if(aiChatSendBtn) {
        aiChatSendBtn.onclick = sendChatMessage;
    }
    if(aiChatInput) {
        aiChatInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        };
    }
}

function addMessageToChat(sender, message, type) {
    const messagesDiv = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
    if (!messagesDiv) return;

    const messageEl = document.createElement('div');
    let senderClass = 'text-slate-700';
    let messageBgClass = 'bg-white';
    let textAlignClass = 'mr-auto';

    if (type === 'user') {
        senderClass = 'text-blue-600 font-semibold';
        messageBgClass = 'bg-blue-50';
        textAlignClass = 'ml-auto';
    } else if (type === 'ai') {
        senderClass = 'text-indigo-600 font-semibold';
        messageBgClass = 'bg-indigo-50';
    } else if (type === 'system' || type === 'error') {
        senderClass = type === 'error' ? 'text-red-500 italic' : 'text-slate-500 italic';
        messageBgClass = 'bg-slate-100';
    }
    
    messageEl.className = `p-2 rounded-md ${messageBgClass} max-w-[85%] ${textAlignClass}`;
    messageEl.innerHTML = `<strong class="${senderClass}">${sender}:</strong> ${processTextForDisplay(message)}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupTabs(tabsContainerSelector, tabContentContainerSelector = null) {
    const tabsContainer = document.querySelector(tabsContainerSelector);
    if (!tabsContainer) return;

    const contentContainer = tabContentContainerSelector ? document.querySelector(tabContentContainerSelector) : document.body;

    tabsContainer.addEventListener('click', (event) => {
        const clickedLink = event.target.closest('.tab-link');
        if (clickedLink) {
            const targetTabId = clickedLink.dataset.tab;
            tabsContainer.querySelectorAll('.tab-link').forEach(link => link.removeAttribute('data-active'));
            contentContainer.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
                content.removeAttribute('data-active');
            });
            
            clickedLink.dataset.active = "true";
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.dataset.active = "true";
            }
        }
    });
}

function setCurrentYear(elementId) {
    const yearSpan = document.getElementById(elementId);
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
}

function displayResults(results) {
    console.log("displayResults called. Results object:", results);
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutputContainer = document.getElementById('flashcardsOutput');
    const quizOutput = document.getElementById('quizOutput');
    const quizOutputStructured = document.getElementById('quizOutputStructured');
    const explainButton = document.getElementById('explainSelectedSummaryTextButton');
    const explanationOutput = document.getElementById('explanationOutput');
    const explainInstruction = document.getElementById('explainInstruction');

    if (summaryOutput) summaryOutput.innerHTML = '';
    if (flashcardsOutputContainer) flashcardsOutputContainer.innerHTML = '';
    if (quizOutput) quizOutput.innerHTML = '';
    if (quizOutputStructured) quizOutputStructured.value = '';
    if (explainButton) explainButton.classList.add('hidden');
    if (explanationOutput) {
        explanationOutput.innerHTML = '';
        explanationOutput.classList.add('hidden');
    }
    if (explainInstruction) explainInstruction.classList.add('hidden');

    document.querySelectorAll('#resultsSection .tab-content').forEach(tc => {
        tc.classList.add('hidden');
        tc.removeAttribute('data-active');
    });
    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => {
        tl.removeAttribute('data-active');
    });
    
    let firstVisibleTab = null;
    const keywordsForHighlighting = window.currentKeywordsForHighlighting || results.summaryKeywords || [];

    if (results.summary) {
        if (summaryOutput) {
            summaryOutput.innerHTML = '';
            const summaryText = results.summary.trim();
            const lines = summaryText.split('\n');
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
                        contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                        currentSectionDetails.appendChild(contentDiv);
                        summaryOutput.appendChild(currentSectionDetails);
                    }
                    currentSectionDetails = document.createElement('details');
                    currentSectionDetails.className = 'details-accordion';
                    currentSectionDetails.open = true;
                    const summaryTitle = document.createElement('summary');
                    summaryTitle.className = 'details-accordion-summary';
                    summaryTitle.innerHTML = processTextForDisplay(trimmedLine.substring(4), keywordsForHighlighting);
                    currentSectionDetails.appendChild(summaryTitle);
                    sectionContentHtml = '';
                } else {
                    sectionContentHtml += line + '\n';
                }
            });

            if (firstHeadingFound && currentSectionDetails) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'details-accordion-content';
                contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                currentSectionDetails.appendChild(contentDiv);
                summaryOutput.appendChild(currentSectionDetails);
            } else if (sectionContentHtml.trim()) {
                const isBulleted = lines.some(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
                if(isBulleted) {
                    let firstBulletIdx = lines.findIndex(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
                    const currentContentLines = sectionContentHtml.trim().split('\n');
                    firstBulletIdx = currentContentLines.findIndex(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
                    const relevantLines = firstBulletIdx !== -1 ? currentContentLines.slice(firstBulletIdx) : [];
                    if(relevantLines.length >0) {
                        const ul = document.createElement('ul');
                        ul.className = 'list-disc list-inside space-y-1 pl-1';
                        relevantLines.forEach(l => {
                            const trimmedL = l.trim();
                            if (trimmedL.startsWith('* ') || trimmedL.startsWith('- ')) {
                                const li = document.createElement('li');
                                li.innerHTML = processTextForDisplay(trimmedL.substring(2), keywordsForHighlighting);
                                ul.appendChild(li);
                            } else if (trimmedL) {
                                const li = document.createElement('li');
                                li.innerHTML = processTextForDisplay(trimmedL, keywordsForHighlighting);
                                ul.appendChild(li);
                            }
                        });
                        summaryOutput.appendChild(ul);
                    } else {
                        summaryOutput.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                    }
                } else {
                    summaryOutput.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                }
            }
            if (summaryOutput.innerHTML.trim() !== "" && explainInstruction) {
                explainInstruction.classList.remove('hidden');
            }
        }
        if (!firstVisibleTab) firstVisibleTab = 'summaryTab';
    }

    if (results.flashcards && Array.isArray(results.flashcards) && results.flashcards.length > 0) {
        if (flashcardsOutputContainer) {
            renderFlashcards(flashcardsOutputContainer, results.flashcards, keywordsForHighlighting, 'main');
        }
        if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    }

    if (results.quiz) {
        if (quizOutput) renderQuiz(quizOutput, results.quiz, keywordsForHighlighting);
        if (quizOutputStructured && results.quiz && results.quiz.length > 0) {
            quizOutputStructured.value = JSON.stringify(results.quiz, null, 2);
        }
        if (!firstVisibleTab) firstVisibleTab = 'quizTab';
    }
    
    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => tl.classList.remove('hidden'));

    if (firstVisibleTab) {
        const tabToActivate = document.getElementById(firstVisibleTab);
        const linkToActivate = document.querySelector(`#resultsSection .tab-link[data-tab="${firstVisibleTab}"]`);
        if(tabToActivate) {
            tabToActivate.classList.remove('hidden');
            tabToActivate.dataset.active = "true";
        }
        if(linkToActivate) linkToActivate.dataset.active = "true";
        if (resultsSection) resultsSection.classList.remove('hidden');
    } else {
        if (resultsSection) resultsSection.classList.add('hidden');
        document.querySelectorAll('#resultsSection .tab-link').forEach(tl => tl.classList.add('hidden'));
    }
}

function renderQuiz(container, quiz, keywordsToHighlight = []) {
    container.innerHTML = '';
    if (!quiz || !Array.isArray(quiz) || quiz.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-sm p-4">No quiz questions available.</p>';
        return;
    }

    quiz.forEach((q, index) => {
        if (!q || typeof q !== 'object' || !q.question || !Array.isArray(q.options) || !q.correctAnswer) {
            console.error(`Invalid quiz question data at index ${index}:`, q);
            return;
        }

        const questionDiv = document.createElement('div');
        questionDiv.className = 'quiz-question-custom';
        
        const qText = document.createElement('p');
        qText.className = 'quiz-question-custom-text';
        qText.innerHTML = `${index + 1}. ${processTextForDisplay(q.question, keywordsToHighlight)}`;
        questionDiv.appendChild(qText);
        
        const optionsList = document.createElement('ul');
        optionsList.className = 'quiz-question-custom-options';
        q.options.forEach(opt => {
            const li = document.createElement('li');
            li.innerHTML = processTextForDisplay(opt, keywordsToHighlight);
            optionsList.appendChild(li);
        });
        questionDiv.appendChild(optionsList);
        
        const answerText = document.createElement('p');
        answerText.className = 'quiz-question-custom-correct-answer';
        answerText.innerHTML = `<strong>Correct Answer:</strong> ${processTextForDisplay(q.correctAnswer, keywordsToHighlight)}`;
        questionDiv.appendChild(answerText);
        
        container.appendChild(questionDiv);
    });
}