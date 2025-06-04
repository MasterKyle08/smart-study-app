console.log("Smart Study UI Script Loaded - Version: QUIZ_START_FIX_1.2");

function showMessage(elementId, message, type = 'error') {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = ''; 
    element.classList.add(type === 'success' ? 'success-message' : 'error-message', 'block', 'mt-4', 'p-3', 'rounded-md');
    element.classList.remove('hidden');
  }
}
window.showMessage = showMessage; 

function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = '';
    element.className = '';
    element.classList.add('hidden', 'mt-4', 'text-sm');
  }
}
window.clearMessage = clearMessage; 

function toggleElementVisibility(elementId, forceShow) {
    const element = document.getElementById(elementId);
    if (element) {
        const isModal = element.classList.contains('group'); 
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
window.toggleElementVisibility = toggleElementVisibility; 

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
window.updateNav = updateNav; 

function showProcessingStatus(message, showSpinner = true, elementId = 'processingStatus') {
    const statusDiv = document.getElementById(elementId);
    if (statusDiv) {
        let html = '';
        if (showSpinner) {
            html += '<div class="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 mr-2 align-middle"></div>';
        }
        html += `<span class="text-slate-600 align-middle">${message}</span>`;
        statusDiv.innerHTML = html;
        statusDiv.className = 'mt-4 text-center text-sm flex items-center justify-center'; 
        statusDiv.classList.remove('hidden', 'success-message', 'error-message'); 
    }
}
window.showProcessingStatus = showProcessingStatus; 

function hideProcessingStatus(elementId = 'processingStatus') {
    const statusDiv = document.getElementById(elementId);
    if (statusDiv) {
        statusDiv.innerHTML = '';
        statusDiv.classList.add('hidden');
    }
}
window.hideProcessingStatus = hideProcessingStatus; 

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
window.processTextForDisplay = processTextForDisplay; 

function displayResults(results) {
    window.lastProcessedResults = results; 
    window.currentExtractedTextForQuiz = results.extractedText; 
    console.log("[ui.js] displayResults called. Full results object:", JSON.stringify(results, null, 2));
    console.log("[ui.js] Stored currentExtractedTextForQuiz:", window.currentExtractedTextForQuiz ? "Exists" : "MISSING");


    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutputPlaceholder = document.querySelector('#flashcardsTab .output-box-flashcards-placeholder');
    const flashcardsOutputRawTextarea = document.getElementById('flashcardsOutputRaw');
    const launchFlashcardModalBtnMain = document.getElementById('launchFlashcardModalBtn-main');

    const quizTabContent = document.getElementById('quizTab'); 
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizLoadingStatus = document.getElementById('quizLoadingStatus');
    const quizReadyMessage = document.getElementById('quizReadyMessage');
    const startQuizBtn = document.getElementById('startQuizBtn');
    const customizeQuizDetails = document.querySelector('#quizSetupView details');


    const explainButton = document.getElementById('explainSelectedSummaryTextButton'); 
    const explanationOutput = document.getElementById('explanationOutput');
    const explainInstruction = document.getElementById('explainInstruction'); 

    if (summaryOutput) summaryOutput.innerHTML = '';
    if (flashcardsOutputPlaceholder) flashcardsOutputPlaceholder.innerHTML = '<p class="text-slate-500 text-sm p-4">No flashcards generated.</p>';
    if (flashcardsOutputRawTextarea) flashcardsOutputRawTextarea.value = '';
    if (launchFlashcardModalBtnMain) launchFlashcardModalBtnMain.classList.add('hidden');

    if (quizSetupView) quizSetupView.classList.remove('hidden'); 
    if (quizInterfaceContainer) {
        quizInterfaceContainer.classList.add('hidden');
        quizInterfaceContainer.innerHTML = ''; 
    }
    if (quizResultsContainer) {
        quizResultsContainer.classList.add('hidden');
        quizResultsContainer.innerHTML = ''; 
    }
    if (quizLoadingStatus) {
        quizLoadingStatus.classList.add('hidden');
        quizLoadingStatus.innerHTML = '';
    }
    if (customizeQuizDetails) customizeQuizDetails.open = false; 


    if (explainButton) explainButton.classList.add('hidden'); 
    if (explanationOutput) { explanationOutput.innerHTML = ''; explanationOutput.classList.add('hidden');}
    if (explainInstruction) explainInstruction.classList.add('hidden'); 

    document.querySelectorAll('#resultsSection .tab-content').forEach(tc => { tc.classList.add('hidden'); tc.removeAttribute('data-active'); });
    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => { tl.removeAttribute('data-active'); });
    
    let firstVisibleTab = null;
    const keywordsForHighlighting = window.currentKeywordsForHighlighting || results.summaryKeywords || [];

    if (results.summary) {
        console.log("[ui.js] Processing summary data.");
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
                        contentDiv.innerHTML = window.processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                        currentSectionDetails.appendChild(contentDiv);
                        summaryOutput.appendChild(currentSectionDetails);
                    }
                    currentSectionDetails = document.createElement('details');
                    currentSectionDetails.className = 'details-accordion';
                    currentSectionDetails.open = true; 
                    const summaryTitle = document.createElement('summary');
                    summaryTitle.className = 'details-accordion-summary';
                    summaryTitle.innerHTML = window.processTextForDisplay(trimmedLine.substring(4), keywordsForHighlighting); 
                    currentSectionDetails.appendChild(summaryTitle);
                    sectionContentHtml = ''; 
                } else {
                    sectionContentHtml += line + '\n';
                }
            });

            if (firstHeadingFound && currentSectionDetails) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'details-accordion-content';
                contentDiv.innerHTML = window.processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
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
                                li.innerHTML = window.processTextForDisplay(trimmedL.substring(2), keywordsForHighlighting);
                                ul.appendChild(li);
                            } else if (trimmedL) {
                                const li = document.createElement('li'); 
                                li.innerHTML = window.processTextForDisplay(trimmedL, keywordsForHighlighting);
                                ul.appendChild(li);
                            }
                        });
                        summaryOutput.appendChild(ul);
                    } else { 
                         summaryOutput.innerHTML = window.processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                    }
                 } else { 
                    summaryOutput.innerHTML = window.processTextForDisplay(summaryText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                 }
            }
            if (summaryOutput.innerHTML.trim() !== "" && explainInstruction) {
                explainInstruction.classList.remove('hidden');
            }
        }
        if (!firstVisibleTab) firstVisibleTab = 'summaryTab';
    } else {
        console.log("[ui.js] No summary data in results.");
        if (explainInstruction) explainInstruction.classList.add('hidden');
    }

    if (results.flashcards && Array.isArray(results.flashcards) && results.flashcards.length > 0) {
        console.log(`[ui.js] Processing ${results.flashcards.length} flashcards.`);
        if (flashcardsOutputRawTextarea) flashcardsOutputRawTextarea.value = JSON.stringify(results.flashcards, null, 2);
        if (flashcardsOutputPlaceholder) flashcardsOutputPlaceholder.innerHTML = `<p class="text-slate-600 text-sm">Total ${results.flashcards.length} flashcards generated. Click "Study Flashcards" to begin.</p>`;
        if (launchFlashcardModalBtnMain) {
            launchFlashcardModalBtnMain.classList.remove('hidden');
            const newBtn = launchFlashcardModalBtnMain.cloneNode(true); 
            launchFlashcardModalBtnMain.parentNode.replaceChild(newBtn, launchFlashcardModalBtnMain);
            document.getElementById('launchFlashcardModalBtn-main').onclick = () => { 
                const flashcardModalContent = document.getElementById('flashcardModalContent-main');
                if (flashcardModalContent && window.lastProcessedResults && window.lastProcessedResults.flashcards) {
                    window.renderInteractiveFlashcards(flashcardModalContent, window.lastProcessedResults.flashcards, [], 'main');
                    window.toggleElementVisibility('flashcardStudyModal-main', true);
                } else {
                     alert("No flashcards data available from the last processing or modal content area not found.");
                }
            };
        }
        if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    } else {
        console.log("[ui.js] No valid flashcards data in results.");
        if (flashcardsOutputPlaceholder) flashcardsOutputPlaceholder.innerHTML = '<p class="text-slate-500 text-sm p-4">No flashcards available to display.</p>';
        if (launchFlashcardModalBtnMain) launchFlashcardModalBtnMain.classList.add('hidden');
    }

    console.log("[ui.js] Checking quiz data in displayResults. results.quiz:", results.quiz);
    if (results.quiz && Array.isArray(results.quiz) && results.quiz.length > 0) {
        console.log(`[ui.js] Found ${results.quiz.length} quiz questions. Storing and ensuring setup view is visible.`);
        window.currentQuizData = results.quiz; 
        if (quizReadyMessage) quizReadyMessage.textContent = `Your quiz with ${results.quiz.length} questions is ready. Click "Start Quiz" to begin or customize options below.`;
        if (startQuizBtn) startQuizBtn.disabled = false;
        if (quizSetupView) {
             quizSetupView.classList.remove('hidden');
        } else {
            console.error("[ui.js] quizSetupView element not found!");
        }
        if (typeof window.initializeQuizSystem === 'function') {
            console.log("[ui.js] Initializing quiz system.");
            window.initializeQuizSystem(); 
        } else {
            console.error("[ui.js] initializeQuizSystem function not found!");
        }
        if (!firstVisibleTab) firstVisibleTab = 'quizTab'; 
    } else {
         console.log("[ui.js] No valid quiz data in results or quiz data is empty. Quiz setup view might remain or show 'no quiz'.");
         window.currentQuizData = null; 
         if(quizReadyMessage) quizReadyMessage.textContent = 'No quiz generated for this material. Try selecting "Quiz" or "All" in output formats.';
         if(startQuizBtn) startQuizBtn.disabled = true;
         if (quizSetupView) quizSetupView.classList.remove('hidden'); 
    }
    

    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => tl.classList.remove('hidden'));

    if (firstVisibleTab) {
        console.log(`[ui.js] Activating first visible tab: ${firstVisibleTab}`);
        const tabToActivate = document.getElementById(firstVisibleTab);
        const linkToActivate = document.querySelector(`#resultsSection .tab-link[data-tab="${firstVisibleTab}"]`);
        if(tabToActivate) {
            tabToActivate.classList.remove('hidden'); 
            tabToActivate.dataset.active = "true";
        } else {
            console.error(`[ui.js] Tab content for ${firstVisibleTab} not found!`);
        }
        if(linkToActivate) {
            linkToActivate.dataset.active = "true";
        } else {
            console.error(`[ui.js] Tab link for ${firstVisibleTab} not found!`);
        }
        if (resultsSection) resultsSection.classList.remove('hidden');
    } else {
         console.log("[ui.js] No first visible tab to activate. Hiding results section.");
         if (resultsSection) resultsSection.classList.add('hidden'); 
         document.querySelectorAll('#resultsSection .tab-link').forEach(tl => tl.classList.add('hidden'));
    }
}
window.displayResults = displayResults; 


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
window.setupTabs = setupTabs; 

