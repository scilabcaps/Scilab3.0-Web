/**
 * professor_unreturned.js
 * Handles functionality for professor unreturned items page
 */

const CACHE_KEY = 'professor_unreturned_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes (short-term cache for frequently changing data)

window.addEventListener('DOMContentLoaded', function () {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username && user.role === 'Professor') {
        loadUnreturnedItems();
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

async function loadUnreturnedItems() {
    try {
        // Try to get cached data first
        const cachedData = getCachedData();
        if (cachedData) {
            displayItems(cachedData.formattedItems);
            displayStudents(cachedData.studentsArray);
            return;
        }
        
        // Query reservation items from Supabase
        const { data: items, error } = await supabase
            .from('reservation_items')
            .select(`
                *,
                reservations!inner(
                    reservation_date,
                    start_time,
                    user_info!inner(first_name, last_name, email),
                    year,
                    section
                ),
                lab_assets!inner(item_name, category)
            `)
            .eq('is_returned', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter items where quantity_returned < quantity_borrowed
        const unreturnedItems = items.filter(item => item.quantity_returned < item.quantity_borrowed);

        // Format items for display
        const formattedItems = unreturnedItems.map(item => ({
            student_name: item.reservations.user_info ? 
                `${item.reservations.user_info.first_name} ${item.reservations.user_info.last_name}` : 'N/A',
            student_email: item.reservations.user_info?.email || 'N/A',
            year: item.reservations.year,
            section: item.reservations.section,
            resource_name: item.lab_assets.item_name,
            resource_type: item.lab_assets.category,
            borrowed_quantity: item.quantity_borrowed,
            returned_quantity: item.quantity_returned,
            unreturned_quantity: item.quantity_borrowed - item.quantity_returned,
            reservation_date: item.reservations.reservation_date,
            reservation_time: item.reservations.start_time
        }));

        // Group by student
        const studentsMap = new Map();
        formattedItems.forEach(item => {
            const key = item.student_name;
            if (!studentsMap.has(key)) {
                studentsMap.set(key, {
                    student_name: item.student_name,
                    student_email: item.student_email,
                    year: item.year,
                    section: item.section,
                    items: []
                });
            }
            studentsMap.get(key).items.push(item);
        });

        const studentsArray = Array.from(studentsMap.values());

        // Cache the results
        setCachedData({ formattedItems, studentsArray });
        
        displayItems(formattedItems);
        displayStudents(studentsArray);
    } catch (error) {
        console.error('Error loading unreturned items:', error);
        displayItems([]);
        displayStudents([]);
    }
}

function displayItems(items) {
    const tbody = document.getElementById('itemsTable');
    if (items.length === 0) {
        document.getElementById('itemsEmptyState').style.display = 'block';
        tbody.innerHTML = '';
    } else {
        document.getElementById('itemsEmptyState').style.display = 'none';
        tbody.innerHTML = items.map(item => {
            console.log('Processing unreturned item:', item);
            
            return `
                <tr>
                    <td>${item.student_name || 'N/A'}</td>
                    <td>${item.year ? item.year + (item.section ? ' - ' + item.section : '') : 'N/A'}</td>
                    <td>${item.resource_name}</td>
                    <td>${item.resource_type}</td>
                    <td>${item.borrowed_quantity}</td>
                    <td>${item.returned_quantity}</td>
                    <td class="unreturned-qty">${item.unreturned_quantity}</td>
                    <td>${item.reservation_date}</td>
                </tr>
            `;
        }).join('');
    }
}

function displayStudents(students) {
    const container = document.getElementById('studentsList');
    if (students.length === 0) {
        document.getElementById('studentsEmptyState').style.display = 'block';
        container.innerHTML = '';
    } else {
        document.getElementById('studentsEmptyState').style.display = 'none';
        container.innerHTML = `
            <h3 style="color: #152614; margin-bottom: 20px;">Students Grouped by Student</h3>
            ${students.map(student => {
            const itemsHtml = student.items.map(item => `
                <div class="unreturned-item">
                    <div class="item-info">
                        <div class="item-name">${item.resource_name} (${item.resource_type})</div>
                        <div class="item-details">
                            Borrowed: ${item.borrowed_quantity} | Returned: ${item.returned_quantity} | 
                            <span class="unreturned-qty">Unreturned: ${item.unreturned_quantity}</span> | 
                            Reservation: ${item.reservation_date} ${item.reservation_time}
                        </div>
                    </div>
                </div>
            `).join('');

            return `
                <div class="student-section">
                    <div class="student-header">
                        <div class="student-name">${student.student_name}</div>
                        <div class="student-info">
                            ${student.year ? student.year + (student.section ? ' - ' + student.section : '') : 'N/A'} | 
                            Email: ${student.student_email}
                        </div>
                    </div>
                    ${itemsHtml}
                </div>
            `;
        }).join('')}
        `;
    }
}
