// Main JavaScript file for common functionality

function formatResourceCell(resources, fallback = 'No resources specified') {
    if (!Array.isArray(resources) || resources.length === 0) {
        return `<span class="resource-cell-empty">${escapeResourceCellText(fallback)}</span>`;
    }

    return `<div class="resource-cell-list">${resources.map(resource => {
        const entry = typeof resource === 'string' ? { name: resource } : resource;
        const name = escapeResourceCellText(entry.name || '');
        const meta = entry.meta ? ` <span class="resource-cell-meta">(${escapeResourceCellText(entry.meta)})</span>` : '';
        return `<div class="resource-cell-item">${name}${meta}</div>`;
    }).join('')}</div>`;
}

function escapeResourceCellText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
}

function renderReservationDetails(fields = [], resources = [], options = {}) {
    const escape = escapeResourceCellText;
    const fieldMarkup = fields.filter(field => field && field.value !== undefined && field.value !== null && field.value !== '')
        .map(field => `<div class="reservation-detail-field"><strong>${escape(field.label)}</strong><span>${escape(field.value)}</span></div>`).join('');
    const resourceMarkup = resources.map(resource => `
        <article class="reservation-detail-resource">
            <h3>${escape(resource.name || 'Resource')}</h3>
            ${resource.type ? `<p class="reservation-detail-type">${escape(resource.type)}</p>` : ''}
            ${(resource.details || []).map(detail => `<p><strong>${escape(detail.label)}:</strong> ${escape(detail.value)}</p>`).join('')}
        </article>
    `).join('');

    return `<div class="reservation-detail-layout">
        <div class="reservation-detail-grid">${fieldMarkup}</div>
        ${options.note ? `<section class="reservation-detail-note"><h3>Additional Note</h3><p>${escape(options.note)}</p></section>` : ''}
        <h3 class="reservation-detail-heading">Resources</h3>
        <div class="reservation-detail-resources">${resourceMarkup || `<p class="reservation-detail-empty">${escape(options.emptyResources || 'No resources were recorded for this reservation.')}</p>`}</div>
    </div>`;
}

function reservationWasDeclined(reservation) {
    const declinedStates = new Set(['declined', 'rejected']);
    const approvalStates = [reservation?.status, reservation?.professor_approval, reservation?.admin_approval]
        .map(value => String(value || '').trim().toLowerCase());

    return approvalStates.some(status => declinedStates.has(status));
}

function getReservationAssetDetails(reservation, item) {
    if (reservationWasDeclined(reservation)) return [{ label: 'Issuance', value: 'Not issued — reservation declined' }];

    const borrowed = Number(item?.quantity_borrowed) || 0;
    const returned = Number(item?.quantity_returned) || 0;
    return [
        { label: 'Borrowed', value: borrowed },
        { label: 'Returned', value: returned },
        { label: 'Still in hand', value: Math.max(0, borrowed - returned) }
    ];
}

function getReservationChemicalDetails(reservation, usage) {
    if (reservationWasDeclined(reservation)) return [{ label: 'Usage', value: 'Not used — reservation declined' }];

    const amount = usage?.quantity_used ?? 0;
    const unit = usage?.unit ? ` ${usage.unit}` : '';
    return [{ label: 'Used', value: `${amount}${unit}` }];
}

// Keep the local Supabase session as the source of truth for authentication.
// A transient getUser() failure should not eject a user who still has a valid
// locally cached session; only an actually missing session should redirect.
async function getCurrentAuthUser() {
    if (!window.supabase?.auth) {
        return { user: null, error: new Error('Supabase authentication is unavailable.') };
    }

    const { data: sessionData, error: sessionError } = await window.supabase.auth.getSession();
    if (sessionError) {
        console.warn('Unable to read the current auth session:', sessionError);
        return { user: null, error: sessionError, transient: true };
    }

    const sessionUser = sessionData?.session?.user || null;
    if (!sessionUser) return { user: null, error: null, transient: false };

    const { data: userData, error: userError } = await window.supabase.auth.getUser();
    if (userError) {
        console.warn('Unable to validate the auth session right now:', userError);
        return { user: sessionUser, error: userError, transient: true };
    }

    return { user: userData?.user || sessionUser, error: null, transient: false };
}

// Toggle password visibility
function togglePassword(inputId = 'password') {
    const input = document.getElementById(inputId);
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
}