function setCurrentYear(elementId) {
    const yearSpan = document.getElementById(elementId);
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
}
window.setCurrentYear = setCurrentYear; 

let currentFlashcardIndex = 0;
let allFlashcardsData = []; 
let currentFlashcardChatHistory = [];
let flashcardContext = 'main'; 
let markedForReview = [];
let flashcardStates = {}; 

function renderInteractiveFlashcards(modalContentContainer, flashcards, keywordsToHighlight = [], context = 'main') {
    modalContentContainer.innerHTML = '';
    allFlashcardsData = [...flashcards]; 
    currentFlashcardIndex = 0;
    currentFlashcardChatHistory = [];
    flashcardContext = context; 
    markedForReview = allFlashcardsData.map(() => false); 
    flashcardStates = {}; 
    allFlashcardsData.forEach((card, idx) => {
        flashcardStates[idx] = {
            isFlipped: false,
            userAnswer: '',
            aiFeedback: '',
            isCorrect: null 
        };
    });

    if (!allFlashcardsData || allFlashcardsData.length === 0) {
        modalContentContainer.innerHTML = `<p class="text-slate-500 text-sm p-4 text-center">No flashcards to display.</p>`;
        return;
    }

    const flashcardWrapper = document.createElement('div');
    flashcardWrapper.className = 'flex flex-col items-center w-full h-full';
    
    const topControlsDiv = document.createElement('div');
    topControlsDiv.className = 'flex items-center justify-between w-full mb-2 px-1';
    topControlsDiv.innerHTML = `
        <button id="shuffleFlashcardsBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Shuffle</button>
        <span id="flashcardCounter-${flashcardContext}" class="text-xs text-slate-600">1 / ${allFlashcardsData.length}</span>
        <button id="resetFlashcardsBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Reset</button>
    `;
    flashcardWrapper.appendChild(topControlsDiv);

    const progressBarContainer = document.createElement('div');
    progressBarContainer.id = `flashcardProgressBar-${flashcardContext}`;
    progressBarContainer.className = 'w-full flex justify-center space-x-1 mb-3 px-1';
    flashcardWrapper.appendChild(progressBarContainer);


    const cardScene = document.createElement('div');
    cardScene.id = `flashcardScene-${flashcardContext}`;
    cardScene.className = 'flashcard-modal-scene w-full flex-grow';

    const cardInner = document.createElement('div');
    cardInner.id = `flashcardInner-${flashcardContext}`;
    cardInner.className = 'flashcard-modal-inner';
    
    cardScene.appendChild(cardInner);
    flashcardWrapper.appendChild(cardScene);

    const navControlsDiv = document.createElement('div');
    navControlsDiv.className = 'flex items-center justify-between w-full mt-3 mb-3 px-1';
    navControlsDiv.innerHTML = `
        <button id="prevFlashcardBtn-${flashcardContext}" class="flashcard-modal-nav-btn">&larr; Prev</button>
        <button id="markReviewBtn-${flashcardContext}" class="flashcard-modal-utility-btn text-xs">Mark for Review</button>
        <button id="nextFlashcardBtn-${flashcardContext}" class="flashcard-modal-nav-btn">Next &rarr;</button>
    `;
    flashcardWrapper.appendChild(navControlsDiv);
    
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
    updateProgressBar();
    displayFlashcard(currentFlashcardIndex); 
    setupFlashcardEventListeners(); 
}
window.renderInteractiveFlashcards = renderInteractiveFlashcards; 

