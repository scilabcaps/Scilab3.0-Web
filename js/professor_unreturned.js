/**
 * professor_unreturned.js
 * Handles functionality for professor unreturned items page
 */

const CACHE_KEY = 'professor_unreturned_cache_v4';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ProfessorUnreturned = {
    formattedItems: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,
    detailsRequestId: 0,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.reservationModal = new Modal('reservationDetailsModal');
            const closeReservationModal = event => {
                if (event.target === this.reservationModal.modal || event.target === this.reservationModal.modalBody) {
                    // The global window.onclick handler also hides .modal with an inline
                    // display:none, which prevents Modal.open() from showing it again.
                    event.stopPropagation();
                    this.detailsRequestId++;
                    this.reservationModal.close();
                }
            };
            this.reservationModal.modal.addEventListener('click', closeReservationModal);
            this.reservationModal.modalBody.addEventListener('click', closeReservationModal);
            this.loadUnreturnedItems();
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

    hasReservationEnded(date, endTime, now = Date.now()) {
        if (!date || !endTime) return false;
        const endTimestamp = new Date(`${date}T${endTime}`).getTime();
        return Number.isFinite(endTimestamp) && endTimestamp < now;
    },

    async loadUnreturnedItems() {
        try {
            const cachedData = this.getCachedData();
            if (cachedData) {
                this.formattedItems = cachedData.formattedItems;
                this.currentPage = 1;
                this.displayItems();
                return;
            }

            const { data: items, error } = await supabase
                .from('reservation_items')
                .select(`
                    *,
                    reservations!inner(
                        reservation_date,
                        end_time,
                        start_time,
                        user_info!inner(first_name, last_name, email, year_section, role)
                    ),
                    lab_assets!inner(item_name, category)
                `)
                .eq('is_returned', false)
                .eq('reservations.user_info.role', 'student')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const now = Date.now();
            const unreturnedItems = items.filter(item =>
                item.quantity_returned < item.quantity_borrowed &&
                this.hasReservationEnded(item.reservations.reservation_date, item.reservations.end_time, now)
            );

            const formattedItems = unreturnedItems.map(item => ({
                reservation_id: item.reservation_id,
                student_name: item.reservations.user_info ?
                    `${item.reservations.user_info.first_name} ${item.reservations.user_info.last_name}` : 'N/A',
                student_email: item.reservations.user_info?.email || 'N/A',
                year_section: item.reservations.user_info?.year_section || 'N/A',
                resource_name: item.lab_assets.item_name,
                resource_type: item.lab_assets.category,
                borrowed_quantity: item.quantity_borrowed,
                returned_quantity: item.quantity_returned,
                unreturned_quantity: item.quantity_borrowed - item.quantity_returned,
                reservation_date: item.reservations.reservation_date,
                reservation_end_time: item.reservations.end_time,
                reservation_time: item.reservations.start_time
            }));

            this.formattedItems = formattedItems;
            this.currentPage = 1;
            this.setCachedData({ formattedItems });

            this.displayItems();
        } catch (error) {
            console.error('Error loading unreturned items:', error);
            this.displayItems([]);
        }
    },

    getReservationGroups(items = this.formattedItems) {
        const groups = new Map();

        items.forEach(item => {
            const key = String(item.reservation_id);
            if (!groups.has(key)) {
                groups.set(key, {
                    reservation_id: item.reservation_id,
                    student_name: item.student_name,
                    year_section: item.year_section,
                    reservation_date: item.reservation_date,
                    resources: [],
                    borrowed_quantity: 0,
                    returned_quantity: 0,
                    unreturned_quantity: 0
                });
            }

            const group = groups.get(key);
            group.resources.push(item);
            group.borrowed_quantity += Number(item.borrowed_quantity) || 0;
            group.returned_quantity += Number(item.returned_quantity) || 0;
            group.unreturned_quantity += Number(item.unreturned_quantity) || 0;
        });

        return Array.from(groups.values());
    },

    displayItems(items) {
        const reservationsToDisplay = this.getReservationGroups(items || this.formattedItems);
        const tbody = document.getElementById('itemsTable');

        if (reservationsToDisplay.length === 0) {
            document.getElementById('itemsEmptyState').style.display = 'block';
            tbody.innerHTML = '';
            this.removePagination();
        } else {
            document.getElementById('itemsEmptyState').style.display = 'none';
            this.renderPage(reservationsToDisplay);
            this.renderPaginationControls(reservationsToDisplay.length);
        }
    },

    renderPage(reservations) {
        const tbody = document.getElementById('itemsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = reservations.slice(start, end);

        tbody.innerHTML = pageData.map(reservation => {
            const resources = reservation.resources.map(item => `
                <div class="reservation-resource">
                    ${this.escapeHtml(item.resource_name)} <span class="resource-detail-meta">(${this.escapeHtml(item.resource_type || 'Asset')})</span>
                </div>
            `).join('');

            return `
                <tr>
                    <td>${this.escapeHtml(reservation.student_name || 'N/A')}</td>
                    <td>${this.escapeHtml(reservation.year_section || 'N/A')}</td>
                    <td><div class="reservation-resource-list">${resources}</div></td>
                    <td>${reservation.borrowed_quantity}</td>
                    <td>${reservation.returned_quantity}</td>
                    <td class="unreturned-qty">${reservation.unreturned_quantity}</td>
                    <td>${this.escapeHtml(reservation.reservation_date || 'N/A')}</td>
                    <td><button class="view-reservation-btn" onclick="ProfessorUnreturned.viewDetails(${reservation.reservation_id})">View</button></td>
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
                <button onclick="ProfessorUnreturned.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="ProfessorUnreturned.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="ProfessorUnreturned.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="ProfessorUnreturned.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="ProfessorUnreturned.changePageSize(this.value)">
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
        const reservations = this.getReservationGroups();
        const totalPages = Math.ceil(reservations.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage(reservations);
        this.renderPaginationControls(reservations.length);
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        const reservations = this.getReservationGroups();
        this.renderPage(reservations);
        this.renderPaginationControls(reservations.length);
    },

    async viewDetails(reservationId) {
        const requestId = ++this.detailsRequestId;
        this.reservationModal.open('Reservation Details', '<p>Loading reservation resources...</p>');

        try {
            const { data: reservation, error } = await supabase
                .from('reservations')
                .select(`
                    reservation_id,
                    reservation_date,
                    start_time,
                    end_time,
                    rooms(room_name),
                    user_info(first_name, last_name),
                    reservation_items(
                        quantity_borrowed,
                        quantity_returned,
                        is_returned,
                        lab_assets(item_name, category)
                    ),
                    chemical_usage(
                        quantity_used,
                        unit,
                        chemicals(chemical_name)
                    )
                `)
                .eq('reservation_id', reservationId)
                .single();

            if (error) throw error;

            const resources = [];
            if (reservation.rooms?.room_name) {
                resources.push(`
                    <div class="resource-detail-row">
                        <div class="resource-detail-name">${this.escapeHtml(reservation.rooms.room_name)} (Room)</div>
                    </div>
                `);
            }

            (reservation.reservation_items || []).forEach(item => {
                const asset = item.lab_assets;
                if (!asset) return;
                const unreturned = Math.max(0, (item.quantity_borrowed || 0) - (item.quantity_returned || 0));
                resources.push(`
                    <div class="resource-detail-row">
                        <div class="resource-detail-name">${this.escapeHtml(asset.item_name)} (${this.escapeHtml(asset.category || 'Asset')})</div>
                        <div class="resource-detail-meta">Quantity: ${item.quantity_borrowed || 0} | Returned: ${item.quantity_returned || 0} | Unreturned: ${unreturned}</div>
                    </div>
                `);
            });

            (reservation.chemical_usage || []).forEach(usage => {
                const chemical = usage.chemicals;
                if (!chemical) return;
                resources.push(`
                    <div class="resource-detail-row">
                        <div class="resource-detail-name">${this.escapeHtml(chemical.chemical_name)} (Chemical)</div>
                        <div class="resource-detail-meta">Used: ${usage.quantity_used || 0} ${this.escapeHtml(usage.unit || '')}</div>
                    </div>
                `);
            });

            const student = reservation.user_info ?
                `${reservation.user_info.first_name || ''} ${reservation.user_info.last_name || ''}`.trim() : 'N/A';
            if (requestId !== this.detailsRequestId || !this.reservationModal.modal.classList.contains('active')) {
                return;
            }

            this.reservationModal.open('Reservation Details', `
                <div class="summary-item">
                    <div class="summary-label">Student</div>
                    <div class="summary-value">${this.escapeHtml(student)}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Date</div>
                    <div class="summary-value">${this.escapeHtml(reservation.reservation_date)}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Time</div>
                    <div class="summary-value">${this.escapeHtml(`${reservation.start_time} - ${reservation.end_time}`)}</div>
                </div>
                <div class="modal-resource-heading">Resources</div>
                <div class="modal-resource-list">
                    ${resources.length ? resources.join('') : '<div class="summary-item">No resources found for this reservation.</div>'}
                </div>
            `);
        } catch (error) {
            console.error('Error loading reservation details:', error);
            if (requestId !== this.detailsRequestId || !this.reservationModal.modal.classList.contains('active')) {
                return;
            }

            this.reservationModal.open('Reservation Details', '<p style="color: #d32f2f;">Failed to load reservation resources.</p>');
        }
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

window.addEventListener('DOMContentLoaded', function () {
    ProfessorUnreturned.init();
});
