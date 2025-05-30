/**
 * @file public/js/ui.js
 * @description UI manipulation functions for the Smart Study application.
 */

function showMessage(elementId, message, type = 'error') {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = type === 'success' ? 'success-message' : 'error-message';
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

function toggleElementVisibility(elementId, forceShow) {
    const element = document.getElementById(elementId);
    if (element) {
        if (typeof forceShow === 'boolean') {
            element.classList.toggle('hidden', !forceShow);
        } else {
            element.classList.toggle('hidden');
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
            html += '<div class="loading-spinner"></div> ';
        }
        html += message;
        statusDiv.innerHTML = html;
        statusDiv.classList.remove('hidden');
        statusDiv.classList.remove('error-message', 'success-message'); 
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
    console.log("Full results object received in displayResults:", JSON.stringify(results, null, 2));
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutput = document.getElementById('flashcardsOutput');
    const quizOutput = document.getElementById('quizOutput');
    const quizOutputStructured = document.getElementById('quizOutputStructured');
    const explainButton = document.getElementById('explainSelectedSummaryTextButton'); 
    const explanationOutput = document.getElementById('explanationOutput');
    const explainInstruction = document.getElementById('explainInstruction'); 

    if (summaryOutput) summaryOutput.innerHTML = '';
    if (flashcardsOutput) flashcardsOutput.innerHTML = '<p>No flashcards generated.</p>';
    if (quizOutput) quizOutput.innerHTML = '<p>No quiz questions generated.</p>';
    if (quizOutputStructured) quizOutputStructured.value = '';
    if (explainButton) explainButton.classList.add('hidden'); 
    if (explanationOutput) { explanationOutput.innerHTML = ''; explanationOutput.classList.add('hidden');}
    if (explainInstruction) explainInstruction.classList.add('hidden'); 

    document.querySelectorAll('.tab-content').forEach(tc => { tc.classList.remove('active'); tc.classList.add('hidden'); });
    document.querySelectorAll('.tab-link').forEach(tl => { tl.classList.remove('active'); tl.classList.add('hidden'); });
    
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
                        contentDiv.innerHTML = processTextForDisplay(sectionContentHtml.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>'), keywordsForHighlighting);
                        currentSectionDetails.appendChild(contentDiv);
                        summaryOutput.appendChild(currentSectionDetails);
                    }
                    currentSectionDetails = document.createElement('details');
                    currentSectionDetails.open = true; 
                    const summaryTitle = document.createElement('summary');
                    summaryTitle.innerHTML = processTextForDisplay(trimmedLine.substring(4), keywordsForHighlighting); 
                    currentSectionDetails.appendChild(summaryTitle);
                    sectionContentHtml = ''; 
                } else {
                    sectionContentHtml += line + '\n';
                }
            });

            if (firstHeadingFound && currentSectionDetails) {
                const contentDiv = document.createElement('div');
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
        document.querySelector('[data-tab="summaryTab"]')?.classList.remove('hidden');
        document.getElementById('summaryTab')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'summaryTab';
    } else {
        if (explainInstruction) explainInstruction.classList.add('hidden');
    }

    if (results.flashcards && results.flashcards.length > 0) {
        if (flashcardsOutput) renderFlashcards(flashcardsOutput, results.flashcards, keywordsForHighlighting);
        document.querySelector('[data-tab="flashcardsTab"]')?.classList.remove('hidden');
        document.getElementById('flashcardsTab')?.classList.remove('hidden');
         if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    }

    if (results.quiz) { 
        if (quizOutput) renderQuiz(quizOutput, results.quiz, keywordsForHighlighting); 
        if (quizOutputStructured && results.quiz && results.quiz.length > 0) { 
             quizOutputStructured.value = JSON.stringify(results.quiz, null, 2);
        }
        document.querySelector('[data-tab="quizTab"]')?.classList.remove('hidden');
        document.getElementById('quizTab')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'quizTab';
    }
    
    if (firstVisibleTab) {
        document.getElementById(firstVisibleTab)?.classList.add('active');
        document.querySelector(`.tab-link[data-tab="${firstVisibleTab}"]`)?.classList.add('active');
        if (resultsSection) resultsSection.classList.remove('hidden');
    } else {
         if (resultsSection) resultsSection.classList.add('hidden'); 
    }
}