function updateProgressBar() {
    const progressBarContainer = document.getElementById(`flashcardProgressBar-${flashcardContext}`);
    if (!progressBarContainer) return;
    progressBarContainer.innerHTML = ''; 

    allFlashcardsData.forEach((card, idx) => {
        const dot = document.createElement('span');
        dot.className = 'flashcard-progress-dot cursor-pointer'; 
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
window.updateProgressBar = updateProgressBar; 


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

    cardInner.innerHTML = ''; 
    if(aiChatMessages && !cardState.isFlipped) aiChatMessages.innerHTML = ''; 
    if(aiChatContainer && !cardState.isFlipped) aiChatContainer.classList.add('hidden');

    const frontFace = document.createElement('div');
    frontFace.className = 'flashcard-modal-face flashcard-modal-front';
    frontFace.innerHTML = `
        <div class="p-4 sm:p-6 flex flex-col items-center justify-center h-full text-center">
            <p class="text-md sm:text-lg font-semibold text-indigo-700 mb-3 sm:mb-4 leading-tight">${processTextForDisplay(cardData.term)}</p>
            <textarea id="flashcardUserAnswer-${flashcardContext}" class="form-textarea w-full max-w-xs h-20 text-sm p-2 border-slate-300 rounded-md shadow-sm mb-3 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Type your answer here...">${cardState.isFlipped ? '' : cardState.userAnswer || ''}</textarea>
            <button id="submitFlashcardAnswerBtn-${flashcardContext}" class="flashcard-modal-action-btn bg-green-500 hover:bg-green-600 focus:ring-green-400">Submit & Flip</button>
        </div>
    `;
    
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

    if (cardState.isFlipped) {
        cardInner.classList.add('[transform:rotateY(180deg)]');
        const feedbackDiv = backFace.querySelector(`#flashcardUserFeedback-${flashcardContext}`);
        if (feedbackDiv && cardState.aiFeedback) {
            if (cardState.isCorrect === true) {
                feedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-green-50 border border-green-200 text-green-700';
            } else if (cardState.isCorrect === 'partial') { 
                feedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-yellow-50 border border-yellow-200 text-yellow-700';
            } else { 
                 feedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-red-50 border border-red-200 text-red-700';
            }
        }
    } else {
        cardInner.classList.remove('[transform:rotateY(180deg)]');
    }

    if(counter) counter.textContent = `${index + 1} / ${allFlashcardsData.length}`;
    if(prevBtn) prevBtn.disabled = index === 0;
    if(nextBtn) nextBtn.disabled = index === allFlashcardsData.length - 1;
    if(markReviewBtn) {
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

            userFeedbackDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Getting feedback...</span>`;
            userFeedbackDiv.className = 'text-xs p-2 rounded-md mb-2 bg-slate-100 border border-slate-200';
            cardInner.classList.add('[transform:rotateY(180deg)]');
            flashcardStates[currentFlashcardIndex].isFlipped = true; 

            try {
                const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "submit_answer", userAnswer);
                flashcardStates[currentFlashcardIndex].aiFeedback = result.feedback; 
                userFeedbackDiv.innerHTML = processTextForDisplay(result.feedback);
                
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
                const errorMessage = `Error getting feedback: ${error.message}`;
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
                const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "request_explanation");
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
            flashcardStates[currentFlashcardIndex].isFlipped = false;
            
            if(userAnswerTextarea) userAnswerTextarea.value = flashcardStates[currentFlashcardIndex].userAnswer || '';
            if(aiChatContainer) aiChatContainer.classList.add('hidden');
            const chatMessages = document.getElementById(`flashcardAiChatMessages-${flashcardContext}`);
            if(chatMessages) chatMessages.innerHTML = '';
            currentFlashcardChatHistory = []; 
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
        aiChatInput.value = '';
        aiChatStatus.textContent = 'AI is thinking...';
        try {
            const result = await apiFlashcardInteract(allFlashcardsData[currentFlashcardIndex], "chat_message", null, userQuery, currentFlashcardChatHistory);
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

    if(shuffleBtn) {
        shuffleBtn.onclick = () => {
            let combined = allFlashcardsData.map((card, i) => ({
                card,
                state: flashcardStates[i] || { isFlipped: false, userAnswer: '', aiFeedback: '', isCorrect: null }, 
                marked: markedForReview[i] || false
            }));
    
            for (let i = combined.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [combined[i], combined[j]] = [combined[j], combined[i]];
            }
    
            allFlashcardsData = combined.map(item => item.card);
            flashcardStates = {}; 
            combined.forEach((item, i) => { flashcardStates[i] = item.state; });
            markedForReview = combined.map(item => item.marked);
            
            currentFlashcardIndex = 0;
            displayFlashcard(currentFlashcardIndex);
        };
    }
    if(markReviewBtn) {
        markReviewBtn.onclick = () => {
            markedForReview[currentFlashcardIndex] = !markedForReview[currentFlashcardIndex];
            displayFlashcard(currentFlashcardIndex); 
            updateProgressBar(); 
        };
    }
    if(resetBtn) {
        resetBtn.onclick = () => {
            let originalFlashcards;
            if (flashcardContext === 'main' && window.lastProcessedResults && window.lastProcessedResults.flashcards) {
                 originalFlashcards = window.lastProcessedResults.flashcards;
            } else if (flashcardContext === 'modal' && window.currentDashboardSessionData && window.currentDashboardSessionData.flashcards) {
                 originalFlashcards = window.currentDashboardSessionData.flashcards;
            } else {
                if(shuffleBtn) shuffleBtn.click(); 
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
        senderClass = 'text-slate-500 italic';
        messageBgClass = 'bg-slate-100';
         if(type === 'error') senderClass = 'text-red-500 italic';
    }
    
    messageEl.className = `p-1.5 rounded-md ${messageBgClass} max-w-[85%] ${textAlignClass} mb-1`;
    messageEl.innerHTML = `<strong class="${senderClass}">${sender}:</strong> ${processTextForDisplay(message)}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
window.addMessageToChat = addMessageToChat; 

// --- Quiz Variables & Functions ---
let currentQuizData = [];
let currentQuizQuestionIndex = 0;
let userQuizAnswers = {}; 
let quizQuestionStates = {}; 
let quizContext = 'main'; 

function initializeQuizSystem() {
    console.log("[ui.js] initializeQuizSystem called.");
    const startQuizBtn = document.getElementById('startQuizBtn');
    const regenerateQuizWithOptionsBtn = document.getElementById('regenerateQuizWithOptionsBtn');

    if (startQuizBtn) {
        console.log("[ui.js] Found startQuizBtn, attaching listener.");
        startQuizBtn.onclick = () => handleStartQuiz(false); 
    } else {
        console.warn("[ui.js] startQuizBtn not found in initializeQuizSystem.");
    }

    if (regenerateQuizWithOptionsBtn) {
        console.log("[ui.js] Found regenerateQuizWithOptionsBtn, attaching listener.");
        regenerateQuizWithOptionsBtn.onclick = () => handleStartQuiz(true); 
    } else {
         console.warn("[ui.js] regenerateQuizWithOptionsBtn not found in initializeQuizSystem.");
    }

    const quizOptionsCheckboxes = document.querySelectorAll('input[name="quizQuestionTypeOption"]');
    quizOptionsCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const anyChecked = Array.from(quizOptionsCheckboxes).some(c => c.checked);
            if(regenerateQuizWithOptionsBtn) regenerateQuizWithOptionsBtn.disabled = !anyChecked;
        });
    });
    const anyTypesChecked = Array.from(quizOptionsCheckboxes).some(c => c.checked);
    if (regenerateQuizWithOptionsBtn) regenerateQuizWithOptionsBtn.disabled = !anyTypesChecked;

}
window.initializeQuizSystem = initializeQuizSystem; 

