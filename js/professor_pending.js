/**
 * professor_pending.js
 * Handles functionality for professor pending reservations page
 */

const CACHE_TTL = 60 * 1000; // 1 minute

const ProfessorPending = {
    allReservations: [],
    currentFilter: 'all',
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && String(user.role || '').toLowerCase() === 'professor') {
            this.loadPendingReservations();
        } else {
            window.location.href = '../../index.html';
        }
    },

    getCacheKey(userId) {
        return `professor_pending_cache:${userId}`;
    },

    getCachedData(userId) {
        try {
            const cached = localStorage.getItem(this.getCacheKey(userId));
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();

            if (now - timestamp > CACHE_TTL) {
                localStorage.removeItem(this.getCacheKey(userId));
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error reading cache:', error);
            return null;
        }
    },

    setCachedData(userId, data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(this.getCacheKey(userId), JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    },

    clearCache(userId) {
        if (userId) localStorage.removeItem(this.getCacheKey(userId));
    },

    async loadPendingReservations() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');

            const { data: reservations, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name),
                    user_info!inner(first_name, last_name),
                    reservation_items(
                        lab_assets(item_name, category)
                    ),
                    chemical_usage(
                        chemicals(chemical_name)
                    )
                `)
                .eq('admin_approval', 'Pending')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.allReservations = reservations || [];
            this.displayAllReservations();
        } catch (error) {
            console.error('Error loading reservations:', error);
            this.showError('Failed to load reservations');
        }
    },

    displayAllReservations() {
        this.currentPage = 1;
        this.displayReservations(this.allReservations);
    },

    displayReservations(reservations) {
        const emptyState = document.getElementById('emptyState');

        if (!reservations || reservations.length === 0) {
            const tbody = document.getElementById('reservationsTable');
            if (tbody) tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            this.removePagination();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        this.renderPage(reservations);
        this.renderPaginationControls(reservations.length);
    },

    renderPage(reservations) {
        const tbody = document.getElementById('reservationsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = reservations.slice(start, end);

        tbody.innerHTML = pageData.map(res => {
            let resourcesDisplay = '';
            if (res.room_id && res.rooms) {
                resourcesDisplay = res.rooms.room_name || 'Lab Room';
            } else if (res.chemical_usage && res.chemical_usage.length > 0) {
                const chemicalNames = res.chemical_usage.map(cu => cu.chemicals?.chemical_name).filter(Boolean);
                resourcesDisplay = chemicalNames.join(', ') || 'Chemicals';
            } else if (res.reservation_items && res.reservation_items.length > 0) {
                const assetNames = res.reservation_items.map(ri => ri.lab_assets?.item_name).filter(Boolean);
                resourcesDisplay = assetNames.join(', ') || 'Assets';
            } else {
                resourcesDisplay = '<span style="color: #6b7280;">No resources specified</span>';
            }

            const studentName = res.user_info ? `${res.user_info.first_name} ${res.user_info.last_name}` : 'Unknown';

            return `
                <tr>
                    <td>${res.reservation_date}</td>
                    <td>${res.start_time} - ${res.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${studentName}</td>
                    <td>${res.additional_note || 'N/A'}</td>
                    <td>${this.getApprovalStatus(res.admin_approval)}</td>
                </tr>
            `;
        }).join('');
    },

    getApprovalStatus(adminApproval) {
        return `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                ${this.getApprovalBadge(adminApproval, 'Admin')}
            </div>
        `;
    },

    getApprovalBadge(status, type) {
        const colors = {
            Pending: '#f39c12',
            Approved: '#27ae60',
            Declined: '#e74c3c',
            Cancelled: '#95a5a6',
            Completed: '#3498db'
        };
        const color = colors[status] || '#7f8c8d';

        return `
            <span style="
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                background: ${color}20;
                color: ${color};
                border: 1px solid ${color}40;
            ">
                ${type}: ${status || 'Unknown'}
            </span>
        `;
    },

    renderPaginationControls(totalCount) {
        this.removePagination();
        if (totalCount <= this.pageSize) return;

        const totalPages = Math.ceil(totalCount / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" id="paginationInfo">Showing ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button onclick="ProfessorPending.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="ProfessorPending.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="ProfessorPending.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="ProfessorPending.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="ProfessorPending.changePageSize(this.value)">
                    ${[5, 10, 25, 50].map(s => `<option value="${s}" ${this.pageSize === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
        `;

        const table = document.querySelector('.data-table table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(container, table.nextSibling);
        }
    },

    removePagination() {
        const existing = document.getElementById('paginationContainer');
        if (existing) existing.remove();
    },

    goToPage(page) {
        const reservations = this.allReservations;
        const totalPages = Math.ceil(reservations.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage(reservations);
        this.renderPaginationControls(reservations.length);
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        const reservations = this.allReservations;
        this.renderPage(reservations);
        this.renderPaginationControls(reservations.length);
    },

    viewDetails(id) {
        alert('Viewing reservation details for ID: ' + id);
    },

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'block';
        this.removePagination();
    }
};

window.addEventListener('DOMContentLoaded', function () {
    ProfessorPending.init();
});
