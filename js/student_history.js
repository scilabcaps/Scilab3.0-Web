/**
 * student_history.js
 * Handles loading and displaying student reservation history
 */

const StudentHistory = {
    reservations: [],
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Student') {
            this.loadReservations(user.id);
        } else {
            window.location.href = '../../index.html';
        }
    },

    /**
     * Get status color based on status value
     */
    getStatusColor(status) {
        const statusColors = {
            'Pending': '#e74c3c',
            'Pending for return': '#e74c3c',
            'Completed': '#31CB00',
            'Approved': '#31CB00',
            'Returned': '#31CB00',
            'Cancelled': '#f44336',
            'Rejected': '#f44336'
        };
        return statusColors[status] || '#7f8c8d';
    },

    /**
     * Get display text for status
     */
    getStatusDisplayText(status) {
        if (status === 'Pending') {
            return 'Pending for return';
        }
        return status;
    },

    /**
     * Load student's reservation history from Supabase
     */
    async loadReservations(userId) {
        try {
            const today = new Date().toISOString().split('T')[0];

            const { data: reservations, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name)
                `)
                .eq('user_id', userId)
                .or('status.in.(Completed,Cancelled,Declined),and(status.in.(Approved,Ongoing,Partially Returned),reservation_date.lt.' + today + ')')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.reservations = reservations || [];
            this.currentPage = 1;
            this.renderReservations();
        } catch (error) {
            console.error('Error loading reservations:', error);
            this.showError('Failed to load reservation history');
        }
    },

    renderReservations() {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (!this.reservations || this.reservations.length === 0) {
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
            const statusColor = this.getStatusColor(res.status);
            const statusText = this.getStatusDisplayText(res.status);
            return `
                <tr>
                    <td>${res.reservation_date}</td>
                    <td>${res.start_time} - ${res.end_time}</td>
                    <td>${res.room_name || 'Lab Room'}</td>
                    <td>${res.year_section || 'N/A'}</td>
                    <td>${res.course || 'N/A'}</td>
                    <td>${res.professor}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${statusText}</span></td>
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
                <button onclick="StudentHistory.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="StudentHistory.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="StudentHistory.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="StudentHistory.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="StudentHistory.changePageSize(this.value)">
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

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'block';
        this.removePagination();
    },

    /**
     * View details of a specific reservation
     */
    viewDetails(id) {
        alert('Viewing reservation details for ID: ' + id);
    }
};

window.addEventListener('DOMContentLoaded', function() {
    StudentHistory.init();
});
