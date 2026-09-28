/**
 * student_history.js
 * Handles loading and displaying student reservation history
 */

const StudentHistory = {
    reservations: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Student') {
            this.reservationModal = new Modal('studentHistoryModal');
            this.reservationModal.modal.addEventListener('click', event => {
                if (event.target === this.reservationModal.modal) event.stopPropagation();
            });
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
            'Rejected': '#f44336',
            'Declined': '#f44336',
            'Partially Returned': '#e68a00',
            'Unreturned': '#e74c3c'
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
                    rooms(room_name),
                    reservation_items(
                        quantity_borrowed,
                        quantity_returned,
                        lab_assets(item_name, category)
                    ),
                    chemical_usage(
                        quantity_used,
                        unit,
                        chemicals(chemical_name)
                    )
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
                    <td>${this.escapeHtml(res.reservation_date || 'N/A')}</td>
                    <td>${this.escapeHtml(`${res.start_time || 'N/A'} - ${res.end_time || 'N/A'}`)}</td>
                    <td>${this.escapeHtml(this.getResourceSummary(res))}</td>
                    <td>${this.escapeHtml(res.year_section || 'N/A')}</td>
                    <td>${this.escapeHtml(res.course || 'N/A')}</td>
                    <td>${this.escapeHtml(res.professor || 'N/A')}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${this.escapeHtml(statusText)}</span></td>
                    <td><button type="button" class="btn btn-view" onclick="StudentHistory.viewDetails(${res.reservation_id})">View</button></td>
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
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #e74c3c;">${this.escapeHtml(message)}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'block';
        this.removePagination();
    },

    /**
     * View details of a specific reservation
     */
    viewDetails(id) {
        const reservation = this.reservations.find(item => String(item.reservation_id) === String(id));
        if (!reservation) {
            this.reservationModal.open('Reservation Details', '<p>Reservation details could not be found.</p>');
            return;
        }

        const rooms = (Array.isArray(reservation.rooms) ? reservation.rooms : [reservation.rooms])
            .filter(room => room?.room_name)
            .map(room => `<article class="history-detail-resource"><h3>${this.escapeHtml(room.room_name)}</h3><p>Room</p></article>`);
        const assets = (reservation.reservation_items || []).filter(item => item.lab_assets).map(item => {
            const borrowed = Number(item.quantity_borrowed) || 0;
            const returned = Number(item.quantity_returned) || 0;
            return `
                <article class="history-detail-resource">
                    <h3>${this.escapeHtml(item.lab_assets.item_name || 'Unknown item')}</h3>
                    <p>Type: ${this.escapeHtml(item.lab_assets.category || 'Equipment')}</p>
                    <p>Borrowed: ${borrowed} · Returned: ${returned} · Still in hand: ${Math.max(0, borrowed - returned)}</p>
                </article>
            `;
        });
        const chemicals = (reservation.chemical_usage || []).map(usage => `
            <article class="history-detail-resource">
                <h3>${this.escapeHtml(usage.chemicals?.chemical_name || 'Chemical')}</h3>
                <p>Used: ${this.escapeHtml(usage.quantity_used)} ${this.escapeHtml(usage.unit || '')}</p>
            </article>
        `);
        const resources = [...rooms, ...assets, ...chemicals];

        this.reservationModal.open('Reservation Details', `
            <div class="history-detail-grid">
                <div><strong>Date</strong><span>${this.escapeHtml(reservation.reservation_date || 'N/A')}</span></div>
                <div><strong>Time</strong><span>${this.escapeHtml(`${reservation.start_time || 'N/A'} - ${reservation.end_time || 'N/A'}`)}</span></div>
                <div><strong>Year &amp; Section</strong><span>${this.escapeHtml(reservation.year_section || 'N/A')}</span></div>
                <div><strong>Course</strong><span>${this.escapeHtml(reservation.course || 'N/A')}</span></div>
                <div><strong>Professor</strong><span>${this.escapeHtml(reservation.professor || 'N/A')}</span></div>
                <div><strong>Status</strong><span>${this.escapeHtml(this.getStatusDisplayText(reservation.status || 'N/A'))}</span></div>
            </div>
            ${reservation.additional_note ? `<div class="history-detail-note"><strong>Additional Note</strong><p>${this.escapeHtml(reservation.additional_note)}</p></div>` : ''}
            <h3 class="history-detail-heading">Resources</h3>
            <div class="history-detail-resources">
                ${resources.length ? resources.join('') : '<p>No resources were recorded for this reservation.</p>'}
            </div>
        `);
    },

    getResourceSummary(reservation) {
        const rooms = (Array.isArray(reservation.rooms) ? reservation.rooms : [reservation.rooms])
            .filter(room => room?.room_name).map(room => room.room_name);
        const assetCount = (reservation.reservation_items || []).filter(item => item.lab_assets).length;
        const chemicalCount = (reservation.chemical_usage || []).length;
        const summary = [...rooms];
        if (assetCount) summary.push(`${assetCount} ${assetCount === 1 ? 'item' : 'items'}`);
        if (chemicalCount) summary.push(`${chemicalCount} ${chemicalCount === 1 ? 'chemical' : 'chemicals'}`);
        return summary.length ? summary.join(' · ') : 'No resources recorded';
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
    }
};

window.addEventListener('DOMContentLoaded', function() {
    StudentHistory.init();
});
