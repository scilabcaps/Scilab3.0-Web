/**
 * professor_unreturned.js
 * Handles functionality for professor unreturned items page
 */

const CACHE_KEY = 'professor_unreturned_cache_v5';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ProfessorUnreturned = {
    formattedItems: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,
    detailsRequestId: 0,
    requestedReservationId: new URLSearchParams(window.location.search).get('reservation_id'),

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
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && this.reservationModal.modal.classList.contains('active')) {
                    event.stopPropagation();
                    this.detailsRequestId++;
                    this.reservationModal.close();
                }
            });
            this.reservationModal.closeBtn?.addEventListener('click', () => {
                this.detailsRequestId++;
                this.reservationModal.close();
            });
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
                this.formattedItems = this.filterRequestedReservation(cachedData.formattedItems);
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
                        status,
                        user_info!inner(first_name, last_name, email, year_section, role)
                    ),
                    lab_assets!inner(item_name, category)
                `)
                .eq('is_returned', false)
                .eq('is_deleted', false)
                .eq('reservations.is_deleted', false)
                .eq('reservations.user_info.role', 'student')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const now = Date.now();
            const unreturnedItems = items.filter(item =>
                !['declined', 'rejected', 'cancelled'].includes(String(item.reservations.status || '').toLowerCase()) &&
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
                reservation_time: item.reservations.start_time,
                reservation_status: item.reservations.status
            }));

            this.formattedItems = this.filterRequestedReservation(formattedItems);
            this.currentPage = 1;
            this.setCachedData({ formattedItems });

            this.displayItems();
        } catch (error) {
            console.error('Error loading unreturned items:', error);
            this.displayItems([]);
        }
    },

    filterRequestedReservation(items) {
        if (!this.requestedReservationId) return items;
        return items.filter(item => String(item.reservation_id) === this.requestedReservationId);
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
                });
            }

            const group = groups.get(key);
            group.resources.push(item);
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
            const resources = formatResourceCell(reservation.resources.map(item => ({
                name: item.resource_name,
                meta: item.resource_type || 'Asset'
            })));
            const quantityList = (key, label, className = '') => `
                <div class="unreturned-quantity-list ${className}" role="list" aria-label="${label} quantity per resource">
                    ${reservation.resources.map(item => {
                        const quantity = Number(item[key]) || 0;
                        return `<div class="unreturned-quantity-item" role="listitem" aria-label="${this.escapeHtml(item.resource_name)}: ${quantity} ${label.toLowerCase()}">${quantity}</div>`;
                    }).join('')}
                </div>
            `;

            return `
                <tr>
                    <td>${this.escapeHtml(reservation.student_name || 'N/A')}</td>
                    <td>${this.escapeHtml(reservation.year_section || 'N/A')}</td>
                    <td>${resources}</td>
                    <td>${quantityList('borrowed_quantity', 'Borrowed')}</td>
                    <td>${quantityList('returned_quantity', 'Returned')}</td>
                    <td>${quantityList('unreturned_quantity', 'Unreturned', 'unreturned-quantity-list--due')}</td>
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
                    status,
                    additional_note,
                    year_section,
                    course,
                    professor,
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

            (reservation.reservation_items || []).forEach(item => {
                const asset = item.lab_assets;
                if (!asset) return;
                resources.push({ name: asset.item_name, type: asset.category || 'Asset', details: getReservationAssetDetails(reservation, item) });
            });

            (reservation.chemical_usage || []).forEach(usage => {
                const chemical = usage.chemicals;
                if (!chemical) return;
                resources.push({ name: chemical.chemical_name, type: 'Chemical', details: getReservationChemicalDetails(reservation, usage) });
            });

            const student = reservation.user_info ?
                `${reservation.user_info.first_name || ''} ${reservation.user_info.last_name || ''}`.trim() : 'N/A';
            if (requestId !== this.detailsRequestId || !this.reservationModal.modal.classList.contains('active')) {
                return;
            }

            if (reservation.rooms?.room_name) resources.unshift({ name: reservation.rooms.room_name, type: 'Room' });
            this.reservationModal.open('Reservation Details', renderReservationDetails([
                { label: 'Reservation ID', value: reservationId },
                { label: 'Student', value: student },
                { label: 'Date', value: reservation.reservation_date },
                { label: 'Time', value: `${reservation.start_time} - ${reservation.end_time}` },
                { label: 'Year & Section', value: reservation.year_section },
                { label: 'Course', value: reservation.course },
                { label: 'Professor', value: reservation.professor },
                { label: 'Status', value: reservation.status }
            ], resources, { note: reservation.additional_note }));
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