async function handleStartQuiz(forceRegenerate = false) {
    console.log(`[ui.js] handleStartQuiz called. forceRegenerate: ${forceRegenerate}`);
    const quizSetupView = document.getElementById('quizSetupView');
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizLoadingStatus = document.getElementById('quizLoadingStatus');
    const quizResultsContainer = document.getElementById('quizResultsContainer');

    if(quizSetupView) quizSetupView.classList.add('hidden');
    if(quizInterfaceContainer) quizInterfaceContainer.innerHTML = ''; 
    if(quizResultsContainer) quizResultsContainer.classList.add('hidden');
    if(quizLoadingStatus) {
        if (typeof window.showProcessingStatus === 'function') window.showProcessingStatus('Preparing your quiz...', true, 'quizLoadingStatus');
        quizLoadingStatus.classList.remove('hidden');
    }

    try {
        if (forceRegenerate) {
            console.log("[ui.js] Force regenerating quiz. Collecting options and calling API.");
            const selectedTypes = Array.from(document.querySelectorAll('input[name="quizQuestionTypeOption"]:checked')).map(cb => cb.value);
            const numQuestions = document.querySelector('input[name="quizNumQuestionsOption"]:checked')?.value || 'ai_choice';
            const difficulty = document.querySelector('input[name="quizDifficultyOption"]:checked')?.value || 'medium';
            
            if (selectedTypes.length === 0) {
                throw new Error('Please select at least one question type to regenerate.');
            }
            const quizOptions = { questionTypes: selectedTypes, numQuestions, difficulty };
            // Use window.currentExtractedTextForQuiz, which should be set by displayResults
            const extractedText = window.currentExtractedTextForQuiz; 
            
            console.log("[ui.js] Extracted text for quiz regeneration:", extractedText ? "Exists" : "MISSING");
            if (!extractedText) {
                throw new Error("No text content available to generate a new quiz from.");
            }

            const result = await apiGenerateQuiz(extractedText, quizOptions);
            currentQuizData = result.quiz || [];
            console.log("[ui.js] New quiz data received from API:", currentQuizData);
        } else if (window.currentQuizData && window.currentQuizData.length > 0) {
            console.log("[ui.js] Using existing pre-generated quiz data from window.currentQuizData.");
            // Quiz data is already set, no need to call API again
        } else {
             console.warn("[ui.js] No current quiz data and not forcing regeneration. This indicates an issue if a quiz was expected.");
             throw new Error("No quiz data available to start. Please process a file and select 'Quiz' or try regenerating.");
        }
        
        currentQuizQuestionIndex = 0;
        userQuizAnswers = {};
        quizQuestionStates = {};
        currentQuizData.forEach(q => {
            quizQuestionStates[q.id] = { userAnswer: null, isCorrect: null, aiFeedback: '', aiExplanation: '', chatHistory: [] };
        });

        if(quizLoadingStatus && typeof window.hideProcessingStatus === 'function') window.hideProcessingStatus('quizLoadingStatus');
        if (currentQuizData.length > 0) {
            if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');
            renderQuizInterface();
        } else {
            if(quizInterfaceContainer) quizInterfaceContainer.innerHTML = '<p class="text-center text-slate-500">Could not generate quiz questions. Please try adjusting options or material.</p>';
            if(quizSetupView) quizSetupView.classList.remove('hidden'); 
        }
    } catch (error) {
        console.error("[ui.js] Error in handleStartQuiz:", error);
        if(quizLoadingStatus && typeof window.showMessage === 'function') window.showMessage('quizLoadingStatus', `Error generating quiz: ${error.message}`, 'error');
        if(quizSetupView) quizSetupView.classList.remove('hidden'); 
    }
}

