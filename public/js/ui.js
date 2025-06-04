// UI Helper Functions
function toggleElementVisibility(elementId, visible) {
    const element = document.getElementById(elementId);
    if (element) {
        element.dataset.visible = visible.toString();
        element.classList.toggle('hidden', !visible);
    }
}

function showMessage(elementId, message, type = 'success', duration = 0) {
    const element = document.getElementById(elementId);
    if (element) {
        element.className = 'p-3 rounded-md shadow-sm text-sm font-medium';
        if (type === 'error') {
            element.classList.add('bg-red-100', 'border', 'border-red-300', 'text-red-700');
        } else if (type === 'warning') {
            element.classList.add('bg-yellow-100', 'border', 'border-yellow-300', 'text-yellow-700');
        } else {
            element.classList.add('bg-green-100', 'border', 'border-green-300', 'text-green-700');
        }
        element.textContent = message;
        element.classList.remove('hidden');

        if (duration > 0) {
            setTimeout(() => clearMessage(elementId), duration);
        }
    }
}

function clearMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = '';
        element.className = '';
        element.classList.add('hidden');
    }
}

function showProcessingStatus(elementId, message, showSpinner = false) {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.innerHTML = `${message}${showSpinner ? ' <span class="inline-block animate-spin ml-2">⏳</span>' : ''}`;
        statusElement.className = 'p-3 rounded-md shadow-sm text-sm font-medium bg-blue-50 border border-blue-200 text-blue-700';
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
    if (element) {
        element.textContent = new Date().getFullYear();
    }
}

function setupTabs(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const tabLinks = container.querySelectorAll('.tab-link');
    const tabContents = container.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            if (link.classList.contains('opacity-50')) { // Check if tab is "disabled"
                event.preventDefault();
                return;
            }
            const targetId = link.dataset.tab;
            
            tabLinks.forEach(tl => tl.removeAttribute('data-active'));
            tabContents.forEach(tc => {
                tc.classList.add('hidden');
                tc.removeAttribute('data-active');
            });
            
            link.dataset.active = "true";
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.dataset.active = "true";
            }
        });
    });
}

