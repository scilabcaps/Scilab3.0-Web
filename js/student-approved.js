/**
 * Student Approved Reservations Module
 * Handles fetching and displaying approved student reservations
 */

class StudentApprovedReservations {
    constructor() {
        this.reservations = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadUserInfo();
    }

    setupEventListeners() {
        document.addEventListener('keydown', event => {
            const modal = document.getElementById('studentApprovedDetailsModal');
            if (event.key === 'Escape' && modal?.classList.contains('active')) this.closeDetails();
        });
        document.addEventListener('click', event => {
            const modal = document.getElementById('studentApprovedDetailsModal');
            if (event.target === modal) this.closeDetails();
        });
        // DOM ready event
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
        } else {
            this.onDOMReady();
        }
    }

    onDOMReady() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Student') {
            this.loadUserInfo();
            this.loadApprovedReservations();
        } else {
            window.location.href = '../../index.html';
        }
    }

    loadUserInfo() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.firstname) {
            const fullName = user.firstname + ' ' + user.lastname;
            const userNameElement = document.getElementById('userName');
            const userNameSidebarElement = document.getElementById('userNameSidebar');
            const userAvatarElement = document.getElementById('userAvatar');

            if (userNameElement) userNameElement.textContent = fullName;
            if (userNameSidebarElement) userNameSidebarElement.textContent = fullName;
            if (userAvatarElement) {
                userAvatarElement.textContent = (user.firstname.charAt(0) + user.lastname.charAt(0)).toUpperCase();
            }
        }
    }

    async loadApprovedReservations() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            
            // Query approved reservations from Supabase - only show where both professor and admin are approved
            const { data: reservations, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name, is_deleted),
                    reservation_items(
                        quantity_borrowed,
                        quantity_returned,
                        is_deleted,
                        lab_assets(item_name, category, is_deleted)
                    ),
                    chemical_usage(
                        quantity_used,
                        unit,
                        is_deleted,
                        chemicals(chemical_name, is_deleted)
                    )
                `)
                .eq('user_id', user.id)
                .eq('professor_approval', 'Approved')
                .eq('admin_approval', 'Approved')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Keep one reservation row while listing every linked resource.
            this.reservations = reservations.map(res => {
                const resources = [];
                const rooms = Array.isArray(res.rooms) ? res.rooms : [res.rooms];
                rooms.forEach(room => {
                    if (room?.room_name && !room.is_deleted) resources.push({ name: room.room_name, meta: 'Room' });
                });

                (res.reservation_items || []).forEach(item => {
                    const asset = item.lab_assets;
                    if (!item.is_deleted && asset?.item_name && !asset.is_deleted) {
                        const quantity = Number(item.quantity_borrowed) || 0;
                        resources.push({ name: asset.item_name, meta: `${asset.category || 'Asset'}${quantity > 1 ? ` · x${quantity}` : ''}` });
                    }
                });

                (res.chemical_usage || []).forEach(usage => {
                    const chemical = usage.chemicals;
                    if (!usage.is_deleted && chemical?.chemical_name && !chemical.is_deleted) {
                        const amount = usage.quantity_used;
                        const quantity = amount === null || amount === undefined
                            ? ''
                            : ` (${amount}${usage.unit ? ` ${usage.unit}` : ''})`;
                        resources.push({ name: chemical.chemical_name, meta: `Chemical${quantity ? ` · ${quantity.slice(2, -1)}` : ''}` });
                    }
                });

                return {
                    id: res.reservation_id,
                    date: res.reservation_date,
                    startTime: res.start_time,
                    endTime: res.end_time,
                    reservation_date: res.reservation_date,
                    start_time: res.start_time,
                    end_time: res.end_time,
                    reservation_items: res.reservation_items || [],
                    chemical_usage: res.chemical_usage || [],
                    rooms: res.rooms,
                    additional_note: res.additional_note,
                    resources,
                    year_section: res.year_section,
                    course: res.course,
                    professor: res.professor,
                    status: res.status,
                    professor_approval: res.professor_approval,
                    admin_approval: res.admin_approval
                };
            });

            this.renderReservations();
        } catch (error) {
            console.error('Error fetching reservations:', error);
            this.showError('Failed to load reservations');
        }
    }

    renderReservations() {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (!this.reservations || this.reservations.length === 0) {
            if (tbody) tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            this.removePagination();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        this.currentPage = 1;
        this.renderPage();
        this.renderPaginationControls();
    }

    renderPage() {
        const tbody = document.getElementById('reservationsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.reservations.slice(start, end);
        const reservationsHTML = pageData.map(res => this.createReservationRow(res)).join('');
        if (tbody) tbody.innerHTML = reservationsHTML;
    }

    renderPaginationControls() {
        this.removePagination();
        if (this.reservations.length <= this.pageSize) return;

        const totalPages = Math.ceil(this.reservations.length / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" id="paginationInfo">Showing ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button onclick="studentApproved.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="studentApproved.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="studentApproved.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="studentApproved.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="studentApproved.changePageSize(this.value)">
                    ${[5, 10, 25, 50].map(s => `<option value="${s}" ${this.pageSize === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
        `;

        const table = document.querySelector('.data-table table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(container, table.nextSibling);
        }
    }

    removePagination() {
        const existing = document.getElementById('paginationContainer');
        if (existing) existing.remove();
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.reservations.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage();
        this.renderPaginationControls();
    }

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        this.renderPage();
        this.renderPaginationControls();
    }

    createReservationRow(reservation) {
        const approvalStatus = this.getApprovalStatus(reservation.professor_approval, reservation.admin_approval);
        const timeRange = `${reservation.startTime} - ${reservation.endTime}`;
        
        return `
            <tr>
                <td>${reservation.date}</td>
                <td>${timeRange}</td>
                <td>${formatResourceCell(reservation.resources, 'No resources recorded')}</td>
                <td>${reservation.year_section || 'N/A'}</td>
                <td>${reservation.course || 'N/A'}</td>
                <td>${reservation.professor || 'N/A'}</td>
                <td>${approvalStatus}</td>
                <td>
                    <button type="button" class="btn btn-view" onclick="studentApproved.viewDetails(${Number(reservation.id)})">View</button>
                </td>
            </tr>
        `;
    }

    getApprovalStatus(professorApproval, adminApproval) {
        const professorStatus = this.getApprovalBadge(professorApproval, 'Professor');
        const adminStatus = this.getApprovalBadge(adminApproval, 'Admin');
        
        return `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                ${professorStatus}
                ${adminStatus}
            </div>
        `;
    }

    getApprovalBadge(status, type) {
        const colors = {
            'Pending': '#f39c12',
            'Approved': '#27ae60',
            'Declined': '#e74c3c',
            'Cancelled': '#95a5a6',
            'Completed': '#3498db'
        };
        
        const color = colors[status] || '#7f8c8d';
        
        return `
            <span style="
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                background: ${color}20;
                color: ${color};
                border: 1px solid ${color}40;
            ">
                ${type}: ${status}
            </span>
        `;
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
    }

    getStatusColor(status) {
        const statusColors = {
            'Approved': '#31CB00',
            'Completed': '#31CB00',
            'Rejected': '#f44336',
            'Cancelled': '#f44336'
        };
        return statusColors[status] || '#7f8c8d';
    }

    viewDetails(reservationId) {
        const reservation = this.reservations.find(r => String(r.id) === String(reservationId));
        if (reservation) {
            const resources = [];
            const rooms = Array.isArray(reservation.rooms) ? reservation.rooms : [reservation.rooms];
            rooms.filter(room => room?.room_name && !room.is_deleted).forEach(room => resources.push({ name: room.room_name, type: 'Room' }));
            (reservation.reservation_items || []).filter(item => !item.is_deleted && item.lab_assets?.item_name && !item.lab_assets.is_deleted).forEach(item => {
                resources.push({ name: item.lab_assets.item_name, type: item.lab_assets.category || 'Asset', details: getReservationAssetDetails(reservation, item) });
            });
            (reservation.chemical_usage || []).filter(item => !item.is_deleted && item.chemicals?.chemical_name && !item.chemicals.is_deleted).forEach(item => {
                resources.push({ name: item.chemicals.chemical_name, type: 'Chemical', details: getReservationChemicalDetails(reservation, item) });
            });
            const modal = document.getElementById('studentApprovedDetailsModal');
            document.getElementById('studentApprovedDetailsBody').innerHTML = renderReservationDetails([
                { label: 'Reservation ID', value: reservation.id },
                { label: 'Date', value: reservation.date },
                { label: 'Time', value: `${reservation.startTime} - ${reservation.endTime}` },
                { label: 'Year & Section', value: reservation.year_section },
                { label: 'Course', value: reservation.course },
                { label: 'Professor', value: reservation.professor },
                { label: 'Status', value: reservation.status }
            ], resources, { note: reservation.additional_note });
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            console.error('Approved reservation not found:', reservationId);
        }
    }

    closeDetails() {
        const modal = document.getElementById('studentApprovedDetailsModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'none';
        this.removePagination();
    }

    refresh() {
        this.loadApprovedReservations();
    }
}

// Initialize the module
const studentApproved = new StudentApprovedReservations();

// Make it globally accessible for onclick handlers
window.studentApproved = studentApproved;
