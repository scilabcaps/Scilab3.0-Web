// Shows unreturned items from the authenticated professor's own reservations.
const ProfessorMyUnreturned = {
    items: [],
    detailsModal: null,
    requestedReservationId: new URLSearchParams(window.location.search).get('reservation_id'),

    async init() {
        if (!window.location.pathname.endsWith('/professor_my_unreturned.html')) return;
        const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (String(sessionUser.role || '').toLowerCase() !== 'professor') {
            window.location.href = '../../index.html';
            return;
        }

        const { user, transient } = await getCurrentAuthUser();
        if (!user && !transient) {
            window.location.href = '../../index.html';
            return;
        }
        if (!user) return;

        try {
            this.detailsModal = new Modal('professorMyUnreturnedDetailsModal');
            this.detailsModal.closeBtn?.addEventListener('click', () => this.detailsModal.close());
            const { data, error } = await supabase
                .from('reservation_items')
                .select(`
                    detail_id, reservation_id, quantity_borrowed, quantity_returned, is_returned,
                    reservations!inner(reservation_date, start_time, end_time, user_id, status, professor_approval, admin_approval, is_deleted),
                    lab_assets!inner(item_name, category)
                `)
                .eq('reservations.user_id', user.id)
                .eq('reservations.is_deleted', false)
                .eq('is_deleted', false)
                .eq('is_returned', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            const now = Date.now();
            this.items = (data || []).filter(item => this.isUnreturnedItem(item, now));
            this.render(this.requestedReservationId
                ? this.items.filter(item => String(item.reservation_id) === this.requestedReservationId)
                : this.items);
        } catch (error) {
            console.error('Unable to load professor unreturned items:', error);
            this.showMessage('Unable to load your unreturned items. Please refresh the page.');
        }
    },

    isUnreturnedItem(item, now = Date.now()) {
        const reservation = item?.reservations || {};
        const excludedStates = new Set(['declined', 'rejected', 'cancelled']);
        const hasExcludedState = [
            reservation.status,
            reservation.professor_approval,
            reservation.admin_approval
        ].some(value => excludedStates.has(String(value || '').trim().toLowerCase()));
        if (hasExcludedState) return false;

        const end = new Date(`${reservation.reservation_date}T${reservation.end_time}`).getTime();
        return Number(item.quantity_returned) < Number(item.quantity_borrowed)
            && Number.isFinite(end)
            && end < now;
    },

    render(items) {
        const groups = new Map();
        items.forEach(item => {
            const key = String(item.reservation_id);
            if (!groups.has(key)) groups.set(key, { id: item.reservation_id, reservation: item.reservations, items: [] });
            groups.get(key).items.push(item);
        });

        const rows = [...groups.values()].map(group => {
            const borrowed = group.items.reduce((sum, item) => sum + Number(item.quantity_borrowed || 0), 0);
            const returned = group.items.reduce((sum, item) => sum + Number(item.quantity_returned || 0), 0);
            const resources = group.items.map(item => ({ name: item.lab_assets?.item_name || 'Unknown item', meta: item.lab_assets?.category || 'Item' }));
            const quantityList = (getQuantity, label, className = '') => `
                <div class="unreturned-quantity-list ${className}" role="list" aria-label="${label} quantity per resource">
                    ${group.items.map((item, index) => {
                        const quantity = getQuantity(item);
                        return `<div class="unreturned-quantity-item" role="listitem" aria-label="${this.escape(resources[index].name)}: ${quantity} ${label.toLowerCase()}">${quantity}</div>`;
                    }).join('')}
                </div>
            `;
            return `<tr><td>${this.escape(this.formatDate(group.reservation.reservation_date))}</td><td>${this.escape(group.id)}</td><td>${this.escape(`${this.formatTime(group.reservation.start_time)} – ${this.formatTime(group.reservation.end_time)}`)}</td><td>${formatResourceCell(resources)}</td><td>${quantityList(item => Number(item.quantity_borrowed) || 0, 'Borrowed')}</td><td>${quantityList(item => Number(item.quantity_returned) || 0, 'Returned')}</td><td class="unreturned-qty">${quantityList(item => Math.max(0, (Number(item.quantity_borrowed) || 0) - (Number(item.quantity_returned) || 0)), 'Unreturned', 'unreturned-quantity-list--due')}</td><td><button type="button" class="btn btn-view" onclick="ProfessorMyUnreturned.viewDetails(${group.id})">View</button></td></tr>`;
        }).join('');

        document.getElementById('myUnreturnedItemsTable').innerHTML = rows;
        document.getElementById('myUnreturnedEmpty').style.display = rows ? 'none' : 'block';
    },

    viewDetails(reservationId) {
        const items = this.items.filter(item => String(item.reservation_id) === String(reservationId));
        if (!items.length) {
            this.detailsModal.open('Reservation Items', '<p>No items were found for this reservation.</p>');
            return;
        }
        const reservation = items[0].reservations || {};
        const resources = items.map(item => ({
            name: item.lab_assets?.item_name || 'Unknown item',
            type: item.lab_assets?.category || 'Item',
            details: getReservationAssetDetails(reservation, item)
        }));
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

    showMessage(message) {
        document.getElementById('myUnreturnedItemsTable').innerHTML = `<tr><td colspan="8">${this.escape(message)}</td></tr>`;
        document.getElementById('myUnreturnedEmpty').style.display = 'none';
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    }
};

window.addEventListener('DOMContentLoaded', () => ProfessorMyUnreturned.init());
