// Sidebar Loader - Loads the shared sidebar component
async function loadSidebar() {
    const header = document.querySelector('.dashboard-header');
    if (header && !header.querySelector('.header-logout')) {
        const logoutButton = document.createElement('button');
        logoutButton.type = 'button';
        logoutButton.className = 'header-logout';
        logoutButton.setAttribute('aria-label', 'Log out');
        logoutButton.title = 'Log out';
        logoutButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z"/></svg>';
        logoutButton.addEventListener('click', () => logout());
        header.appendChild(logoutButton);
    }
    try {
        // Determine the correct path based on current location
        const currentPath = window.location.pathname;
        let sidebarPath = '../../components/professor_sidebar.html';
        
        // Check user role from sessionStorage
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        // If we're in a professor page, adjust the path
        if (currentPath.includes('/pages/professor/')) {
            sidebarPath = '../../components/professor_sidebar.html';
        } else if (currentPath.includes('/pages/student/') || currentPath.includes('/pages/shared_pages/')) {
            sidebarPath = '../../components/student_sidebar.html';
        }
        
        const response = await fetch(sidebarPath);
        if (!response.ok) {
            throw new Error(`Failed to load sidebar: ${response.status}`);
        }
        const sidebarHTML = await response.text();

        // Insert sidebar at the beginning of dashboard-container
        const dashboardContainer = document.querySelector('.dashboard-container');
        if (dashboardContainer) {
            dashboardContainer.insertAdjacentHTML('afterbegin', sidebarHTML);

            // Wait a brief moment for DOM to update
            setTimeout(() => {
                // Set active navigation item based on current page
                setActiveNavItem();

                // Update user information
                updateUserInfo();

                // Initialize dropdown toggles
                initDropdowns();
            }, 50);
        }

    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

function setActiveNavItem() {
    const currentPage = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
            // Open parent dropdown if this link is inside one
            const parentDropdown = link.closest('.dropdown');
            if (parentDropdown) {
                parentDropdown.classList.add('open');
            }
        }
    });
}

function updateUserInfo() {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username) {
        const fullName = user.firstname + ' ' + user.lastname;
        const userNameSidebar = document.getElementById('userNameSidebar');
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');

        if (userNameSidebar) {
            userNameSidebar.textContent = fullName;
        }
        if (userName) {
            userName.textContent = fullName;
        }
        if (userAvatar) {
            userAvatar.textContent = (user.firstname.charAt(0) + user.lastname.charAt(0)).toUpperCase();
        }
    }
}

function initDropdowns() {
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const dropdown = this.closest('.dropdown');
            
            // Close other dropdowns
            document.querySelectorAll('.dropdown.open').forEach(openDropdown => {
                if (openDropdown !== dropdown) {
                    openDropdown.classList.remove('open');
                }
            });
            
            // Toggle current dropdown
            dropdown.classList.toggle('open');
        });
    });
}

// Load sidebar when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSidebar);
} else {
    loadSidebar();
}
