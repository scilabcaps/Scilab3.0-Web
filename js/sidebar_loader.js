// Sidebar Loader - Loads the shared sidebar component
async function loadSidebar() {
    const header = document.querySelector('.dashboard-header');
    const currentPath = window.location.pathname;
    const isStudentOrProfessorPage = currentPath.includes('/pages/student/') || currentPath.includes('/pages/professor/');
    if (header && isStudentOrProfessorPage && !header.querySelector('.header-notifications')) {
        const notificationWrap = document.createElement('div');
        notificationWrap.className = 'header-notifications-wrap';
        notificationWrap.innerHTML = `
            <button type="button" class="header-notifications" aria-label="Notifications" title="Notifications" aria-expanded="false" aria-controls="userNotificationsPanel">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.25 2.25 0 0 0 2.24-2h-4.48A2.25 2.25 0 0 0 12 22Zm7-6-1.7-1.8V10a5.3 5.3 0 0 0-4.3-5.2V4a1 1 0 0 0-2 0v.8A5.3 5.3 0 0 0 6.7 10v4.2L5 16v1h14v-1Z"/></svg>
                <span class="notification-count" hidden></span>
            </button>
            <section class="notifications-panel" id="userNotificationsPanel" aria-label="Notifications" hidden>
                <div class="notifications-panel-header">
                    <h2>Notifications</h2>
                    <button type="button" class="notifications-mark-all" hidden>Mark all read</button>
                </div>
                <div class="notifications-list" aria-live="polite"></div>
            </section>
        `;
        const logoutControl = header.querySelector('.header-logout');
        header.insertBefore(notificationWrap, logoutControl || null);
        initUserNotifications(notificationWrap);
    }
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
        let sidebarPath = '../../components/professor_sidebar.txt';
        
        // Check user role from sessionStorage
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        // If we're in a professor page, adjust the path
        if (currentPath.includes('/pages/professor/')) {
            sidebarPath = '../../components/professor_sidebar.txt';
        } else if (currentPath.includes('/pages/student/') || currentPath.includes('/pages/shared_pages/')) {
            sidebarPath = '../../components/student_sidebar.txt';
        }
        
        const response = await fetch(sidebarPath, { cache: 'no-store' });
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

function initUserNotifications(wrapper) {
    const toggle = wrapper.querySelector('.header-notifications');
    const panel = wrapper.querySelector('.notifications-panel');
    const list = wrapper.querySelector('.notifications-list');
    const badge = wrapper.querySelector('.notification-count');
    const markAll = wrapper.querySelector('.notifications-mark-all');
    let recipientId = null;
    let notifications = [];

    const updateBadge = () => {
        const unread = notifications.filter(notification => !notification.is_read).length;
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.hidden = unread === 0;
        toggle.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
        markAll.hidden = unread === 0;
    };

    const notificationDestination = notification => {
        const pagePath = window.location.pathname;
        const isProfessor = pagePath.includes('/pages/professor/');
        const type = String(notification.type || '');
        const title = String(notification.title || '').toLowerCase();

        if (isProfessor && type === 'reservation_submitted') return 'student_approvals.html';
        if (isProfessor && type === 'reservation_reminder_day_before') return 'professor_my_upcoming.html';
        if (isProfessor && type === 'unreturned_items_student') return 'professor_unreturned.html';
        if (isProfessor && type === 'unreturned_items_owner') return 'professor_my_unreturned.html';
        if (!pagePath.includes('/pages/student/') || !notification.reservation_id) return null;
        if (type === 'reservation_reminder_day_before') return 'student_upcoming.html';
        if (type === 'unreturned_items_owner') return 'student_unreturned.html';
        if (title.includes('declined') || title.includes('cancelled')) return 'student_history.html';
        if (type === 'admin_approval_updated' && title.includes('approved')) return 'student_approved.html';
        if (type === 'professor_approval_updated') return 'student_pending.html';
        if (type === 'admin_approval_updated') return 'student_history.html';
        return null;
    };

    const markNotificationRead = async notificationId => {
        const notification = notifications.find(item => item.notification_id === notificationId);
        if (!notification || notification.is_read || !recipientId) return true;
        const { error } = await supabase
            .from('user_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('notification_id', notificationId)
            .eq('recipient_user_id', recipientId);
        if (error) {
            console.error('Unable to mark notification as read:', error);
            return false;
        }
        notification.is_read = true;
        updateBadge();
        return true;
    };

    const render = (message = '') => {
        list.replaceChildren();
        if (message) {
            const state = document.createElement('p');
            state.className = 'notifications-empty';
            state.textContent = message;
            list.appendChild(state);
            return;
        }
        if (!notifications.length) {
            const state = document.createElement('p');
            state.className = 'notifications-empty';
            state.textContent = 'You’re all caught up.';
            list.appendChild(state);
            return;
        }

        notifications.forEach(notification => {
            const item = document.createElement('article');
            item.className = `notification-item${notification.is_read ? '' : ' unread'}`;
            const destination = notificationDestination(notification);
            const content = destination ? document.createElement('a') : document.createElement('div');
            content.className = destination ? 'notification-open' : 'notification-content';
            if (destination) {
                content.href = `${destination}?reservation_id=${encodeURIComponent(notification.reservation_id)}`;
                content.dataset.notificationId = notification.notification_id;
            }
            const title = document.createElement('h3');
            title.textContent = notification.title;
            const messageText = document.createElement('p');
            messageText.textContent = notification.message;
            content.append(title, messageText);
            const meta = document.createElement('div');
            meta.className = 'notification-meta';
            const date = document.createElement('time');
            date.dateTime = notification.created_at;
            date.textContent = new Date(notification.created_at).toLocaleString();
            meta.appendChild(date);
            if (!notification.is_read) {
                const readButton = document.createElement('button');
                readButton.type = 'button';
                readButton.className = 'notification-mark-read';
                readButton.dataset.notificationId = notification.notification_id;
                readButton.textContent = 'Mark read';
                meta.appendChild(readButton);
            }
            item.append(content, meta);
            list.appendChild(item);
        });
    };

    const loadNotifications = async () => {
        list.innerHTML = '<p class="notifications-empty">Loading notifications…</p>';
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw authError || new Error('Please sign in to view notifications.');
            recipientId = user.id;
            const { data, error } = await supabase
                .from('user_notifications')
                .select('notification_id, title, message, type, reservation_id, is_read, created_at')
                .eq('recipient_user_id', recipientId)
                .order('created_at', { ascending: false })
                .limit(30);
            if (error) throw error;
            notifications = data || [];
            updateBadge();
            render();
        } catch (error) {
            console.error('Unable to load user notifications:', error);
            render('Could not load notifications. Please try again.');
        }
    };

    toggle.addEventListener('click', async () => {
        const isOpening = panel.hidden;
        panel.hidden = !isOpening;
        toggle.setAttribute('aria-expanded', String(isOpening));
        if (isOpening) await loadNotifications();
    });

    list.addEventListener('click', async event => {
        const openLink = event.target.closest('.notification-open');
        if (openLink) {
            event.preventDefault();
            await markNotificationRead(openLink.dataset.notificationId);
            window.location.assign(openLink.href);
            return;
        }
        const button = event.target.closest('.notification-mark-read');
        if (!button || !recipientId) return;
        button.disabled = true;
        const wasMarkedRead = await markNotificationRead(button.dataset.notificationId);
        if (!wasMarkedRead) {
            button.disabled = false;
            return;
        }
        render();
    });

    markAll.addEventListener('click', async () => {
        if (!recipientId) return;
        markAll.disabled = true;
        const { error } = await supabase
            .from('user_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('recipient_user_id', recipientId)
            .eq('is_read', false);
        markAll.disabled = false;
        if (error) {
            console.error('Unable to mark notifications as read:', error);
            return;
        }
        notifications = notifications.map(notification => ({ ...notification, is_read: true }));
        updateBadge();
        render();
    });

    document.addEventListener('click', event => {
        if (!wrapper.contains(event.target)) {
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) {
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.focus();
        }
    });

    loadNotifications();
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
