/**
 * Dialog/Modal Component
 * Reusable dialog for confirmations and prompts
 */

/**
 * Show a confirmation dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} confirmText - Text for confirm button (default: 'Confirm')
 * @param {string} cancelText - Text for cancel button (default: 'Cancel')
 * @param {string} type - Dialog type: 'danger', 'warning', 'info' (default: 'info')
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
function showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'info') {
    return new Promise((resolve) => {
        // Remove existing dialog if any
        const existingDialog = document.querySelector('.custom-dialog-overlay');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Create dialog elements
        const overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = `custom-dialog custom-dialog-${type}`;
        
        const icon = getDialogIcon(type);
        
        dialog.innerHTML = `
            <div class="custom-dialog-header">
                <div class="custom-dialog-title-wrapper">
                    <span class="custom-dialog-icon">${icon}</span>
                    <h3 class="custom-dialog-title">${title}</h3>
                </div>
                <button class="custom-dialog-close" onclick="closeCustomDialog(false)">&times;</button>
            </div>
            <div class="custom-dialog-body">
                <p class="custom-dialog-message">${message}</p>
            </div>
            <div class="custom-dialog-footer">
                <button class="custom-dialog-btn custom-dialog-btn-cancel" onclick="closeCustomDialog(false)">${cancelText}</button>
                <button class="custom-dialog-btn custom-dialog-btn-confirm" onclick="closeCustomDialog(true)">${confirmText}</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Store resolve function globally for the close function
        window.currentDialogResolve = resolve;
        
        // Show with animation
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeCustomDialog(false);
            }
        });
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeCustomDialog(false);
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    });
}

/**
 * Get icon HTML for dialog type
 * @param {string} type - The type of dialog
 * @returns {string} HTML string for the icon
 */
function getDialogIcon(type) {
    const icons = {
        danger: '⚠',
        warning: '⚠',
        info: 'ℹ',
        success: '✓'
    };
    return icons[type] || icons.info;
}

/**
 * Close the custom dialog
 * @param {boolean} confirmed - Whether the dialog was confirmed
 */
function closeCustomDialog(confirmed) {
    const overlay = document.querySelector('.custom-dialog-overlay');
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
    
    if (window.currentDialogResolve) {
        window.currentDialogResolve(confirmed);
        window.currentDialogResolve = null;
    }
}

/**
 * Show an alert dialog (no cancel option)
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} buttonText - Text for button (default: 'OK')
 * @param {string} type - Dialog type: 'danger', 'warning', 'info', 'success' (default: 'info')
 * @returns {Promise<void>} - Resolves when dialog is closed
 */
function showAlertDialog(title, message, buttonText = 'OK', type = 'info') {
    return new Promise((resolve) => {
        // Remove existing dialog if any
        const existingDialog = document.querySelector('.custom-dialog-overlay');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Create dialog elements
        const overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = `custom-dialog custom-dialog-${type}`;
        
        const icon = getDialogIcon(type);
        
        dialog.innerHTML = `
            <div class="custom-dialog-header">
                <div class="custom-dialog-title-wrapper">
                    <span class="custom-dialog-icon">${icon}</span>
                    <h3 class="custom-dialog-title">${title}</h3>
                </div>
                <button class="custom-dialog-close" onclick="closeAlertDialog()">&times;</button>
            </div>
            <div class="custom-dialog-body">
                <p class="custom-dialog-message">${message}</p>
            </div>
            <div class="custom-dialog-footer">
                <button class="custom-dialog-btn custom-dialog-btn-confirm" onclick="closeAlertDialog()">${buttonText}</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Store resolve function globally for the close function
        window.currentAlertResolve = resolve;
        
        // Show with animation
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAlertDialog();
            }
        });
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeAlertDialog();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    });
}

/**
 * Close the alert dialog
 */
function closeAlertDialog() {
    const overlay = document.querySelector('.custom-dialog-overlay');
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
    
    if (window.currentAlertResolve) {
        window.currentAlertResolve();
        window.currentAlertResolve = null;
    }
}
