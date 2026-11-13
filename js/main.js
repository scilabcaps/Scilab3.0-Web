// Main JavaScript file for common functionality

// Remove data saved by the former page-level reservation and approval caches.
try {
    const retiredCacheKeys = new Set([
        'professor_history_cache_v3',
        'professor_approved_cache_v4',
        'professor_unreturned_cache_v5'
    ]);
    const retiredCachePrefixes = [
        'account_approvals_cache:',
        'professor_pending_cache:',
        'student_approvals_cache:'
    ];
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (retiredCacheKeys.has(key) || retiredCachePrefixes.some(prefix => key?.startsWith(prefix))) {
            localStorage.removeItem(key);
        }
    }
} catch (error) {
    console.warn('Unable to clear retired page cache entries:', error);
}

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

function getTableColumnCount(tbody) {
    const headerRow = tbody?.closest('table')?.querySelector('thead tr:last-child');
    if (!headerRow) return 1;

    return [...headerRow.cells].reduce((count, cell) => count + (Number(cell.colSpan) || 1), 0);
}

function showTableLoadingState(tbody, message = 'Loading…') {
    if (!tbody) return;

    const normalizedText = tbody.textContent.trim().toLowerCase();
    const hasRows = tbody.children.length > 0;
    const isLoadingRow = hasRows && normalizedText.startsWith('loading');
    if (hasRows && !isLoadingRow) return;

    const colspan = getTableColumnCount(tbody);
    tbody.innerHTML = `
        <tr class="table-loading-row" aria-busy="true">
            <td colspan="${colspan}">
                <span class="table-loading-content" role="status" aria-live="polite">
                    <span class="table-loading-spinner" aria-hidden="true"></span>
                    <span>${message}</span>
                </span>
            </td>
        </tr>
    `;
}

function initializeTableLoadingStates() {
    document.querySelectorAll('table tbody').forEach(tbody => showTableLoadingState(tbody));
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

const APP_REALTIME_TABLES = [
    'reservations',
    'reservation_items',
    'chemical_usage',
    'user_info',
    'rooms',
    'lab_assets',
    'chemicals',
    'announcement',
    'user_notifications'
];

const APP_REALTIME_PAGE_TABLES = {
    'student_approvals.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info'],
    'account_approvals.html': ['user_info'],
    'professor_pending_approval.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'student_approved_reservation.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'professor_reservation_history.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'professor_my_upcoming.html': ['reservations', 'reservation_items', 'chemical_usage', 'rooms', 'lab_assets', 'chemicals'],
    'professor_unreturned.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'professor_my_unreturned.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'student_pending.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'student_upcoming.html': ['reservations', 'reservation_items', 'chemical_usage', 'rooms', 'lab_assets', 'chemicals'],
    'student_approved.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'student_history.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'student_unreturned.html': ['reservations', 'reservation_items', 'user_info', 'lab_assets'],
    'student_upcoming_reservations.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'history_reports.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'reservation_reports.html': ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals'],
    'reservation_student.html': ['reservations', 'reservation_items', 'chemical_usage', 'rooms', 'lab_assets', 'chemicals'],
    'professor_new_reservation.html': ['reservations', 'reservation_items', 'chemical_usage', 'rooms', 'lab_assets', 'chemicals'],
    'student_dashboard.html': ['reservations', 'user_info', 'announcement'],
    'professor_dashboard.html': ['reservations', 'user_info', 'announcement'],
    'settings.html': ['user_info']
};

let appRealtimeRefreshTimer = null;
let appRealtimeFormRefreshTimer = null;
let approvedReservationPromotionTimer = null;
let approvedReservationPromotionPromise = null;

function getManilaDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function manilaReservationInterval(reservation) {
    const date = reservation?.reservation_date;
    const startTime = String(reservation?.start_time || '').slice(0, 8);
    const endTime = String(reservation?.end_time || '').slice(0, 8);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) || !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)) return null;

    const normalizedStart = startTime.length === 5 ? `${startTime}:00` : startTime;
    const normalizedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;
    const startAt = Date.parse(`${date}T${normalizedStart}+08:00`);
    let endAt = Date.parse(`${date}T${normalizedEnd}+08:00`);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return null;
    if (endAt <= startAt) endAt += 24 * 60 * 60 * 1000;
    return { startAt, endAt };
}

async function promoteActiveApprovedReservations() {
    if (approvedReservationPromotionPromise) return approvedReservationPromotionPromise;
    if (!window.supabase?.from || !window.supabase?.auth) return;
    approvedReservationPromotionPromise = (async () => {
        const authResult = await window.supabase.auth.getSession();
        if (authResult.error || !authResult.data?.session) return;

        const today = getManilaDateString();
        const yesterdayDate = new Date(Date.parse(`${today}T00:00:00+08:00`) - 24 * 60 * 60 * 1000);
        const yesterday = getManilaDateString(yesterdayDate);
        const { data: reservations, error } = await window.supabase
            .from('reservations')
            .select('reservation_id, reservation_date, start_time, end_time')
            .eq('status', 'Approved')
            .eq('professor_approval', 'Approved')
            .eq('admin_approval', 'Approved')
            .gte('reservation_date', yesterday)
            .lte('reservation_date', today);

        if (error) throw error;
        const now = Date.now();
        const activeIds = (reservations || []).filter(reservation => {
            const interval = manilaReservationInterval(reservation);
            return interval && interval.startAt <= now && now < interval.endAt;
        }).map(reservation => reservation.reservation_id).filter(id => id !== null && id !== undefined);
        if (!activeIds.length) return;

        const { error: updateError } = await window.supabase
            .from('reservations')
            .update({ status: 'Ongoing', updated_at: new Date(now).toISOString() })
            .in('reservation_id', activeIds)
            .eq('status', 'Approved')
            .eq('professor_approval', 'Approved')
            .eq('admin_approval', 'Approved');
        if (updateError) throw updateError;
        refreshCurrentDataPage('reservations');
    })();

    try {
        return await approvedReservationPromotionPromise;
    } catch (error) {
        console.warn('Unable to promote active approved reservations:', error);
    } finally {
        approvedReservationPromotionPromise = null;
    }
}

function startApprovedReservationPromotionChecks() {
    if (!approvedReservationPromotionTimer) {
        approvedReservationPromotionTimer = setInterval(() => {
            if (document.visibilityState === 'visible') promoteActiveApprovedReservations();
        }, 60 * 1000);
    }
    return promoteActiveApprovedReservations();
}

function stopApprovedReservationPromotionChecks() {
    if (approvedReservationPromotionTimer) clearInterval(approvedReservationPromotionTimer);
    approvedReservationPromotionTimer = null;
}

function getRealtimeSessionUser() {
    try {
        return JSON.parse(sessionStorage.getItem('user') || '{}');
    } catch (error) {
        return {};
    }
}