// Logout function
function logout() {
    let modal = document.getElementById('logoutModal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="logoutModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Confirm Logout</h3>
                        <button class="modal-close" onclick="cancelLogout()" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body"><p>Are you sure you want to log out?</p></div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="cancelLogout()">Cancel</button>
                        <button class="btn-primary" onclick="confirmLogout()">Log out</button>
                    </div>
                </div>
            </div>`);
        modal = document.getElementById('logoutModal');
    }
    if (modal) {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Confirm Logout');
        modal.style.display = 'flex';
        modal.querySelector('.btn-secondary').focus();
    }
}

// Confirm logout
async function confirmLogout() {
    try {
        const { error } = await window.supabase.auth.signOut();
        if (error) throw error;
        sessionStorage.removeItem('user');
        window.location.href = '/index.html';
    } catch (error) {
        console.error('Logout failed:', error);
        alert('Unable to log out. Please try again.');
    }
}

// Cancel logout
function cancelLogout() {
    const modal = document.getElementById('logoutModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Navigation function
function navigateTo(page) {
    window.location.href = page;
}

// Set active navigation link based on current page
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || window.location.href.split('/').pop();
    console.log('Current page detected:', currentPage); // Debug log
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        console.log('Checking link href:', href, 'against current page:', currentPage); // Debug log
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Initialize sidebar user info
function initSidebarUser() {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    if (user.firstname) {
        const firstName = user.firstname || 'User';
        const lastName = user.lastname || '';
        const initials = (firstName.charAt(0) + (lastName ? lastName.charAt(0) : firstName.charAt(1) || '')).toUpperCase();
        const fullName = firstName + ' ' + lastName;
        
        if (userAvatar) userAvatar.textContent = initials;
        if (userName) userName.textContent = fullName;
    }
}

// Load sidebar component dynamically
async function loadSidebarComponent(containerId, sidebarPath) {
    const container = document.getElementById(containerId);
    if (container) {
        try {
            const response = await fetch(sidebarPath);
            if (response.ok) {
                const sidebarHTML = await response.text();
                container.innerHTML = sidebarHTML;
                // Initialize sidebar after loading
                setActiveNavLink();
                initSidebarUser();
            }
        } catch (error) {
            console.error('Error loading sidebar:', error);
        }
    }
}

// Initialize sidebar on page load
document.addEventListener('DOMContentLoaded', function() {
    setActiveNavLink();
    initSidebarUser();
});

// Keep the dashboard shell mounted while navigating between dashboard pages.
// Destination pages still provide their own main content and page-specific scripts.
(function initContentNavigation() {
    const dashboardPath = /\/pages\/(student|professor)\//;
    const sharedScripts = new Set([
        'sidebar_loader.js',
        'main.js',
        'supabase.js'
    ]);
    let navigationInProgress = false;

    const isInternalDashboardLink = link => {
        if (!link || !link.href || link.target === '_blank' || link.hasAttribute('download')) return false;
        const url = new URL(link.href, window.location.href);
        return url.origin === window.location.origin
            && dashboardPath.test(url.pathname)
            && url.pathname.endsWith('.html');
    };

    const loadPageAssets = (documentFragment, pageUrl) => {
        [...documentFragment.querySelectorAll('link[rel="stylesheet"]')].forEach(sourceLink => {
            const stylesheetUrl = new URL(sourceLink.getAttribute('href'), pageUrl);
            const alreadyLoaded = [...document.querySelectorAll('link[rel="stylesheet"]')]
                .some(link => new URL(link.href, window.location.href).href === stylesheetUrl.href);
            if (alreadyLoaded) return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = stylesheetUrl.href;
            link.dataset.contentAsset = stylesheetUrl.href;
            document.head.appendChild(link);
        });

        documentFragment.querySelectorAll('style').forEach(sourceStyle => {
            const style = document.createElement('style');
            style.textContent = sourceStyle.textContent;
            style.dataset.contentAsset = 'true';
            document.head.appendChild(style);
        });
    };

    const syncPageOverlays = documentFragment => {
        const currentOverlays = [...document.querySelectorAll('.modal')]
            .filter(overlay => overlay.id !== 'logoutModal');
        currentOverlays.forEach(overlay => overlay.remove());

        documentFragment.querySelectorAll('.modal').forEach(overlay => {
            if (overlay.id !== 'logoutModal') {
                document.body.appendChild(overlay.cloneNode(true));
            }
        });
    };

    const loadPageScripts = async (documentFragment, pageUrl) => {
        const scripts = [...documentFragment.querySelectorAll('script[src], script:not([src]):not([type])')];
        const externalScripts = scripts.filter(sourceScript => sourceScript.src);
        const inlineScripts = scripts.filter(sourceScript => !sourceScript.src && sourceScript.textContent.trim());

        for (const sourceScript of externalScripts) {
            if (sourceScript.src) {
                const scriptUrl = new URL(sourceScript.getAttribute('src'), pageUrl);
                const fileName = scriptUrl.pathname.split('/').pop();
                const alreadyLoaded = [...document.scripts].some(script => {
                    if (!script.src) return false;
                    return new URL(script.src, window.location.href).href === scriptUrl.href;
                });
                if (sharedScripts.has(fileName) || alreadyLoaded) continue;

                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = scriptUrl.href;
                    script.dataset.contentScript = scriptUrl.href;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.body.appendChild(script);
                });
            }
        }

        inlineScripts.forEach(sourceScript => {
            const script = document.createElement('script');
            script.textContent = sourceScript.textContent;
            document.body.appendChild(script);
        });
    };

    const renderPage = async (url, { pushState = true } = {}) => {
        if (navigationInProgress) return;
        navigationInProgress = true;
        const currentMain = document.querySelector('.dashboard-main');
        const sharedHeaderControls = currentMain
            ? [...currentMain.querySelectorAll('.header-notifications-wrap, .header-logout')]
            : [];

        try {
            const response = await fetch(url.href, { headers: { 'X-Content-Navigation': 'true' } });
            if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);

            const html = await response.text();
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            const nextMain = parsed.querySelector('.dashboard-main');
            if (!currentMain || !nextMain) throw new Error('Destination does not contain dashboard content');

            loadPageAssets(parsed, url.href);
            syncPageOverlays(parsed);
            currentMain.replaceWith(nextMain);
            const nextHeader = nextMain.querySelector('.dashboard-header');
            if (nextHeader) {
                const nextLogout = nextHeader.querySelector('.header-logout');
                sharedHeaderControls.forEach(control => {
                    if (control.classList.contains('header-notifications-wrap')) {
                        nextHeader.insertBefore(control, nextLogout || null);
                    } else {
                        nextHeader.appendChild(control);
                    }
                });
            }
            document.title = parsed.title || document.title;
            if (pushState) window.history.pushState({}, '', url.href);
            if (typeof setActiveNavItem === 'function') setActiveNavItem();
            await loadPageScripts(parsed, url.href);
            window.dispatchEvent(new CustomEvent('content:navigation', {
                detail: { path: url.pathname }
            }));
            window.__contentNavigationRefresh = true;
            document.dispatchEvent(new Event('DOMContentLoaded'));
            window.dispatchEvent(new Event('DOMContentLoaded'));
            window.__contentNavigationRefresh = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        } catch (error) {
            console.error('Content navigation failed; using normal navigation:', error);
            window.location.assign(url.href);
        } finally {
            navigationInProgress = false;
        }
    };

    document.addEventListener('click', event => {
        const link = event.target.closest('a.nav-link');
        if (!isInternalDashboardLink(link)) return;
        event.preventDefault();

        renderPage(new URL(link.href));
    });

    window.addEventListener('popstate', () => {
        const url = new URL(window.location.href);
        if (dashboardPath.test(url.pathname)) renderPage(url, { pushState: false });
    });
})();

// Handle login form submission - Supabase authentication
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('email')?.value || document.getElementById('username')?.value;
            const password = document.getElementById('password').value;
            
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) throw error;
                
                // Fetch user role from user_info table
                const { data: userData, error: userError } = await supabase
                    .from('user_info')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();
                
                if (userError) {
                    await supabase.auth.signOut();
                    sessionStorage.removeItem('user');
                    throw userError;
                }

                // Authentication success does not mean the application account is
                // approved. Deny every state except the explicit approved value.
                if (userData.isApproved !== 1) {
                    await supabase.auth.signOut();
                    sessionStorage.removeItem('user');

                    throw new Error(userData.isApproved === 2
                        ? 'Your account has been rejected. Please contact an authorized person.'
                        : 'Your account is waiting for approval by an authorized person.');
                }
                
                sessionStorage.setItem('user', JSON.stringify(userData));
                
                // Redirect based on role
                if (userData.role === 'Professor') {
                    window.location.href = '/pages/professor/professor_dashboard.html';
                } else {
                    window.location.href = '/pages/student/student_dashboard.html';
                }
            } catch (error) {
                console.error('Login error:', error);
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = error.message || 'Invalid email or password';
                    errorMsg.style.display = 'block';
                } else {
                    alert(error.message || 'Invalid email or password');
                }
            }
        });
    }

    // Handle signup form submission - Supabase authentication
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const firstname = document.getElementById('firstname').value;
            const lastname = document.getElementById('lastname').value;
            
            if (password !== confirmPassword) {
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = 'Passwords do not match';
                    errorMsg.style.display = 'block';
                } else {
                    alert('Passwords do not match');
                }
                return;
            }

            try {
                // Create auth user
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: email,
                    password: password
                });
                
                if (authError) throw authError;
                
                // Create user info record
                const { error: userError } = await supabase
                    .from('user_info')
                    .insert({
                        email: email,
                        first_name: firstname,
                        last_name: lastname,
                        role: 'Student',
                        is_banned: false
                    });
                
                if (userError) throw userError;
                
                alert('Account created successfully! Please login.');
                window.location.href = '../index.html';
            } catch (error) {
                console.error('Signup error:', error);
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = error.message || 'Error creating account';
                    errorMsg.style.display = 'block';
                } else {
                    alert(error.message || 'Error creating account');
                }
            }
        });
    }
});

// Close modal when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

