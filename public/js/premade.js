let premadeQuizzesCache = [];
let selectedPremadeQuiz = null;
let isViewingQuizDetail = false;
let myQuizSlugs = new Set();

const domRefs = {
    listContainer: document.getElementById('premadeListContainer'),
    listEmpty: document.getElementById('premadeListEmpty'),
    overviewPlaceholder: document.getElementById('premadeOverviewPlaceholder'),
    overviewContent: document.getElementById('premadeOverviewContent'),
    overviewStatus: document.getElementById('premadeOverviewStatus'),
    titleDisplay: document.getElementById('premadeTitleDisplay'),
    descriptionDisplay: document.getElementById('premadeDescriptionDisplay'),
    metaDisplay: document.getElementById('premadeMetaDisplay'),
    tagsDisplay: document.getElementById('premadeTagsDisplay'),
    shareLink: document.getElementById('premadeShareLink'),
    overviewCard: document.getElementById('premadeOverviewCard'),
    startButton: document.getElementById('startPremadeQuizButton'),
    quizInterfaceContainer: document.getElementById('quizInterfaceContainer'),
    quizResultsContainer: document.getElementById('quizResultsContainer'),
    quizLoadingStatus: document.getElementById('quizLoadingStatus'),
    quizWrapper: document.getElementById('premadeQuizInterfaceWrapper'),
    searchInput: document.getElementById('premadeSearchInput'),
    searchButton: document.getElementById('premadeSearchButton'),
    creatorSection: document.getElementById('premadeCreatorSection'),
    creatorNotice: document.getElementById('premadeCreatorNotice'),
    creatorForm: document.getElementById('premadeQuizForm'),
    creatorMessage: document.getElementById('premadeQuizFormMessage'),
    creatorNoticeLoginBtn: document.getElementById('premadeNoticeLoginBtn'),
};

const isUserLoggedIn = () => !!localStorage.getItem('userEmail');

function getSlugFromLocation() {
    const path = window.location.pathname || '';
    if (path.startsWith('/quiz/')) {
        return decodeURIComponent(path.replace('/quiz/', '').replace(/\/+$/, ''));
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('quiz')) {
        return params.get('quiz');
    }
    return null;
}

