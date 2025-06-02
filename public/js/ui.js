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
            // For modals, we only toggle the data-visible attribute.
            // The HTML structure and Tailwind classes handle the actual display and transitions.
            if (typeof forceShow === 'boolean') {
                element.dataset.visible = forceShow ? 'true' : 'false';
            } else { // Toggle logic
                element.dataset.visible = element.dataset.visible === 'true' ? 'false' : 'true';
            }
        } else { 
            // For non-modal elements, toggle the 'hidden' class as before.
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
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutput = document.getElementById('flashcardsOutput');
    const quizOutput = document.getElementById('quizOutput');
    const quizOutputStructured = document.getElementById('quizOutputStructured');
    const explainButton = document.getElementById('explainSelectedSummaryTextButton'); 
    const explanationOutput = document.getElementById('explanationOutput');
    const explainInstruction = document.getElementById('explainInstruction'); 

    if (summaryOutput) summaryOutput.innerHTML = '';
    if (flashcardsOutput) flashcardsOutput.innerHTML = '<p class="text-slate-500 text-sm">No flashcards generated.</p>';
    if (quizOutput) quizOutput.innerHTML = '<p class="text-slate-500 text-sm">No quiz questions generated.</p>';
    if (quizOutputStructured) quizOutputStructured.value = '';
    if (explainButton) explainButton.classList.add('hidden'); 
    if (explanationOutput) { explanationOutput.innerHTML = ''; explanationOutput.classList.add('hidden');}
    if (explainInstruction) explainInstruction.classList.add('hidden'); 

    document.querySelectorAll('#resultsSection .tab-content').forEach(tc => { tc.classList.add('hidden'); tc.removeAttribute('data-active'); });
    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => { /* don't hide tab links, just manage active state */ tl.removeAttribute('data-active'); });
    
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
        // No longer hiding tab links, just content
        // document.querySelector('[data-tab="summaryTab"]')?.classList.remove('hidden');
        // document.getElementById('summaryTab')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'summaryTab';
    } else {
        if (explainInstruction) explainInstruction.classList.add('hidden');
    }

    if (results.flashcards && results.flashcards.length > 0) {
        if (flashcardsOutput) renderFlashcards(flashcardsOutput, results.flashcards, keywordsForHighlighting);
        // document.querySelector('[data-tab="flashcardsTab"]')?.classList.remove('hidden');
        // document.getElementById('flashcardsTab')?.classList.remove('hidden');
         if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    }

    if (results.quiz) { 
        if (quizOutput) renderQuiz(quizOutput, results.quiz, keywordsForHighlighting); 
        if (quizOutputStructured && results.quiz && results.quiz.length > 0) { 
             quizOutputStructured.value = JSON.stringify(results.quiz, null, 2);
        }
        // document.querySelector('[data-tab="quizTab"]')?.classList.remove('hidden');
        // document.getElementById('quizTab')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'quizTab';
    }
    
    // Ensure all tab links are visible
    document.querySelectorAll('#resultsSection .tab-link').forEach(tl => tl.classList.remove('hidden'));

    if (firstVisibleTab) {
        const tabToActivate = document.getElementById(firstVisibleTab);
        const linkToActivate = document.querySelector(`.tab-link[data-tab="${firstVisibleTab}"]`);
        if(tabToActivate) {
            tabToActivate.classList.remove('hidden'); // Show the content for the first visible tab
            tabToActivate.dataset.active = "true";
        }
        if(linkToActivate) linkToActivate.dataset.active = "true";
        if (resultsSection) resultsSection.classList.remove('hidden');
    } else {
         if (resultsSection) resultsSection.classList.add('hidden'); 
         // If no results, hide all tab links as well
         document.querySelectorAll('#resultsSection .tab-link').forEach(tl => tl.classList.add('hidden'));
    }
}

function renderFlashcards(container, flashcards, keywordsToHighlight = []) {
    container.innerHTML = ''; 
    if (!flashcards || flashcards.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-sm">No flashcards generated.</p>';
        return;
    }
    flashcards.forEach(fc => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'flashcard-custom';
        
        const termEl = document.createElement('strong');
        termEl.className = 'flashcard-custom-term';
        termEl.innerHTML = processTextForDisplay(fc.term, keywordsToHighlight); 
        
        const defEl = document.createElement('p');
        defEl.className = 'flashcard-custom-definition';
        defEl.innerHTML = processTextForDisplay(fc.definition.replace(/\n/g, '<br>'), keywordsToHighlight);
        
        cardDiv.appendChild(termEl);
        cardDiv.appendChild(defEl);
        container.appendChild(cardDiv);
    });
}

function renderQuiz(container, quiz, keywordsToHighlight = []) {
    container.innerHTML = ''; 
    if (!quiz || !Array.isArray(quiz) || quiz.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-sm">No quiz questions generated or data is invalid.</p>';
        return;
    }
    quiz.forEach((q, index) => {
        if (typeof q !== 'object' || q === null || 
            typeof q.question !== 'string' || 
            !Array.isArray(q.options) || 
            typeof q.correctAnswer !== 'string') {
            const errorItem = document.createElement('p');
            errorItem.textContent = `Error: Invalid data for question ${index + 1}.`;
            errorItem.className = 'text-red-600 text-xs';
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
            // listItem.className = 'quiz-option-item'; // If specific option styling is needed
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
