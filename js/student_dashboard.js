        // Update current date and time
        function updateDateTime() {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const dateString = now.toLocaleDateString('en-US', options);
            const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            
            document.getElementById('currentDate').textContent = dateString;
            document.getElementById('currentTime').textContent = timeString;
        }

        // Calendar navigation
        let currentWeekOffset = 0;
        
        function updateWeekDisplay() {
            const today = new Date();
            const currentWeek = new Date(today);
            currentWeek.setDate(today.getDate() + (currentWeekOffset * 7));
            
            const startOfWeek = new Date(currentWeek);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
            startOfWeek.setDate(diff);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            const startString = startOfWeek.toLocaleDateString('en-US', options);
            const endString = endOfWeek.toLocaleDateString('en-US', options);
            
            document.getElementById('weekRange').textContent = `${startString} - ${endString}`;
            
            // Update calendar days
            updateCalendarDays(startOfWeek);
        }
        
        async function updateCalendarDays(startDate) {
            const calendarDays = document.querySelectorAll('.calendar-day');
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            
            try {
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6);
                
                // Fetch reservations for the current week
                const { data: reservations, error } = await supabase
                    .from('reservations')
                    .select(`
                        reservation_id,
                        reservation_date,
                        start_time,
                        end_time,
                        additional_note,
                        professor_approval,
                        admin_approval,
                        rooms(room_name),
                        reservation_items(lab_assets(item_name)),
                        chemical_usage(chemicals(chemical_name))
                    `)
                    .eq('user_id', user.id)
                    .eq('professor_approval', 'Approved')
                    .eq('admin_approval', 'Approved')
                    .gte('reservation_date', startDate.toISOString().split('T')[0])
                    .lte('reservation_date', endDate.toISOString().split('T')[0]);

                if (error) throw error;

                // Create a map of reservations by date
                const reservationsByDate = {};
                if (reservations) {
                    reservations.forEach(res => {
                        if (!reservationsByDate[res.reservation_date]) {
                            reservationsByDate[res.reservation_date] = [];
                        }
                        reservationsByDate[res.reservation_date].push(res);
                    });
                }
                
                calendarDays.forEach((dayElement, index) => {
                    const currentDate = new Date(startDate);
                    currentDate.setDate(startDate.getDate() + index);
                    
                    const dayHeader = dayElement.querySelector('.day-header');
                    const dayDate = dayElement.querySelector('.day-date');
                    const dayEvents = dayElement.querySelector('.day-events');
                    
                    dayHeader.textContent = dayNames[index];
                    dayDate.textContent = currentDate.getDate();
                    
                    // Clear existing events
                    dayEvents.innerHTML = '';
                    
                    // Add events from database for this date
                    const dateStr = currentDate.toISOString().split('T')[0];
                    const dayReservations = reservationsByDate[dateStr] || [];
                    
                    dayReservations.forEach(res => {
                        const resources = [
                            ...(res.reservation_items || []).map(item => item.lab_assets?.item_name),
                            ...(res.chemical_usage || []).map(item => item.chemicals?.chemical_name)
                        ].filter(Boolean);
                        const locationOrResources = [
                            ...(res.rooms?.room_name ? [res.rooms.room_name] : []),
                            ...resources
                        ];
                        const reservationDetails = locationOrResources.length
                            ? locationOrResources.join(', ')
                            : (res.additional_note || 'Reservation');
                        const formatScheduleTime = value => {
                            if (!value) return '';
                            const [hourText, minute = '00'] = value.split(':');
                            const hour = Number(hourText);
                            return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
                        };
                        const eventDiv = document.createElement('div');
                        eventDiv.className = 'event-item approved';
                        const timeRange = `${formatScheduleTime(res.start_time)}${res.end_time ? `–${formatScheduleTime(res.end_time)}` : ''}`;
                        const fullDetails = `Reservation #${res.reservation_id}: ${reservationDetails}${timeRange ? ` · ${timeRange}` : ''}${res.additional_note ? ` · ${res.additional_note}` : ''}`;
                        eventDiv.textContent = `#${res.reservation_id} ${reservationDetails} · ${timeRange}`;
                        eventDiv.title = fullDetails;
                        eventDiv.setAttribute('aria-label', fullDetails);
                        dayEvents.appendChild(eventDiv);
                    });
                });
            } catch (error) {
                console.error('Error loading calendar events:', error);
                // Fallback to empty calendar on error
                calendarDays.forEach((dayElement, index) => {
                    const dayHeader = dayElement.querySelector('.day-header');
                    const dayDate = dayElement.querySelector('.day-date');
                    const dayEvents = dayElement.querySelector('.day-events');
                    
                    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    const currentDate = new Date(startDate);
                    currentDate.setDate(startDate.getDate() + index);
                    
                    dayHeader.textContent = dayNames[index];
                    dayDate.textContent = currentDate.getDate();
                    dayEvents.innerHTML = '';
                });
            }
        }
        
        function previousWeek() {
            currentWeekOffset--;
            updateWeekDisplay();
        }
        
        function nextWeek() {
            currentWeekOffset++;
            updateWeekDisplay();
        }

        // Load student data and dashboard metrics
        async function loadStudentData() {
            try {
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                
                // Update student name
                const studentName = document.getElementById('userName')?.textContent || 'Student Name';
                document.getElementById('studentName').textContent = studentName;
                
                // Fetch reservation counts from Supabase
                const { data: allReservations, error } = await supabase
                    .from('reservations')
                    .select('status, professor_approval, admin_approval, reservation_date, approved_at')
                    .eq('user_id', user.id);
                
                if (error) throw error;
                
                // Calculate metrics
                const totalReservations = allReservations?.length || 0;
                const pendingRequests = allReservations?.filter(r => 
                    r.professor_approval === 'Pending' || r.admin_approval === 'Pending'
                ).length || 0;
                
                const manilaDate = date => {
                    const parts = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Manila',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).formatToParts(date);
                    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
                    return `${values.year}-${values.month}-${values.day}`;
                };
                const today = manilaDate(new Date());
                const approvedToday = allReservations?.filter(r => 
                    r.professor_approval === 'Approved' && 
                    r.admin_approval === 'Approved' && 
                    r.approved_at &&
                    manilaDate(new Date(r.approved_at)) === today
                ).length || 0;
                
                // Update dashboard metrics
                document.getElementById('myReservationsCount').textContent = totalReservations;
                document.getElementById('pendingRequestsCount').textContent = pendingRequests;
                document.getElementById('approvedTodayCount').textContent = approvedToday;

                loadUpcomingReservations();
                
            } catch (error) {
                console.error('Error loading student data:', error);
                // Set default values on error
                document.getElementById('myReservationsCount').textContent = '0';
                document.getElementById('pendingRequestsCount').textContent = '0';
                document.getElementById('approvedTodayCount').textContent = '0';
            }
        }

        async function loadUpcomingReservations() {
            try {
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                const today = new Date().toISOString().split('T')[0];
                const { data: reservations, error } = await supabase
                    .from('reservations')
                    .select(`
                        reservation_id,
                        created_at,
                        reservation_date,
                        start_time,
                        end_time,
                        status,
                        professor_approval,
                        admin_approval,
                        rooms(room_name),
                        reservation_items(quantity_borrowed, lab_assets(item_name, category)),
                        chemical_usage(quantity_used, unit, chemicals(chemical_name))
                    `)
                    .eq('user_id', user.id)
                    .eq('professor_approval', 'Approved')
                    .eq('admin_approval', 'Approved')
                    .gte('reservation_date', today)
                    .order('created_at', { ascending: false })
                    .order('reservation_id', { ascending: false })
                    .limit(5);

                if (error) throw error;

                const container = document.getElementById('upcomingReservationsList');
                if (!reservations || reservations.length === 0) {
                    container.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;padding:20px;">No upcoming reservations</td></tr>';
                    return;
                }

                container.innerHTML = reservations.map(reservation => {
                    const resources = [];
                    if (reservation.rooms?.room_name) resources.push({ name: reservation.rooms.room_name, meta: 'Room · Qty 1' });
                    (reservation.reservation_items || []).forEach(item => {
                        if (item.lab_assets?.item_name) resources.push({
                            name: item.lab_assets.item_name,
                            meta: `${item.lab_assets.category || 'Asset'} · Qty ${Number(item.quantity_borrowed) || 0}`
                        });
                    });
                    (reservation.chemical_usage || []).forEach(item => {
                        if (item.chemicals?.chemical_name) {
                            const unit = item.unit ? ` ${item.unit}` : '';
                            resources.push({
                                name: item.chemicals.chemical_name,
                                meta: `Chemical · Qty ${Number(item.quantity_used) || 0}${unit}`
                            });
                        }
                    });

                    return `
                        <tr>
                            <td>${reservation.reservation_date}</td>
                            <td>${reservation.start_time} - ${reservation.end_time}</td>
                            <td>${formatResourceCell(resources, 'No resources recorded')}</td>
                            <td><span class="status-badge approved">${reservation.status || 'Approved'}</span></td>
                        </tr>
                    `;
                }).join('');
            } catch (error) {
                console.error('Error loading upcoming reservations:', error);
                document.getElementById('upcomingReservationsList').innerHTML = '<tr><td colspan="4" style="text-align:center;color:#e74c3c;padding:20px;">Error loading reservations</td></tr>';
            }
        }

        // Initialize dashboard
        function initializeStudentDashboard() {
            if (!document.getElementById('currentDate')) return;
            updateDateTime();
            if (window.__studentDashboardClock) clearInterval(window.__studentDashboardClock);
            window.__studentDashboardClock = setInterval(updateDateTime, 1000);
            updateWeekDisplay();
            loadStudentData();
            loadUserData();
            loadAnnouncements();
        }

        document.addEventListener('DOMContentLoaded', initializeStudentDashboard);
        window.addEventListener('content:navigation', initializeStudentDashboard);

        function quickReserve(assetId) {
            // Pre-fill reservation form with this item
            sessionStorage.setItem('preselectedItem', assetId);
            window.location.href = 'reservation_student.html';
        }

        // Load user data and validate session
        function loadUserData() {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            if (user.username && user.role === 'Student') {
                const firstName = user.firstname || 'Student';
                const lastName = user.lastname || 'User';
                const fullName = firstName + ' ' + lastName;
                document.getElementById('studentName').textContent = fullName;
            } else {
                window.location.href = '../../index.html';
            }
        }

        // Load announcements from Supabase
        async function loadAnnouncements() {
            try {
                const now = new Date().toISOString();
                
                const { data: announcements, error } = await supabase
                    .from('announcement')
                    .select('title, content, publish_at')
                    .eq('is_published', true)
                    .lte('publish_at', now)
                    .or('expires_at.is.null,expires_at.gte.' + now)
                    .order('publish_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                const container = document.getElementById('announcementsList');
                
                if (!announcements || announcements.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-state-icon">📢</div>
                            <div class="empty-state-text">No announcements</div>
                            <div class="empty-state-subtext">Check back later for updates</div>
                        </div>
                    `;
                    return;
                }

                let html = '';
                const icons = ['📋', '🔧', '🎉', '⚠️', 'ℹ️', '📢'];
                
                announcements.forEach((announcement, index) => {
                    const icon = icons[index % icons.length];
                    const date = new Date(announcement.publish_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    
                    html += `
                        <div class="announcement-item">
                            <div class="announcement-icon">${icon}</div>
                            <div class="announcement-content">
                                <h4>${announcement.title}</h4>
                                <p>${announcement.content}</p>
                                <span class="announcement-date">${date}</span>
                            </div>
                        </div>
                    `;
                });
                
                container.innerHTML = html;
            } catch (error) {
                console.error('Error loading announcements:', error);
                const container = document.getElementById('announcementsList');
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">❌</div>
                        <div class="empty-state-text">Error loading announcements</div>
                        <div class="empty-state-subtext">Please try refreshing the page</div>
                    </div>
                `;
            }
        }
    