function processTextForDisplay(text, keywordsToHighlight = []) {
    if (!text) return '';
    let processedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    if (keywordsToHighlight && keywordsToHighlight.length > 0) {
        const keywordPattern = new RegExp(`(${keywordsToHighlight.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        processedText = processedText.replace(keywordPattern, '<span class="highlighted-keyword">$1</span>');
    }
    return processedText;
}

function displayResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutputRaw = document.getElementById('flashcardsOutputRaw');
    const launchFlashcardModalBtn = document.getElementById('launchFlashcardModalBtn-main');
    const startQuizBtn = document.getElementById('startQuizBtn');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const summaryTabContent = document.getElementById('summaryTab');
    const flashcardsTabContent = document.getElementById('flashcardsTab');
    const quizTabContent = document.getElementById('quizTab');
    const summaryTabLink = document.querySelector('.tab-link[data-tab="summaryTab"]');
    const flashcardsTabLink = document.querySelector('.tab-link[data-tab="flashcardsTab"]');
    const quizTabLink = document.querySelector('.tab-link[data-tab="quizTab"]');


    if (!resultsSection) return;
    resultsSection.classList.remove('hidden');
    window.lastProcessedResults = results; 
    window.currentExtractedTextForQuiz = results.extractedText || window.currentExtractedTextForQuiz;

    let firstAvailableTab = null;

    if (summaryOutput && results.summary) {
        renderSummary(summaryOutput, results.summary);
        if (summaryTabContent) summaryTabContent.classList.remove('hidden');
        if (summaryTabLink) {
            summaryTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            summaryTabLink.disabled = false;
            if (!firstAvailableTab) firstAvailableTab = summaryTabLink;
        }
    } else {
        if (summaryTabContent) summaryTabContent.classList.add('hidden');
        if (summaryTabLink) {
            summaryTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden');
            summaryTabLink.disabled = true;
        }
    }

    if (flashcardsOutputRaw && results.flashcards && results.flashcards.length > 0) {
        flashcardsOutputRaw.value = JSON.stringify(results.flashcards, null, 2);
        if (launchFlashcardModalBtn) {
            launchFlashcardModalBtn.classList.remove('hidden');
            launchFlashcardModalBtn.onclick = () => {
                const flashcardModalContent = document.getElementById('flashcardModalContent-main');
                if (flashcardModalContent && results.flashcards) {
                    renderInteractiveFlashcards(flashcardModalContent, results.flashcards, window.currentKeywordsForHighlighting || [], 'main');
                    toggleElementVisibility('flashcardStudyModal-main', true);
                }
            };
        }
        if (flashcardsTabContent) flashcardsTabContent.classList.remove('hidden');
         if (flashcardsTabLink) {
            flashcardsTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            flashcardsTabLink.disabled = false;
            if (!firstAvailableTab) firstAvailableTab = flashcardsTabLink;
        }
    } else {
        if (launchFlashcardModalBtn) launchFlashcardModalBtn.classList.add('hidden');
        if (flashcardsTabContent) flashcardsTabContent.classList.add('hidden');
        if (flashcardsTabLink) {
            flashcardsTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden');
            flashcardsTabLink.disabled = true;
        }
    }
    
    window.currentQuizOptions = results.quizOptions || { 
        questionTypes: ['multiple_choice'], 
        numQuestions: 'ai_choice', 
        difficulty: 'medium' 
    };

    if (results.quiz && Array.isArray(results.quiz) && results.quiz.length > 0) {
        window.currentQuizData = results.quiz.map(q => ({...q, chatHistory: [], detailedExplanationContent: null, detailedExplanationFetched: false, aiFeedback: null, previousStateBeforeMark: null }));
        if (startQuizBtn) {
            startQuizBtn.disabled = false;
            startQuizBtn.textContent = 'Start Quiz';
        }
        if(quizReadyMessage) quizReadyMessage.textContent = `A quiz with ${results.quiz.length} questions is ready. You can start it or customize options below to generate a new one.`;
        if (quizTabContent) quizTabContent.classList.remove('hidden');
        if (quizTabLink) {
            quizTabLink.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            quizTabLink.disabled = false;
            if (!firstAvailableTab) firstAvailableTab = quizTabLink;
        }
        initializeQuizSystem();
    } else {
        window.currentQuizData = null;
        if (startQuizBtn) {
            startQuizBtn.disabled = true;
            startQuizBtn.textContent = 'Start Quiz (No Quiz Data)';
        }
        if(quizReadyMessage) quizReadyMessage.textContent = 'No quiz was generated. You can customize options below and generate one.';
        if (quizTabContent) quizTabContent.classList.add('hidden');
        if (quizTabLink) {
            quizTabLink.classList.add('opacity-50', 'cursor-not-allowed', 'hidden');
            quizTabLink.disabled = true;
        }
        initializeQuizSystem(); 
    }
    
    const allTabLinks = document.querySelectorAll('#resultsSection .tab-link');
    allTabLinks.forEach(tl => tl.removeAttribute('data-active')); // Deactivate all first
    
    if (firstAvailableTab) {
        firstAvailableTab.click();
    } else {
        resultsSection.innerHTML = '<p class="text-center text-slate-500 p-6">No materials were generated. Please try different options or a different file.</p>';
    }
}


function renderSummary(container, summaryText) {
    if (!container || !summaryText) return;
    
    const lines = summaryText.trim().split('\n');
    let currentSectionDetails = null;
    let sectionContentHtml = '';
    let firstHeadingFound = false;

    container.innerHTML = ''; 

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('### ')) {
            firstHeadingFound = true;
            if (currentSectionDetails) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'details-accordion-content';
                contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
                currentSectionDetails.appendChild(contentDiv);
                container.appendChild(currentSectionDetails);
            }
            currentSectionDetails = document.createElement('details');
            currentSectionDetails.className = 'details-accordion';
            currentSectionDetails.open = true;
            const summaryTitle = document.createElement('summary');
            summaryTitle.className = 'details-accordion-summary';
            summaryTitle.innerHTML = processTextForDisplay(trimmedLine.substring(4), window.currentKeywordsForHighlighting || []);
            currentSectionDetails.appendChild(summaryTitle);
            sectionContentHtml = '';
        } else {
            sectionContentHtml += line + '\n';
        }
    });

    if (firstHeadingFound && currentSectionDetails) {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'details-accordion-content';
        contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
        currentSectionDetails.appendChild(contentDiv);
        container.appendChild(currentSectionDetails);
    } else if (sectionContentHtml.trim()) {
        const currentContentLines = sectionContentHtml.trim().split('\n');
        const isBulleted = currentContentLines.some(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
        
        if (isBulleted) {
            let firstBulletIdx = currentContentLines.findIndex(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
            const relevantLines = firstBulletIdx !== -1 ? currentContentLines.slice(firstBulletIdx) : [];
            
            if (relevantLines.length > 0) {
                const ul = document.createElement('ul');
                ul.className = 'list-disc list-inside space-y-1 pl-1';
                relevantLines.forEach(l => {
                    const trimmedL = l.trim();
                    if (trimmedL.startsWith('* ') || trimmedL.startsWith('- ')) {
                        const li = document.createElement('li');
                        li.innerHTML = processTextForDisplay(trimmedL.substring(2), window.currentKeywordsForHighlighting || []);
                        ul.appendChild(li);
                    } else if (trimmedL) {
                        const li = document.createElement('li');
                        li.innerHTML = processTextForDisplay(trimmedL, window.currentKeywordsForHighlighting || []);
                        ul.appendChild(li);
                    }
                });
                container.appendChild(ul);
            }
        } else {
            container.innerHTML = processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), window.currentKeywordsForHighlighting || []);
        }
    }

    if (container.innerHTML.trim() !== "") {
        const explainInstruction = document.getElementById('explainInstruction');
        if (explainInstruction) explainInstruction.classList.remove('hidden');
    }
}

function renderInteractiveFlashcards(container, flashcards, keywordsToHighlight = [], context = 'main') {
    if (!container || !Array.isArray(flashcards) || flashcards.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center">No flashcards available.</p>';
        return;
    }

    let currentCardIndex = 0;
    let isFlipped = false;
    let cardStates = new Array(flashcards.length).fill('default');
    let chatHistory = [];

    function createFlashcardContent() {
        const card = flashcards[currentCardIndex];
        const html = `
            <div class="flashcard-modal-scene" id="flashcardScene-${context}">
                <div class="flashcard-modal-inner" id="flashcardInner-${context}" style="${isFlipped ? 'transform: rotateY(180deg);' : ''}">
                    <div class="flashcard-modal-face flashcard-modal-front">
                        <h4 class="text-lg sm:text-xl font-semibold text-slate-800 mb-4">Term/Question:</h4>
                        <p class="text-base sm:text-lg text-slate-700">${processTextForDisplay(card.term, keywordsToHighlight)}</p>
                    </div>
                    <div class="flashcard-modal-face flashcard-modal-back">
                        <div class="flex-grow">
                            <h4 class="text-lg sm:text-xl font-semibold text-slate-800 mb-4">Definition/Answer:</h4>
                            <p class="text-base sm:text-lg text-slate-700">${processTextForDisplay(card.definition, keywordsToHighlight)}</p>
                        </div>
                        <div class="mt-4 space-x-2">
                            <button class="flashcard-modal-action-btn bg-green-500 hover:bg-green-600 focus:ring-green-400" onclick="handleFlashcardAction('correct', '${context}')">I Got It Right</button>
                            <button class="flashcard-modal-action-btn bg-red-500 hover:bg-red-600 focus:ring-red-400" onclick="handleFlashcardAction('incorrect', '${context}')">Need More Practice</button>
                            <button class="flashcard-modal-action-btn bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400" onclick="handleFlashcardAction('mark', '${context}')">Mark for Review</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex justify-between items-center mb-4">
                <div class="flex space-x-1">
                    ${flashcards.map((_, idx) => `
                        <button 
                            class="flashcard-progress-dot ${cardStates[idx]}" 
                            onclick="jumpToCard(${idx}, '${context}')"
                            aria-label="Go to card ${idx + 1}"
                            ${idx === currentCardIndex ? 'data-current="true"' : ''}
                        ></button>
                    `).join('')}
                </div>
                <span class="text-sm text-slate-600">Card ${currentCardIndex + 1} of ${flashcards.length}</span>
            </div>
            <div class="flex justify-between space-x-4 mb-6">
                <button class="flashcard-modal-nav-btn" onclick="previousCard('${context}')" ${currentCardIndex === 0 ? 'disabled' : ''}>Previous</button>
                <button class="flashcard-modal-utility-btn" onclick="toggleFlashcard('${context}')">Flip Card</button>
                <button class="flashcard-modal-nav-btn" onclick="nextCard('${context}')" ${currentCardIndex === flashcards.length - 1 ? 'disabled' : ''}>Next</button>
            </div>
            <div class="space-y-4">
                <div>
                    <label for="flashcardAnswer-${context}" class="block text-sm font-medium text-slate-700 mb-1">Your Answer:</label>
                    <textarea id="flashcardAnswer-${context}" class="form-textarea w-full text-sm rounded-lg border-slate-300 shadow-sm" rows="2" placeholder="Type your answer here..."></textarea>
                    <button onclick="checkFlashcardAnswer('${context}')" class="mt-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition duration-150">Check Answer</button>
                </div>
                <div>
                    <label for="flashcardQuestion-${context}" class="block text-sm font-medium text-slate-700 mb-1">Ask a Question:</label>
                    <div class="flex space-x-2">
                        <input type="text" id="flashcardQuestion-${context}" class="form-input flex-grow text-sm rounded-lg border-slate-300 shadow-sm" placeholder="Ask about this term/concept...">
                        <button onclick="askFlashcardQuestion('${context}')" class="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition duration-150">Ask</button>
                    </div>
                </div>
                <div id="flashcardFeedback-${context}" class="hidden rounded-lg p-4 text-sm"></div>
            </div>
        `;
        container.innerHTML = html;

        const dots = container.querySelectorAll('.flashcard-progress-dot');
        dots.forEach((dot, idx) => {
            dot.className = `flashcard-progress-dot ${cardStates[idx]}${idx === currentCardIndex ? ' current' : ''}`;
        });
    }

    window.toggleFlashcard = function(ctx) {
        if (ctx !== context) return;
        const inner = document.getElementById(`flashcardInner-${context}`);
        if (inner) {
            isFlipped = !isFlipped;
            inner.style.transform = isFlipped ? 'rotateY(180deg)' : '';
        }
    };

    window.previousCard = function(ctx) {
        if (ctx !== context) return;
        if (currentCardIndex > 0) {
            currentCardIndex--;
            isFlipped = false;
            createFlashcardContent();
            clearFeedback();
        }
    };

    window.nextCard = function(ctx) {
        if (ctx !== context) return;
        if (currentCardIndex < flashcards.length - 1) {
            currentCardIndex++;
            isFlipped = false;
            createFlashcardContent();
            clearFeedback();
        }
    };

    window.jumpToCard = function(idx, ctx) {
        if (ctx !== context) return;
        if (idx >= 0 && idx < flashcards.length) {
            currentCardIndex = idx;
            isFlipped = false;
            createFlashcardContent();
            clearFeedback();
        }
    };

    window.handleFlashcardAction = function(action, ctx) {
        if (ctx !== context) return;
        switch(action) {
            case 'correct':
                cardStates[currentCardIndex] = 'correct';
                break;
            case 'incorrect':
                cardStates[currentCardIndex] = 'incorrect';
                break;
            case 'mark':
                cardStates[currentCardIndex] = cardStates[currentCardIndex] === 'marked' ? 'default' : 'marked';
                break;
        }
        createFlashcardContent();
    };

    window.checkFlashcardAnswer = async function(ctx) {
        if (ctx !== context) return;
        const answerInput = document.getElementById(`flashcardAnswer-${context}`);
        const feedbackDiv = document.getElementById(`flashcardFeedback-${context}`);
        if (!answerInput || !feedbackDiv) return;

        const userAnswer = answerInput.value.trim();
        if (!userAnswer) {
            showFeedback('Please enter an answer first.', 'warning');
            return;
        }

        try {
            const response = await apiFlashcardInteract(flashcards[currentCardIndex], 'submit_answer', userAnswer);
            showFeedback(response.feedback);
            answerInput.value = '';
        } catch (error) {
            showFeedback(error.message || 'Failed to check answer.', 'error');
        }
    };

    window.askFlashcardQuestion = async function(ctx) {
        if (ctx !== context) return;
        const questionInput = document.getElementById(`flashcardQuestion-${context}`);
        const feedbackDiv = document.getElementById(`flashcardFeedback-${context}`);
        if (!questionInput || !feedbackDiv) return;

        const userQuery = questionInput.value.trim();
        if (!userQuery) {
            showFeedback('Please enter a question first.', 'warning');
            return;
        }

        try {
            const response = await apiFlashcardInteract(flashcards[currentCardIndex], 'chat_message', null, userQuery, chatHistory);
            chatHistory = response.updatedChatHistory;
            showFeedback(response.chatResponse);
            questionInput.value = '';
        } catch (error) {
            showFeedback(error.message || 'Failed to get answer.', 'error');
        }
    };

    function showFeedback(message, type = 'success') {
        const feedbackDiv = document.getElementById(`flashcardFeedback-${context}`);
        if (!feedbackDiv) return;

        feedbackDiv.className = 'rounded-lg p-4 text-sm';
        switch(type) {
            case 'error':
                feedbackDiv.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
                break;
            case 'warning':
                feedbackDiv.classList.add('bg-yellow-50', 'text-yellow-700', 'border', 'border-yellow-200');
                break;
            default:
                feedbackDiv.classList.add('bg-green-50', 'text-green-700', 'border', 'border-green-200');
        }
        feedbackDiv.textContent = message;
        feedbackDiv.classList.remove('hidden');
    }

    function clearFeedback() {
        const feedbackDiv = document.getElementById(`flashcardFeedback-${context}`);
        if (feedbackDiv) {
            feedbackDiv.classList.add('hidden');
            feedbackDiv.textContent = '';
        }
    }

    createFlashcardContent();
}

// --- Quiz System ---
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

function initializeQuizSystem() {
    const startQuizBtn = document.getElementById('startQuizBtn');
    const regenerateQuizBtn = document.getElementById('regenerateQuizWithOptionsBtn');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const customizeDetails = quizSetupView.querySelector('details');

    if (startQuizBtn) {
        startQuizBtn.onclick = () => handleStartQuiz(false);
        startQuizBtn.textContent = 'Start Quiz'; 
    }
    if (regenerateQuizBtn) {
        regenerateQuizBtn.onclick = () => handleStartQuiz(true);
    }
    
    const defaultQuestionTypeCheckbox = document.querySelector('#quizSetupView input[name="quizQuestionTypeOption"][value="multiple_choice"]');
    if (defaultQuestionTypeCheckbox) defaultQuestionTypeCheckbox.checked = true;
    
    const defaultNumQuestionsRadio = document.querySelector('#quizSetupView input[name="quizNumQuestionsOption"][value="ai_choice"]');
    if (defaultNumQuestionsRadio) defaultNumQuestionsRadio.checked = true;

    const defaultDifficultyRadio = document.querySelector('#quizSetupView input[name="quizDifficultyOption"][value="medium"]');
    if (defaultDifficultyRadio) defaultDifficultyRadio.checked = true;


    if (window.currentQuizData && window.currentQuizData.length > 0) {
        if(startQuizBtn) {
            startQuizBtn.disabled = false;
            startQuizBtn.textContent = `Start Quiz (${window.currentQuizData.length} questions)`;
        }
        if(quizReadyMessage) quizReadyMessage.classList.remove('hidden');
        if(startQuizBtn) startQuizBtn.classList.remove('hidden');
        if(customizeDetails) customizeDetails.open = false; 
    } else {
         if(startQuizBtn) {
            startQuizBtn.disabled = !(window.currentExtractedTextForQuiz && window.currentExtractedTextForQuiz.trim() !== "");
            startQuizBtn.textContent = 'Start Quiz';
         }
        if(quizReadyMessage) quizReadyMessage.classList.remove('hidden');
        if(startQuizBtn) startQuizBtn.classList.remove('hidden');
        if(customizeDetails) customizeDetails.open = true; 
    }
    if(quizSetupView) quizSetupView.classList.remove('hidden');
    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
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
        if (forceRegenerate) {
            const textToUse = window.currentQuizTextContext || window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
            if (!textToUse || textToUse.trim() === "") {
                throw new Error("No text content available to generate a new quiz from.");
            }
            window.currentQuizTextContext = textToUse; 
            const questionTypes = Array.from(document.querySelectorAll('#quizSetupView input[name="quizQuestionTypeOption"]:checked')).map(cb => cb.value);
            const numQuestions = document.querySelector('#quizSetupView input[name="quizNumQuestionsOption"]:checked')?.value || 'ai_choice';
            const difficulty = document.querySelector('#quizSetupView input[name="quizDifficultyOption"]:checked')?.value || 'medium';
            
            if (questionTypes.length === 0) {
                showMessage('quizLoadingStatus', 'Please select at least one question type.', 'error', 3000);
                if(quizSetupView) quizSetupView.classList.remove('hidden');
                if(startQuizBtn) startQuizBtn.disabled = false;
                return;
            }

            window.currentQuizOptions = { questionTypes, numQuestions, difficulty };
            const generatedQuiz = await apiGenerateQuiz(textToUse, window.currentQuizOptions);
            quizDataToUse = generatedQuiz.quiz;
        } else { 
            if (!window.currentQuizData || window.currentQuizData.length === 0) {
                 const textToUse = window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
                 if (!textToUse || textToUse.trim() === "") {
                    throw new Error("No pre-generated quiz data and no text available to generate a new one.");
                 }
                 window.currentQuizTextContext = textToUse;
                 const optionsToUse = window.currentQuizOptions || { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
                 const generatedQuiz = await apiGenerateQuiz(textToUse, optionsToUse);
                 quizDataToUse = generatedQuiz.quiz;
                 window.currentQuizOptions = optionsToUse; 
            } else {
                 quizDataToUse = window.currentQuizData;
                 window.currentQuizTextContext = window.currentExtractedTextForQuiz || (window.lastProcessedResults ? window.lastProcessedResults.extractedText : null);
            }
        }

        if (!quizDataToUse || quizDataToUse.length === 0) {
            throw new Error("Failed to load or generate quiz data.");
        }
        
        window.currentQuizData = quizDataToUse.map(q => ({
            ...q, 
            chatHistory: q.chatHistory || [], 
            detailedExplanationContent: q.detailedExplanationContent || null, 
            detailedExplanationFetched: q.detailedExplanationFetched || false, 
            aiFeedback: q.aiFeedback || null,
            previousStateBeforeMark: q.previousStateBeforeMark || null
        }));
        window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData)); 

        window.currentQuizQuestionIndex = 0;
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
        
        renderQuizInterface();
        if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');

    } catch (error) {
        showMessage('quizLoadingStatus', `Error: ${error.message}`, 'error', 5000);
        if(quizSetupView) quizSetupView.classList.remove('hidden'); 
    } finally {
        if(quizLoadingStatus && document.getElementById('quizInterfaceContainer') && !document.getElementById('quizInterfaceContainer').classList.contains('hidden')) {
            hideProcessingStatus('quizLoadingStatus');
        }
        if(startQuizBtn) startQuizBtn.disabled = false;
    }
}

function renderQuizInterface() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    if (!quizInterfaceContainer || !window.currentQuizData || window.currentQuizData.length === 0) return;

    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    const questionState = window.quizQuestionStates[window.currentQuizQuestionIndex];
    const isAnswered = questionState !== 'unanswered' && questionState !== 'skipped' && questionState !== 'marked';
    const isMarked = questionState === 'marked';
    const userAnswer = window.userQuizAnswers[window.currentQuizQuestionIndex];

    let optionsHtml = '';
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    if (question.questionType === 'multiple_choice') {
        optionsHtml = question.options.map((option, idx) => `
            <label class="quiz-option-label ${isAnswered || isMarked ? 'cursor-not-allowed' : ''} 
                ${isAnswered && option === question.correctAnswer ? 'bg-green-100 border-green-400 text-green-700' : ''}
                ${isAnswered && option === userAnswer && option !== question.correctAnswer ? 'bg-red-100 border-red-400 text-red-700' : ''}
                ${!isAnswered && !isMarked && option === userAnswer ? 'bg-indigo-100 border-indigo-400' : ''}
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
            <label class="quiz-option-label ${isAnswered || isMarked ? 'cursor-not-allowed' : ''}
                ${isAnswered && question.correctAnswer.includes(option) ? 'bg-green-100 border-green-400 text-green-700' : ''}
                ${isAnswered && userAnswer?.includes(option) && !question.correctAnswer.includes(option) ? 'bg-red-100 border-red-400 text-red-700' : ''}
                ${!isAnswered && !isMarked && userAnswer?.includes(option) ? 'bg-indigo-100 border-indigo-400' : ''}
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
    }

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
    if(isAnswered) { 
        displayQuizAnswerFeedbackUI(window.userQuizAnswers[window.currentQuizQuestionIndex], window.currentQuizData[window.currentQuizQuestionIndex]);
        const explanationDiv = document.getElementById('quizDetailedExplanation');
        if (explanationDiv && question.detailedExplanationFetched && question.detailedExplanationContent) {
            explanationDiv.innerHTML = `<p class="font-medium text-slate-700">Detailed Explanation:</p><p class="mt-1">${processTextForDisplay(question.detailedExplanationContent)}</p>`;
            explanationDiv.classList.remove('hidden');
        }
    }
    if (question.chatHistory && question.chatHistory.length > 0 && document.getElementById('quizQuestionChatContainer')?.classList.contains('hidden') === false) {
        renderQuizChatHistory();
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

window.handleQuizAnswerSelection = function(value, type) {
    const index = window.currentQuizQuestionIndex;
    if (window.quizQuestionStates[index] === 'marked' || (window.quizQuestionStates[index] !== 'unanswered' && window.quizQuestionStates[index] !== 'skipped')) {
        return; 
    }

    if (type === 'select_all') {
        window.userQuizAnswers[index] = window.userQuizAnswers[index] || [];
        const optionIndex = window.userQuizAnswers[index].indexOf(value);
        if (optionIndex === -1) {
            window.userQuizAnswers[index].push(value);
        } else {
            window.userQuizAnswers[index].splice(optionIndex, 1);
        }
    } else {
        window.userQuizAnswers[index] = value;
    }
    
    const currentQuestion = window.currentQuizData[index];
    if (currentQuestion.questionType !== 'short_answer') { 
      renderQuizInterface(); 
    }
}

window.handleQuizAnswerSubmission = async function() {
    const index = window.currentQuizQuestionIndex;
    const question = window.currentQuizData[index];
    const userAnswer = window.userQuizAnswers[index];

    if (window.quizQuestionStates[index] === 'marked') {
        showMessage('quizAnswerFeedback', 'This question is marked for review. Unmark to submit an answer.', 'warning', 3000);
        return;
    }

    if (userAnswer === null || (Array.isArray(userAnswer) && userAnswer.length === 0) || (typeof userAnswer === 'string' && userAnswer.trim() === '')) {
        showMessage('quizAnswerFeedback', 'Please select or type an answer.', 'warning', 3000);
        return;
    }

    try {
        showProcessingStatus('quizAnswerFeedback', 'Checking answer...', true);
        const response = await apiGetQuizAnswerFeedback(question, userAnswer);
        
        if (response.feedback.toLowerCase().includes('correct!')) { 
            window.quizQuestionStates[index] = 'correct';
        } else if (response.feedback.toLowerCase().includes('partially correct')) {
            window.quizQuestionStates[index] = 'partial';
        } else {
            window.quizQuestionStates[index] = 'incorrect';
        }
        question.aiFeedback = response.feedback; 
        hideProcessingStatus('quizAnswerFeedback');
        renderQuizInterface(); 
        displayQuizAnswerFeedbackUI(userAnswer, question);

    } catch (error) {
        showMessage('quizAnswerFeedback', `Error: ${error.message}`, 'error', 5000);
    }
}

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

    if (question.aiFeedback) {
        feedbackHtml += `<p class="mt-2 pt-2 border-t border-slate-200">AI Feedback: ${processTextForDisplay(question.aiFeedback)}</p>`;
    } else {
        feedbackHtml += `<p class="mt-2 pt-2 border-t border-slate-200">Brief Explanation: ${processTextForDisplay(question.briefExplanation)}</p>`;
    }
    
    feedbackDiv.innerHTML = feedbackHtml;
    feedbackDiv.className = `mt-4 p-3 rounded-md text-sm ${
        window.quizQuestionStates[window.currentQuizQuestionIndex] === 'correct' ? 'bg-green-50 border-green-200 text-green-700' :
        window.quizQuestionStates[window.currentQuizQuestionIndex] === 'partial' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
        'bg-red-50 border-red-200 text-red-700'
    }`;
    feedbackDiv.classList.remove('hidden');
}


window.toggleDetailedExplanation = async function() {
    const explanationDiv = document.getElementById('quizDetailedExplanation');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];

    if (explanationDiv.classList.contains('hidden') || !question.detailedExplanationFetched) {
        if (!question.detailedExplanationContent) {
            try {
                showProcessingStatus('quizAnswerFeedback', 'Fetching explanation...', true);
                const response = await apiGetQuizQuestionDetailedExplanation(question);
                question.detailedExplanationContent = response.explanation;
                hideProcessingStatus('quizAnswerFeedback');
            } catch (error) {
                showMessage('quizAnswerFeedback', `Error fetching explanation: ${error.message}`, 'error', 3000);
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

window.toggleQuizQuestionChat = function() {
    const chatContainer = document.getElementById('quizQuestionChatContainer');
    chatContainer.classList.toggle('hidden');
    if (!chatContainer.classList.contains('hidden')) {
        renderQuizChatHistory();
    }
}

function renderQuizChatHistory() {
    const chatHistoryDiv = document.getElementById('quizQuestionChatHistory');
    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    question.chatHistory = question.chatHistory || [];
    chatHistoryDiv.innerHTML = question.chatHistory.map(msg => 
        `<p class="${msg.role === 'user' ? 'text-blue-600' : 'text-green-600'}"><strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong> ${processTextForDisplay(msg.parts[0].text)}</p>`
    ).join('');
    if (chatHistoryDiv.children.length > 0) {
      chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
    }
}

window.handleQuizChatSend = async function() {
    const chatInput = document.getElementById('quizChatInput');
    const userQuery = chatInput.value.trim();
    if (!userQuery) return;

    const question = window.currentQuizData[window.currentQuizQuestionIndex];
    question.chatHistory = question.chatHistory || [];
    
    try {
        chatInput.disabled = true;
        const tempUserMessage = { role: "user", parts: [{ text: userQuery }] };
        question.chatHistory.push(tempUserMessage);
        renderQuizChatHistory(); 
        chatInput.value = '';

        const response = await apiChatAboutQuizQuestion(question, question.chatHistory.slice(0, -1), userQuery); 
        
        question.chatHistory.pop(); 
        question.chatHistory.push({ role: "user", parts: [{ text: userQuery }] }); 
        question.chatHistory.push({ role: "model", parts: [{ text: response.chatResponse }] });
        renderQuizChatHistory();
    } catch (error) {
        showMessage('quizAnswerFeedback', `Chat error: ${error.message}`, 'error', 3000);
        const userMsgIndex = question.chatHistory.findIndex(msg => msg === tempUserMessage );
        if (userMsgIndex > -1) question.chatHistory.splice(userMsgIndex, 1);
        renderQuizChatHistory();
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
}


window.regenerateCurrentQuizQuestion = async function() {
    const index = window.currentQuizQuestionIndex;
    const originalQuestion = window.currentQuizData[index];
    
    try {
        showProcessingStatus('quizAnswerFeedback', 'Regenerating question...', true);
        const newQuestionData = await apiRegenerateQuizQuestion(originalQuestion, window.currentQuizTextContext, originalQuestion.difficulty || window.currentQuizOptions.difficulty);
        
        window.currentQuizData[index] = {
            ...newQuestionData.question, 
            id: originalQuestion.id, 
            chatHistory: [], 
            detailedExplanationContent: null,
            detailedExplanationFetched: false,
            aiFeedback: null,
            previousStateBeforeMark: null
        };
        window.userQuizAnswers[index] = null;
        window.quizQuestionStates[index] = 'unanswered';
        
        hideProcessingStatus('quizAnswerFeedback');
        clearMessage('quizAnswerFeedback'); 
        document.getElementById('quizDetailedExplanation')?.classList.add('hidden');
        document.getElementById('quizQuestionChatContainer')?.classList.add('hidden');
        renderQuizInterface();
        showMessage('quizLoadingStatus', 'Question regenerated.', 'success', 3000);

    } catch (error) {
        showMessage('quizLoadingStatus', `Error regenerating question: ${error.message}`, 'error', 5000);
        hideProcessingStatus('quizAnswerFeedback');
    }
}


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

    if (window.quizQuestionStates[index] === 'marked') {
        window.quizQuestionStates[index] = question.previousStateBeforeMark || 'unanswered';
        question.previousStateBeforeMark = null; 
    } else {
        question.previousStateBeforeMark = window.quizQuestionStates[index]; 
        window.quizQuestionStates[index] = 'marked';
    }
    renderQuizInterface();
}

window.skipQuestion = function() {
    const index = window.currentQuizQuestionIndex;
    if (window.quizQuestionStates[index] !== 'skipped') {
        window.quizQuestionStates[index] = 'skipped';
    }
    if (window.currentQuizQuestionIndex < window.currentQuizData.length - 1) {
        nextQuizQuestion();
    } else {
        finishQuiz(); 
    }
}


window.finishQuiz = function() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizSetupView = document.getElementById('quizSetupView');

    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    if(quizResultsContainer) quizResultsContainer.classList.remove('hidden');
    if(quizSetupView) quizSetupView.classList.add('hidden'); 

    let score = 0;
    let correctAnswers = 0;
    let attemptedQuestions = 0;
    let hasPartialPoints = false;

    window.currentQuizData.forEach((question, index) => {
        const state = window.quizQuestionStates[index];
        if (state === 'correct') {
            score++;
            correctAnswers++;
            attemptedQuestions++;
        } else if (state === 'partial') {
            score += 0.5; 
            hasPartialPoints = true;
            attemptedQuestions++;
        } else if (state === 'incorrect') {
            attemptedQuestions++;
        } else if (state === 'skipped' || state === 'marked' || state === 'unanswered') {
            if (question.previousStateBeforeMark && (question.previousStateBeforeMark === 'correct' || question.previousStateBeforeMark === 'incorrect' || question.previousStateBeforeMark === 'partial')) {
                 attemptedQuestions++; 
            }
        }
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
                    <div class="py-2 border-b border-slate-200 last:border-b-0 text-sm">
                        <span class="font-medium">Q${i+1}:</span> ${processTextForDisplay(q.questionText.substring(0,50))}... 
                        <span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold
                            ${window.quizQuestionStates[i] === 'correct' ? 'bg-green-100 text-green-700' : 
                              window.quizQuestionStates[i] === 'incorrect' ? 'bg-red-100 text-red-700' :
                              window.quizQuestionStates[i] === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                              window.quizQuestionStates[i] === 'marked' ? 'bg-purple-100 text-purple-700' :
                              window.quizQuestionStates[i] === 'skipped' ? 'bg-slate-100 text-slate-500' :
                              'bg-gray-100 text-gray-500'}">
                            ${window.quizQuestionStates[i].replace(/^\w/, c => c.toUpperCase())}
                        </span>
                    </div>
                `).join('')}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                <button onclick="retryIncorrectQuestions()" class="quiz-nav-button bg-orange-500 hover:bg-orange-600 text-white w-full">Retry Incorrect Questions</button>
                <button onclick="retryAllQuestions()" class="quiz-nav-button bg-blue-500 hover:bg-blue-600 text-white w-full">Retry All Questions</button>
                <button onclick="startNewQuizSameSettings()" class="quiz-nav-button bg-teal-500 hover:bg-teal-600 text-white w-full">New Quiz (Same Material & Settings)</button>
                <button onclick="changeQuizSettingsAndStartNew()" class="quiz-nav-button bg-indigo-500 hover:bg-indigo-600 text-white w-full">Change Settings & New Quiz</button>
            </div>
        </div>
    `;
    const startQuizBtn = document.getElementById('startQuizBtn');
    if (startQuizBtn) {
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
        window.currentQuizData = incorrectOrPartialQuestionsData.map(q => ({
            ...q, 
            chatHistory: [], 
            detailedExplanationContent: null, 
            detailedExplanationFetched: false, 
            aiFeedback: null,
            previousStateBeforeMark: null
        }));
        window.currentQuizQuestionIndex = 0;
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
        document.getElementById('quizResultsContainer').classList.add('hidden');
        renderQuizInterface();
        document.getElementById('quizInterfaceContainer').classList.remove('hidden');
    } else {
        showMessage('quizLoadingStatus', 'No incorrect or partially correct questions to retry!', 'success', 3000);
    }
}

window.retryAllQuestions = function() {
    if (!window.originalFullQuizData || window.originalFullQuizData.length === 0) {
        showMessage('quizLoadingStatus', 'No original quiz data to retry.', 'error', 3000);
        return;
    }
    window.currentQuizData = JSON.parse(JSON.stringify(window.originalFullQuizData)).map(q => ({
        ...q, 
        chatHistory: [], 
        detailedExplanationContent: null, 
        detailedExplanationFetched: false, 
        aiFeedback: null,
        previousStateBeforeMark: null
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
    if (!window.currentQuizOptions || Object.keys(window.currentQuizOptions).length === 0) {
        window.currentQuizOptions = { 
            questionTypes: ['multiple_choice'], 
            numQuestions: 'ai_choice', 
            difficulty: 'medium' 
        };
    }
    document.getElementById('quizResultsContainer').classList.add('hidden');
    await handleStartQuiz(true); 
}

window.changeQuizSettingsAndStartNew = function() {
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const startQuizBtn = document.getElementById('startQuizBtn');
    const customizeDetails = quizSetupView.querySelector('details');

    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
    if(quizSetupView) quizSetupView.classList.remove('hidden');
    if(quizInterfaceContainer) quizInterfaceContainer.classList.add('hidden');
    
    if(quizReadyMessage) quizReadyMessage.classList.add('hidden');
    if(startQuizBtn) startQuizBtn.classList.add('hidden');
    if(customizeDetails) customizeDetails.open = true;


    window.currentQuizData = null; 
    
    const defaultQuestionTypeCheckbox = document.querySelector('#quizSetupView input[name="quizQuestionTypeOption"][value="multiple_choice"]');
    if (defaultQuestionTypeCheckbox) defaultQuestionTypeCheckbox.checked = true;
    else { 
        const anyCheckedType = document.querySelector('#quizSetupView input[name="quizQuestionTypeOption"]:checked');
        if (!anyCheckedType && defaultQuestionTypeCheckbox) defaultQuestionTypeCheckbox.checked = true;
    }
    
    const defaultNumQuestionsRadio = document.querySelector('#quizSetupView input[name="quizNumQuestionsOption"][value="ai_choice"]');
    if (defaultNumQuestionsRadio) defaultNumQuestionsRadio.checked = true;

    const defaultDifficultyRadio = document.querySelector('#quizSetupView input[name="quizDifficultyOption"][value="medium"]');
    if (defaultDifficultyRadio) defaultDifficultyRadio.checked = true;
}


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

window.initializeQuizSystem = initializeQuizSystem;
window.handleStartQuiz = handleStartQuiz;
window.renderQuizInterface = renderQuizInterface;
window.previousQuizQuestion = previousQuizQuestion;
window.nextQuizQuestion = nextQuizQuestion;
window.jumpToQuizQuestion = jumpToQuizQuestion;
window.markQuestionForReview = markQuestionForReview;
window.skipQuestion = skipQuestion;
window.finishQuiz = finishQuiz;
window.retryIncorrectQuestions = retryIncorrectQuestions;
window.retryAllQuestions = retryAllQuestions;
window.startNewQuizSameSettings = startNewQuizSameSettings;
window.changeQuizSettingsAndStartNew = changeQuizSettingsAndStartNew;
window.toggleDetailedExplanation = toggleDetailedExplanation;
window.toggleQuizQuestionChat = toggleQuizQuestionChat;
window.handleQuizChatSend = handleQuizChatSend;
window.regenerateCurrentQuizQuestion = regenerateCurrentQuizQuestion;

document.addEventListener('DOMContentLoaded', () => {
    initializeQuizSystem();
});
