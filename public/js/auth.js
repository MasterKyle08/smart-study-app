document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('authModal');
    const loginNavButton = document.getElementById('loginNavButton');
    const registerNavButton = document.getElementById('registerNavButton');
    const closeModalButton = document.getElementById('closeModalButton');
    const authForm = document.getElementById('authForm');
    const modalTitle = document.getElementById('modalTitle');
    const authSubmitButton = document.getElementById('authSubmitButton');
    const authFormToggle = document.getElementById('authFormToggle');
    // const toggleToRegisterLink = document.getElementById('toggleToRegister'); // No longer needed as a static element reference
    const authFormMessage = document.getElementById('authFormMessage');
    const logoutNavButton = document.getElementById('logoutNavButton');
    const dashboardNavButton = document.getElementById('dashboardNavButton');

    let isLoginMode = true;

    function updateAuthMode() {
        if (!authFormToggle || !modalTitle || !authSubmitButton) return;
        
        if (isLoginMode) {
            modalTitle.textContent = 'Sign in';
            authSubmitButton.textContent = 'Sign in';
            authFormToggle.innerHTML = `Don't have an account? <a href="#" id="toggleToRegister" class="font-medium text-indigo-600 hover:text-indigo-700 underline">Create one</a>`;
        } else {
            modalTitle.textContent = 'Create account';
            authSubmitButton.textContent = 'Create account';
            authFormToggle.innerHTML = `Already have an account? <a href="#" id="toggleToRegister" class="font-medium text-indigo-600 hover:text-indigo-700 underline">Sign in</a>`;
        }
        
        const newToggleLink = document.getElementById('toggleToRegister');
        if (newToggleLink) {
            newToggleLink.addEventListener('click', (e) => {
                e.preventDefault();
                isLoginMode = !isLoginMode;
                if (authFormMessage) clearMessage('authFormMessage');
                if (authForm) authForm.reset();
                updateAuthMode();
            });
        }
    }

    function openAuthModal(startInLoginMode) {
        isLoginMode = startInLoginMode;
        updateAuthMode();
        if (authForm) authForm.reset();
        if (authFormMessage) clearMessage('authFormMessage');
        toggleElementVisibility('authModal', true);
    }

    if (loginNavButton) {
        loginNavButton.addEventListener('click', () => openAuthModal(true));
    }
    if (registerNavButton) {
        registerNavButton.addEventListener('click', () => openAuthModal(false));
    }
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => toggleElementVisibility('authModal', false));
    }

    if (authModal) {
        authModal.addEventListener('click', (event) => {
            if (event.target === authModal) {
                toggleElementVisibility('authModal', false);
            }
        });
    }
    
    async function handleAuthFormSubmit(event) {
        event.preventDefault();
        if (authFormMessage) clearMessage('authFormMessage');
        if (!authSubmitButton || !authForm) return;

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        if (!emailInput || !passwordInput) return;

        authSubmitButton.disabled = true;
        authSubmitButton.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            let response;
            if (isLoginMode) {
                response = await apiLogin(email, password);
                if (authFormMessage) showMessage('authFormMessage', 'Signed in. Welcome back.', 'success');
            } else {
                response = await apiRegister(email, password);
                if (authFormMessage) showMessage('authFormMessage', 'Account created. You are signed in.', 'success');
            }

            if (response.user) {
                localStorage.removeItem('authToken');
                localStorage.setItem('userEmail', response.user.email);
                localStorage.setItem('userPlan', response.user.plan || 'free');
                localStorage.setItem('userIsAdmin', response.user.isAdmin ? '1' : '0');
                updateNav(true, response.user.email, response.user.plan || 'free', Boolean(response.user.isAdmin));
                if (typeof window.refreshUsageMeter === 'function') window.refreshUsageMeter();
                setTimeout(() => {
                    toggleElementVisibility('authModal', false);
                }, 700);
            }
        } catch (error) {
            const message = error.data?.message || error.message || 'An unknown error occurred.';
            if (authFormMessage) showMessage('authFormMessage', message, 'error');
        } finally {
            authSubmitButton.disabled = false;
            // updateAuthMode(); // Already called in registration success, might cause issues if called again here.
            // Let's ensure it's correctly set for the current mode if no mode switch happened.
            authSubmitButton.textContent = isLoginMode ? 'Sign in' : 'Create account';
        }
    }

    if (authForm) {
        authForm.addEventListener('submit', handleAuthFormSubmit);
    }

    async function handleLogout() {
        try { if (typeof apiLogout === 'function') await apiLogout(); } catch (_err) { /* ignore */ }
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userPlan');
        localStorage.removeItem('userIsAdmin');
        updateNav(false);
        if (window.location.pathname.includes('dashboard.html')) {
            window.location.href = '/';
        }
    }

    if (logoutNavButton) {
        logoutNavButton.addEventListener('click', handleLogout);
    }
    
    if (dashboardNavButton) {
        dashboardNavButton.addEventListener('click', () => {
            window.location.href = '/dashboard.html';
        });
    }

    async function restoreSession() {
        if (typeof apiGetCurrentUser !== 'function') {
            updateNav(false);
            return;
        }
        try {
            const { user } = await apiGetCurrentUser();
            localStorage.removeItem('authToken');
            localStorage.setItem('userEmail', user.email);
            localStorage.setItem('userPlan', user.plan || 'free');
            localStorage.setItem('userIsAdmin', user.isAdmin ? '1' : '0');
            updateNav(true, user.email, user.plan || 'free', Boolean(user.isAdmin));
            if (typeof window.refreshUsageMeter === 'function') window.refreshUsageMeter();
        } catch (_error) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userPlan');
            localStorage.removeItem('userIsAdmin');
            updateNav(false);
        }
    }

    restoreSession();
    updateAuthMode(); 
});
