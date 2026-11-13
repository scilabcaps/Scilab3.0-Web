/**
 * Professor Dashboard Module
 * Handles professor dashboard functionality and user info display
 */

class ProfessorDashboard {
    constructor() {
        this.user = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadUserInfo();
    }

    setupEventListeners() {
        // DOM ready event
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
        } else {
            this.onDOMReady();
        }
    }

    onDOMReady() {
        this.user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        if (this.user.username && this.user.role === 'Professor') {
            this.loadUserInfo();
            this.updateWelcomeMessage();
        } else {
            window.location.href = '../../index.html';
        }
    }

    loadUserInfo() {
        if (!this.user || !this.user.firstname) {
            console.warn('User information not found in session');
            return;
        }

        const firstName = this.user.firstname || 'Professor';
        const lastName = this.user.lastname || 'User';
        const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
        const fullName = firstName + ' ' + lastName;

        // Update all user-related elements
        this.updateElement('userName', fullName);
        this.updateElement('userNameSidebar', fullName);
        this.updateElement('userAvatar', initials);

        // Update welcome message
        this.updateWelcomeMessage();
    }

    updateElement(elementId, content) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = content;
        }
    }

    updateWelcomeMessage() {
        if (!this.user || !this.user.firstname) return;

        const welcomeTitle = document.querySelector('.dashboard-title');
        if (welcomeTitle) {
            const firstName = this.user.firstname;
            welcomeTitle.textContent = `Welcome, Professor ${firstName}!`;
        }
    }

    // Navigation helper
    navigateTo(page) {
        window.location.href = page;
    }

    // Refresh dashboard data
    refresh() {
        this.loadUserInfo();
    }

    // Get current user info
    getUserInfo() {
        return this.user;
    }

    // Check if user is authenticated as professor
    isAuthenticated() {
        return this.user && this.user.username && this.user.role === 'Professor';
    }
}

// Initialize the module
const professorDashboard = new ProfessorDashboard();

// Make it globally accessible for onclick handlers
window.professorDashboard = professorDashboard;

// Also make navigateTo globally available for existing onclick handlers
window.navigateTo = (page) => professorDashboard.navigateTo(page);
