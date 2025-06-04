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
            modalTitle.textContent = 'Login';
            authSubmitButton.textContent = 'Login';
            authFormToggle.innerHTML = `Don't have an account? <a href="#" id="toggleToRegister" class="font-medium text-indigo-600 hover:text-indigo-700 underline hover:underline">Register</a>`;
        } else {
            modalTitle.textContent = 'Register';
            authSubmitButton.textContent = 'Register';
            authFormToggle.innerHTML = `Already have an account? <a href="#" id="toggleToRegister" class="font-medium text-indigo-600 hover:text-indigo-700 underline hover:underline">Login</a>`;
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

        authSubmitButton.disabled = true;
        authSubmitButton.textContent = isLoginMode ? 'Logging in...' : 'Registering...';

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        if(!emailInput || !passwordInput) return;

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            let response;
            if (isLoginMode) {
                response = await apiLogin(email, password);
                if (authFormMessage) showMessage('authFormMessage', 'Login successful! Redirecting...', 'success');
            } else {
                response = await apiRegister(email, password);
                 if (authFormMessage) showMessage('authFormMessage', 'Registration successful! You can now log in.', 'success');
                isLoginMode = true; 
                updateAuthMode();   
            }

            if (response.token) {
                localStorage.setItem('authToken', response.token);
                localStorage.setItem('userEmail', response.user.email); 
                updateNav(true, response.user.email);
                
                setTimeout(() => {
                    toggleElementVisibility('authModal', false);
                    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                        // No specific redirect needed beyond nav update.
                    }
                }, 1500);
            }
        } catch (error) {
            const message = error.data?.message || error.message || 'An unknown error occurred.';
            if (authFormMessage) showMessage('authFormMessage', message, 'error');
        } finally {
            authSubmitButton.disabled = false;
            // updateAuthMode(); // Already called in registration success, might cause issues if called again here.
            // Let's ensure it's correctly set for the current mode if no mode switch happened.
             if (isLoginMode) {
                authSubmitButton.textContent = 'Login';
            } else {
                authSubmitButton.textContent = 'Register';
            }
        }
    }

    if (authForm) {
        authForm.addEventListener('submit', handleAuthFormSubmit);
    }

    function handleLogout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        updateNav(false);
        if (window.location.pathname.includes('dashboard.html')) {
            window.location.href = '/index.html';
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

    const token = localStorage.getItem('authToken');
    const userEmail = localStorage.getItem('userEmail');
    if (token && userEmail) {
        updateNav(true, userEmail);
    } else {
        updateNav(false);
    }
    updateAuthMode(); 
});