function renderQuizInterface() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    if (!quizInterfaceContainer) return;
    quizInterfaceContainer.innerHTML = ''; 

    const quizWrapper = document.createElement('div');
    quizWrapper.className = 'flex flex-col items-center w-full max-w-3xl mx-auto bg-white p-6 rounded-lg shadow-xl border border-slate-200';

    const progressBar = document.createElement('div');
    progressBar.id = `quizProgressBar-${quizContext}`;
    progressBar.className = 'w-full flex justify-center space-x-1 mb-4';
    quizWrapper.appendChild(progressBar);
    
    const questionArea = document.createElement('div');
    questionArea.id = `quizQuestionArea-${quizContext}`;
    questionArea.className = 'w-full mb-4';
    quizWrapper.appendChild(questionArea);

    const navDiv = document.createElement('div');
    navDiv.className = 'flex justify-between items-center w-full mt-4 pt-4 border-t border-slate-200';
    navDiv.innerHTML = `
        <button id="prevQuizQuestionBtn-${quizContext}" class="quiz-nav-button bg-slate-200 hover:bg-slate-300 text-slate-700">Previous</button>
        <span id="quizQuestionCounter-${quizContext}" class="text-sm text-slate-600"></span>
        <button id="nextQuizQuestionBtn-${quizContext}" class="quiz-nav-button bg-indigo-600 hover:bg-indigo-700 text-white">Next</button>
    `;
    quizWrapper.appendChild(navDiv);
    
    const finishButton = document.createElement('button');
    finishButton.id = `finishQuizBtn-${quizContext}`;
    finishButton.textContent = 'Finish Quiz & See Results';
    finishButton.className = 'quiz-nav-button bg-green-500 hover:bg-green-600 text-white mt-4 w-full hidden';
    quizWrapper.appendChild(finishButton);

    quizInterfaceContainer.appendChild(quizWrapper);
    
    updateQuizProgressBar();
    displayQuizQuestion(currentQuizQuestionIndex);
    setupQuizNavEventListeners();
}

function updateQuizProgressBar() {
    const progressBarContainer = document.getElementById(`quizProgressBar-${quizContext}`);
    if (!progressBarContainer || !currentQuizData) return;
    progressBarContainer.innerHTML = '';

    currentQuizData.forEach((question, idx) => {
        const dot = document.createElement('span');
        dot.className = 'flashcard-progress-dot cursor-pointer'; 
        dot.dataset.index = idx;

        const state = quizQuestionStates[question.id];
        if (idx === currentQuizQuestionIndex) {
            dot.classList.add('current');
        } else if (state && state.isCorrect === true) {
            dot.classList.add('correct');
        } else if (state && state.isCorrect === 'partial') {
            dot.classList.add('partial');
        } else if (state && state.isCorrect === false) {
            dot.classList.add('incorrect');
        } else {
            dot.classList.add('default');
        }
        
        dot.addEventListener('click', () => {
            currentQuizQuestionIndex = idx;
            displayQuizQuestion(currentQuizQuestionIndex);
        });
        progressBarContainer.appendChild(dot);
    });
}


