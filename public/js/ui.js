/**
 * @file public/js/ui.js
 * @description UI manipulation functions for the Smart Study application.
 */

/**
 * Displays a message in a specified element, with a specified type (success/error).
 * @param {string} elementId - The ID of the HTML element to display the message in.
 * @param {string} message - The message text.
 * @param {'success' | 'error'} type - The type of message.
 */
function showMessage(elementId, message, type = 'error') {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = type === 'success' ? 'success-message' : 'error-message'; // Assumes CSS classes exist
    element.classList.remove('hidden'); // Make sure it's visible
  }
}

/**
 * Clears a message from a specified element.
 * @param {string} elementId - The ID of the HTML element.
 */
function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = '';
    element.className = '';
    element.classList.add('hidden'); // Hide it again
  }
}

/**
 * Toggles the visibility of an element.
 * @param {string} elementId - The ID of the HTML element.
 * @param {boolean} [forceShow] - If true, shows the element. If false, hides it. If undefined, toggles.
 */
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


/**
 * Updates the navigation buttons based on authentication status.
 * @param {boolean} isLoggedIn - True if the user is logged in, false otherwise.
 * @param {string} [userEmail=''] - The email of the logged-in user.
 */
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

/**
 * Displays processing status with an optional spinner.
 * @param {string} message - The message to display.
 * @param {boolean} [showSpinner=true] - Whether to show a loading spinner.
 */
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
    }
}

/**
 * Hides the processing status.
 */
function hideProcessingStatus() {
    const statusDiv = document.getElementById('processingStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '';
        statusDiv.classList.add('hidden');
    }
}

/**
 * Displays generated results in their respective tabs.
 * @param {object} results - The results object from the API.
 * @param {string} [results.summary] - The summary text.
 * @param {Array<object>} [results.flashcards] - Array of flashcard objects.
 * @param {Array<object>} [results.quiz] - Array of quiz objects.
 */
function displayResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutput = document.getElementById('flashcardsOutput');
    const quizOutput = document.getElementById('quizOutput');
    const quizOutputStructured = document.getElementById('quizOutputStructured'); // For raw JSON

    // Hide all tabs initially then show relevant ones
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(tl => tl.classList.remove('active'));
    
    let firstVisibleTab = null;

    if (results.summary) {
        if (summaryOutput) summaryOutput.textContent = results.summary;
        document.querySelector('[data-tab="summaryTab"]')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'summaryTab';
    } else {
        document.querySelector('[data-tab="summaryTab"]')?.classList.add('hidden');
        document.getElementById('summaryTab')?.classList.add('hidden');
    }

    if (results.flashcards && results.flashcards.length > 0) {
        if (flashcardsOutput) renderFlashcards(flashcardsOutput, results.flashcards);
        document.querySelector('[data-tab="flashcardsTab"]')?.classList.remove('hidden');
         if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    } else {
        document.querySelector('[data-tab="flashcardsTab"]')?.classList.add('hidden');
        document.getElementById('flashcardsTab')?.classList.add('hidden');
    }

    if (results.quiz && results.quiz.length > 0) {
        if (quizOutput) renderQuiz(quizOutput, results.quiz);
        if (quizOutputStructured) quizOutputStructured.value = JSON.stringify(results.quiz, null, 2);
        document.querySelector('[data-tab="quizTab"]')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'quizTab';
    } else {
        document.querySelector('[data-tab="quizTab"]')?.classList.add('hidden');
        document.getElementById('quizTab')?.classList.add('hidden');
    }
    
    if (firstVisibleTab) {
        document.getElementById(firstVisibleTab)?.classList.add('active');
        document.querySelector(`.tab-link[data-tab="${firstVisibleTab}"]`)?.classList.add('active');
        if (resultsSection) resultsSection.classList.remove('hidden');
    } else {
         if (resultsSection) resultsSection.classList.add('hidden'); // No results to show
    }
}

/**
 * Renders flashcards into the specified container.
 * @param {HTMLElement} container - The HTML element to render flashcards into.
 * @param {Array<object>} flashcards - Array of flashcard objects {term, definition}.
 */
function renderFlashcards(container, flashcards) {
    container.innerHTML = ''; // Clear previous flashcards
    if (!flashcards || flashcards.length === 0) {
        container.innerHTML = '<p>No flashcards generated.</p>';
        return;
    }
    flashcards.forEach(fc => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'flashcard';
        
        const termEl = document.createElement('strong');
        termEl.textContent = fc.term;
        
        const defEl = document.createElement('p');
        defEl.textContent = fc.definition;
        
        cardDiv.appendChild(termEl);
        cardDiv.appendChild(defEl);
        container.appendChild(cardDiv);
    });
}

/**
 * Renders quiz questions into the specified container.
 * @param {HTMLElement} container - The HTML element to render quiz questions into.
 * @param {Array<object>} quiz - Array of quiz objects {question, options, correctAnswer}.
 */
function renderQuiz(container, quiz) {
    container.innerHTML = ''; // Clear previous quiz
    if (!quiz || quiz.length === 0) {
        container.innerHTML = '<p>No quiz questions generated.</p>';
        return;
    }
    quiz.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'quiz-question';
        
        const qText = document.createElement('p');
        qText.className = 'question-text';
        qText.textContent = `${index + 1}. ${q.question}`;
        questionDiv.appendChild(qText);
        
        const optionsList = document.createElement('ul');
        q.options.forEach(opt => {
            const listItem = document.createElement('li');
            listItem.textContent = opt;
            if (opt === q.correctAnswer) {
                // Optionally highlight correct answer for review, or hide for taking quiz
                // For display purposes, we'll show it.
            }
            optionsList.appendChild(listItem);
        });
        questionDiv.appendChild(optionsList);

        const correctAnswerEl = document.createElement('p');
        correctAnswerEl.className = 'correct-answer';
        correctAnswerEl.textContent = q.correctAnswer;
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

    // If tabContentContainerSelector is not provided, assume content is sibling to tabsContainer or globally accessible by ID
    const contentContainer = tabContentContainerSelector ? document.querySelector(tabContentContainerSelector) : document;


    tabsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('tab-link')) {
            const targetTabId = event.target.dataset.tab;

            // Deactivate all tabs and content panes within this specific group
            tabsContainer.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active'));
            
            // Find content panes. If contentContainer is document, it searches globally.
            // If specific container, it searches within that.
            // This assumes tab content IDs match data-tab attributes.
            const allTabContents = contentContainer.querySelectorAll('.tab-content'); // Get all potential tab contents
            allTabContents.forEach(content => {
                // Only hide content panes that are part of *this* tab group.
                // This is tricky without a direct parent-child relation for content.
                // A common pattern is that tab content elements are siblings or children of a shared parent.
                // For simplicity, if the content ID matches any data-tab from this group, manage it.
                // This might need refinement based on exact HTML structure.
                // A safer way is if tab-content elements are direct children of `contentContainer`.
                if (contentContainer === document || content.parentElement === contentContainer) {
                     content.classList.remove('active');
                } else if (document.getElementById(content.id)) { // Global search if not direct child
                     document.getElementById(content.id).classList.remove('active');
                }
            });
            
            // Activate the clicked tab and its corresponding content pane
            event.target.classList.add('active');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        }
    });
}

// Initialize current year in footer
function setCurrentYear(elementId) {
    const yearSpan = document.getElementById(elementId);
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
}