function renderPremadeList(quizzes, activeSlug) {
    if (!domRefs.listContainer) return;
    domRefs.listContainer.innerHTML = '';
    if (!quizzes || quizzes.length === 0) {
        if (domRefs.listEmpty) domRefs.listEmpty.classList.remove('hidden');
        return;
    }
    if (domRefs.listEmpty) domRefs.listEmpty.classList.add('hidden');

    quizzes.forEach(quiz => {
        const li = document.createElement('li');
        li.className = `border border-slate-200 rounded-lg p-3 cursor-pointer transition duration-150 hover:border-teal-400 hover:shadow-md ${quiz.slug === activeSlug ? 'ring-2 ring-teal-400 shadow-lg bg-slate-50' : 'bg-white'}`;
        li.dataset.slug = quiz.slug;
        li.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-sm font-semibold text-slate-800">${escapeHtml(quiz.title)}</h3>
                    <p class="text-xs text-slate-500 mt-1">${escapeHtml(quiz.description || '')}</p>
                </div>
                <span class="text-xs text-slate-500 whitespace-nowrap ml-3">${quiz.questionCount || 0} Qs</span>
            </div>
            ${quiz.topic ? `<p class="text-xs text-slate-400 mt-2">Topic: ${escapeHtml(quiz.topic)}</p>` : ''}
        `;
        li.addEventListener('click', () => {
            loadPremadeQuiz(quiz.slug, { pushHistory: true });
        });
        domRefs.listContainer.appendChild(li);
    });
}

function highlightActiveListSlug(slug) {
    if (!domRefs.listContainer) return;
    Array.from(domRefs.listContainer.children).forEach(item => {
        if (item.dataset.slug === slug) {
            item.classList.add('ring-2', 'ring-teal-400', 'shadow-lg', 'bg-slate-50');
        } else {
            item.classList.remove('ring-2', 'ring-teal-400', 'shadow-lg', 'bg-slate-50');
        }
    });
}

function updateOverview(quiz) {
    if (!domRefs.startButton || !domRefs.overviewPlaceholder || !domRefs.overviewContent) return;

    if (!quiz) {
        selectedPremadeQuiz = null;
        window.currentQuizSessionType = 'standard';
        window.currentExtractedTextForQuiz = '';
        domRefs.startButton.disabled = true;
        domRefs.overviewContent.classList.add('hidden');
        domRefs.overviewPlaceholder.classList.add('hidden');
        domRefs.metaDisplay.innerHTML = '';
        domRefs.tagsDisplay.innerHTML = '';
        domRefs.shareLink.textContent = '';
        domRefs.shareLink.removeAttribute('href');
        if (domRefs.overviewCard) domRefs.overviewCard.classList.add('hidden');
        if (typeof clearMessage === 'function') clearMessage('premadeOverviewStatus');
        return;
    }

    selectedPremadeQuiz = quiz;
    if (domRefs.overviewCard) domRefs.overviewCard.classList.remove('hidden');
    domRefs.overviewPlaceholder.classList.add('hidden');
    domRefs.overviewContent.classList.remove('hidden');
    domRefs.startButton.disabled = false;

    domRefs.titleDisplay.textContent = quiz.title || 'Premade Quiz';
    domRefs.descriptionDisplay.textContent = quiz.description || '';
    domRefs.shareLink.textContent = `${window.location.origin}${quiz.quizUrl}`;
    domRefs.shareLink.setAttribute('href', quiz.quizUrl);

    const metaPieces = [];
    if (quiz.topic) metaPieces.push(`<span class="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-full">${escapeHtml(quiz.topic)}</span>`);
    if (quiz.questionCount !== undefined) metaPieces.push(`<span class="inline-flex items-center px-2 py-1 bg-indigo-100 text-indigo-600 rounded-full">${quiz.questionCount} questions</span>`);
    if (quiz.quizOptions?.difficulty) metaPieces.push(`<span class="inline-flex items-center px-2 py-1 bg-amber-100 text-amber-600 rounded-full">Difficulty: ${escapeHtml(quiz.quizOptions.difficulty)}</span>`);
    if (quiz.createdAt) metaPieces.push(`<span class="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-500 rounded-full">Published ${new Date(quiz.createdAt.includes('Z') ? quiz.createdAt : `${quiz.createdAt}Z`).toLocaleDateString()}</span>`);
    domRefs.metaDisplay.innerHTML = metaPieces.join('');

    domRefs.tagsDisplay.innerHTML = '';
    const ownerBox = document.getElementById('premadeOwnerActions');
    if (ownerBox) {
        const isOwner = myQuizSlugs.has(quiz.slug);
        ownerBox.classList.toggle('hidden', !isOwner);
        if (isOwner) {
            const title = document.getElementById('ownerTitle');
            const description = document.getElementById('ownerDescription');
            const isPublic = document.getElementById('ownerPublic');
            if (title) title.value = quiz.title || '';
            if (description) description.value = quiz.description || '';
            if (isPublic) isPublic.checked = quiz.isPublic !== false;
        }
    }

    if (Array.isArray(quiz.tags) && quiz.tags.length > 0) {
        quiz.tags.forEach(tag => {
            const tagPill = document.createElement('span');
            tagPill.className = 'inline-flex items-center px-2.5 py-1 text-xs bg-teal-100 text-teal-700 rounded-full';
            tagPill.textContent = tag;
            domRefs.tagsDisplay.appendChild(tagPill);
        });
    }
}

function resetQuizInterfaceVisibility() {
    if (domRefs.quizInterfaceContainer) domRefs.quizInterfaceContainer.classList.add('hidden');
    if (domRefs.quizResultsContainer) {
        domRefs.quizResultsContainer.classList.add('hidden');
        domRefs.quizResultsContainer.innerHTML = '';
    }
    if (domRefs.quizWrapper) domRefs.quizWrapper.classList.add('hidden');
    if (domRefs.quizLoadingStatus) {
        domRefs.quizLoadingStatus.innerHTML = '';
        domRefs.quizLoadingStatus.className = 'mt-4 text-center text-sm';
    }
}

function startSelectedPremadeQuiz() {
    if (!selectedPremadeQuiz || !Array.isArray(selectedPremadeQuiz.quiz)) {
        showMessage('premadeOverviewStatus', 'Select a premade quiz before starting.', 'warning', 3000);
        return;
    }
    if (domRefs.quizLoadingStatus) showProcessingStatus('quizLoadingStatus', 'Loading quiz...', true);

    window.currentQuizSessionType = 'premade';
    window.currentQuizData = selectedPremadeQuiz.quiz.map(question => ({
        ...question,
        chatHistory: [],
        detailedExplanationContent: null,
        detailedExplanationFetched: false,
        aiFeedback: null,
        correctness: null,
        previousStateBeforeMark: null,
        isExplanationVisible: false,
        isChatVisible: false,
    }));
    window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData));
    window.currentQuizQuestionIndex = 0;
    window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
    window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
    window.currentQuizOptions = selectedPremadeQuiz.quizOptions || {
        questionTypes: ['multiple_choice'],
        numQuestions: 'ai_choice',
        difficulty: 'medium',
    };
    window.currentQuizTextContext = selectedPremadeQuiz.topic || selectedPremadeQuiz.description || '';
    window.currentExtractedTextForQuiz = selectedPremadeQuiz.sourceText || window.currentQuizTextContext || '';

    renderQuizInterface();
    if (domRefs.quizWrapper) domRefs.quizWrapper.classList.remove('hidden');
    if (domRefs.quizInterfaceContainer) domRefs.quizInterfaceContainer.classList.remove('hidden');
    if (domRefs.quizResultsContainer) {
        domRefs.quizResultsContainer.classList.add('hidden');
        domRefs.quizResultsContainer.innerHTML = '';
    }
    if (domRefs.quizLoadingStatus) hideProcessingStatus('quizLoadingStatus');

    const wrapper = document.getElementById('premadeQuizInterfaceWrapper');
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.generatePersonalizedQuizFromPremade = async function() {
    const statusElementId = 'premadePersonalizeStatus';
    if (!selectedPremadeQuiz) {
        showMessage(statusElementId, 'Select a premade quiz before personalizing.', 'error', 4000);
        return;
    }

    const generateBtn = document.getElementById('premadePersonalizeGenerateBtn');
    if (typeof clearMessage === 'function') clearMessage(statusElementId);

    const questionTypes = Array.from(document.querySelectorAll('input[name="premadePersonalQuestionType"]:checked')).map(input => input.value);
    if (questionTypes.length === 0) {
        showMessage(statusElementId, 'Choose at least one question type.', 'warning', 4000);
        return;
    }

    const numQuestions = document.getElementById('premadePersonalNumQuestions')?.value || 'ai_choice';
    const difficulty = document.getElementById('premadePersonalDifficulty')?.value || 'medium';
    const referenceText = (selectedPremadeQuiz.sourceText || selectedPremadeQuiz.description || selectedPremadeQuiz.topic || '').trim();

    if (!referenceText) {
        showMessage(statusElementId, 'This premade quiz is missing detailed reference material. Try another quiz or add your own context.', 'error', 6000);
        return;
    }

    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    }
    showMessage(statusElementId, 'Generating a personalized quiz...', 'warning');

    try {
        const quizOptions = { questionTypes, numQuestions, difficulty };
        const response = await apiGenerateQuiz(referenceText, quizOptions);
        if (!response.quiz || !Array.isArray(response.quiz) || response.quiz.length === 0) {
            throw new Error('AI did not return any quiz questions. Try adjusting the settings.');
        }

        window.currentQuizOptions = quizOptions;
        window.currentQuizTextContext = referenceText;
        window.currentExtractedTextForQuiz = referenceText;
        window.currentQuizData = response.quiz.map(question => ({
            ...question,
            chatHistory: [],
            detailedExplanationContent: null,
            detailedExplanationFetched: false,
            aiFeedback: null,
            correctness: null,
            previousStateBeforeMark: null,
            isExplanationVisible: false,
            isChatVisible: false,
        }));
        window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData));
        window.currentQuizQuestionIndex = 0;
        window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
        window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
        window.currentQuizSessionType = 'standard';

        if (domRefs.quizResultsContainer) domRefs.quizResultsContainer.classList.add('hidden');
        renderQuizInterface();
        if (domRefs.quizWrapper) domRefs.quizWrapper.classList.remove('hidden');
        if (domRefs.quizInterfaceContainer) domRefs.quizInterfaceContainer.classList.remove('hidden');
        showMessage(statusElementId, 'Personalized quiz ready! Work through it below.', 'success', 4000);
    } catch (error) {
        console.error('Failed to generate personalized quiz from premade:', error);
        showMessage(statusElementId, error.message || 'Failed to generate personalized quiz.', 'error', 5000);
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Personalized Quiz';
        }
    }
};

async function loadPremadeList(searchTerm) {
    try {
        const response = await apiListPremadeQuizzes(searchTerm);
        premadeQuizzesCache = response.quizzes || [];
        renderPremadeList(premadeQuizzesCache, selectedPremadeQuiz?.slug);
    } catch (error) {
        console.error('Failed to load premade quizzes:', error);
        if (domRefs.listEmpty) {
            domRefs.listEmpty.textContent = error.message || 'Failed to load premade quizzes.';
            domRefs.listEmpty.classList.remove('hidden');
        }
    }
}

async function loadPremadeQuiz(slug, { pushHistory = false } = {}) {
    if (!slug) return;
    isViewingQuizDetail = true;
    updateCreatorVisibility();
    if (domRefs.overviewCard) domRefs.overviewCard.classList.remove('hidden');
    if (domRefs.overviewPlaceholder) domRefs.overviewPlaceholder.classList.remove('hidden');
    if (domRefs.overviewContent) domRefs.overviewContent.classList.add('hidden');
    if (domRefs.startButton) domRefs.startButton.disabled = true;
    try {
        highlightActiveListSlug(slug);
        showMessage('premadeOverviewStatus', 'Loading quiz details...', 'success');
        const response = await apiGetPremadeQuiz(slug);
        if (!response.quiz) {
            showMessage('premadeOverviewStatus', 'Quiz not found.', 'error', 3000);
            return;
        }
        updateOverview(response.quiz);
        highlightActiveListSlug(response.quiz.slug);
        clearMessage('premadeOverviewStatus');
        resetQuizInterfaceVisibility();
        if (pushHistory) {
            history.pushState({ slug: response.quiz.slug }, '', `/quiz/${response.quiz.slug}`);
        } else {
            history.replaceState({ slug: response.quiz.slug }, '', `/quiz/${response.quiz.slug}`);
        }
    } catch (error) {
        console.error('Failed to load premade quiz:', error);
        showMessage('premadeOverviewStatus', error.message || 'Failed to load premade quiz.', 'error', 4000);
    }
}

function updateCreatorVisibility() {
    const loggedIn = isUserLoggedIn();
    const showCreatorSection = !isViewingQuizDetail && loggedIn;
    const showCreatorNotice = !isViewingQuizDetail && !loggedIn;

    if (domRefs.creatorSection) domRefs.creatorSection.classList.toggle('hidden', !showCreatorSection);
    if (domRefs.creatorNotice) domRefs.creatorNotice.classList.toggle('hidden', !showCreatorNotice);
    if ((!showCreatorSection || !loggedIn) && domRefs.creatorMessage && typeof clearMessage === 'function') {
        clearMessage('premadeQuizFormMessage');
    }
}

window.addEventListener('authTokenExpired', (event) => {
    updateCreatorVisibility();
    const defaultMessage = 'Your session expired. Please log in again to generate premade quizzes.';
    const message = event?.detail?.message && event.detail.message.toLowerCase().includes('token') 
        ? 'Your session expired. Please log in again to generate premade quizzes.'
        : (event?.detail?.message || defaultMessage);
    if (!isViewingQuizDetail && domRefs.creatorMessage) {
        showMessage('premadeQuizFormMessage', message, 'error', 6000);
    }
});

async function handlePremadeCreateSubmit(event) {
    event.preventDefault();
    if (!domRefs.creatorForm) return;

    if (domRefs.creatorMessage) clearMessage('premadeQuizFormMessage');

    const submitButton = domRefs.creatorForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Generating...';
    }

    const title = domRefs.creatorForm.premadeTitle.value.trim();
    const topic = domRefs.creatorForm.premadeTopic.value.trim();
    const description = domRefs.creatorForm.premadeDescription.value.trim();
    const keyInstructions = domRefs.creatorForm.premadeKeyInstructions.value.trim();
    const sourceText = domRefs.creatorForm.premadeSourceText.value.trim();
    const tagsInput = domRefs.creatorForm.premadeTags.value.trim();
    const questionCount = domRefs.creatorForm.premadeQuestionCount.value;
    const difficulty = domRefs.creatorForm.premadeDifficulty.value;
    const questionTypes = Array.from(domRefs.creatorForm.querySelectorAll('input[name="premadeQuestionType"]:checked')).map(input => input.value);

    if (!title) {
        showMessage('premadeQuizFormMessage', 'Please provide a title for your premade quiz.', 'warning', 4000);
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Generate Premade Quiz';
        }
        return;
    }
    if (questionTypes.length === 0) {
        showMessage('premadeQuizFormMessage', 'Select at least one question type.', 'warning', 4000);
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Generate Premade Quiz';
        }
        return;
    }

    try {
        showMessage('premadeQuizFormMessage', 'Generating quiz with AI...', 'success');
        const payload = {
            title,
            topic: topic || title,
            description,
            customInstructions: keyInstructions,
            sourceText,
            tags: tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(Boolean) : [],
            quizOptions: {
                questionTypes,
                numQuestions: questionCount,
                difficulty,
            },
        };
        const response = await apiCreatePremadeQuiz(payload);
        const quiz = response.quiz;
        if (quiz && quiz.quizUrl) {
            const shareLink = `${window.location.origin}${quiz.quizUrl}`;
            showMessage('premadeQuizFormMessage', `Premade quiz ready! Share link: ${shareLink}`, 'success', 8000);
            domRefs.creatorForm.reset();
            const defaultType = domRefs.creatorForm.querySelector('input[name="premadeQuestionType"][value="multiple_choice"]');
            if (defaultType) defaultType.checked = true;
            domRefs.creatorForm.premadeQuestionCount.value = 'ai_choice';
            domRefs.creatorForm.premadeDifficulty.value = 'medium';
            const currentSearch = domRefs.searchInput ? domRefs.searchInput.value : '';
            await loadPremadeList(currentSearch);
            loadPremadeQuiz(quiz.slug, { pushHistory: true });
        } else {
            showMessage('premadeQuizFormMessage', 'Premade quiz created, but no share link was returned.', 'warning', 5000);
        }
    } catch (error) {
        let message = error.data?.message || error.message || 'Failed to create premade quiz.';
        if (error.status === 401 || error.status === 403) {
            message = 'Your session expired. Please log in again to generate premade quizzes.';
            updateCreatorVisibility();
        }
        showMessage('premadeQuizFormMessage', message, 'error', 5000);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Generate Premade Quiz';
        }
    }
}

let searchTimeoutId = null;
function handlePremadeSearch() {
    const term = domRefs.searchInput ? domRefs.searchInput.value : '';
    if (searchTimeoutId) clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => {
        loadPremadeList(term);
    }, 250);
}

function initialisePremadePage() {
    if (typeof window.setCurrentYear === 'function') setCurrentYear('currentYearPremade');

    if (domRefs.creatorNoticeLoginBtn) {
        domRefs.creatorNoticeLoginBtn.addEventListener('click', () => {
            const loginButton = document.getElementById('loginNavButton');
            if (loginButton) {
                loginButton.click();
            } else {
                toggleElementVisibility('authModal', true);
            }
        });
    }
    if (domRefs.creatorForm) {
        domRefs.creatorForm.addEventListener('submit', handlePremadeCreateSubmit);
    }

    if (domRefs.startButton) {
        domRefs.startButton.addEventListener('click', startSelectedPremadeQuiz);
        domRefs.startButton.disabled = true;
    }
    if (domRefs.searchButton) {
        domRefs.searchButton.addEventListener('click', () => handlePremadeSearch());
    }
    if (domRefs.searchInput) {
        domRefs.searchInput.addEventListener('input', handlePremadeSearch);
        domRefs.searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handlePremadeSearch();
            }
        });
    }

    const ownerSaveBtn = document.getElementById('ownerSaveBtn');
    const ownerDeleteBtn = document.getElementById('ownerDeleteBtn');
    if (ownerSaveBtn) {
        ownerSaveBtn.addEventListener('click', async () => {
            if (!selectedPremadeQuiz) return;
            try {
                const response = await apiUpdatePremadeQuiz(selectedPremadeQuiz.slug, {
                    title: document.getElementById('ownerTitle').value,
                    description: document.getElementById('ownerDescription').value,
                    isPublic: document.getElementById('ownerPublic').checked,
                });
                showMessage('ownerActionStatus', 'Saved.', 'success', 3000);
                selectedPremadeQuiz = response.quiz;
                updateOverview(response.quiz);
                await loadPremadeList(domRefs.searchInput ? domRefs.searchInput.value : '');
            } catch (error) {
                showMessage('ownerActionStatus', error.message || 'Could not save.', 'error', 4000);
            }
        });
    }
    if (ownerDeleteBtn) {
        ownerDeleteBtn.addEventListener('click', async () => {
            if (!selectedPremadeQuiz) return;
            if (!window.confirm('Delete this premade quiz? This cannot be undone.')) return;
            try {
                await apiDeletePremadeQuiz(selectedPremadeQuiz.slug);
                showMessage('ownerActionStatus', 'Deleted.', 'success', 3000);
                selectedPremadeQuiz = null;
                updateOverview(null);
                await loadPremadeList('');
                history.replaceState({}, '', '/premade');
            } catch (error) {
                showMessage('ownerActionStatus', error.message || 'Could not delete.', 'error', 4000);
            }
        });
    }

    async function refreshMine() {
        myQuizSlugs = new Set();
        if (!isUserLoggedIn()) return;
        try {
            const mine = await apiListMyPremadeQuizzes();
            (mine.quizzes || []).forEach((quiz) => myQuizSlugs.add(quiz.slug));
        } catch (_err) {
            myQuizSlugs = new Set();
        }
    }

    loadPremadeList('');
    updateCreatorVisibility();

    if (typeof window.updateNav === 'function') {
        const originalUpdateNav = window.updateNav;
        window.updateNav = function (...args) {
            originalUpdateNav.apply(this, args);
            updateCreatorVisibility();
        };
    }

    window.addEventListener('storage', (event) => {
        if (event.key === 'authToken') updateCreatorVisibility();
    });

    refreshMine().then(() => {
    const initialSlug = getSlugFromLocation();
    if (initialSlug) {
        loadPremadeQuiz(initialSlug, { pushHistory: false });
    } else {
        isViewingQuizDetail = false;
        updateCreatorVisibility();
        updateOverview(null);
        resetQuizInterfaceVisibility();
        highlightActiveListSlug(null);
        history.replaceState({}, '', '/premade');
    }
    });

    window.addEventListener('popstate', () => {
        const slugFromState = getSlugFromLocation();
        if (slugFromState) {
            loadPremadeQuiz(slugFromState, { pushHistory: false });
        } else {
            isViewingQuizDetail = false;
            updateCreatorVisibility();
            updateOverview(null);
            resetQuizInterfaceVisibility();
            highlightActiveListSlug(null);
        }
    });
}

document.addEventListener('DOMContentLoaded', initialisePremadePage);