/**
 * Renders flashcards into the specified container.
 * @param {HTMLElement} container - The HTML element to render flashcards into.
 * @param {Array<object>} flashcards - Array of flashcard objects {term, definition}.
 * @param {string[]} [keywordsToHighlight=[]] - Optional keywords to highlight in content.
 */
function renderFlashcards(container, flashcards, keywordsToHighlight = []) {
    container.innerHTML = ''; 
    if (!flashcards || flashcards.length === 0) {
        container.innerHTML = '<p>No flashcards generated.</p>';
        return;
    }
    flashcards.forEach(fc => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'flashcard';
        
        const termEl = document.createElement('strong');
        termEl.innerHTML = processTextForDisplay(fc.term, keywordsToHighlight); 
        
        const defEl = document.createElement('p');
        defEl.innerHTML = processTextForDisplay(fc.definition.replace(/\n/g, '<br>'), keywordsToHighlight);
        
        cardDiv.appendChild(termEl);
        cardDiv.appendChild(defEl);
        container.appendChild(cardDiv);
    });
}

/**
 * Renders quiz questions into the specified container.
 * @param {HTMLElement} container - The HTML element to render quiz questions into.
 * @param {Array<object>} quiz - Array of quiz objects {question, options, correctAnswer}.
 * @param {string[]} [keywordsToHighlight=[]] - Optional keywords to highlight in content.
 */
function renderQuiz(container, quiz, keywordsToHighlight = []) {
    container.innerHTML = ''; 
    if (!quiz || !Array.isArray(quiz) || quiz.length === 0) {
        container.innerHTML = '<p>No quiz questions generated or data is invalid.</p>';
        return;
    }
    quiz.forEach((q, index) => {
        if (typeof q !== 'object' || q === null || 
            typeof q.question !== 'string' || 
            !Array.isArray(q.options) || 
            typeof q.correctAnswer !== 'string') {
            const errorItem = document.createElement('p');
            errorItem.textContent = `Error: Invalid data for question ${index + 1}.`;
            errorItem.style.color = 'red';
            container.appendChild(errorItem);
            return; 
        }

        const questionDiv = document.createElement('div');
        questionDiv.className = 'quiz-question';
        
        const qText = document.createElement('p');
        qText.className = 'question-text';
        qText.innerHTML = `${index + 1}. ${processTextForDisplay(q.question, keywordsToHighlight)}`;
        questionDiv.appendChild(qText);
        
        const optionsList = document.createElement('ul');
        q.options.forEach((opt) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = processTextForDisplay(typeof opt === 'string' ? opt : JSON.stringify(opt), keywordsToHighlight);
            optionsList.appendChild(listItem);
        });
        questionDiv.appendChild(optionsList);

        const correctAnswerEl = document.createElement('p');
        correctAnswerEl.className = 'correct-answer';
        correctAnswerEl.innerHTML = `<strong>Correct Answer:</strong> ${processTextForDisplay(q.correctAnswer, keywordsToHighlight)}`; 
        questionDiv.appendChild(correctAnswerEl);
        
        container.appendChild(questionDiv);
    });
}

/**
 * Sets up tab navigation.
 * @param {string} tabsContainerSelector - Selector for the container holding tab links.
 * @param {string} tabContentContainerSelector - Selector for the container holding tab content panes.
 */
function setupTabs(tabsContainerSelector, tabContentContainerSelector = null) {
    const tabsContainer = document.querySelector(tabsContainerSelector);
    if (!tabsContainer) return;

    const contentContainer = tabContentContainerSelector ? document.querySelector(tabContentContainerSelector) : document;

    tabsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('tab-link')) {
            const targetTabId = event.target.dataset.tab;

            tabsContainer.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active'));
            
            const allTabContentsInScope = contentContainer === document ? 
                                      document.querySelectorAll('.tab-content') : 
                                      contentContainer.querySelectorAll('.tab-content');

            allTabContentsInScope.forEach(content => {
                 content.classList.remove('active');
                 // Also ensure they are hidden if not active
                 if(content.id !== targetTabId) {
                    content.classList.add('hidden');
                 } else {
                    content.classList.remove('hidden');
                 }
            });
            
            event.target.classList.add('active');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.classList.remove('hidden');
            }
        }
    });
}

/**
 * Initializes the current year in a footer element.
 * @param {string} elementId - The ID of the span element to update with the year.
 */
function setCurrentYear(elementId) {
    const yearSpan = document.getElementById(elementId);
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
}