// Shows unreturned items from the authenticated professor's own reservations.
const ProfessorMyUnreturned = {
    requestedReservationId: new URLSearchParams(window.location.search).get('reservation_id'),

    async init() {
        const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (String(sessionUser.role || '').toLowerCase() !== 'professor') {
            window.location.href = '../../index.html';
            return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = '../../index.html';
            return;
        }

        try {
            const { data, error } = await supabase
                .from('reservation_items')
                .select(`
                    reservation_id, quantity_borrowed, quantity_returned,
                    reservations!inner(reservation_date, start_time, end_time, user_id, is_deleted),
                    lab_assets!inner(item_name, category)
                `)
                .eq('reservations.user_id', user.id)
                .eq('reservations.is_deleted', false)
                .eq('is_deleted', false)
                .eq('is_returned', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            const now = Date.now();
            const items = (data || []).filter(item => {
                const reservation = item.reservations;
                const end = new Date(`${reservation.reservation_date}T${reservation.end_time}`).getTime();
                return Number(item.quantity_returned) < Number(item.quantity_borrowed)
                    && Number.isFinite(end) && end < now;
            });
            this.render(this.requestedReservationId
                ? items.filter(item => String(item.reservation_id) === this.requestedReservationId)
                : items);
        } catch (error) {
            console.error('Unable to load professor unreturned items:', error);
            this.showMessage('Unable to load your unreturned items. Please refresh the page.');
        }
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
            return `<tr><td>${this.escape(group.id)}</td><td>${formatResourceCell(resources)}</td><td>${quantityList(item => Number(item.quantity_borrowed) || 0, 'Borrowed')}</td><td>${quantityList(item => Number(item.quantity_returned) || 0, 'Returned')}</td><td class="unreturned-qty">${quantityList(item => Math.max(0, (Number(item.quantity_borrowed) || 0) - (Number(item.quantity_returned) || 0)), 'Unreturned', 'unreturned-quantity-list--due')}</td><td>${this.escape(group.reservation.reservation_date)}</td></tr>`;
        }).join('');

        document.getElementById('myUnreturnedItemsTable').innerHTML = rows;
        document.getElementById('myUnreturnedEmpty').style.display = rows ? 'none' : 'block';
    },

    showMessage(message) {
        document.getElementById('myUnreturnedItemsTable').innerHTML = `<tr><td colspan="6">${this.escape(message)}</td></tr>`;
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    }
};

window.addEventListener('DOMContentLoaded', () => ProfessorMyUnreturned.init());
