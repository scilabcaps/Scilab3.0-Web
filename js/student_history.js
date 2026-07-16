/**
 * student_history.js
 * Handles loading and displaying student reservation history
 */

window.addEventListener('DOMContentLoaded', function() {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username && user.role === 'Student') {
        loadReservations(user.id);
    } else {
        window.location.href = '../index.html';
    }
});

/**
 * Get status color based on status value
 */
function getStatusColor(status) {
    const statusColors = {
        'Pending': '#e74c3c', // Red for pending returns
        'Pending for return': '#e74c3c', // Red for pending returns
        'Completed': '#31CB00', // Green for completed
        'Approved': '#31CB00', // Green for approved
        'Returned': '#31CB00', // Green for returned
        'Cancelled': '#f44336', // Red for cancelled
        'Rejected': '#f44336' // Red for rejected
    };
    return statusColors[status] || '#7f8c8d'; // Default gray
}

/**
 * Get display text for status
 */
function getStatusDisplayText(status) {
    if (status === 'Pending') {
        return 'Pending for return';
    }
    return status;
}

/**
 * Load student's reservation history from Supabase
 */
async function loadReservations(userId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Query only completed, cancelled, declined, or expired reservations for the user
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select(`
                *,
                rooms(room_name)
            `)
            .eq('user_id', userId)
            .or('status.in.(Completed,Cancelled,Declined),and(status.in.(Approved,Ongoing,Partially Returned),reservation_date.lt.' + today + ')')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('reservationsTable');
        
        if (!reservations || reservations.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
            tbody.innerHTML = '';
        } else {
            document.getElementById('emptyState').style.display = 'none';
            tbody.innerHTML = reservations.map(res => {
                const statusColor = getStatusColor(res.status);
                const statusText = getStatusDisplayText(res.status);
                return `
                    <tr>
                        <td>${res.reservation_date}</td>
                        <td>${res.start_time} - ${res.end_time}</td>
                        <td>${res.room_name || 'Lab Room'}</td>
                        <td>${res.year} - ${res.section}</td>
                        <td>${res.professor}</td>
                        <td><span style="color: ${statusColor}; font-weight: 600;">${statusText}</span></td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading reservations:', error);
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('reservationsTable').innerHTML = '';
    }
}

/**
 * View details of a specific reservation
 */
function viewDetails(id) {
    alert('Viewing reservation details for ID: ' + id);
    // This will open a detailed view modal
}
