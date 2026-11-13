// Shows future reservations owned by the authenticated student.
const StudentUpcoming = {
    async init() {
        let sessionUser = {};
        try {
            sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        } catch (error) {
            sessionUser = {};
        }

        if (String(sessionUser.role || '').toLowerCase() !== 'student') {
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
            const { data, error } = await supabase
                .from('reservations')
                .select(`
                    reservation_id, created_at, reservation_date, start_time, end_time, status,
                    is_deleted, rooms(room_name),
                    reservation_items(quantity_borrowed, quantity_returned, lab_assets(item_name, category)),
                    chemical_usage(quantity_used, unit, chemicals(chemical_name))
                `)
                .eq('user_id', user.id)
                .eq('professor_approval', 'Approved')
                .eq('admin_approval', 'Approved')
                .eq('is_deleted', false)
                .in('status', ['Approved', 'Ongoing', 'Partially Returned'])
                .order('created_at', { ascending: false })
                .order('reservation_id', { ascending: false });

            if (error) throw error;

            const now = new Date();
            this.render((data || []).filter(reservation =>
                new Date(`${reservation.reservation_date}T${reservation.start_time}`) > now
            ));
        } catch (error) {
            console.error('Unable to load student upcoming reservations:', error);
            this.showMessage('Unable to load your upcoming reservations. Please refresh the page.');
        }
    },

    render(reservations) {
        const rows = reservations.map(reservation => {
            const resources = [];
            if (reservation.rooms?.room_name) resources.push({ name: reservation.rooms.room_name, meta: 'Room · Qty 1' });
            (reservation.reservation_items || []).forEach(item => {
                if (item.lab_assets?.item_name) resources.push({
                    name: item.lab_assets.item_name,
                    meta: `${item.lab_assets.category || 'Asset'} · Qty ${Number(item.quantity_borrowed) || 0}`
                });
            });
            (reservation.chemical_usage || []).forEach(item => {
                if (item.chemicals?.chemical_name) {
                    const unit = item.unit ? ` ${item.unit}` : '';
                    resources.push({
                        name: item.chemicals.chemical_name,
                        meta: `Chemical · Qty ${Number(item.quantity_used) || 0}${unit}`
                    });
                }
            });

            return `<tr><td>${this.escape(reservation.reservation_date)}</td><td>${this.escape(`${reservation.start_time} - ${reservation.end_time}`)}</td><td>${formatResourceCell(resources, 'None')}</td><td><span class="status-badge approved">${this.escape(reservation.status || 'Approved')}</span></td></tr>`;
        }).join('');

        const tbody = document.getElementById('upcomingReservationsTable');
        const emptyState = document.getElementById('upcomingEmpty');
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No upcoming reservations found</td></tr>';
            emptyState.style.display = 'none';
            return;
        }

        tbody.innerHTML = rows;
        emptyState.style.display = 'none';
    },

    showMessage(message) {
        document.getElementById('upcomingReservationsTable').innerHTML = `<tr><td colspan="4">${this.escape(message)}</td></tr>`;
        document.getElementById('upcomingEmpty').style.display = 'none';
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    }
};

window.addEventListener('DOMContentLoaded', () => StudentUpcoming.init());
window.addEventListener('content:navigation', () => {
    if (window.location.pathname.endsWith('/student_upcoming.html')) StudentUpcoming.init();
});