function displayQuizQuestion(index) {
    const questionArea = document.getElementById(`quizQuestionArea-${quizContext}`);
    const counter = document.getElementById(`quizQuestionCounter-${quizContext}`);
    const prevBtn = document.getElementById(`prevQuizQuestionBtn-${quizContext}`);
    const nextBtn = document.getElementById(`nextQuizQuestionBtn-${quizContext}`);
    const finishBtn = document.getElementById(`finishQuizBtn-${quizContext}`);


    if (!questionArea || !currentQuizData || !currentQuizData[index]) return;
    questionArea.innerHTML = ''; 

    const question = currentQuizData[index];
    const questionState = quizQuestionStates[question.id] || { userAnswer: null, isCorrect: null, aiFeedback: '', aiExplanation: '', chatHistory: [] };

    const questionDisplay = document.createElement('div');
    questionDisplay.className = 'quiz-question-display-inner'; 
    
    const questionTextEl = document.createElement('p');
    questionTextEl.className = 'quiz-question-text';
    questionTextEl.innerHTML = `${index + 1}. ${processTextForDisplay(question.questionText)}`;
    questionDisplay.appendChild(questionTextEl);

    const answerArea = document.createElement('div');
    answerArea.id = `quizAnswerArea-${question.id}`;
    answerArea.className = 'mt-4 space-y-3';

    if (question.questionType === 'multiple_choice') {
        question.options.forEach((option, optIndex) => {
            const optionId = `q${index}_opt${optIndex}`;
            const label = document.createElement('label');
            label.htmlFor = optionId;
            label.className = 'quiz-answer-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `quizQuestion_${index}`;
            input.id = optionId;
            input.value = option;
            input.className = 'form-radio quiz-option-input';
            if (questionState.userAnswer === option) input.checked = true;
            if (questionState.isCorrect !== null) input.disabled = true; 

            label.appendChild(input);
            label.append(` ${processTextForDisplay(option)}`);
            answerArea.appendChild(label);
        });
    } else if (question.questionType === 'select_all') {
        question.options.forEach((option, optIndex) => {
            const optionId = `q${index}_opt${optIndex}`;
            const label = document.createElement('label');
            label.htmlFor = optionId;
            label.className = 'quiz-answer-option';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = `quizQuestion_${index}_opt${optIndex}`; 
            input.id = optionId;
            input.value = option;
            input.className = 'form-checkbox quiz-option-input';
            if (Array.isArray(questionState.userAnswer) && questionState.userAnswer.includes(option)) input.checked = true;
            if (questionState.isCorrect !== null) input.disabled = true;

            label.appendChild(input);
            label.append(` ${processTextForDisplay(option)}`);
            answerArea.appendChild(label);
        });
    } else if (question.questionType === 'short_answer') {
        const textarea = document.createElement('textarea');
        textarea.id = `quizShortAnswer-${question.id}`;
        textarea.className = 'form-textarea w-full h-24 text-sm p-2 border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500';
        textarea.placeholder = "Type your answer...";
        textarea.value = questionState.userAnswer || '';
        if (questionState.isCorrect !== null) textarea.disabled = true;
        answerArea.appendChild(textarea);
    }
    questionDisplay.appendChild(answerArea);

    const feedbackContainer = document.createElement('div');
    feedbackContainer.id = `quizFeedbackContainer-${question.id}`;
    feedbackContainer.className = 'mt-4 space-y-3';
    if (questionState.isCorrect !== null) { 
        const feedbackDiv = document.createElement('div');
        feedbackDiv.id = `quizAnswerFeedback-${question.id}`;
        feedbackDiv.className = `quiz-feedback-area ${questionState.isCorrect === true ? 'quiz-feedback-correct' : (questionState.isCorrect === 'partial' ? 'quiz-feedback-partial' : 'quiz-feedback-incorrect')}`;
        feedbackDiv.innerHTML = processTextForDisplay(questionState.aiFeedback || question.briefExplanation);
        feedbackContainer.appendChild(feedbackDiv);

        const explainBtn = document.createElement('button');
        explainBtn.textContent = 'More Explanation';
        explainBtn.className = 'flashcard-modal-action-btn bg-sky-500 hover:bg-sky-600 text-xs';
        explainBtn.onclick = () => handleRequestQuizExplanation(question.id);
        feedbackContainer.appendChild(explainBtn);

        const explanationDiv = document.createElement('div');
        explanationDiv.id = `quizQuestionExplanation-${question.id}`;
        explanationDiv.className = 'text-xs p-2 mt-2 bg-slate-100 rounded-md border border-slate-200 hidden prose prose-xs max-w-none';
        feedbackContainer.appendChild(explanationDiv);
    }
    questionDisplay.appendChild(feedbackContainer);

    const actionButtonDiv = document.createElement('div');
    actionButtonDiv.className = 'mt-4';
    if (questionState.isCorrect === null) { 
        const checkAnswerBtn = document.createElement('button');
        checkAnswerBtn.id = `checkQuizAnswerBtn-${question.id}`;
        checkAnswerBtn.textContent = 'Check Answer';
        checkAnswerBtn.className = 'quiz-nav-button bg-green-500 hover:bg-green-600 text-white';
        checkAnswerBtn.onclick = () => handleCheckQuizAnswer(question.id, index);
        actionButtonDiv.appendChild(checkAnswerBtn);
    } else { 
        const regenerateBtn = document.createElement('button');
        regenerateBtn.textContent = 'Try Different Version';
        regenerateBtn.className = 'quiz-nav-button bg-orange-500 hover:bg-orange-600 text-white text-xs';
        regenerateBtn.onclick = () => handleRegenerateQuizQuestion(index);
        actionButtonDiv.appendChild(regenerateBtn);
    }
    questionDisplay.appendChild(actionButtonDiv);


    questionArea.appendChild(questionDisplay);

    if(counter) counter.textContent = `Question ${index + 1} / ${currentQuizData.length}`;
    if(prevBtn) prevBtn.disabled = index === 0;
    if(nextBtn) nextBtn.disabled = index === currentQuizData.length - 1 && questionState.isCorrect !== null; 
    
    if(finishBtn) {
        const allAnswered = currentQuizData.every(q => quizQuestionStates[q.id] && quizQuestionStates[q.id].isCorrect !== null);
        if (allAnswered || (index === currentQuizData.length - 1 && questionState.isCorrect !== null)) {
            finishBtn.classList.remove('hidden');
            if(nextBtn) nextBtn.classList.add('hidden'); 
        } else {
            finishBtn.classList.add('hidden');
             if(nextBtn) nextBtn.classList.remove('hidden');
        }
    }
    updateQuizProgressBar();
}

