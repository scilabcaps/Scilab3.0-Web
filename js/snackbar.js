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
    
    // Get icon based on type
    const icon = getSnackbarIcon(type);
    
    snackbar.innerHTML = `
        <span class="snackbar-icon">${icon}</span>
        <span class="snackbar-message">${message}</span>
    `;

    // Add to DOM
    document.body.appendChild(snackbar);

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