function refreshRealtimePageInPlace(pageName, changedTable = null) {
    const user = getRealtimeSessionUser();
    const reservationChanged = !changedTable || ['reservations', 'reservation_items', 'chemical_usage', 'rooms', 'lab_assets', 'chemicals', 'user_info'].includes(changedTable);

    if (pageName === 'student_dashboard.html') {
        if (changedTable === 'announcement') {
            if (typeof loadAnnouncements === 'function') loadAnnouncements();
            return;
        }
        if (!changedTable && typeof loadAnnouncements === 'function') loadAnnouncements();
        if (reservationChanged) {
            if (typeof loadStudentData === 'function') loadStudentData();
            if (typeof updateWeekDisplay === 'function') updateWeekDisplay();
        }
        return;
    }

    if (pageName === 'professor_dashboard.html') {
        if (changedTable === 'announcement') {
            if (typeof loadAnnouncements === 'function') loadAnnouncements();
            return;
        }
        if (!changedTable && typeof loadAnnouncements === 'function') loadAnnouncements();
        if (reservationChanged) {
            if (typeof loadProfessorData === 'function') loadProfessorData();
            if (typeof loadStudentRequests === 'function') loadStudentRequests();
            if (typeof loadUpcomingReservations === 'function') loadUpcomingReservations();
            if (typeof updateProfessorWeekDisplay === 'function') updateProfessorWeekDisplay();
        }
        return;
    }

    if (pageName === 'student_approvals.html' && typeof StudentApprovals !== 'undefined') return StudentApprovals.loadPendingRequests();
    if (pageName === 'account_approvals.html' && typeof AccountApprovals !== 'undefined') return AccountApprovals.loadPendingAccounts();
    if (pageName === 'professor_pending_approval.html' && typeof ProfessorPending !== 'undefined') return ProfessorPending.loadPendingReservations();
    if (pageName === 'student_approved_reservation.html' && typeof ProfessorApproved !== 'undefined') return ProfessorApproved.loadApprovedReservations();
    if (pageName === 'professor_reservation_history.html' && typeof ProfessorHistory !== 'undefined') return ProfessorHistory.loadCompletedReservations();
    if (pageName === 'professor_my_upcoming.html' && typeof ProfessorMyUpcoming !== 'undefined' && user.id) return ProfessorMyUpcoming.loadReservations(user.id);
    if (pageName === 'professor_unreturned.html' && typeof ProfessorUnreturned !== 'undefined') return ProfessorUnreturned.loadUnreturnedItems();
    if (pageName === 'professor_my_unreturned.html' && typeof ProfessorMyUnreturned !== 'undefined') return ProfessorMyUnreturned.refresh();
    if (pageName === 'student_pending.html' && typeof studentPending !== 'undefined') return studentPending.loadPendingReservations();
    if (pageName === 'student_upcoming.html' && typeof StudentUpcoming !== 'undefined') return StudentUpcoming.init();
    if (pageName === 'student_approved.html' && typeof studentApproved !== 'undefined') return studentApproved.loadApprovedReservations();
    if (pageName === 'student_history.html' && typeof StudentHistory !== 'undefined' && user.id) return StudentHistory.loadReservations(user.id);
    if (pageName === 'student_unreturned.html' && typeof StudentUnreturnedItems !== 'undefined' && user.id) return StudentUnreturnedItems.loadItems(user.id);
    if (pageName === 'student_upcoming_reservations.html' && typeof UpcomingStudentReservations !== 'undefined') return UpcomingStudentReservations.loadReservations(user);

    if (pageName === 'history_reports.html') {
        if (typeof loadHistoryStatistics === 'function') loadHistoryStatistics();
        const results = document.getElementById('reportResultsSection');
        if (reservationChanged && results && results.style.display !== 'none' && typeof generateHistoryReport === 'function') generateHistoryReport();
        return;
    }
    if (pageName === 'reservation_reports.html') {
        const results = document.getElementById('reportResultsSection');
        if (reservationChanged && results && results.style.display !== 'none' && typeof generateReport === 'function') generateReport();
    }
}

