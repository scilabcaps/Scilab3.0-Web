/**
 * professor_approved.js
 * Handles functionality for professor approved student reservations page
 */

const CACHE_KEY = 'professor_approved_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const ProfessorApproved = {
    reservations: [],
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.loadApprovedReservations();
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

    async loadApprovedReservations() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');

            const cachedData = this.getCachedData();
            if (cachedData) {
                this.reservations = cachedData || [];
                this.currentPage = 1;
                this.displayReservations();
                return;
            }

            const professorFullName = user.firstname + ' ' + user.lastname;
            const { data: reservations, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    reservation_items(
                        asset_id,
                        lab_assets!inner(item_name)
                    ),
                    chemical_usage(
                        chemical_id,
                        chemicals!inner(chemical_name)
                    ),
                    user_info!inner(first_name, last_name, role)
                `)
                .eq('professor_approval', 'Approved')
                .eq('professor', professorFullName)
                .eq('user_info.role', 'student')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.setCachedData(reservations);
            this.reservations = reservations || [];
            this.currentPage = 1;
            this.displayReservations();
        } catch (error) {
            console.error('Error loading reservations:', error);
            this.showError('Failed to load approved reservations');
        }
    },

    displayReservations() {
        const emptyState = document.getElementById('emptyState');

        if (!this.reservations || this.reservations.length === 0) {
            const tbody = document.getElementById('reservationsTable');
            if (tbody) tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            this.removePagination();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        this.renderPage();
        this.renderPaginationControls();
    },

    renderPage() {
        const tbody = document.getElementById('reservationsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.reservations.slice(start, end);

        tbody.innerHTML = pageData.map(res => {
            let statusColor = '#119822';
            if (res.status === 'Approved') {
                statusColor = '#119822';
            } else if (res.admin_approval === 'Pending') {
                statusColor = '#f59e0b';
            } else if (res.status === 'Rejected') {
                statusColor = '#dc2626';
            }

            let items = [];

            if (res.reservation_items && res.reservation_items.length > 0) {
                const assetNames = res.reservation_items
                    .map(item => item.lab_assets ? item.lab_assets.item_name : 'Unknown')
                    .filter(name => name !== 'Unknown');
                items.push(...assetNames);
            }

            if (res.chemical_usage && res.chemical_usage.length > 0) {
                const chemicalNames = res.chemical_usage
                    .map(chem => chem.chemicals ? chem.chemicals.chemical_name : 'Unknown')
                    .filter(name => name !== 'Unknown');
                items.push(...chemicalNames);
            }

            let resourcesDisplay = items.length > 0
                ? items.join(', ')
                : '<span style="color: #6b7280;">No items specified</span>';

            const studentName = res.user_info ? `${res.user_info.first_name} ${res.user_info.last_name}` : 'Unknown';

            return `
                <tr>
                    <td>${res.reservation_date}</td>
                    <td>${res.start_time} - ${res.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${studentName}</td>
                    <td>${res.additional_note || 'N/A'}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${res.admin_approval}</span></td>
                    <td>
                        <button class="btn btn-view" onclick="ProfessorApproved.viewDetails(${res.reservation_id})">View</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderPaginationControls() {
        this.removePagination();
        if (this.reservations.length <= this.pageSize) return;

        const totalPages = Math.ceil(this.reservations.length / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" id="paginationInfo">Showing ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button onclick="ProfessorApproved.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="ProfessorApproved.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="ProfessorApproved.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="ProfessorApproved.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="ProfessorApproved.changePageSize(this.value)">
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
        const totalPages = Math.ceil(this.reservations.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage();
        this.renderPaginationControls();
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        this.renderPage();
        this.renderPaginationControls();
    },

    viewDetails(id) {
        alert('Viewing reservation details for ID: ' + id);
    },

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'block';
        this.removePagination();
    }
};

window.addEventListener('DOMContentLoaded', function () {
    ProfessorApproved.init();
});