async function handleCheckQuizAnswer(questionId, questionIndex) {
    const question = currentQuizData[questionIndex];
    let userAnswer;

    if (question.questionType === 'multiple_choice') {
        const selectedOption = document.querySelector(`input[name="quizQuestion_${questionIndex}"]:checked`);
        userAnswer = selectedOption ? selectedOption.value : null;
    } else if (question.questionType === 'select_all') {
        userAnswer = Array.from(document.querySelectorAll(`input[name^="quizQuestion_${questionIndex}_opt"]:checked`)).map(cb => cb.value);
    } else if (question.questionType === 'short_answer') {
        const textarea = document.getElementById(`quizShortAnswer-${question.id}`);
        userAnswer = textarea ? textarea.value.trim() : '';
    }

    if (userAnswer === null || (Array.isArray(userAnswer) && userAnswer.length === 0) && question.questionType !== 'short_answer') {
        const feedbackDiv = document.getElementById(`quizAnswerFeedback-${question.id}`) || document.createElement('div');
        feedbackDiv.id = `quizAnswerFeedback-${question.id}`;
        feedbackDiv.innerHTML = processTextForDisplay("Please select or type an answer before checking.");
        feedbackDiv.className = 'quiz-feedback-area bg-yellow-50 border-yellow-300 text-yellow-700';
        const feedbackContainer = document.getElementById(`quizFeedbackContainer-${question.id}`);
        if (feedbackContainer && !document.getElementById(feedbackDiv.id)) feedbackContainer.appendChild(feedbackDiv);
        return;
    }

    quizQuestionStates[question.id].userAnswer = userAnswer;
    const feedbackContainer = document.getElementById(`quizFeedbackContainer-${question.id}`);
    const feedbackDiv = document.getElementById(`quizAnswerFeedback-${question.id}`) || document.createElement('div');
    feedbackDiv.id = `quizAnswerFeedback-${question.id}`;
    feedbackDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Checking...</span>`;
    feedbackDiv.className = 'quiz-feedback-area bg-slate-100';
    if (feedbackContainer && !document.getElementById(feedbackDiv.id)) feedbackContainer.appendChild(feedbackDiv);


    try {
        const result = await apiGetQuizAnswerFeedback(question, userAnswer);
        quizQuestionStates[question.id].aiFeedback = result.feedback;
        
        const feedbackText = result.feedback.toLowerCase();
        if (feedbackText.includes("partially correct")) { 
            quizQuestionStates[question.id].isCorrect = 'partial';
        } else if (feedbackText.includes("correct")) { 
            quizQuestionStates[question.id].isCorrect = true;
        } else { 
             quizQuestionStates[question.id].isCorrect = false;
        }
        displayQuizQuestion(questionIndex); 
    } catch (error) {
        quizQuestionStates[question.id].aiFeedback = `Error getting feedback: ${error.message}`;
        quizQuestionStates[question.id].isCorrect = false;
        displayQuizQuestion(questionIndex); 
    }
    updateQuizProgressBar();
    const finishBtn = document.getElementById(`finishQuizBtn-${quizContext}`);
    const allAnswered = currentQuizData.every(q => quizQuestionStates[q.id] && quizQuestionStates[q.id].isCorrect !== null);
    if(finishBtn && allAnswered) {
        finishBtn.classList.remove('hidden');
        const nextBtn = document.getElementById(`nextQuizQuestionBtn-${quizContext}`);
        if(nextBtn) nextBtn.classList.add('hidden');
    } else if (finishBtn && currentQuizQuestionIndex === currentQuizData.length - 1 && quizQuestionStates[question.id].isCorrect !== null) {
         finishBtn.classList.remove('hidden');
         const nextBtn = document.getElementById(`nextQuizQuestionBtn-${quizContext}`);
         if(nextBtn) nextBtn.classList.add('hidden');
    }
}

async function handleRequestQuizExplanation(questionId) {
    const question = currentQuizData.find(q => q.id === questionId);
    const explanationDiv = document.getElementById(`quizQuestionExplanation-${questionId}`);
    
    if (!question || !explanationDiv) return;

    explanationDiv.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-slate-500 mr-1.5 align-middle"></div> <span class="text-slate-500 align-middle">Loading explanation...</span>`;
    explanationDiv.classList.remove('hidden');

    try {
        const result = await apiGetQuizQuestionDetailedExplanation(question);
        quizQuestionStates[questionId].aiExplanation = result.explanation;
        explanationDiv.innerHTML = processTextForDisplay(result.explanation);
    } catch (error) {
        explanationDiv.innerHTML = `<p class="text-red-500">Error loading explanation: ${error.message}</p>`;
    }
}

async function handleRegenerateQuizQuestion(questionIndex) {
    const originalQuestion = currentQuizData[questionIndex];
    const textContext = window.currentExtractedTextForQuiz || window.lastProcessedResults?.extractedText || "";
    const difficultyHint = document.querySelector('input[name="quizDifficultyOption"]:checked')?.value || 'medium'; 
    const quizLoadingStatus = document.getElementById('quizLoadingStatus');


    if(quizLoadingStatus) {
        showProcessingStatus("Regenerating question...", true, 'quizLoadingStatus');
        quizLoadingStatus.classList.remove('hidden');
    }


    try {
        const result = await apiRegenerateQuizQuestion(originalQuestion, textContext, difficultyHint);
        currentQuizData[questionIndex] = result.question; 
        quizQuestionStates[result.question.id] = { userAnswer: null, isCorrect: null, aiFeedback: '', aiExplanation: '', chatHistory: [] };
        if (quizQuestionStates[originalQuestion.id] && originalQuestion.id !== result.question.id) {
            delete quizQuestionStates[originalQuestion.id]; 
        }
        displayQuizQuestion(questionIndex); 
    } catch (error) {
        if(quizLoadingStatus && typeof window.showMessage === 'function') window.showMessage('quizLoadingStatus', `Error regenerating question: ${error.message}`, 'error');
    } finally {
        if(quizLoadingStatus && typeof window.hideProcessingStatus === 'function') window.hideProcessingStatus('quizLoadingStatus');
    }
}


function setupQuizNavEventListeners() {
    const prevBtn = document.getElementById(`prevQuizQuestionBtn-${quizContext}`);
    const nextBtn = document.getElementById(`nextQuizQuestionBtn-${quizContext}`);
    const finishBtn = document.getElementById(`finishQuizBtn-${quizContext}`);

    if(prevBtn) {
        prevBtn.onclick = () => {
            if (currentQuizQuestionIndex > 0) {
                currentQuizQuestionIndex--;
                displayQuizQuestion(currentQuizQuestionIndex);
            }
        };
    }
    if(nextBtn) {
        nextBtn.onclick = () => {
            if (currentQuizQuestionIndex < currentQuizData.length - 1) {
                currentQuizQuestionIndex++;
                displayQuizQuestion(currentQuizQuestionIndex);
            }
        };
    }
    if(finishBtn) {
        finishBtn.onclick = renderQuizResults;
    }
}

