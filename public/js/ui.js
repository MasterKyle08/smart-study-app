// UI Helper Functions
function toggleElementVisibility(elementId, visible) {
    const element = document.getElementById(elementId);
    if (element) {
        element.dataset.visible = visible.toString();
    }
}

function showMessage(elementId, message, type = 'success') {
    const element = document.getElementById(elementId);
    if (element) {
        element.className = type === 'error' ? 'error-message' : 'success-message';
        element.textContent = message;
        element.classList.remove('hidden');
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

function showProcessingStatus(message, showSpinner = false) {
    const statusElement = document.getElementById('processingStatus');
    if (statusElement) {
        statusElement.innerHTML = `${message}${showSpinner ? ' <span class="inline-block animate-spin">⏳</span>' : ''}`;
        statusElement.classList.remove('hidden', 'error-message');
        statusElement.classList.add('success-message');
    }
}

function hideProcessingStatus() {
    const statusElement = document.getElementById('processingStatus');
    if (statusElement) {
        statusElement.classList.add('hidden');
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
        link.addEventListener('click', () => {
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
    const flashcardsOutput = document.getElementById('flashcardsOutput');
    const flashcardsOutputRaw = document.getElementById('flashcardsOutputRaw');
    const quizOutput = document.getElementById('quizOutput');
    const launchFlashcardModalBtn = document.getElementById('launchFlashcardModalBtn-main');

    if (!resultsSection) return;
    resultsSection.classList.remove('hidden');

    if (summaryOutput && results.summary) {
        renderSummary(summaryOutput, results.summary);
    }

    if (flashcardsOutput && flashcardsOutputRaw && results.flashcards) {
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
    }

    if (quizOutput && results.quiz) {
        renderQuiz(quizOutput, results.quiz, window.currentKeywordsForHighlighting || []);
    }

    const firstTabLink = document.querySelector('#resultsSection .tab-link');
    if (firstTabLink) firstTabLink.click();
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
                            <button class="flashcard-modal-action-btn bg-green-500 hover:bg-green-600 focus:ring-green-400" onclick="handleFlashcardAction('correct', ${context})">I Got It Right</button>
                            <button class="flashcard-modal-action-btn bg-red-500 hover:bg-red-600 focus:ring-red-400" onclick="handleFlashcardAction('incorrect', ${context})">Need More Practice</button>
                            <button class="flashcard-modal-action-btn bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400" onclick="handleFlashcardAction('mark', ${context})">Mark for Review</button>
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

        // Update current dot
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

function renderQuiz(container, quizData, keywordsToHighlight = []) {
    if (!container || !Array.isArray(quizData) || quizData.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center">No quiz available.</p>';
        return;
    }

    let currentQuestionIndex = 0;
    let userAnswers = new Array(quizData.length).fill(null);
    let questionStates = new Array(quizData.length).fill('unanswered');
    let explanations = new Array(quizData.length).fill(null);
    let chatHistories = new Array(quizData.length).fill(null).map(() => []);

    function createQuizContent() {
        const question = quizData[currentQuestionIndex];
        const isAnswered = questionStates[currentQuestionIndex] !== 'unanswered';
        const userAnswer = userAnswers[currentQuestionIndex];
        const explanation = explanations[currentQuestionIndex];

        let optionsHtml = '';
        if (question.questionType === 'multiple_choice') {
            optionsHtml = question.options.map((option, idx) => `
                <label class="quiz-option-label ${isAnswered ? 'cursor-not-allowed' : ''} ${
                    isAnswered ? (
                        option === question.correctAnswer ? 'bg-green-100 border-green-400' :
                        option === userAnswer ? 'bg-red-100 border-red-400' : ''
                    ) : (option === userAnswer ? 'bg-indigo-100 border-indigo-400' : '')
                }">
                    <input type="radio" name="quizOption" value="${option}"
                        ${option === userAnswer ? 'checked' : ''}
                        ${isAnswered ? 'disabled' : ''}
                        class="quiz-option-input"
                        onchange="handleQuizAnswer(${currentQuestionIndex}, '${option}', 'multiple_choice')"
                    >
                    <span>${processTextForDisplay(option, keywordsToHighlight)}</span>
                </label>
            `).join('');
        } else if (question.questionType === 'select_all') {
            optionsHtml = question.options.map((option, idx) => `
                <label class="quiz-option-label ${isAnswered ? 'cursor-not-allowed' : ''} ${
                    isAnswered ? (
                        question.correctAnswer.includes(option) ? 'bg-green-100 border-green-400' :
                        userAnswer?.includes(option) ? 'bg-red-100 border-red-400' : ''
                    ) : (userAnswer?.includes(option) ? 'bg-indigo-100 border-indigo-400' : '')
                }">
                    <input type="checkbox" name="quizOption" value="${option}"
                        ${userAnswer?.includes(option) ? 'checked' : ''}
                        ${isAnswered ? 'disabled' : ''}
                        class="quiz-option-input"
                        onchange="handleQuizAnswer(${currentQuestionIndex}, '${option}', 'select_all')"
                    >
                    <span>${processTextForDisplay(option, keywordsToHighlight)}</span>
                </label>
            `).join('');
        } else if (question.questionType === 'short_answer') {
            optionsHtml = `
                <div class="space-y-2">
                    <textarea
                        class="form-textarea w-full rounded-lg border-slate-300 shadow-sm"
                        rows="3"
                        placeholder="Type your answer here..."
                        ${isAnswered ? 'disabled' : ''}
                        onchange="handleQuizAnswer(${currentQuestionIndex}, this.value, 'short_answer')"
                    >${userAnswer || ''}</textarea>
                    ${isAnswered ? `
                        <div class="mt-4 p-3 bg-slate-100 rounded-lg border border-slate-200">
                            <p class="font-medium text-slate-700">Correct Answer:</p>
                            <p class="mt-1 text-slate-600">${processTextForDisplay(question.correctAnswer, keywordsToHighlight)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        const html = `
            <div class="quiz-question-display">
                <div class="flex justify-between items-start mb-4">
                    <h4 class="quiz-question-text">${processTextForDisplay(question.questionText, keywordsToHighlight)}</h4>
                    <span class="text-sm text-slate-500">Question ${currentQuestionIndex + 1} of ${quizData.length}</span>
                </div>
                <div class="space-y-3 mb-6">
                    ${optionsHtml}
                </div>
                ${isAnswered ? `
                    <div class="mt-4 space-y-4">
                        <div class="quiz-feedback-${questionStates[currentQuestionIndex]} p-4 rounded-lg">
                            <p class="font-medium">${
                                questionStates[currentQuestionIndex] === 'correct' ? '✓ Correct!' :
                                questionStates[currentQuestionIndex] === 'incorrect' ? '✗ Incorrect' :
                                '◐ Partially Correct'
                            }</p>
                            <p class="mt-1">${question.briefExplanation}</p>
                        </div>
                        ${explanation ? `
                            <div class="bg-slate-100 p-4 rounded-lg border border-slate-200">
                                <p class="font-medium text-slate-700">Detailed Explanation:</p>
                                <p class="mt-2 text-slate-600">${processTextForDisplay(explanation, keywordsToHighlight)}</p>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                <div class="mt-6 space-y-4">
                    <div class="flex items-center space-x-2">
                        <button onclick="submitQuizAnswer()" class="quiz-nav-button bg-indigo-600 hover:bg-indigo-700 text-white" ${isAnswered ? 'disabled' : ''}>
                            Submit Answer
                        </button>
                        ${isAnswered ? `
                            <button onclick="getDetailedExplanation()" class="quiz-nav-button bg-sky-500 hover:bg-sky-600 text-white">
                                Get Detailed Explanation
                            </button>
                        ` : ''}
                    </div>
                    ${isAnswered ? `
                        <div class="space-y-2">
                            <label for="quizQuestion" class="block text-sm font-medium text-slate-700">Ask a question about this topic:</label>
                            <div class="flex space-x-2">
                                <input type="text" id="quizQuestion" class="form-input flex-grow rounded-lg border-slate-300 shadow-sm text-sm" placeholder="Your question...">
                                <button onclick="askQuizQuestion()" class="quiz-nav-button bg-green-500 hover:bg-green-600 text-white">Ask</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="flex justify-between items-center mt-6">
                <button onclick="previousQuestion()" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white" ${currentQuestionIndex === 0 ? 'disabled' : ''}>
                    Previous
                </button>
                <div class="flex space-x-1">
                    ${quizData.map((_, idx) => `
                        <button 
                            class="w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                                idx === currentQuestionIndex ? 'bg-indigo-500 ring-2 ring-indigo-300 ring-offset-1' :
                                questionStates[idx] === 'correct' ? 'bg-green-500' :
                                questionStates[idx] === 'incorrect' ? 'bg-red-500' :
                                questionStates[idx] === 'partial' ? 'bg-yellow-500' :
                                'bg-slate-300'
                            }"
                            onclick="jumpToQuestion(${idx})"
                            aria-label="Go to question ${idx + 1}"
                        ></button>
                    `).join('')}
                </div>
                <button onclick="nextQuestion()" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white" ${currentQuestionIndex === quizData.length - 1 ? 'disabled' : ''}>
                    Next
                </button>
            </div>
            <div id="quizFeedback" class="mt-4 hidden"></div>
        `;

        container.innerHTML = html;
    }

    window.handleQuizAnswer = function(questionIndex, value, type) {
        if (type === 'select_all') {
            userAnswers[questionIndex] = userAnswers[questionIndex] || [];
            const index = userAnswers[questionIndex].indexOf(value);
            if (index === -1) {
                userAnswers[questionIndex].push(value);
            } else {
                userAnswers[questionIndex].splice(index, 1);
            }
        } else {
            userAnswers[questionIndex] = value;
        }
        createQuizContent();
    };

    window.submitQuizAnswer = async function() {
        const currentAnswer = userAnswers[currentQuestionIndex];
        if (!currentAnswer || (Array.isArray(currentAnswer) && currentAnswer.length === 0)) {
            showQuizFeedback('Please select an answer before submitting.', 'warning');
            return;
        }

        try {
            const response = await apiGetQuizAnswerFeedback(quizData[currentQuestionIndex], currentAnswer);
            const feedback = response.feedback;
            
            if (feedback.toLowerCase().includes('correct')) {
                questionStates[currentQuestionIndex] = 'correct';
            } else if (feedback.toLowerCase().includes('partially')) {
                questionStates[currentQuestionIndex] = 'partial';
            } else {
                questionStates[currentQuestionIndex] = 'incorrect';
            }
            
            createQuizContent();
        } catch (error) {
            showQuizFeedback(error.message || 'Failed to check answer.', 'error');
        }
    };

    window.getDetailedExplanation = async function() {
        if (explanations[currentQuestionIndex]) return;
        
        try {
            const response = await apiGetQuizQuestionDetailedExplanation(quizData[currentQuestionIndex]);
            explanations[currentQuestionIndex] = response.explanation;
            createQuizContent();
        } catch (error) {
            showQuizFeedback(error.message || 'Failed to get explanation.', 'error');
        }
    };

    window.askQuizQuestion = async function() {
        const questionInput = document.getElementById('quizQuestion');
        if (!questionInput) return;

        const userQuery = questionInput.value.trim();
        if (!userQuery) {
            showQuizFeedback('Please enter a question first.', 'warning');
            return;
        }

        try {
            const response = await apiChatAboutQuizQuestion(
                quizData[currentQuestionIndex],
                chatHistories[currentQuestionIndex],
                userQuery
            );
            chatHist

ories[currentQuestionIndex] = response.updatedChatHistory;
            showQuizFeedback(response.chatResponse);
            questionInput.value = '';
        } catch (error) {
            showQuizFeedback(error.message || 'Failed to get answer.', 'error');
        }
    };

    window.previousQuestion = function() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            createQuizContent();
        }
    };

    window.nextQuestion = function() {
        if (currentQuestionIndex < quizData.length - 1) {
            currentQuestionIndex++;
            createQuizContent();
        }
    };

    window.jumpToQuestion = function(idx) {
        if (idx >= 0 && idx < quizData.length) {
            currentQuestionIndex = idx;
            createQuizContent();
        }
    };

    function showQuizFeedback(message, type = 'success') {
        const feedbackDiv = document.getElementById('quizFeedback');
        if (!feedbackDiv) return;

        feedbackDiv.className = 'mt-4 p-4 rounded-lg text-sm';
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

    createQuizContent();
}

// Export functions that need to be globally available
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
window.renderQuiz = renderQuiz;