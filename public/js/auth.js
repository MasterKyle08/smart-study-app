/**
 * @file public/js/auth.js
 * @description Handles authentication UI logic (login, registration, logout modals).
 */

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('authModal');
    const loginNavButton = document.getElementById('loginNavButton');
    const registerNavButton = document.getElementById('registerNavButton');
    const closeModalButton = document.getElementById('closeModalButton');
    const authForm = document.getElementById('authForm');
    const modalTitle = document.getElementById('modalTitle');
    const authSubmitButton = document.getElementById('authSubmitButton');
    const authFormToggle = document.getElementById('authFormToggle');
    const toggleToRegisterLink = document.getElementById('toggleToRegister'); // Link text changes
    const authFormMessage = document.getElementById('authFormMessage');
    const logoutNavButton = document.getElementById('logoutNavButton');
    const dashboardNavButton = document.getElementById('dashboardNavButton');

    let isLoginMode = true;

    /**
     * Updates the auth modal and form for either login or registration mode.
     */
    function updateAuthMode() {
        if (isLoginMode) {
            modalTitle.textContent = 'Login';
            authSubmitButton.textContent = 'Login';
            authFormToggle.innerHTML = `Don't have an account? <a href="#" id="toggleToRegister">Register</a>`;
        } else {
            modalTitle.textContent = 'Register';
            authSubmitButton.textContent = 'Register';
            authFormToggle.innerHTML = `Already have an account? <a href="#" id="toggleToRegister">Login</a>`;
        }
        // Re-attach event listener to the new link
        document.getElementById('toggleToRegister').addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            clearMessage('authFormMessage');
            authForm.reset();
            updateAuthMode();
        });
    }

    /**
     * Opens the authentication modal.
     * @param {boolean} startInLoginMode - True to open in login mode, false for registration.
     */
    function openAuthModal(startInLoginMode) {
        isLoginMode = startInLoginMode;
        updateAuthMode();
        authForm.reset();
        clearMessage('authFormMessage');
        toggleElementVisibility('authModal', true);
    }

    // Event listeners for nav buttons
    if (loginNavButton) {
        loginNavButton.addEventListener('click', () => openAuthModal(true));
    }
    if (registerNavButton) {
        registerNavButton.addEventListener('click', () => openAuthModal(false));
    }
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => toggleElementVisibility('authModal', false));
    }

    // Close modal if clicked outside
    if (authModal) {
        authModal.addEventListener('click', (event) => {
            if (event.target === authModal) {
                toggleElementVisibility('authModal', false);
            }
        });
    }
    

    /**
     * Handles the submission of the authentication form (login/register).
     * @param {Event} event - The form submission event.
     */
    async function handleAuthFormSubmit(event) {
        event.preventDefault();
        clearMessage('authFormMessage');
        authSubmitButton.disabled = true;
        authSubmitButton.textContent = isLoginMode ? 'Logging in...' : 'Registering...';

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            let response;
            if (isLoginMode) {
                response = await apiLogin(email, password);
                showMessage('authFormMessage', 'Login successful! Redirecting...', 'success');
            } else {
                response = await apiRegister(email, password);
                showMessage('authFormMessage', 'Registration successful! You can now log in.', 'success');
                // Optionally auto-login or switch to login mode
                isLoginMode = true; // Switch to login mode after successful registration
                updateAuthMode();   // Update form display
            }

            if (response.token) {
                localStorage.setItem('authToken', response.token);
                localStorage.setItem('userEmail', response.user.email); // Store email for display
                updateNav(true, response.user.email);
                
                // If login was successful, close modal. If registration, user might want to login next.
                // For now, close modal on any success that yields a token and updates nav.
                setTimeout(() => {
                    toggleElementVisibility('authModal', false);
                    // If on index.html and login is successful, they might want to go to dashboard or just stay.
                    // If they were trying to access a protected feature, redirect there.
                    // For now, simple updateNav is enough. Dashboard button will appear.
                    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                        // User is on the main page, no specific redirect needed beyond nav update.
                        // Or, redirect to dashboard: window.location.href = '/dashboard.html';
                    }
                }, 1500);
            }
        } catch (error) {
            const message = error.data?.message || error.message || 'An unknown error occurred.';
            showMessage('authFormMessage', message, 'error');
        } finally {
            authSubmitButton.disabled = false;
            updateAuthMode(); // Reset button text
        }
    }

    if (authForm) {
        authForm.addEventListener('submit', handleAuthFormSubmit);
    }

    /**
     * Handles user logout.
     */
    function handleLogout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        updateNav(false);
        // Redirect to home page or login page if currently on a protected page
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


    // Initial check for authentication status on page load
    const token = localStorage.getItem('authToken');
    const userEmail = localStorage.getItem('userEmail');
    if (token && userEmail) {
        // TODO: Optionally verify token with a lightweight backend call here
        // For now, assume token is valid if present
        updateNav(true, userEmail);
    } else {
        updateNav(false);
    }
});
