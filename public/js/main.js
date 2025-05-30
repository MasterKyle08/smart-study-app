/**
 * @file public/js/main.js
 * @description Main JavaScript file for index.html. Initializes UI components and event listeners.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements and event listeners for index.html

    // Setup tabs for the results section
    setupTabs('#resultsSection .tabs'); // ui.js function

    // Setup copy and download buttons
    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const contentElement = document.getElementById(targetId);
            if (contentElement) {
                const textToCopy = contentElement.tagName === 'TEXTAREA' ? contentElement.value : contentElement.textContent;
                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                        // Briefly change button text or show a small notification
                        const originalText = event.target.textContent;
                        event.target.textContent = 'Copied!';
                        setTimeout(() => event.target.textContent = originalText, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy text: ', err);
                        // Fallback for older browsers if navigator.clipboard is not available
                        // or if execCommand is preferred due to iframe restrictions (though less likely here)
                        try {
                            const textArea = document.createElement("textarea");
                            textArea.value = textToCopy;
                            textArea.style.position = "fixed"; // Hide it
                            document.body.appendChild(textArea);
                            textArea.focus();
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            const originalText = event.target.textContent;
                            event.target.textContent = 'Copied!';
                            setTimeout(() => event.target.textContent = originalText, 1500);
                        } catch (execErr) {
                            console.error('Fallback copy failed: ', execErr);
                            alert('Failed to copy text. Please try manually.');
                        }
                    });
            }
        });
    });

    document.querySelectorAll('.download-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const filename = event.target.dataset.filename || 'download.txt';
            const contentElement = document.getElementById(targetId);
            if (contentElement) {
                const textToDownload = contentElement.tagName === 'TEXTAREA' ? contentElement.value : contentElement.textContent;
                const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    });
    
    // Set current year in footer
    setCurrentYear('currentYear'); // ui.js function

    // Initial check for auth status (already handled by auth.js, but good for clarity)
    // const token = localStorage.getItem('authToken');
    // const userEmail = localStorage.getItem('userEmail');
    // if (token && userEmail) {
    //     updateNav(true, userEmail); // ui.js
    // } else {
    //     updateNav(false); // ui.js
    // }
    // Note: auth.js already calls updateNav on DOMContentLoaded.
});
