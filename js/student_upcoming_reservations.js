/**
 * Displays future reservations submitted by the current professor's students.
 */
const UpcomingStudentReservations = {
    reservations: [],
    currentPage: 1,
    pageSize: 10,
    reservationModal: null,

    init() {
        let user;
        try {
            user = JSON.parse(sessionStorage.getItem('user') || '{}');
        } catch (error) {
            user = {};
        }

        if (!user.username || user.role !== 'Professor') {
            window.location.href = '../../index.html';
            return;
        }

        this.reservationModal = new Modal('upcomingReservationModal');
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.reservationModal.modal.classList.contains('active')) this.reservationModal.close();
        });
        this.reservationModal.modal.addEventListener('click', event => {
            if (event.target === this.reservationModal.modal) event.stopPropagation();
        });
        this.reservationModal.closeBtn?.addEventListener('click', () => this.reservationModal.close());
        this.loadReservations(user);
    },

    philippinesDateTime(date = new Date()) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).map(part => [part.type, part.value]));
        return {
            date: `${parts.year}-${parts.month}-${parts.day}`,
            time: `${parts.hour}:${parts.minute}:${parts.second}`
        };
    },

    startsAfterNow(reservation, now = this.philippinesDateTime()) {
        const reservationDate = String(reservation.reservation_date || '');
        const reservationTime = String(reservation.start_time || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate) || !/^\d{2}:\d{2}(:\d{2})?$/.test(reservationTime)) return false;

        const normalizedTime = reservationTime.length === 5 ? `${reservationTime}:00` : reservationTime;
        return `${reservationDate}T${normalizedTime}` > `${now.date}T${now.time}`;
    },

    async loadReservations(user) {
        try {
            const professorName = `${user.firstname || user.first_name || ''} ${user.lastname || user.last_name || ''}`.trim();
            if (!professorName) throw new Error('Professor name is missing from the session.');
            const now = this.philippinesDateTime();

            const { data, error } = await supabase
                .from('reservations')
                .select(`
                    reservation_id,
                    reservation_date,
                    start_time,
                    end_time,
                    year_section,
                    course,
                    status,
                    additional_note,
                    professor_approval,
                    admin_approval,
                    rooms(room_name),
                    reservation_items(
                        quantity_borrowed,
                        quantity_returned,
                        lab_assets(item_name, category)
                    ),
                    chemical_usage(
                        quantity_used,
                        unit,
                        chemicals(chemical_name)
                    ),
                    user_info!inner(first_name, last_name, role)
                `)
                .eq('professor', professorName)
                .eq('user_info.role', 'student')
                .eq('professor_approval', 'Approved')
                .eq('admin_approval', 'Approved')
                .in('status', ['Approved', 'Ongoing'])
                .eq('is_deleted', false)
                .gte('reservation_date', now.date)
                .order('reservation_date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;

            this.reservations = (data || []).filter(reservation => this.startsAfterNow(reservation, now));
            this.currentPage = 1;
            this.displayReservations();
        } catch (error) {
            console.error('Error loading upcoming student reservations:', error);
            this.showError('Failed to load upcoming student reservations. Please try again later.');
        }
    },

    displayReservations() {
        const emptyState = document.getElementById('emptyState');
        if (!this.reservations.length) {
            document.getElementById('reservationsTable').innerHTML = '';
            emptyState.style.display = 'block';
            this.removePagination();
            return;
        }

        emptyState.style.display = 'none';
        this.renderPage();
        this.renderPaginationControls();
    },

    getResources(reservation) {
        const resources = [];
        if (reservation.rooms?.room_name) resources.push({ name: reservation.rooms.room_name, meta: 'Room' });
        (reservation.reservation_items || []).forEach(item => {
            if (item.lab_assets?.item_name) resources.push({ name: item.lab_assets.item_name, meta: item.lab_assets.category || 'Asset' });
        });
        (reservation.chemical_usage || []).forEach(item => {
            if (item.chemicals?.chemical_name) resources.push({ name: item.chemicals.chemical_name, meta: 'Chemical' });
        });
        return resources;
    },

    getStudentName(reservation) {
        const info = reservation.user_info || {};
        return `${info.first_name || ''} ${info.last_name || ''}`.trim() || 'Unknown';
    },

    renderPage() {
        const tbody = document.getElementById('reservationsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const pageData = this.reservations.slice(start, start + this.pageSize);

        tbody.innerHTML = pageData.map(reservation => {
            const resources = this.getResources(reservation);
            return `
                <tr>
                    <td>${this.escapeHtml(this.getStudentName(reservation))}</td>
                    <td>${this.escapeHtml(reservation.reservation_date)}</td>
                    <td>${this.escapeHtml(`${reservation.start_time} - ${reservation.end_time}`)}</td>
                    <td>${formatResourceCell(resources)}</td>
                    <td><button type="button" class="btn btn-view" onclick="UpcomingStudentReservations.viewDetails(${Number(reservation.reservation_id)})">View details</button></td>
                </tr>
            `;
        }).join('');
    },

    renderPaginationControls() {
        this.removePagination();
        if (this.reservations.length <= this.pageSize) return;

        const totalPages = Math.ceil(this.reservations.length / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" aria-live="polite">Page ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button type="button" onclick="UpcomingStudentReservations.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''} aria-label="First page">&laquo; First</button>
                <button type="button" onclick="UpcomingStudentReservations.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''} aria-label="Previous page">&lsaquo; Prev</button>
                <button type="button" onclick="UpcomingStudentReservations.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''} aria-label="Next page">Next &rsaquo;</button>
                <button type="button" onclick="UpcomingStudentReservations.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''} aria-label="Last page">Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="upcomingPageSize">Rows:</label>
                <select id="upcomingPageSize" onchange="UpcomingStudentReservations.changePageSize(this.value)">
                    ${[5, 10, 25, 50].map(size => `<option value="${size}" ${this.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}
                </select>
            </div>
        `;

        const table = document.querySelector('.data-table table');
        if (table?.parentNode) table.parentNode.insertBefore(container, table.nextSibling);
    },

    removePagination() {
        document.getElementById('paginationContainer')?.remove();
    },

    goToPage(page) {
        const totalPages = Math.ceil(this.reservations.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage();
        this.renderPaginationControls();
    },

    changePageSize(size) {
        this.pageSize = Number.parseInt(size, 10);
        this.currentPage = 1;
        this.renderPage();
        this.renderPaginationControls();
    },

    viewDetails(id) {
        const reservation = this.reservations.find(item => String(item.reservation_id) === String(id));
        if (!reservation) {
            this.reservationModal.open('Reservation Details', '<p>Reservation details could not be found.</p>');
            return;
        }

        const resources = [];
        if (reservation.rooms?.room_name) {
            resources.push({ name: reservation.rooms.room_name, type: 'Room' });
        }
        (reservation.reservation_items || []).forEach(item => {
            if (!item.lab_assets?.item_name) return;
            resources.push({ name: item.lab_assets.item_name, type: item.lab_assets.category || 'Equipment', details: getReservationAssetDetails(reservation, item) });
        });
        (reservation.chemical_usage || []).forEach(item => {
            if (!item.chemicals?.chemical_name) return;
            resources.push({ name: item.chemicals.chemical_name, type: 'Chemical', details: getReservationChemicalDetails(reservation, item) });
        });

        this.reservationModal.open('Reservation Details', renderReservationDetails([
            { label: 'Reservation ID', value: reservation.reservation_id },
            { label: 'Student', value: this.getStudentName(reservation) },
            { label: 'Date', value: reservation.reservation_date },
            { label: 'Time', value: `${reservation.start_time} - ${reservation.end_time}` },
            { label: 'Year & Section', value: reservation.year_section },
            { label: 'Course', value: reservation.course },
            { label: 'Professor', value: reservation.professor },
            { label: 'Status', value: reservation.status }
        ], resources, { note: reservation.additional_note }));
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
        document.getElementById('reservationsTable').innerHTML = `<tr><td colspan="5" style="text-align: center; color: #e74c3c;">${this.escapeHtml(message)}</td></tr>`;
        document.getElementById('emptyState').style.display = 'none';
        this.removePagination();
    }
};

window.addEventListener('DOMContentLoaded', () => UpcomingStudentReservations.init());
