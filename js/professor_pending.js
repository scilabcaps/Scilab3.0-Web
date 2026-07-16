/**
 * professor_pending.js
 * Handles functionality for professor pending reservations page
 */

let allReservations = [];
let currentFilter = 'all';
const CACHE_KEY = 'professor_pending_cache';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

window.addEventListener('DOMContentLoaded', function () {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username && user.role === 'Professor') {
        loadPendingReservations();
        setupTabButtons();
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

async function loadPendingReservations() {
    try {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        // Try to get cached data first
        const cachedData = getCachedData();
        if (cachedData) {
            allReservations = cachedData || [];
            filterReservations(currentFilter);
            return;
        }
        
        // Query reservations that need admin approval for the current user from Supabase
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select(`
                *,
                rooms(room_name),
                user_info!inner(first_name, last_name),
                reservation_items(
                    lab_assets(item_name, category)
                ),
                chemical_usage(
                    chemicals(chemical_name)
                )
            `)
            .eq('admin_approval', 'Pending')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Cache the results
        setCachedData(reservations);
        allReservations = reservations || [];
        filterReservations(currentFilter);
    } catch (error) {
        console.error('Error loading reservations:', error);
        document.getElementById('emptyState').style.display = 'block';
    }
}

function setupTabButtons() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            // Update filter and refresh display
            currentFilter = this.getAttribute('data-filter');
            filterReservations(currentFilter);
        });
    });
}

function filterReservations(filter) {
    let filteredReservations = allReservations;
    
    if (filter !== 'all') {
        filteredReservations = allReservations.filter(res => {
            if (filter === 'rooms') {
                return res.room_id !== null && res.room_id !== undefined;
            } else if (filter === 'chemicals') {
                return res.chemical_usage && res.chemical_usage.length > 0;
            } else if (filter === 'assets') {
                return res.reservation_items && res.reservation_items.length > 0;
            }
            return true;
        });
    }
    
    displayReservations(filteredReservations);
}

function displayReservations(reservations) {
    const tbody = document.getElementById('reservationsTable');
    if (!reservations || reservations.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        tbody.innerHTML = '';
    } else {
        document.getElementById('emptyState').style.display = 'none';
        tbody.innerHTML = reservations.map(res => {
            // Determine status color based on admin approval status
            let statusColor = '#f59e0b'; // Default orange for pending
            if (res.admin_approval === 'Approved') {
                statusColor = '#119822'; // Green
            } else if (res.admin_approval === 'Rejected') {
                statusColor = '#dc2626'; // Red
            } else if (res.admin_approval === 'Pending') {
                statusColor = '#3b82f6'; // Blue
            }

            // Format resources based on type
            let resourcesDisplay = '';
            
            if (res.room_id && res.rooms) {
                resourcesDisplay = res.rooms.room_name || 'Lab Room';
            } else if (res.chemical_usage && res.chemical_usage.length > 0) {
                const chemicalNames = res.chemical_usage.map(cu => cu.chemicals?.chemical_name).filter(Boolean);
                resourcesDisplay = chemicalNames.join(', ') || 'Chemicals';
            } else if (res.reservation_items && res.reservation_items.length > 0) {
                const assetNames = res.reservation_items.map(ri => ri.lab_assets?.item_name).filter(Boolean);
                resourcesDisplay = assetNames.join(', ') || 'Assets';
            } else {
                resourcesDisplay = '<span style="color: #6b7280;">No resources specified</span>';
            }

            const studentName = res.user_info ? `${res.user_info.first_name} ${res.user_info.last_name}` : 'Unknown';

            return `
                <tr>
                    <td>${res.reservation_date}</td>
                    <td>${res.start_time} - ${res.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${studentName}</td>
                    <td>${res.additional_note || 'N/A'}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${res.admin_approval}</span></td>
                </tr>
            `;
        }).join('');
    }
}

function viewDetails(id) {
    alert('Viewing reservation details for ID: ' + id);
}
{/* <td>
    <button class="btn btn-view" onclick="viewDetails(${res.id})">View</button>
</td> */}