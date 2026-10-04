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

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = '../../index.html';
            return;
        }

        try {
            const { data, error } = await supabase
                .from('reservations')
                .select(`
                    reservation_id, reservation_date, start_time, end_time,
                    is_deleted, rooms(room_name),
                    reservation_items(quantity_borrowed, quantity_returned, lab_assets(item_name, category)),
                    chemical_usage(quantity_used, unit, chemicals(chemical_name))
                `)
                .eq('user_id', user.id)
                .eq('professor_approval', 'Approved')
                .eq('admin_approval', 'Approved')
                .eq('is_deleted', false)
                .in('status', ['Approved', 'Ongoing', 'Partially Returned'])
                .order('reservation_date', { ascending: true })
                .order('start_time', { ascending: true });

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
            if (reservation.rooms?.room_name) resources.push({ name: reservation.rooms.room_name, meta: 'Room' });
            (reservation.reservation_items || []).forEach(item => {
                if (item.lab_assets?.item_name) resources.push({ name: item.lab_assets.item_name, meta: item.lab_assets.category || 'Asset' });
            });
            (reservation.chemical_usage || []).forEach(item => {
                if (item.chemicals?.chemical_name) resources.push({ name: item.chemicals.chemical_name, meta: 'Chemical' });
            });

            return `<tr><td>${this.escape(reservation.reservation_id)}</td><td>${this.escape(reservation.reservation_date)}</td><td>${this.escape(`${reservation.start_time} - ${reservation.end_time}`)}</td><td>${formatResourceCell(resources, 'None')}</td></tr>`;
        }).join('');

        document.getElementById('upcomingReservationsTable').innerHTML = rows;
        document.getElementById('upcomingEmpty').style.display = rows ? 'none' : 'block';
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
