/**
 * professor_approved.js
 * Handles functionality for professor approved student reservations page
 */

const CACHE_KEY = 'professor_approved_cache_v2';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const ProfessorApproved = {
    reservations: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.reservationModal = new Modal('approvedReservationModal');
            this.reservationModal.modal.addEventListener('click', event => {
                if (event.target === this.reservationModal.modal) {
                    // Prevent main.js from hiding the modal with inline display:none.
                    event.stopPropagation();
                }
            });
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
                    rooms(room_name),
                    reservation_items(
                        asset_id,
                        quantity_borrowed,
                        quantity_returned,
                        lab_assets!inner(item_name, category)
                    ),
                    chemical_usage(
                        chemical_id,
                        quantity_used,
                        unit,
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
            const adminStatus = String(res.admin_approval || 'Unknown').trim();
            const statusClass = this.getStatusClass(adminStatus);

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
                    <td>${this.escapeHtml(res.reservation_date)}</td>
                    <td>${this.escapeHtml(`${res.start_time} - ${res.end_time}`)}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${this.escapeHtml(studentName)}</td>
                    <td>${this.escapeHtml(res.additional_note || 'N/A')}</td>
                    <td><span class="approval-status ${statusClass}">${this.escapeHtml(adminStatus)}</span></td>
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
        const reservation = this.reservations.find(item => String(item.reservation_id) === String(id));
        if (!reservation) {
            this.reservationModal.open('Reservation Details', '<p>Reservation details could not be found.</p>');
            return;
        }

        const resources = [];
        if (reservation.rooms?.room_name) {
            resources.push(`
                <div class="summary-item">
                    <div class="summary-label">${this.escapeHtml(reservation.rooms.room_name)} (Room)</div>
                </div>
            `);
        }

        (reservation.reservation_items || []).forEach(item => {
            if (!item.lab_assets) return;
            const quantity = Number(item.quantity_borrowed) || 0;
            const returned = Number(item.quantity_returned) || 0;
            const unreturned = Math.max(0, quantity - returned);
            resources.push(`
                <div class="summary-item">
                    <div class="summary-label">${this.escapeHtml(item.lab_assets.item_name)} (${this.escapeHtml(item.lab_assets.category || 'Equipment')})</div>
                    <div class="summary-value">Quantity: ${quantity} | Returned: ${returned} | Unreturned: ${unreturned}</div>
                </div>
            `);
        });

        (reservation.chemical_usage || []).forEach(usage => {
            if (!usage.chemicals) return;
            resources.push(`
                <div class="summary-item">
                    <div class="summary-label">${this.escapeHtml(usage.chemicals.chemical_name)} (Chemical)</div>
                    <div class="summary-value">Amount: ${this.escapeHtml(usage.quantity_used)} ${this.escapeHtml(usage.unit || '')}</div>
                </div>
            `);
        });

        const studentName = reservation.user_info
            ? `${reservation.user_info.first_name || ''} ${reservation.user_info.last_name || ''}`.trim()
            : 'Unknown';
        const adminStatus = reservation.admin_approval || 'Unknown';
        this.reservationModal.open('Reservation Details', `
            <div class="summary-item">
                <div class="summary-label">Student</div>
                <div class="summary-value">${this.escapeHtml(studentName)}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Date</div>
                <div class="summary-value">${this.escapeHtml(reservation.reservation_date)}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Time</div>
                <div class="summary-value">${this.escapeHtml(`${reservation.start_time} - ${reservation.end_time}`)}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Additional Note</div>
                <div class="summary-value">${this.escapeHtml(reservation.additional_note || 'N/A')}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Admin Status</div>
                <div class="summary-value"><span class="approval-status ${this.getStatusClass(adminStatus)}">${this.escapeHtml(adminStatus)}</span></div>
            </div>
            <h3 class="modal-resource-heading">Resources</h3>
            <div class="modal-resource-list">
                ${resources.length ? resources.join('') : '<div class="summary-item">No resources specified for this reservation.</div>'}
            </div>
        `);
    },

    getStatusClass(status) {
        const normalized = String(status || '').trim().toLowerCase();
        if (normalized === 'approved') return 'status-approved';
        if (['declined', 'rejected'].includes(normalized)) return 'status-declined';
        if (normalized === 'pending') return 'status-pending';
        return 'status-unknown';
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
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
