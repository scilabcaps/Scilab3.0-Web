/**
 * Student Approved Reservations Module
 * Handles fetching and displaying approved student reservations
 */

class StudentApprovedReservations {
    constructor() {
        this.reservations = [];
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
            this.loadApprovedReservations();
        } else {
            window.location.href = '../index.html';
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
                    rooms(room_name)
                `)
                .eq('user_id', user.id)
                .eq('professor_approval', 'Approved')
                .eq('admin_approval', 'Approved')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Format reservations to match expected structure
            this.reservations = reservations.map(res => ({
                id: res.reservation_id,
                date: res.reservation_date,
                startTime: res.start_time,
                endTime: res.end_time,
                resources: res.room_name || 'Lab Room',
                year: res.year,
                section: res.section,
                professor: res.professor,
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
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        const reservationsHTML = this.reservations.map(res => this.createReservationRow(res)).join('');
        if (tbody) tbody.innerHTML = reservationsHTML;
    }

    createReservationRow(reservation) {
        const approvalStatus = this.getApprovalStatus(reservation.professor_approval, reservation.admin_approval);
        const timeRange = `${reservation.startTime} - ${reservation.endTime}`;
        
        return `
            <tr>
                <td>${reservation.date}</td>
                <td>${timeRange}</td>
                <td>${reservation.resources || 'No resources'}</td>
                <td>${reservation.year ? `${reservation.year} - ${reservation.section || ''}` : 'N/A'}</td>
                <td>${reservation.professor || 'N/A'}</td>
                <td>${approvalStatus}</td>
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
            'Approved': '#31CB00',
            'Completed': '#31CB00',
            'Rejected': '#f44336',
            'Cancelled': '#f44336'
        };
        return statusColors[status] || '#7f8c8d';
    }

    viewDetails(reservationId) {
        // Find the reservation data
        const reservation = this.reservations.find(r => r.id === reservationId);
        if (reservation) {
            // You can implement a modal or redirect to a details page
            alert(`Reservation Details:\n\nID: ${reservation.id}\nDate: ${reservation.date}\nTime: ${reservation.startTime} - ${reservation.endTime}\nResources: ${reservation.resources}\nStatus: ${reservation.status}`);
        } else {
            alert('Reservation not found');
        }
    }

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');
        
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'none';
    }

    refresh() {
        this.loadApprovedReservations();
    }
}

// Initialize the module
const studentApproved = new StudentApprovedReservations();

// Make it globally accessible for onclick handlers
window.studentApproved = studentApproved;
