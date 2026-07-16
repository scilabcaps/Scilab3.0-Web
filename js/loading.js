/**
 * Loading State Manager
 * Reusable component for managing loading states on buttons and elements
 */

/**
 * Set loading state on a button
 * @param {string|HTMLElement} button - Button element or ID
 * @param {boolean} isLoading - Whether to show loading state
 * @param {string} originalText - Original button text to restore
 * @param {string} loadingText - Text to show while loading (default: 'Loading...')
 */
function setButtonLoading(button, isLoading, originalText = null, loadingText = 'Loading...') {
    const btn = typeof button === 'string' ? document.getElementById(button) : button;
    if (!btn) return;

    if (isLoading) {
        // Store original text if not provided
        if (!originalText) {
            btn.dataset.originalText = btn.textContent;
        } else {
            btn.dataset.originalText = originalText;
        }

        // Disable button and show loading state
        btn.disabled = true;
        btn.dataset.loading = 'true';
        btn.textContent = loadingText;
        btn.classList.add('loading');
    } else {
        // Restore button state
        btn.disabled = false;
        btn.dataset.loading = 'false';
        btn.textContent = btn.dataset.originalText || originalText || btn.textContent;
        btn.classList.remove('loading');
        delete btn.dataset.originalText;
    }
}

/**
 * Set loading state on a button with spinner
 * @param {string|HTMLElement} button - Button element or ID
 * @param {boolean} isLoading - Whether to show loading state
 * @param {string} originalText - Original button text to restore
 * @param {string} loadingText - Text to show while loading (default: 'Loading...')
 */
function setButtonLoadingWithSpinner(button, isLoading, originalText = null, loadingText = 'Loading...') {
    const btn = typeof button === 'string' ? document.getElementById(button) : button;
    if (!btn) return;

    if (isLoading) {
        // Store original text if not provided
        if (!originalText) {
            btn.dataset.originalText = btn.textContent;
        } else {
            btn.dataset.originalText = originalText;
        }

        // Disable button and show loading state with spinner
        btn.disabled = true;
        btn.dataset.loading = 'true';
        btn.innerHTML = `
            <span class="spinner"></span>
            <span>${loadingText}</span>
        `;
        btn.classList.add('loading-with-spinner');
    } else {
        // Restore button state
        btn.disabled = false;
        btn.dataset.loading = 'false';
        btn.textContent = btn.dataset.originalText || originalText || btn.textContent;
        btn.classList.remove('loading-with-spinner');
        delete btn.dataset.originalText;
    }
}

/**
 * Check if an element is in loading state
 * @param {string|HTMLElement} element - Element or ID
 * @returns {boolean} Whether the element is loading
 */
function isLoading(element) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    return el ? el.dataset.loading === 'true' : false;
}

/**
 * Set loading state on multiple buttons
 * @param {Array<string|HTMLElement>} buttons - Array of button elements or IDs
 * @param {boolean} isLoading - Whether to show loading state
 * @param {string} loadingText - Text to show while loading (default: 'Loading...')
 */
function setMultipleButtonsLoading(buttons, isLoading, loadingText = 'Loading...') {
    buttons.forEach(button => {
        setButtonLoading(button, isLoading, null, loadingText);
    });
}
