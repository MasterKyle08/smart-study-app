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
    if (flashcardsOutputContainer) flashcardsOutputContainer.innerHTML = '<p class="text-slate-500 text-sm p-4">No flashcards generated.</p>';
    if (quizOutput) quizOutput.innerHTML = '<p class="text-slate-500 text-sm p-4">No quiz questions generated.</p>';
    if (quizOutputStructured) quizOutputStructured.value = '';
    if (explainButton) explainButton.classList.add('hidden'); 
    if (explanationOutput) { explanationOutput.innerHTML = ''; explanationOutput.classList.add('hidden');}
    if (explainInstruction) explainInstruction.classList.add('hidden'); 

    document.querySelectorAll('#resultsSection .tab-content').forEach(tc => { tc.classList.add('hidden'); tc.removeAttribute('data-active'); });
    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => { tl.removeAttribute('data-active'); });
    
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
                    if(relevantLines.length > 0) {
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
    } else {
        if (explainInstruction) explainInstruction.classList.add('hidden');
    }

    console.log("Checking flashcards in displayResults. results.flashcards:", results.flashcards);
    if (results.flashcards && Array.isArray(results.flashcards) && results.flashcards.length > 0) {
        console.log(`Attempting to render ${results.flashcards.length} interactive flashcards.`);
        if (flashcardsOutputContainer) {
            renderInteractiveFlashcards(flashcardsOutputContainer, results.flashcards, keywordsForHighlighting, 'main');
        } else {
            console.error("Flashcards output container not found!");
        }
        if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    } else {
        console.log("No valid flashcards data to render interactively.");
        if (flashcardsOutputContainer) {
             flashcardsOutputContainer.innerHTML = '<p class="text-slate-500 text-sm p-4">No flashcards available to display.</p>';
        }
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
        container.innerHTML = '<p class="text-slate-500 text-sm p-4">No quiz questions generated or data is invalid.</p>';
        return;
    }
    quiz.forEach((q, index) => {
        if (typeof q !== 'object' || q === null || 
            typeof q.question !== 'string' || 
            !Array.isArray(q.options) || 
            typeof q.correctAnswer !== 'string') {
            const errorItem = document.createElement('p');
            errorItem.textContent = `Error: Invalid data for question ${index + 1}.`;
            errorItem.className = 'text-red-600 text-xs p-4';
            container.appendChild(errorItem);
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
        q.options.forEach((opt) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = processTextForDisplay(typeof opt === 'string' ? opt : JSON.stringify(opt), keywordsToHighlight);
            optionsList.appendChild(listItem);
        });
        questionDiv.appendChild(optionsList);

        const correctAnswerEl = document.createElement('p');
        correctAnswerEl.className = 'quiz-question-custom-correct-answer';
        correctAnswerEl.innerHTML = `<strong>Correct Answer:</strong> ${processTextForDisplay(q.correctAnswer, keywordsToHighlight)}`; 
        questionDiv.appendChild(correctAnswerEl);
        
        container.appendChild(questionDiv);
    });
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
            
            const allTabContentsInScope = contentContainer.querySelectorAll('.tab-content');

            allTabContentsInScope.forEach(content => {
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

let currentFlashcardIndex = 0;
let allFlashcards = [];
let currentFlashcardChatHistory = [];
let flashcardContext = 'main'; 

function renderInteractiveFlashcards(container, flashcards, keywordsToHighlight = [], context = 'main') {
    console.log(`renderInteractiveFlashcards called for context: ${context}. Number of flashcards: ${flashcards ? flashcards.length : 0}`);
    container.innerHTML = '';
    allFlashcards = flashcards;
    currentFlashcardIndex = 0;
    currentFlashcardChatHistory = [];
    flashcardContext = context;

    if (!allFlashcards || !Array.isArray(allFlashcards) || allFlashcards.length === 0) {
        console.warn("renderInteractiveFlashcards: No flashcards data or empty array. Displaying fallback message.");
        container.innerHTML = `<p class="text-slate-500 text-sm p-4">No flashcards available to display interactively.</p>`;
        return;
    }
    console.log("Proceeding to render interactive flashcard UI.");

    const flashcardWrapper = document.createElement('div');
    flashcardWrapper.className = 'flex flex-col items-center w-full max-w-2xl mx-auto';
    
    const cardScene = document.createElement('div');
    cardScene.id = `flashcardScene-${flashcardContext}`;
    cardScene.className = 'w-full h-80 sm:h-96 [perspective:1000px] mb-4';

    const cardInner = document.createElement('div');
    cardInner.id = `flashcardInner-${flashcardContext}`;
    cardInner.className = 'relative w-full h-full transition-transform duration-700 ease-in-out [transform-style:preserve-3d]';
    
    cardScene.appendChild(cardInner);
    flashcardWrapper.appendChild(cardScene);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center justify-between w-full mb-4 px-2';
    controlsDiv.innerHTML = `
        <button id="prevFlashcardBtn-${flashcardContext}" class="flashcard-nav-btn">&larr; Prev</button>
        <span id="flashcardCounter-${flashcardContext}" class="text-sm text-slate-600">1 / ${allFlashcards.length}</span>
        <button id="nextFlashcardBtn-${flashcardContext}" class="flashcard-nav-btn">Next &rarr;</button>
    `;
    flashcardWrapper.appendChild(controlsDiv);
    
    const aiChatContainer = document.createElement('div');
    aiChatContainer.id = `flashcardAiChatContainer-${flashcardContext}`;
    aiChatContainer.className = 'w-full mt-4 p-4 bg-slate-50 rounded-lg shadow hidden border border-slate-200';
    aiChatContainer.innerHTML = `
        <h4 class="text-md font-semibold text-slate-700 mb-2">AI Helper</h4>
        <div id="flashcardAiChatMessages-${flashcardContext}" class="h-32 overflow-y-auto border border-slate-200 rounded-md p-2 mb-2 text-xs space-y-1.5 bg-white"></div>
        <div class="flex space-x-2">
            <input type="text" id="flashcardAiChatInput-${flashcardContext}" class="form-input flex-grow text-xs" placeholder="Ask a follow-up question...">
            <button id="flashcardAiChatSendBtn-${flashcardContext}" class="px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-md shadow-sm">Send</button>
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

    if (!cardInner || !allFlashcards[index]) {
        console.error("displayFlashcard: Card inner element or flashcard data missing for index", index);
        return;
    }
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
            <textarea id="flashcardUserAnswer-${flashcardContext}" class="form-textarea w-full max-w-xs h-20 text-sm p-2 border-slate-300 rounded-md shadow-sm mb-3" placeholder="Type your answer here..."></textarea>
            <button id="submitFlashcardAnswerBtn-${flashcardContext}" class="flashcard-action-btn bg-green-500 hover:bg-green-600">Submit & Flip</button>
        </div>
    `;
    
    const backFace = document.createElement('div');
    backFace.className = 'flashcard-face flashcard-back [transform:rotateY(180deg)]';
    backFace.innerHTML = `
        <div class="p-6 flex flex-col h-full">
            <div class="flex-grow space-y-2 overflow-y-auto mb-3 pr-1">
                <div id="flashcardUserFeedback-${flashcardContext}" class="text-xs p-2 rounded-md"></div>
                <div>
                    <strong class="block text-sm font-semibold text-indigo-700 mb-1">Correct Answer:</strong>
                    <p class="text-sm text-slate-700">${processTextForDisplay(cardData.definition)}</p>
                </div>
            </div>
            <div class="mt-auto pt-2 flex flex-wrap gap-2 justify-between items-center border-t border-slate-200">
                <button id="explainFlashcardBtn-${flashcardContext}" class="flashcard-action-btn bg-sky-500 hover:bg-sky-600 text-xs">Explain More</button>
                <button id="flipToFrontBtn-${flashcardContext}" class="flashcard-action-btn bg-slate-500 hover:bg-slate-600 text-xs">Flip to Front</button>
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
            userFeedbackDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Getting feedback...</span>`;
            userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-slate-100 border border-slate-200';
            cardInner.classList.add('[transform:rotateY(180deg)]');
            try {
                const result = await apiFlashcardInteract(allFlashcards[currentFlashcardIndex], "submit_answer", userAnswer);
                userFeedbackDiv.innerHTML = processTextForDisplay(result.feedback);
                if (result.feedback.toLowerCase().includes("correct")) {
                    userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-green-50 border border-green-200 text-green-700';
                } else if (result.feedback.toLowerCase().includes("partially correct")) {
                    userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-yellow-50 border border-yellow-200 text-yellow-700';
                } else {
                     userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-red-50 border border-red-200 text-red-700';
                }
            } catch (error) {
                userFeedbackDiv.innerHTML = `<span class="text-red-600">Error getting feedback: ${error.message}</span>`;
                userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-red-50 border border-red-200';
            }
        };
    }
    if (explainBtn && aiChatContainer && aiChatStatus) {
        explainBtn.onclick = async () => {
            aiChatContainer.classList.remove('hidden');
            addMessageToChat('AI', 'Getting explanation...', 'system');
            aiChatStatus.textContent = 'Getting explanation...';
            try {
                const result = await apiFlashcardInteract(allFlashcards[currentFlashcardIndex], "request_explanation");
                addMessageToChat('AI', result.explanation, 'ai');
                currentFlashcardChatHistory.push({role: "model", parts: [{text: result.explanation}]});
                aiChatStatus.textContent = '';
            } catch (error) {
                addMessageToChat('AI', `Error: ${error.message}`, 'error');
                aiChatStatus.textContent = `Error getting explanation.`;
            }
        };
    }
    if (flipToFrontBtn && cardInner) {
        flipToFrontBtn.onclick = () => {
            cardInner.classList.remove('[transform:rotateY(180deg)]');
            if(userAnswerTextarea) userAnswerTextarea.value = '';
            if(userFeedbackDiv) userFeedbackDiv.innerHTML = '';
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
    const aiChatInput = document.getElementById(`flashcardAiChatInput-${flashcardContext}`);
    const aiChatSendBtn = document.getElementById(`flashcardAiChatSendBtn-${flashcardContext}`);
    const aiChatStatus = document.getElementById(`flashcardAiChatStatus-${flashcardContext}`);

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
    
    const sendChatMessage = async () => {
        if (!aiChatInput || !aiChatStatus) return;
        const userQuery = aiChatInput.value.trim();
        if (!userQuery) return;
        addMessageToChat('You', userQuery, 'user');
        aiChatInput.value = '';
        aiChatStatus.textContent = 'AI is thinking...';
        try {
            const result = await apiFlashcardInteract(allFlashcards[currentFlashcardIndex], "chat_message", null, userQuery, currentFlashcardChatHistory);
            addMessageToChat('AI', result.chatResponse, 'ai');
            currentFlashcardChatHistory = result.updatedChatHistory;
            aiChatStatus.textContent = '';
        } catch (error) {
            addMessageToChat('AI', `Error: ${error.message}`, 'error');
            aiChatStatus.textContent = 'Error in chat.';
        }
    };

    if(aiChatSendBtn) aiChatSendBtn.onclick = sendChatMessage;
    if(aiChatInput) aiChatInput.onkeypress = (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); } };
}

function addMessageToChat(sender, message, type) {
    const messagesDiv = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
    if (!messagesDiv) return;
    const messageEl = document.createElement('div');
    let senderClass = 'text-slate-700';
    let messageBgClass = 'bg-white';
    let textAlignClass = 'mr-auto'; // Default for AI/System

    if (type === 'user') {
        senderClass = 'text-blue-600 font-semibold';
        messageBgClass = 'bg-blue-50';
        textAlignClass = 'ml-auto'; // User messages align right
    } else if (type === 'ai') {
        senderClass = 'text-indigo-600 font-semibold';
        messageBgClass = 'bg-indigo-50';
    } else if (type === 'system' || type === 'error') {
        senderClass = 'text-slate-500 italic';
        messageBgClass = 'bg-slate-100';
         if(type === 'error') senderClass = 'text-red-500 italic';
    }
    
    messageEl.className = `p-1.5 rounded-md ${messageBgClass} max-w-[85%] ${textAlignClass} mb-1`;
    messageEl.innerHTML = `<strong class="${senderClass}">${sender}:</strong> ${processTextForDisplay(message)}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