function renderQuizResults() {
    const quizInterfaceContainer = document.getElementById('quizInterfaceContainer');
    const quizResultsContainer = document.getElementById('quizResultsContainer');
    const quizSetupView = document.getElementById('quizSetupView');

    if (!quizInterfaceContainer || !quizResultsContainer || !quizSetupView) return;

    quizInterfaceContainer.classList.add('hidden');
    quizResultsContainer.innerHTML = ''; 
    quizResultsContainer.classList.remove('hidden');
    quizSetupView.classList.add('hidden');


    let correctCount = 0;
    currentQuizData.forEach(q => {
        if (quizQuestionStates[q.id] && quizQuestionStates[q.id].isCorrect === true) {
            correctCount++;
        } else if (quizQuestionStates[q.id] && quizQuestionStates[q.id].isCorrect === 'partial') {
            correctCount += 0.5; 
        }
    });
    const scorePercentage = currentQuizData.length > 0 ? (correctCount / currentQuizData.length) * 100 : 0;

    const resultsHTML = `
        <div class="text-center p-6 bg-white rounded-lg shadow-xl border border-slate-200">
            <h3 class="text-2xl font-semibold text-slate-800 mb-3">Quiz Complete!</h3>
            <p class="text-lg text-slate-600 mb-1">Your Score: 
                <span class="font-bold ${scorePercentage >= 70 ? 'text-green-600' : (scorePercentage >= 50 ? 'text-yellow-600' : 'text-red-600')}">
                    ${correctCount} / ${currentQuizData.length} (${scorePercentage.toFixed(0)}%)
                </span>
            </p>
            <p class="text-sm text-slate-500 mb-6">${scorePercentage >= 70 ? 'Great job!' : (scorePercentage >= 50 ? 'Good effort, keep practicing!' : 'Keep trying, you can improve!')}</p>
            
            <div class="text-left my-6">
                <h4 class="text-lg font-semibold text-slate-700 mb-3">Review Your Answers:</h4>
                <div id="quizReviewList" class="space-y-2 max-h-80 overflow-y-auto border rounded-md p-3 bg-slate-50"></div>
            </div>

            <div class="mt-6 space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center">
                <button id="quizRetryIncorrectBtn" class="quiz-nav-button bg-yellow-500 hover:bg-yellow-600 text-white">Retry Incorrect</button>
                <button id="quizRetryAllBtn" class="quiz-nav-button bg-blue-500 hover:bg-blue-600 text-white">Retry All Questions</button>
                <button id="quizNewConfigBtn" class="quiz-nav-button bg-slate-500 hover:bg-slate-600 text-white">New Quiz (Change Settings)</button>
            </div>
        </div>
    `;
    quizResultsContainer.innerHTML = resultsHTML;

    const reviewList = document.getElementById('quizReviewList');
    currentQuizData.forEach((q, idx) => {
        const state = quizQuestionStates[q.id];
        const item = document.createElement('div');
        item.className = 'quiz-results-item text-sm';
        let statusIcon = '<span class="text-slate-400">●</span>'; 
        if (state && state.isCorrect === true) statusIcon = '<span class="text-green-500 font-bold">✔</span>';
        else if (state && state.isCorrect === 'partial') statusIcon = '<span class="text-yellow-500 font-bold">●</span>';
        else if (state && state.isCorrect === false) statusIcon = '<span class="text-red-500 font-bold">✘</span>';
        
        item.innerHTML = `
            <div class="flex-grow truncate pr-2"> ${statusIcon} Q${idx + 1}: ${q.questionText}</div>
            <button data-question-id="${q.id}" class="review-question-btn text-xs text-indigo-600 hover:underline focus:outline-none">Review</button>
        `;
        reviewList.appendChild(item);
    });
    
    document.getElementById('quizRetryIncorrectBtn').addEventListener('click', () => {
        const incorrectQuestions = currentQuizData.filter(q => quizQuestionStates[q.id].isCorrect === false || quizQuestionStates[q.id].isCorrect === 'partial');
        if (incorrectQuestions.length > 0) {
            currentQuizData = incorrectQuestions;
            currentQuizQuestionIndex = 0;
            userQuizAnswers = {};
            quizQuestionStates = {};
            currentQuizData.forEach(q => {
                 quizQuestionStates[q.id] = { userAnswer: null, isCorrect: null, aiFeedback: '', aiExplanation: '', chatHistory: [] };
            });
            quizResultsContainer.classList.add('hidden');
            if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');
            renderQuizInterface();
        } else {
            alert("No incorrect questions to retry!");
        }
    });
    document.getElementById('quizRetryAllBtn').addEventListener('click', () => {
        if (window.lastProcessedResults && window.lastProcessedResults.quiz) {
            currentQuizData = [...window.lastProcessedResults.quiz]; 
             currentQuizQuestionIndex = 0;
            userQuizAnswers = {};
            quizQuestionStates = {};
            currentQuizData.forEach(q => {
                 quizQuestionStates[q.id] = { userAnswer: null, isCorrect: null, aiFeedback: '', aiExplanation: '', chatHistory: [] };
            });
            quizResultsContainer.classList.add('hidden');
            if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');
            renderQuizInterface();
        }
    });
    document.getElementById('quizNewConfigBtn').addEventListener('click', () => {
        quizResultsContainer.classList.add('hidden');
        if(quizSetupView) quizSetupView.classList.remove('hidden');
        const quizTypeCheckboxes = document.querySelectorAll('input[name="quizQuestionTypeOption"]');
        quizTypeCheckboxes.forEach(cb => cb.checked = (cb.value === 'multiple_choice')); 
        const numQuestionsRadios = document.querySelectorAll('input[name="quizNumQuestionsOption"]');
        numQuestionsRadios.forEach(rb => rb.checked = (rb.value === 'ai_choice')); 
        const difficultyRadios = document.querySelectorAll('input[name="quizDifficultyOption"]');
        difficultyRadios.forEach(rb => rb.checked = (rb.value === 'medium')); 
    });

    document.querySelectorAll('.review-question-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const qId = e.target.dataset.questionId;
            const qIndex = currentQuizData.findIndex(q => q.id === qId);
            if (qIndex !== -1) {
                currentQuizQuestionIndex = qIndex;
                quizResultsContainer.classList.add('hidden');
                if(quizInterfaceContainer) quizInterfaceContainer.classList.remove('hidden');
                displayQuizQuestion(currentQuizQuestionIndex); 
            }
        });
    });
}

if (document.getElementById('startQuizBtn')) { 
    initializeQuizSystem();
}
