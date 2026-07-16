/**
 * professor_approved.js
 * Handles functionality for professor approved student reservations page
 */

const CACHE_KEY = 'professor_approved_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

window.addEventListener('DOMContentLoaded', function () {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username && user.role === 'Professor') {
        loadApprovedReservations();
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

async function loadApprovedReservations() {
    try {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        // Try to get cached data first
        const cachedData = getCachedData();
        if (cachedData) {
            displayReservations(cachedData);
            return;
        }
        
        // Query reservations approved by current professor from Supabase
        const professorFullName = user.firstname + ' ' + user.lastname;
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select(`
                *,
                reservation_items(
                    asset_id,
                    lab_assets!inner(item_name)
                ),
                chemical_usage(
                    chemical_id,
                    chemicals!inner(chemical_name)
                ),
                user_info!inner(first_name, last_name, role)
            `)
            .eq('professor_approval', 'Approved')
            .eq('professor', professorFullName)
            .eq('user_info.role', 'student')
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
            let statusColor = '#119822'; // Default green for approved
            if (res.status === 'Approved') {
                statusColor = '#119822'; // Green
            } else if (res.admin_approval === 'Pending') {
                statusColor = '#f59e0b'; // Orange
            } else if (res.status === 'Rejected') {
                statusColor = '#dc2626'; // Red
            }
            
            // Format resources from reservation_items (assets) and chemical_usage (chemicals)
            let resourcesDisplay = 'No items';
            let items = [];
            
            // Add assets from reservation_items
            if (res.reservation_items && res.reservation_items.length > 0) {
                const assetNames = res.reservation_items
                    .map(item => item.lab_assets ? item.lab_assets.item_name : 'Unknown')
                    .filter(name => name !== 'Unknown');
                items.push(...assetNames);
            }
            
            // Add chemicals from chemical_usage
            if (res.chemical_usage && res.chemical_usage.length > 0) {
                const chemicalNames = res.chemical_usage
                    .map(chem => chem.chemicals ? chem.chemicals.chemical_name : 'Unknown')
                    .filter(name => name !== 'Unknown');
                items.push(...chemicalNames);
            }
            
            if (items.length > 0) {
                resourcesDisplay = items.join(', ');
            } else {
                resourcesDisplay = '<span style="color: #6b7280;">No items specified</span>';
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
                    <td>
                        <button class="btn btn-view" onclick="viewDetails(${res.reservation_id})">View</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function viewDetails(id) {
    alert('Viewing reservation details for ID: ' + id);
}
