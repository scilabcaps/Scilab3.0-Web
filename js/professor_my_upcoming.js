// Shows future reservations owned by the authenticated professor.
const ProfessorMyUpcoming = {
    reservations: [],
    userId: null,
    detailsModal: null,
    activeReservationId: null,

    async init() {
        if (!window.location.pathname.endsWith('/professor_my_upcoming.html')) return;
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
            this.userId = user.id;
            this.detailsModal = new Modal('professorUpcomingDetailsModal');
            await this.loadReservations(user.id);
        } catch (error) {
            console.error('Unable to load professor upcoming reservations:', error);
            this.showMessage('Unable to load your upcoming reservations. Please refresh the page.');
        }
    },

    async loadReservations(userId) {
        const { data, error } = await supabase
                .from('reservations')
                .select(`
                    reservation_id, created_at, reservation_date, start_time, end_time, status,
                    professor_approval, admin_approval, year_section, course, professor, additional_note,
                    is_deleted, rooms(room_name),
                    reservation_items(quantity_borrowed, quantity_returned, lab_assets(item_name, category)),
                    chemical_usage(quantity_used, unit, chemicals(chemical_name))
                `)
                .eq('user_id', userId)
                .eq('is_deleted', false)
                .eq('professor_approval', 'Approved')
                .eq('admin_approval', 'Approved')
                .in('status', ['Approved', 'Ongoing', 'Partially Returned'])
                .order('created_at', { ascending: false })
                .order('reservation_id', { ascending: false });

        if (error) throw error;
        const now = new Date();
        this.reservations = (data || []).filter(reservation => new Date(`${reservation.reservation_date}T${reservation.start_time}`) > now);
        this.render(this.reservations);
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
            return `<tr><td>${this.escape(reservation.reservation_id)}</td><td>${this.escape(reservation.reservation_date)}</td><td>${this.escape(`${reservation.start_time} - ${reservation.end_time}`)}</td><td>${formatResourceCell(resources, 'None')}</td><td><button type="button" class="btn btn-view" onclick="ProfessorMyUpcoming.viewDetails(${Number(reservation.reservation_id)})">View</button></td></tr>`;
        }).join('');
        document.getElementById('myUpcomingReservationsTable').innerHTML = rows;
        document.getElementById('myUpcomingEmpty').style.display = reservations.length ? 'none' : 'block';
    },

    showMessage(message) {
        document.getElementById('myUpcomingReservationsTable').innerHTML = `<tr><td colspan="5">${this.escape(message)}</td></tr>`;
        document.getElementById('myUpcomingEmpty').style.display = 'none';
    },

    viewDetails(reservationId) {
        const reservation = this.reservations.find(item => String(item.reservation_id) === String(reservationId));
        if (!reservation) return;
        this.activeReservationId = reservation.reservation_id;

        const resources = [];
        if (reservation.rooms?.room_name) resources.push({ name: reservation.rooms.room_name, type: 'Room' });
        (reservation.reservation_items || []).forEach(item => {
            if (item.lab_assets?.item_name) resources.push({
                name: item.lab_assets.item_name,
                type: item.lab_assets.category || 'Asset',
                details: getReservationAssetDetails(reservation, item)
            });
        });
        (reservation.chemical_usage || []).forEach(item => {
            if (item.chemicals?.chemical_name) resources.push({
                name: item.chemicals.chemical_name,
                type: 'Chemical',
                details: getReservationChemicalDetails(reservation, item)
            });
        });
        const fields = [
            { label: 'Reservation ID', value: reservation.reservation_id },
            { label: 'Created At', value: reservation.created_at ? new Date(reservation.created_at).toLocaleString() : 'N/A' },
            { label: 'Reservation Date', value: reservation.reservation_date || 'N/A' },
            { label: 'Reservation Time', value: `${reservation.start_time || 'N/A'} - ${reservation.end_time || 'N/A'}` },
            { label: 'Year & Section', value: reservation.year_section },
            { label: 'Course', value: reservation.course },
            { label: 'Professor', value: reservation.professor },
            { label: 'Status', value: reservation.status },
            { label: 'Professor Approval', value: reservation.professor_approval },
            { label: 'Admin Approval', value: reservation.admin_approval }
        ];
        document.getElementById('professorUpcomingDetailsBody').innerHTML = renderReservationDetails(fields, resources, {
            note: reservation.additional_note,
            emptyResources: 'None'
        });
        const canCancel = reservation.status === 'Approved'
            && reservation.professor_approval === 'Approved'
            && reservation.admin_approval === 'Approved'
            && new Date(`${reservation.reservation_date}T${reservation.start_time}`).getTime() > Date.now();
        document.getElementById('professorUpcomingDialogCancel').hidden = !canCancel;
        this.detailsModal.open('Reservation Details', document.getElementById('professorUpcomingDetailsBody').innerHTML);
    },

    closeDetails() {
        this.activeReservationId = null;
        if (this.detailsModal) this.detailsModal.close();
        else document.getElementById('professorUpcomingDetailsModal')?.classList.remove('active');
    },

    cancelReservationFromDetails() {
        if (this.activeReservationId === null) return;
        return this.cancelReservation(this.activeReservationId);
    },

    async cancelReservation(reservationId) {
        const confirmed = await showConfirmDialog(
            'Cancel Reservation',
            'Are you sure you want to cancel this reservation? This action cannot be undone.',
            'Cancel Reservation',
            'Keep Reservation',
            'danger'
        );
        if (!confirmed) return;

        try {
            const { error } = await supabase.rpc('professor_cancel_own_approved_reservation', {
                p_reservation_id: reservationId
            });
            if (error) throw error;
            showSuccessSnackbar('Reservation cancelled. It is now in reservation history.');
            if (String(this.activeReservationId) === String(reservationId)) this.closeDetails();
            if (this.userId) await this.loadReservations(this.userId);
        } catch (error) {
            console.error('Unable to cancel professor reservation:', error);
            showErrorSnackbar('Unable to cancel this reservation. Please refresh and try again.');
        }
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    }
};

window.addEventListener('DOMContentLoaded', () => ProfessorMyUpcoming.init());
