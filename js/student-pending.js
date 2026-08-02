/**
 * Student Pending Reservations Module
 * Handles fetching and displaying pending student reservations
 */

class StudentPendingReservations {
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
            this.loadPendingReservations();
            this.setupModalListeners();
        } else {
            window.location.href = '../../index.html';
        }
    }

    setupModalListeners() {
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('viewModal');
            if (event.target === modal) {
                this.closeModal();
            }
        });

        // Close modal when pressing Escape key
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    loadUserInfo() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.firstname) {
            const fullName = user.firstname + ' ' + user.lastname;
            const userNameSidebarElement = document.getElementById('userNameSidebar');
            const userAvatarElement = document.getElementById('userAvatar');

            if (userNameSidebarElement) userNameSidebarElement.textContent = fullName;
            if (userAvatarElement) {
                userAvatarElement.textContent = (user.firstname.charAt(0) + user.lastname.charAt(0)).toUpperCase();
            }
        }
    }

    async loadPendingReservations() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            
            // Query reservations from Supabase - only show where either professor or admin approval is pending
            const { data: reservations, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name)
                `)
                .eq('user_id', user.id)
                .or('professor_approval.eq.Pending,admin_approval.eq.Pending')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Format reservations to match expected structure
            this.reservations = reservations.map(res => ({
                id: res.reservation_id,
                date: res.reservation_date,
                start_time: res.start_time,
                end_time: res.end_time,
                resources: res.room_name || 'Lab Room',
                year_section: res.year_section,
                course: res.course,
                professor_name: res.professor,
                status: res.status,
                professor_approval: res.professor_approval,
                admin_approval: res.admin_approval
            }));

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
                <button onclick="studentPending.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="studentPending.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="studentPending.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="studentPending.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="studentPending.changePageSize(this.value)">
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
        const timeRange = `${reservation.start_time} - ${reservation.end_time}`;
        
        return `
            <tr>
                <td>${reservation.date}</td>
                <td>${timeRange}</td>
                <td>${reservation.resources || 'No resources'}</td>
                <td>${reservation.year_section || 'N/A'}</td>
                <td>${reservation.course || 'N/A'}</td>
                <td>${reservation.professor_name || 'N/A'}</td>
                <td>${approvalStatus}</td>
                <td>
                    <button class="btn btn-view" onclick="studentPending.viewDetails(${reservation.id})">View</button>
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

    getStatusColor(status) {
        const statusColors = {
            'Pending Professor Approval': '#f39c12',
            'Pending Admin Approval': '#e74c3c',
            'Pending': '#f39c12',
            'Approved': '#27ae60',
            'Rejected': '#e74c3c'
        };
        return statusColors[status] || '#7f8c8d';
    }

    viewDetails(reservationId) {
        // Find the reservation data
        const reservation = this.reservations.find(r => r.id === reservationId);
        if (reservation) {
            this.showModal(reservation);
        } else {
            alert('Reservation not found');
        }
    }

    showModal(reservation) {
        const modal = document.getElementById('viewModal');
        const modalBody = document.getElementById('modalBody');
        
        const statusColor = this.getStatusColor(reservation.status);
        const approvalStatus = this.getApprovalStatus(reservation.professor_approval, reservation.admin_approval);
        
        modalBody.innerHTML = `
            <div class="summary-item">
                <div class="summary-label">Reservation ID</div>
                <div class="summary-value">#${reservation.id}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Date</div>
                <div class="summary-value">${reservation.date}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Time</div>
                <div class="summary-value">${reservation.start_time} - ${reservation.end_time}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Resources</div>
                <div class="summary-value">${reservation.resources || 'No resources'}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Year & Section</div>
                <div class="summary-value">${reservation.year_section || 'N/A'}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Course</div>
                <div class="summary-value">${reservation.course || 'N/A'}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Professor</div>
                <div class="summary-value">${reservation.professor_name || 'N/A'}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Overall Status</div>
                <div class="summary-value" style="color: ${statusColor}; font-weight: 600;">${reservation.status}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Approval Status</div>
                <div class="summary-value">${approvalStatus}</div>
            </div>
        `;
        
        modal.style.display = 'block';
    }

    closeModal() {
        const modal = document.getElementById('viewModal');
        modal.style.display = 'none';
    }

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'none';
        this.removePagination();
    }

    refresh() {
        this.loadPendingReservations();
    }
}

// Initialize the module
const studentPending = new StudentPendingReservations();

// Make it globally accessible for onclick handlers
window.studentPending = studentPending;
