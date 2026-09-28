/**
 * professor_history.js
 * Handles functionality for professor reservation history page
 */

const CACHE_KEY = 'professor_history_cache_v2';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const ProfessorHistory = {
    reservations: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.reservationModal = new Modal('reservationModal');
            this.reservationModal.modal.addEventListener('click', event => {
                if (event.target === this.reservationModal.modal) {
                    // Prevent main.js from hiding the modal with inline display:none.
                    event.stopPropagation();
                }
            });
            this.loadCompletedReservations();
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

    async loadCompletedReservations() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');

            const cachedData = this.getCachedData();
            if (cachedData) {
                this.reservations = cachedData || [];
                this.currentPage = 1;
                this.displayReservations();
                return;
            }

            const { data: reservations, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name),
                    reservation_items(
                        quantity_borrowed,
                        lab_assets(item_name)
                    ),
                    chemical_usage(
                        quantity_used,
                        unit,
                        chemicals(chemical_name)
                    )
                `)
                .in('status', ['Completed', 'Cancelled', 'Declined'])
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.setCachedData(reservations);
            this.reservations = reservations || [];
            this.currentPage = 1;
            this.displayReservations();
        } catch (error) {
            console.error('Error loading reservations:', error);
            this.showError('Failed to load reservation history');
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
            } else if (res.status === 'Rejected' || res.status === 'Declined') {
                statusColor = '#dc2626';
            } else if (res.status === 'Completed') {
                statusColor = '#6b7280';
            } else if (res.status === 'Cancelled') {
                statusColor = '#f59e0b';
            }

            const resources = [];

            if (res.rooms?.room_name) {
                resources.push(res.rooms.room_name);
            }

            (res.reservation_items || []).forEach(item => {
                const name = item.lab_assets?.item_name;
                if (name) {
                    resources.push(`${name}${item.quantity_borrowed ? ` (${item.quantity_borrowed}x)` : ''}`);
                }
            });

            (res.chemical_usage || []).forEach(usage => {
                const name = usage.chemicals?.chemical_name;
                if (name) {
                    const quantity = usage.quantity_used != null
                        ? ` (${usage.quantity_used}${usage.unit ? ` ${usage.unit}` : ''})`
                        : '';
                    resources.push(`${name}${quantity}`);
                }
            });

            const resourcesDisplay = resources.length > 0
                ? resources.join(', ')
                : '<span style="color: #6b7280;">No resources specified</span>';

            return `
                <tr>
                    <td>${res.reservation_date}</td>
                    <td>${res.start_time} - ${res.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${res.additional_note || 'N/A'}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${res.status}</span></td>
                    <td>
                        <button class="btn btn-view" onclick="ProfessorHistory.viewDetails(${res.reservation_id})">View</button>
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
                <button onclick="ProfessorHistory.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="ProfessorHistory.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="ProfessorHistory.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="ProfessorHistory.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="ProfessorHistory.changePageSize(this.value)">
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

    async viewDetails(id) {
        try {
            const { data: reservation, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name),
                    reservation_items(
                        quantity_borrowed,
                        lab_assets(item_name)
                    ),
                    chemical_usage(
                        quantity_used,
                        unit,
                        chemicals(chemical_name)
                    )
                `)
                .eq('reservation_id', id)
                .single();

            if (error) throw error;

            let statusColor = '#119822';
            if (reservation.status === 'Rejected' || reservation.status === 'Declined') {
                statusColor = '#dc2626';
            } else if (reservation.status === 'Completed') {
                statusColor = '#6b7280';
            } else if (reservation.status === 'Cancelled') {
                statusColor = '#f59e0b';
            }

            const resources = [];
            if (reservation.rooms?.room_name) {
                resources.push(reservation.rooms.room_name);
            }
            (reservation.reservation_items || []).forEach(item => {
                const name = item.lab_assets?.item_name;
                if (name) {
                    resources.push(`${name}${item.quantity_borrowed ? ` (${item.quantity_borrowed}x)` : ''}`);
                }
            });
            (reservation.chemical_usage || []).forEach(usage => {
                const name = usage.chemicals?.chemical_name;
                if (name) {
                    const quantity = usage.quantity_used != null
                        ? ` (${usage.quantity_used}${usage.unit ? ` ${usage.unit}` : ''})`
                        : '';
                    resources.push(`${name}${quantity}`);
                }
            });
            const resourcesDisplay = resources.length > 0 ? resources.join(', ') : 'No resources specified';

            const content = `
                <div class="summary-item">
                    <div class="summary-label">Reservation ID</div>
                    <div class="summary-value">${reservation.reservation_id}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Date</div>
                    <div class="summary-value">${reservation.reservation_date}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Time</div>
                    <div class="summary-value">${reservation.start_time} - ${reservation.end_time}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Resources</div>
                    <div class="summary-value">${resourcesDisplay}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Additional Note</div>
                    <div class="summary-value">${reservation.additional_note || 'N/A'}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Status</div>
                    <div class="summary-value" style="color: ${statusColor}; font-weight: 600;">${reservation.status}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Created At</div>
                    <div class="summary-value">${new Date(reservation.created_at).toLocaleString()}</div>
                </div>
            `;

            this.reservationModal.open('Reservation Details', content);
        } catch (error) {
            console.error('Error fetching reservation details:', error);
            this.reservationModal.open('Error', '<p style="color: #dc2626;">Failed to load reservation details.</p>');
        }
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
    ProfessorHistory.init();
});