function refreshCurrentDataPage(changedTable = null) {
    const pagePath = window.location.pathname;
    const pageName = pagePath.split('/').pop();
    const watchedTables = APP_REALTIME_PAGE_TABLES[pageName];
    if (changedTable && (!watchedTables || !watchedTables.includes(changedTable))) return;
    const isStudentReservationForm = pageName === 'reservation_student.html';
    const isProfessorReservationForm = pageName === 'professor_new_reservation.html';

    if (isStudentReservationForm || isProfessorReservationForm) {
        clearTimeout(appRealtimeFormRefreshTimer);
        appRealtimeFormRefreshTimer = setTimeout(() => {
            if (window.location.pathname !== pagePath) return;
            if (typeof loadResources === 'function') loadResources();
            if (typeof selectedDate !== 'undefined' && selectedDate && typeof loadTimelineForDate === 'function') {
                loadTimelineForDate(selectedDate);
            }
        }, 250);
        return;
    }

    if (pageName === 'settings.html') {
        if (typeof profileHasUnsavedChanges === 'function' && profileHasUnsavedChanges()) return;
        if (typeof loadUserData === 'function') loadUserData();
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(APP_REALTIME_PAGE_TABLES, pageName)) return;

    clearTimeout(appRealtimeRefreshTimer);
    appRealtimeRefreshTimer = setTimeout(() => {
        if (window.location.pathname !== pagePath) return;
        try {
            const refresh = refreshRealtimePageInPlace(pageName, changedTable);
            if (refresh && typeof refresh.catch === 'function') {
                refresh.catch(error => console.error('Unable to refresh live page data:', error));
            }
        } catch (error) {
            console.error('Unable to refresh live page data:', error);
        }
    }, 350);
}

async function startAppRealtimeUpdates() {
    if (!window.supabase?.channel || window.__appRealtimeChannel || window.__appRealtimeStarting) return;
    window.__appRealtimeStarting = true;

    try {
        const { data, error } = await window.supabase.auth.getSession();
        if (error) throw error;
        if (!data?.session || window.__appRealtimeChannel) return;
        startApprovedReservationPromotionChecks();

        let needsRefreshAfterReconnect = false;
        let channel = window.supabase.channel('app-live-data');
        APP_REALTIME_TABLES.forEach(table => {
            channel = channel.on('postgres_changes', {
                event: '*',
                schema: 'public',
                table
            }, payload => {
                window.dispatchEvent(new CustomEvent('app:data-changed', {
                    detail: { table, eventType: payload.eventType, new: payload.new, old: payload.old }
                }));
                if (table !== 'user_notifications') refreshCurrentDataPage(table);
            });
        });

        window.__appRealtimeChannel = channel.subscribe(status => {
            if (status === 'SUBSCRIBED') {
                if (needsRefreshAfterReconnect) refreshCurrentDataPage();
                needsRefreshAfterReconnect = false;
            } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
                needsRefreshAfterReconnect = true;
                console.warn('Live data updates are temporarily unavailable:', status);
            }
        });
    } catch (error) {
        console.warn('Unable to start live data updates:', error);
    } finally {
        window.__appRealtimeStarting = false;
    }
}

window.addEventListener('focus', () => {
    refreshCurrentDataPage();
    if (document.visibilityState === 'visible') promoteActiveApprovedReservations();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        refreshCurrentDataPage();
        promoteActiveApprovedReservations();
    }
});

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
        if (window.__appRealtimeChannel) {
            try {
                await window.supabase.removeChannel(window.__appRealtimeChannel);
            } catch (channelError) {
                console.warn('Unable to close live updates channel during logout:', channelError);
            }
            window.__appRealtimeChannel = null;
        }
        const { error } = await window.supabase.auth.signOut();
        if (error) throw error;
        stopApprovedReservationPromotionChecks();
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
    initializeTableLoadingStates();
    window.__appRealtimeStartPromise = startAppRealtimeUpdates();
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
        const pagePortals = '.modal, .reservation-dialog, .floating-cart-button';
        const currentOverlays = [...document.querySelectorAll(pagePortals)]
            .filter(overlay => overlay.id !== 'logoutModal');
        currentOverlays.forEach(overlay => overlay.remove());

        documentFragment.querySelectorAll(pagePortals).forEach(overlay => {
            if (overlay.id !== 'logoutModal') {
                document.body.appendChild(overlay.cloneNode(true));
            }
        });

        document.body.classList.toggle(
            'student-reservation-page',
            documentFragment.body.classList.contains('student-reservation-page')
        );
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

