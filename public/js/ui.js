/**
 * @file public/js/ui.js
 * @description UI manipulation functions for the Smart Study application.
 * Restored original renderQuiz with internal debugging and improved reset logic.
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
    console.log("Full results object received in displayResults:", JSON.stringify(results, null, 2));

    const resultsSection = document.getElementById('resultsSection');
    const summaryOutput = document.getElementById('summaryOutput');
    const flashcardsOutput = document.getElementById('flashcardsOutput');
    const quizOutput = document.getElementById('quizOutput');
    const quizOutputStructured = document.getElementById('quizOutputStructured'); 

    // --- Proactively clear all output areas and hide tabs ---
    if (summaryOutput) summaryOutput.textContent = '';
    if (flashcardsOutput) flashcardsOutput.innerHTML = '<p>No flashcards generated.</p>'; // Default message
    if (quizOutput) quizOutput.innerHTML = '<p>No quiz questions generated or data is invalid.</p>'; // Default message
    if (quizOutputStructured) quizOutputStructured.value = '';

    document.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.remove('active');
        tc.classList.add('hidden'); // Ensure content panes are hidden initially
    });
    document.querySelectorAll('.tab-link').forEach(tl => {
        tl.classList.remove('active');
        tl.classList.add('hidden'); // Ensure tab links are hidden initially
    });
    // --- End proactive clearing ---
    
    let firstVisibleTab = null;

    if (results.summary) {
        if (summaryOutput) summaryOutput.textContent = results.summary;
        document.querySelector('[data-tab="summaryTab"]')?.classList.remove('hidden');
        document.getElementById('summaryTab')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'summaryTab';
    }

    if (results.flashcards && results.flashcards.length > 0) {
        if (flashcardsOutput) renderFlashcards(flashcardsOutput, results.flashcards); // renderFlashcards clears its own container
        document.querySelector('[data-tab="flashcardsTab"]')?.classList.remove('hidden');
        document.getElementById('flashcardsTab')?.classList.remove('hidden');
         if (!firstVisibleTab) firstVisibleTab = 'flashcardsTab';
    }

    if (results.quiz) { 
        console.log("Quiz data being passed to renderQuiz:", JSON.stringify(results.quiz, null, 2));
        // renderQuiz will handle its own clearing and display "no questions" if quiz array is empty/invalid
        if (quizOutput) renderQuiz(quizOutput, results.quiz); 

        if (quizOutputStructured && results.quiz && results.quiz.length > 0) { 
             quizOutputStructured.value = JSON.stringify(results.quiz, null, 2);
        }
        // Always unhide the quiz tab link and content pane if results.quiz is present
        // renderQuiz will handle displaying the "no questions" message if the array is empty.
        document.querySelector('[data-tab="quizTab"]')?.classList.remove('hidden');
        document.getElementById('quizTab')?.classList.remove('hidden');
        if (!firstVisibleTab) firstVisibleTab = 'quizTab';
    } else {
        console.log("No 'results.quiz' key found or it's undefined/null.");
        // Quiz tab and content remain hidden (already set by proactive hiding)
    }
    
    if (firstVisibleTab) {
        document.getElementById(firstVisibleTab)?.classList.add('active');
        document.querySelector(`.tab-link[data-tab="${firstVisibleTab}"]`)?.classList.add('active');
        if (resultsSection) resultsSection.classList.remove('hidden');
    } else {
         // If no content was generated for any tab, keep the whole results section hidden
         if (resultsSection) resultsSection.classList.add('hidden'); 
    }
}

/**
 * Renders flashcards into the specified container.
 * @param {HTMLElement} container - The HTML element to render flashcards into.
 * @param {Array<object>} flashcards - Array of flashcard objects {term, definition}.
 */
function renderFlashcards(container, flashcards) {
    console.log("renderFlashcards CALLED. Container:", container, "Flashcards data:", flashcards);
    container.innerHTML = ''; 
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
 * This is the ORIGINAL version with added internal logging.
 * @param {HTMLElement} container - The HTML element to render quiz questions into.
 * @param {Array<object>} quiz - Array of quiz objects {question, options, correctAnswer}.
 */
function renderQuiz(container, quiz) {
    console.log("ORIGINAL renderQuiz CALLED. Container:", container, "Quiz data:", JSON.stringify(quiz, null, 2));
    
    if (!container) {
        console.error("renderQuiz: CONTAINER ELEMENT NOT FOUND!");
        return;
    }
    container.innerHTML = ''; // Clear previous quiz

    if (!quiz || !Array.isArray(quiz) || quiz.length === 0) {
        container.innerHTML = '<p>No quiz questions generated or data is invalid.</p>';
        if (quiz && !Array.isArray(quiz)) console.error("renderQuiz: quiz data is not an array!", quiz);
        else if (!quiz) console.log("renderQuiz: quiz data is null or undefined.");
        else if (quiz.length === 0) console.log("renderQuiz: quiz data is an empty array.");
        return;
    }

    console.log(`renderQuiz: Starting to render ${quiz.length} questions.`);
    quiz.forEach((q, index) => {
        console.log(`renderQuiz: Processing question ${index + 1}:`, JSON.stringify(q, null, 2));

        // Validate individual question structure
        if (typeof q !== 'object' || q === null || 
            typeof q.question !== 'string' || 
            !Array.isArray(q.options) || 
            typeof q.correctAnswer !== 'string') {
            console.error("renderQuiz: Invalid question object structure at index", index, q);
            const errorItem = document.createElement('p');
            errorItem.textContent = `Error: Invalid data for question ${index + 1}. Check console for details.`;
            errorItem.style.color = 'red';
            container.appendChild(errorItem);
            return; // Skip this invalid question
        }

        const questionDiv = document.createElement('div');
        questionDiv.className = 'quiz-question';
        console.log(`renderQuiz: Created questionDiv for question ${index + 1}`);
        
        const qText = document.createElement('p');
        qText.className = 'question-text';
        qText.textContent = `${index + 1}. ${q.question}`;
        questionDiv.appendChild(qText);
        console.log(`renderQuiz: Added question text: "${q.question}"`);
        
        const optionsList = document.createElement('ul');
        console.log(`renderQuiz: Processing ${q.options.length} options for question ${index + 1}`);
        q.options.forEach((opt, optIndex) => {
            const listItem = document.createElement('li');
            listItem.textContent = typeof opt === 'string' ? opt : JSON.stringify(opt); // Handle non-string options gracefully
            optionsList.appendChild(listItem);
            console.log(`renderQuiz: Added option ${optIndex + 1}: "${listItem.textContent}"`);
        });
        questionDiv.appendChild(optionsList);

        const correctAnswerEl = document.createElement('p');
        correctAnswerEl.className = 'correct-answer';
        correctAnswerEl.textContent = q.correctAnswer; 
        questionDiv.appendChild(correctAnswerEl);
        console.log(`renderQuiz: Added correct answer: "${q.correctAnswer}"`);
        
        container.appendChild(questionDiv);
        console.log(`renderQuiz: Successfully appended question ${index + 1} to container.`);
    });
    console.log("renderQuiz: Finished rendering all questions.");
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
            });
            
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
