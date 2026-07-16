/**
 * professor_review.js
 * Handles functionality for professor student review page
 */

const CACHE_KEY = 'student_approvals_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (short-term cache for frequently changing data)

window.addEventListener('DOMContentLoaded', function () {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username && user.role === 'Professor') {
        loadPendingRequests();
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

async function loadPendingRequests() {
    try {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const professorName = user.firstname + ' ' + user.lastname;
        
        console.log('Loading requests for professor:', professorName);
        
        // Try to get cached data first
        const cachedData = getCachedData();
        if (cachedData) {
            displayRequests(cachedData);
            return;
        }
        
        // Query reservations pending professor approval from Supabase
        const { data: requests, error } = await supabase
            .from('reservations')
            .select(`
                *,
                rooms(room_name),
                reservation_items(
                    lab_assets(item_name)
                ),
                chemical_usage(
                    chemicals(chemical_name)
                )
            `)
            .eq('professor_approval', 'Pending')
            .eq('professor', professorName)
            .order('created_at', { ascending: false });

        console.log('Requests found:', requests);
        console.log('Error:', error);

        if (error) throw error;

        // Fetch user info for each reservation
        if (requests && requests.length > 0) {
            const userIds = [...new Set(requests.map(r => r.user_id).filter(id => id))];
            const { data: users, error: userError } = await supabase
                .from('user_info')
                .select('id, first_name, last_name')
                .in('id', userIds);
            
            if (userError) console.error('Error fetching users:', userError);
            
            // Map users by id for easy lookup
            const userMap = {};
            if (users) {
                users.forEach(u => {
                    userMap[u.id] = u;
                });
            }
            
            // Attach user info to each request
            requests.forEach(req => {
                req.user_info = userMap[req.user_id] || null;
            });
        }

        // Cache the results
        setCachedData(requests);
        displayRequests(requests);
    } catch (error) {
        console.error('Error loading requests:', error);
        document.getElementById('emptyState').style.display = 'block';
    }
}

function displayRequests(requests) {
    const tbody = document.getElementById('reservationsTable');
    if (!requests || requests.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        tbody.innerHTML = '';
    } else {
        document.getElementById('emptyState').style.display = 'none';
        tbody.innerHTML = requests.map(req => {
            // Format year and section
            const yearSection = req.year && req.section ? `${req.year} - ${req.section}` : 
                              req.year ? req.year : 
                              req.section ? req.section : 'N/A';
            
            const studentName = req.user_info ? `${req.user_info.first_name} ${req.user_info.last_name}` : 'N/A';
            
            // Build resources display
            let resourcesDisplay = '';
            
            // Add room if present
            if (req.room_name) {
                resourcesDisplay += req.room_name;
            }
            
            // Add equipment and glassware from reservation_items
            if (req.reservation_items && req.reservation_items.length > 0) {
                const assets = req.reservation_items
                    .map(item => item.lab_assets ? item.lab_assets.item_name : 'Unknown')
                    .join(', ');
                if (resourcesDisplay) resourcesDisplay += '<br>';
                resourcesDisplay += assets;
            }
            
            // Add chemicals from chemical_usage
            if (req.chemical_usage && req.chemical_usage.length > 0) {
                const chemicals = req.chemical_usage
                    .map(chem => chem.chemicals ? chem.chemicals.chemical_name : 'Unknown')
                    .join(', ');
                if (resourcesDisplay) resourcesDisplay += '<br>';
                resourcesDisplay += chemicals;
            }
            
            if (!resourcesDisplay) resourcesDisplay = 'No resources';
            
            return `
                <tr>
                    <td>${studentName}</td>
                    <td>${req.reservation_date}</td>
                    <td>${req.start_time} - ${req.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${yearSection}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-approve" onclick="approveRequest(${req.reservation_id})">Approve</button>
                            <button class="btn btn-decline" onclick="declineRequest(${req.reservation_id})">Decline</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

async function approveRequest(id) {
    const confirmed = await showConfirmDialog(
        'Approve Request',
        'Are you sure you want to approve this request? It will be sent to admin for final approval.',
        'Approve',
        'Cancel',
        'success'
    );
    
    if (confirmed) {
        try {
            // Update reservation in Supabase
            const { error } = await supabase
                .from('reservations')
                .update({ 
                    professor_approval: 'Approved',
                    status: 'Pending'
                })
                .eq('reservation_id', id);

            if (error) throw error;

            // Clear cache to ensure fresh data on next load
            clearCache();
            
            showSuccessSnackbar('Request approved! Sent to admin for final approval.');
            loadPendingRequests();
        } catch (error) {
            console.error('Error:', error);
            showErrorSnackbar('Error approving request. Please try again.');
        }
    }
}

async function declineRequest(id) {
    const confirmed = await showConfirmDialog(
        'Decline Request',
        'Are you sure you want to decline this request? This action cannot be undone.',
        'Decline',
        'Cancel',
        'danger'
    );
    
    if (confirmed) {
        try {
            // Update reservation in Supabase
            const { error } = await supabase
                .from('reservations')
                .update({ 
                    professor_approval: 'Declined',
                    status: 'Declined'
                })
                .eq('reservation_id', id);

            if (error) throw error;

            // Clear cache to ensure fresh data on next load
            clearCache();
            
            showSuccessSnackbar('Request declined successfully.');
            loadPendingRequests();
        } catch (error) {
            console.error('Error:', error);
            showErrorSnackbar('Error declining request. Please try again.');
        }
    }
}
