// Shows resources from the student's ended reservations that are still outstanding.
const StudentUnreturnedItems = {
    items: [],
    detailsModal: null,
    requestedReservationId: new URLSearchParams(window.location.search).get('reservation_id'),

    async init() {
        const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (String(sessionUser.role || '').toLowerCase() !== 'student') {
            window.location.href = '../../index.html';
            return;
        }

        try {
            this.detailsModal = new Modal('studentUnreturnedDetailsModal');
            this.detailsModal.modal.addEventListener('click', event => {
                if (event.target === this.detailsModal.modal) event.stopPropagation();
            });
            this.detailsModal.closeBtn?.addEventListener('click', () => this.detailsModal.close());

            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && this.detailsModal?.modal.classList.contains('active')) this.detailsModal.close();
            });
            const { data: { user }, error: authError } = await window.supabase.auth.getUser();
            if (authError || !user) throw authError || new Error('Please sign in again.');
            await this.loadItems(user.id);
        } catch (error) {
            console.error('Unable to load unreturned items:', error);
            this.showError('Unable to load your unreturned items. Please refresh the page.');
        }
    },

    async loadItems(studentId) {
        const { data: items, error } = await window.supabase
            .from('reservation_items')
            .select(`
                detail_id,
                reservation_id,
                quantity_borrowed,
                quantity_returned,
                is_returned,
                reservations!inner(
                    reservation_date,
                    start_time,
                    end_time,
                    status,
                    user_id,
                    is_deleted
                ),
                lab_assets!inner(item_name, category)
            `)
            .eq('reservations.user_id', studentId)
            .eq('reservations.is_deleted', false)
            .eq('is_deleted', false)
            .in('reservations.status', ['Approved', 'Ongoing', 'Partially Returned', 'Unreturned', 'Completed'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        const now = Date.now();
        this.items = (items || []).filter(item => {
            const reservation = item.reservations;
            const reservationEnd = new Date(`${reservation.reservation_date}T${reservation.end_time}`).getTime();
            return Number.isFinite(reservationEnd) && reservationEnd < now;
        });

        const outstandingItems = this.items.filter(item =>
            item.is_returned === false
            && (Number(item.quantity_borrowed) || 0) > (Number(item.quantity_returned) || 0)
            && (!this.requestedReservationId || String(item.reservation_id) === this.requestedReservationId)
        );
        this.render(outstandingItems);
    },

    render(items) {
        const tbody = document.getElementById('unreturnedItemsTable');
        const emptyState = document.getElementById('emptyState');
        const reservations = this.groupOutstandingItems(items);
        const reservationCount = reservations.length;
        const outstandingCount = reservations.reduce((sum, reservation) => sum + reservation.outstanding, 0);

        document.getElementById('reservationCount').textContent = reservationCount;
        document.getElementById('outstandingCount').textContent = outstandingCount;

        if (items.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        tbody.innerHTML = reservations.map(reservation => {
            const resources = reservation.resources.map(item => ({
                name: item.lab_assets?.item_name || 'Unknown item',
                meta: item.lab_assets?.category || 'Item'
            }));
            const quantityList = (getQuantity, label, className = '') => `
                <div class="unreturned-quantity-list ${className}" role="list" aria-label="${label} quantity per resource">
                    ${reservation.resources.map((item, index) => {
                        const quantity = getQuantity(item);
                        return `<div class="unreturned-quantity-item" role="listitem" aria-label="${this.escapeHtml(resources[index].name)}: ${quantity} ${label.toLowerCase()}">${quantity}</div>`;
                    }).join('')}
                </div>
            `;
            return `
                <tr>
                    <td>${this.escapeHtml(this.formatDate(reservation.date))}</td>
                    <td>${this.escapeHtml(reservation.reservation_id)}</td>
                    <td>${this.escapeHtml(`${this.formatTime(reservation.startTime)} – ${this.formatTime(reservation.endTime)}`)}</td>
                    <td>${formatResourceCell(resources)}</td>
                    <td>${quantityList(item => Number(item.quantity_borrowed) || 0, 'Borrowed')}</td>
                    <td>${quantityList(item => Number(item.quantity_returned) || 0, 'Returned')}</td>
                    <td class="unreturned-quantity">${quantityList(item => Math.max(0, (Number(item.quantity_borrowed) || 0) - (Number(item.quantity_returned) || 0)), 'Still in hand', 'unreturned-quantity-list--due')}</td>
                    <td><button type="button" class="btn btn-view" onclick="StudentUnreturnedItems.viewDetails(${reservation.reservation_id})">View</button></td>
                </tr>
            `;
        }).join('');
    },

    groupOutstandingItems(items) {
        const groups = new Map();
        items.forEach(item => {
            const reservation = item.reservations;
            const key = String(item.reservation_id);
            if (!groups.has(key)) {
                groups.set(key, {
                    reservation_id: item.reservation_id,
                    date: reservation.reservation_date,
                    startTime: reservation.start_time,
                    endTime: reservation.end_time,
                    resources: [],
                    borrowed: 0,
                    returned: 0,
                    outstanding: 0
                });
            }

            const group = groups.get(key);
            const borrowed = Number(item.quantity_borrowed) || 0;
            const returned = Number(item.quantity_returned) || 0;
            group.resources.push(item);
            group.borrowed += borrowed;
            group.returned += returned;
            group.outstanding += Math.max(0, borrowed - returned);
        });
        return Array.from(groups.values());
    },

    viewDetails(reservationId) {
        const items = this.items.filter(item => String(item.reservation_id) === String(reservationId));
        if (!items.length) {
            this.detailsModal.open('Reservation Items', '<p>No items were found for this reservation.</p>');
            return;
        }

        const resources = items.map(item => {
            const asset = item.lab_assets || {};
            return { name: asset.item_name || 'Unknown item', type: asset.category || 'Item', details: getReservationAssetDetails(item.reservations || {}, item) };
        });

        const reservation = items[0].reservations || {};
        this.detailsModal.open('Reservation Details', renderReservationDetails([
            { label: 'Reservation ID', value: reservationId },
            { label: 'Date', value: reservation.reservation_date },
            { label: 'Time', value: `${reservation.start_time || 'N/A'} - ${reservation.end_time || 'N/A'}` },
            { label: 'Status', value: reservation.status }
        ], resources));
    },

    formatDate(value) {
        if (!value) return 'N/A';
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
    },

    formatTime(value) {
        if (!value) return 'N/A';
        const [hour, minute] = value.split(':');
        const date = new Date();
        date.setHours(Number(hour), Number(minute), 0, 0);
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
        const tbody = document.getElementById('unreturnedItemsTable');
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#b42318">${this.escapeHtml(message)}</td></tr>`;
    }
};

window.addEventListener('DOMContentLoaded', () => StudentUnreturnedItems.init());
