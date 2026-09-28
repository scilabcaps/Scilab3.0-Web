// Shows resources from the student's ended reservations that are still outstanding.
const StudentUnreturnedItems = {
    items: [],
    detailsModal: null,

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
            (Number(item.quantity_borrowed) || 0) > (Number(item.quantity_returned) || 0)
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
            const itemNames = reservation.resources.map(item => this.escapeHtml(item.lab_assets?.item_name || 'Unknown item'));
            const types = [...new Set(reservation.resources.map(item => item.lab_assets?.category || 'Item'))]
                .map(type => this.escapeHtml(type));
            const itemsLabel = reservation.resources.length === 1
                ? itemNames[0]
                : `${reservation.resources.length} items due`;
            return `
                <tr>
                    <td>${this.escapeHtml(this.formatDate(reservation.date))}</td>
                    <td>${this.escapeHtml(reservation.reservation_id)}</td>
                    <td>${this.escapeHtml(`${this.formatTime(reservation.startTime)} – ${this.formatTime(reservation.endTime)}`)}</td>
                    <td><span class="resource-name">${itemsLabel}</span></td>
                    <td><span class="resource-category">${types.join(', ')}</span></td>
                    <td>${reservation.borrowed}</td>
                    <td>${reservation.returned}</td>
                    <td class="unreturned-quantity">${reservation.outstanding}</td>
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
            const borrowed = Number(item.quantity_borrowed) || 0;
            const returned = Number(item.quantity_returned) || 0;
            const outstanding = Math.max(0, borrowed - returned);
            return `
                <article class="unreturned-modal-resource">
                    <h3>${this.escapeHtml(asset.item_name || 'Unknown item')}</h3>
                    <p>Type: ${this.escapeHtml(asset.category || 'Item')}</p>
                    <p>Borrowed: ${borrowed} · Returned: ${returned} · Still in hand: ${outstanding}</p>
                </article>
            `;
        }).join('');

        this.detailsModal.open('Reservation Items', `
            <p><strong>Reservation #${this.escapeHtml(reservationId)}</strong></p>
            <div class="unreturned-modal-resources">${resources}</div>
        `);
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
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#b42318">${this.escapeHtml(message)}</td></tr>`;
    }
};

window.addEventListener('DOMContentLoaded', () => StudentUnreturnedItems.init());
