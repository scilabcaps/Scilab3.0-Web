/**
 * professor_pending.js
 * Handles functionality for professor pending reservations page
 */

const CACHE_KEY = 'professor_pending_cache';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const ProfessorPending = {
    allReservations: [],
    currentFilter: 'all',
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.loadPendingReservations();
            this.setupTabButtons();
        } else {
            window.location.href = '../../index.html';
        }
    },

    getCachedData() {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();

            if (now - timestamp > CACHE_TTL) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error reading cache:', error);
            return null;
        }
    },

    setCachedData(data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    },

    clearCache() {
        localStorage.removeItem(CACHE_KEY);
    },

    async loadPendingReservations() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');

            const cachedData = this.getCachedData();
            if (cachedData) {
                this.allReservations = cachedData || [];
                this.currentPage = 1;
                this.filterReservations(this.currentFilter);
                return;
            }

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

            this.setCachedData(reservations);
            this.allReservations = reservations || [];
            this.currentPage = 1;
            this.filterReservations(this.currentFilter);
        } catch (error) {
            console.error('Error loading reservations:', error);
            this.showError('Failed to load reservations');
        }
    },

    setupTabButtons() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                ProfessorPending.currentFilter = this.getAttribute('data-filter');
                ProfessorPending.filterReservations(ProfessorPending.currentFilter);
            });
        });
    },

    getFilteredReservations(filter) {
        if (filter === 'all') return this.allReservations;

        return this.allReservations.filter(res => {
            if (filter === 'rooms') {
                return res.room_id !== null && res.room_id !== undefined;
            } else if (filter === 'chemicals') {
                return res.chemical_usage && res.chemical_usage.length > 0;
            } else if (filter === 'assets') {
                return res.reservation_items && res.reservation_items.length > 0;
            }
            return true;
        });
    },

    filterReservations(filter) {
        const filtered = this.getFilteredReservations(filter);
        this.currentPage = 1;
        this.displayReservations(filtered);
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
            let statusColor = '#f59e0b';
            if (res.admin_approval === 'Approved') {
                statusColor = '#119822';
            } else if (res.admin_approval === 'Rejected') {
                statusColor = '#dc2626';
            } else if (res.admin_approval === 'Pending') {
                statusColor = '#3b82f6';
            }

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
                    <td><span style="color: ${statusColor}; font-weight: 600;">${res.admin_approval}</span></td>
                </tr>
            `;
        }).join('');
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
        const filtered = this.getFilteredReservations(this.currentFilter);
        const totalPages = Math.ceil(filtered.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage(filtered);
        this.renderPaginationControls(filtered.length);
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        const filtered = this.getFilteredReservations(this.currentFilter);
        this.renderPage(filtered);
        this.renderPaginationControls(filtered.length);
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