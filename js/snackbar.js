/**
 * Snackbar Notification System
 * Reusable snackbar component for showing success, error, warning, and info messages
 */

/**
 * Show a snackbar notification
 * @param {string} message - The message to display
 * @param {string} type - The type of snackbar: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showSnackbar(message, type = 'info', duration = 3000) {
    // Remove existing snackbar if any
    const existingSnackbar = document.querySelector('.snackbar');
    if (existingSnackbar) {
        existingSnackbar.remove();
    }

    // Create snackbar element
    const snackbar = document.createElement('div');
    snackbar.className = `snackbar ${type}`;
    snackbar.setAttribute('role', type === 'error' ? 'alert' : 'status');
    snackbar.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    
    // Get icon based on type
    const icon = getSnackbarIcon(type);
    
    snackbar.innerHTML = `
        <span class="snackbar-icon">${icon}</span>
        <span class="snackbar-message">${message}</span>
    `;

    // Native dialogs render in the browser top layer, above body-level fixed elements.
    // Place the snackbar inside the topmost open dialog so it remains visible there.
    const getSnackbarHost = () => {
        const openDialogs = [...document.querySelectorAll('dialog[open]')];
        return openDialogs.at(-1) || document.body;
    };
    const host = getSnackbarHost();
    host.appendChild(snackbar);

    if (host instanceof HTMLDialogElement) {
        host.addEventListener('close', () => {
            if (snackbar.isConnected) getSnackbarHost().appendChild(snackbar);
        }, { once: true });
    }

    // Trigger animation
    setTimeout(() => {
        snackbar.classList.add('show');
    }, 10);

    // Remove after duration
    setTimeout(() => {
        snackbar.classList.remove('show');
        setTimeout(() => {
            snackbar.remove();
        }, 300);
    }, duration);
}

/**
 * Get icon HTML for snackbar type
 * @param {string} type - The type of snackbar
 * @returns {string} HTML string for the icon
 */
function getSnackbarIcon(type) {
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    return icons[type] || icons.info;
}

/**
 * Show success snackbar
 * @param {string} message - The message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showSuccessSnackbar(message, duration = 3000) {
    showSnackbar(message, 'success', duration);
}

/**
 * Show error snackbar
 * @param {string} message - The message to display
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
function showErrorSnackbar(message, duration = 4000) {
    showSnackbar(message, 'error', duration);
}

/**
 * Show warning snackbar
 * @param {string} message - The message to display
 * @param {number} duration - Duration in milliseconds (default: 3500)
 */
function showWarningSnackbar(message, duration = 3500) {
    showSnackbar(message, 'warning', duration);
}

/**
 * Show info snackbar
 * @param {string} message - The message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showInfoSnackbar(message, duration = 3000) {
    showSnackbar(message, 'info', duration);
}
