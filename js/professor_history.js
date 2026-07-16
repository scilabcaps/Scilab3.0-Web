/**
 * professor_history.js
 * Handles functionality for professor reservation history page
 */

let reservationModal;
const CACHE_KEY = 'professor_history_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

window.addEventListener('DOMContentLoaded', function () {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username && user.role === 'Professor') {
        reservationModal = new Modal('reservationModal');
        loadCompletedReservations();
    } else {
        window.location.href = '../index.html';
    }
});

function getCachedData() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        
        if (now - timestamp > CACHE_TTL) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('Error reading cache:', error);
        return null;
    }
}

function setCachedData(data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.error('Error setting cache:', error);
    }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
}

async function loadCompletedReservations() {
    try {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        // Try to get cached data first
        const cachedData = getCachedData();
        if (cachedData) {
            displayReservations(cachedData);
            return;
        }
        
        // Query completed reservations from Supabase
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select(`
                *,
                rooms(room_name),
                user_info!inner(first_name, last_name)
            `)
            .in('status', ['Completed', 'Cancelled', 'Declined'])
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Cache the results
        setCachedData(reservations);
        displayReservations(reservations);
    } catch (error) {
        console.error('Error loading reservations:', error);
        document.getElementById('emptyState').style.display = 'block';
    }
}

function displayReservations(reservations) {
    const tbody = document.getElementById('reservationsTable');
    if (!reservations || reservations.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        tbody.innerHTML = '';
    } else {
        document.getElementById('emptyState').style.display = 'none';
        tbody.innerHTML = reservations.map(res => {
            // Determine status color based on reservation status
            let statusColor = '#119822'; // Default green for completed
            if (res.status === 'Approved') {
                statusColor = '#119822'; // Green
            } else if (res.status === 'Rejected' || res.status === 'Declined') {
                statusColor = '#dc2626'; // Red
            } else if (res.status === 'Completed') {
                statusColor = '#6b7280'; // Gray for completed
            } else if (res.status === 'Cancelled') {
                statusColor = '#f59e0b'; // Orange for cancelled
            }
            
            // Format resources to ensure proper display
            let resourcesDisplay = res.room_name || 'Lab Room';
            if (!resourcesDisplay) {
                resourcesDisplay = '<span style="color: #6b7280;">No room specified</span>';
            }

            const studentName = res.user_info ? `${res.user_info.first_name} ${res.user_info.last_name}` : 'Unknown';
            
            return `
                <tr>
                    <td>${res.reservation_date}</td>
                    <td>${res.start_time} - ${res.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${studentName}</td>
                    <td>${res.additional_note || 'N/A'}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${res.status}</span></td>
                    <td>
                        <button class="btn btn-view" onclick="viewDetails(${res.reservation_id})">View</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

async function viewDetails(id) {
    try {
        const { data: reservation, error } = await supabase
            .from('reservations')
            .select(`
                *,
                rooms(room_name),
                user_info!inner(first_name, last_name)
            `)
            .eq('reservation_id', id)
            .single();

        if (error) throw error;

        // Determine status color
        let statusColor = '#119822';
        if (reservation.status === 'Rejected' || reservation.status === 'Declined') {
            statusColor = '#dc2626';
        } else if (reservation.status === 'Completed') {
            statusColor = '#6b7280';
        } else if (reservation.status === 'Cancelled') {
            statusColor = '#f59e0b';
        }

        const studentName = reservation.user_info ? 
            `${reservation.user_info.first_name} ${reservation.user_info.last_name}` : 'Unknown';
        const roomName = reservation.rooms?.room_name || 'Lab Room';

        const content = `
            <div class="summary-item">
                <div class="summary-label">Reservation ID</div>
                <div class="summary-value">${reservation.reservation_id}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Date</div>
                <div class="summary-value">${reservation.reservation_date}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Time</div>
                <div class="summary-value">${reservation.start_time} - ${reservation.end_time}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Room</div>
                <div class="summary-value">${roomName}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Student</div>
                <div class="summary-value">${studentName}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Additional Note</div>
                <div class="summary-value">${reservation.additional_note || 'N/A'}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Status</div>
                <div class="summary-value" style="color: ${statusColor}; font-weight: 600;">${reservation.status}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Created At</div>
                <div class="summary-value">${new Date(reservation.created_at).toLocaleString()}</div>
            </div>
        `;

        reservationModal.open('Reservation Details', content);
    } catch (error) {
        console.error('Error fetching reservation details:', error);
        reservationModal.open('Error', '<p style="color: #dc2626;">Failed to load reservation details.</p>');
    }
}
