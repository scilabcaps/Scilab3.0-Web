/**
 * modal.js
 * Reusable modal component for displaying content dynamically
 */

class Modal {
    constructor(modalId) {
        this.modalId = modalId;
        this.modal = document.getElementById(modalId);
        this.modalContent = this.modal?.querySelector('.modal-content');
        this.modalBody = this.modal?.querySelector('.modal-body');
        this.closeBtn = this.modal?.querySelector('.modal-close');
        
        this.init();
    }

    init() {
        if (!this.modal) {
            console.error(`Modal with id "${this.modalId}" not found`);
            return;
        }

        // Close on X button click
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    }

    open(title, content) {
        if (!this.modal) return;

        // Set title if provided
        const titleElement = this.modal.querySelector('.modal-title');
        if (titleElement && title) {
            titleElement.textContent = title;
        }

        // Set content
        if (this.modalBody && content) {
            this.modalBody.innerHTML = content;
        }

        // Show modal
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        if (!this.modal) return;

        this.modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    setContent(content) {
        if (this.modalBody) {
            this.modalBody.innerHTML = content;
        }
    }

    setTitle(title) {
        const titleElement = this.modal.querySelector('.modal-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
}
