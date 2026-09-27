/**
 * professor_unreturned.js
 * Handles functionality for professor unreturned items page
 */

const CACHE_KEY = 'professor_unreturned_cache_v2';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ProfessorUnreturned = {
    formattedItems: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.reservationModal = new Modal('reservationDetailsModal');
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
                        start_time,
                        user_info!inner(first_name, last_name, email, year_section)
                    ),
                    lab_assets!inner(item_name, category)
                `)
                .eq('is_returned', false)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const unreturnedItems = items.filter(item => item.quantity_returned < item.quantity_borrowed);

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

    displayItems(items) {
        const itemsToDisplay = items || this.formattedItems;
        const tbody = document.getElementById('itemsTable');

        if (itemsToDisplay.length === 0) {
            document.getElementById('itemsEmptyState').style.display = 'block';
            tbody.innerHTML = '';
            this.removePagination();
        } else {
            document.getElementById('itemsEmptyState').style.display = 'none';
            this.renderPage(itemsToDisplay);
            this.renderPaginationControls(itemsToDisplay.length);
        }
    },

    renderPage(items) {
        const tbody = document.getElementById('itemsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = items.slice(start, end);

        tbody.innerHTML = pageData.map(item => {
            return `
                <tr>
                    <td>${item.student_name || 'N/A'}</td>
                    <td>${item.year_section || 'N/A'}</td>
                    <td>${item.resource_name}</td>
                    <td>${item.resource_type}</td>
                    <td>${item.borrowed_quantity}</td>
                    <td>${item.returned_quantity}</td>
                    <td class="unreturned-qty">${item.unreturned_quantity}</td>
                    <td>${item.reservation_date}</td>
                    <td><button class="view-reservation-btn" onclick="ProfessorUnreturned.viewDetails(${item.reservation_id})">View</button></td>
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
        const totalPages = Math.ceil(this.formattedItems.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage(this.formattedItems);
        this.renderPaginationControls(this.formattedItems.length);
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        this.renderPage(this.formattedItems);
        this.renderPaginationControls(this.formattedItems.length);
    },

    async viewDetails(reservationId) {
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
                        <div class="resource-detail-meta">Borrowed: ${item.quantity_borrowed || 0} | Returned: ${item.quantity_returned || 0} | Unreturned: ${unreturned}</div>
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
                <div class="summary-item">
                    <div class="summary-label">Resources</div>
                    <div class="summary-value">
                        ${resources.length ? resources.join('') : 'No resources found for this reservation.'}
                    </div>
                </div>
            `);
        } catch (error) {
            console.error('Error loading reservation details:', error);
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
