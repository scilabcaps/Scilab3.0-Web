/**
 * professor_review.js
 * Handles functionality for professor student review page
 */

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const StudentApprovals = {
    requests: [],
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && String(user.role || '').toLowerCase() === 'professor') {
            this.loadPendingRequests();
        } else {
            window.location.href = '../../index.html';
        }
    },

    getCacheKey(professorName) {
        return `student_approvals_cache:${professorName.trim().toLowerCase()}`;
    },

    getCachedData(professorName) {
        try {
            const cached = localStorage.getItem(this.getCacheKey(professorName));
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();

            if (now - timestamp > CACHE_TTL) {
                localStorage.removeItem(this.getCacheKey(professorName));
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error reading cache:', error);
            return null;
        }
    },

    setCachedData(professorName, data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(this.getCacheKey(professorName), JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    },

    clearCache(professorName) {
        if (professorName) {
            localStorage.removeItem(this.getCacheKey(professorName));
        }
    },

    async loadPendingRequests() {
        try {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            const professorName = `${user.firstname || user.first_name || ''} ${user.lastname || user.last_name || ''}`.trim();

            if (!professorName) {
                throw new Error('Unable to determine the logged-in professor name');
            }

            console.log('Loading requests for professor:', professorName);

            const cachedData = this.getCachedData(professorName);
            if (cachedData) {
                this.requests = cachedData || [];
                this.currentPage = 1;
                this.displayRequests();
                return;
            }

            const { data: requests, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    rooms(room_name),
                    reservation_items(
                        lab_assets(item_name, category)
                    ),
                    chemical_usage(
                        chemicals(chemical_name)
                    )
                `)
                .eq('professor_approval', 'Pending')
                .eq('professor', professorName.trim())
                .order('created_at', { ascending: false });

            console.log('Requests found:', requests);
            console.log('Error:', error);

            if (error) throw error;

            if (requests && requests.length > 0) {
                const userIds = [...new Set(requests.map(r => r.user_id).filter(id => id))];
                const { data: users, error: userError } = await supabase
                    .from('user_info')
                    .select('id, first_name, last_name, year_section')
                    .in('id', userIds);

                if (userError) console.error('Error fetching users:', userError);

                const userMap = {};
                if (users) {
                    users.forEach(u => {
                        userMap[u.id] = u;
                    });
                }

                requests.forEach(req => {
                    req.user_info = userMap[req.user_id] || null;
                });
            }

            this.requests = requests || [];
            this.currentPage = 1;
            this.setCachedData(professorName, this.requests);
            this.displayRequests();
        } catch (error) {
            console.error('Error loading requests:', error);
            this.showError('Failed to load pending requests');
        }
    },

    displayRequests() {
        const emptyState = document.getElementById('emptyState');

        if (!this.requests || this.requests.length === 0) {
            const tbody = document.getElementById('reservationsTable');
            if (tbody) tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            this.removePagination();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        this.renderPage();
        this.renderPaginationControls();
    },

    renderPage() {
        const tbody = document.getElementById('reservationsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.requests.slice(start, end);

        tbody.innerHTML = pageData.map(req => {
            const yearSection = req.user_info?.year_section || 'N/A';
            const studentName = req.user_info ? `${req.user_info.first_name} ${req.user_info.last_name}` : 'N/A';

            const resources = [];

            if (req.room_name) {
                resources.push({ name: req.room_name, meta: 'Room' });
            }

            if (req.reservation_items && req.reservation_items.length > 0) {
                req.reservation_items.forEach(item => {
                    if (item.lab_assets?.item_name) resources.push({ name: item.lab_assets.item_name, meta: item.lab_assets.category || 'Asset' });
                });
            }

            if (req.chemical_usage && req.chemical_usage.length > 0) {
                req.chemical_usage.forEach(usage => {
                    if (usage.chemicals?.chemical_name) resources.push({ name: usage.chemicals.chemical_name, meta: 'Chemical' });
                });
            }

            const resourcesDisplay = formatResourceCell(resources);

            return `
                <tr>
                    <td>${studentName}</td>
                    <td>${req.reservation_date}</td>
                    <td>${req.start_time} - ${req.end_time}</td>
                    <td>${resourcesDisplay}</td>
                    <td>${yearSection}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-approve" onclick="StudentApprovals.approveRequest(${req.reservation_id})">Approve</button>
                            <button class="btn btn-decline" onclick="StudentApprovals.declineRequest(${req.reservation_id})">Decline</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderPaginationControls() {
        this.removePagination();
        if (this.requests.length <= this.pageSize) return;

        const totalPages = Math.ceil(this.requests.length / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" id="paginationInfo">Showing ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button onclick="StudentApprovals.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="StudentApprovals.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="StudentApprovals.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="StudentApprovals.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="StudentApprovals.changePageSize(this.value)">
                    ${[5, 10, 25, 50].map(s => `<option value="${s}" ${this.pageSize === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
        `;

        const table = document.querySelector('.data-table table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(container, table.nextSibling);
        }
    },

    removePagination() {
        const existing = document.getElementById('paginationContainer');
        if (existing) existing.remove();
    },

    goToPage(page) {
        const totalPages = Math.ceil(this.requests.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage();
        this.renderPaginationControls();
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        this.renderPage();
        this.renderPaginationControls();
    },

    async approveRequest(id) {
        const confirmed = await showConfirmDialog(
            'Approve Request',
            'Are you sure you want to approve this request? It will be sent to admin for final approval.',
            'Approve',
            'Cancel',
            'success'
        );

        if (confirmed) {
            try {
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                const professorName = `${user.firstname || user.first_name || ''} ${user.lastname || user.last_name || ''}`.trim();
                const { error } = await supabase
                    .from('reservations')
                    .update({
                        professor_approval: 'Approved',
                        status: 'Pending'
                    })
                    .eq('reservation_id', id)
                    .eq('professor', professorName)
                    .eq('professor_approval', 'Pending');

                if (error) throw error;

                this.clearCache(`${user.firstname || user.first_name || ''} ${user.lastname || user.last_name || ''}`);
                showSuccessSnackbar('Request approved! Sent to admin for final approval.');
                this.loadPendingRequests();
            } catch (error) {
                console.error('Error:', error);
                showErrorSnackbar('Error approving request. Please try again.');
            }
        }
    },

    async declineRequest(id) {
        const confirmed = await showConfirmDialog(
            'Decline Request',
            'Are you sure you want to decline this request? This action cannot be undone.',
            'Decline',
            'Cancel',
            'danger'
        );

        if (confirmed) {
            try {
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                const { error } = await supabase.rpc(
                    'decline_reservation_and_restore_inventory',
                    { p_reservation_id: id, p_reason: null }
                );

                if (error) throw error;

                this.clearCache(`${user.firstname || user.first_name || ''} ${user.lastname || user.last_name || ''}`);
                showSuccessSnackbar('Request declined and reserved inventory restored.');
                this.loadPendingRequests();
            } catch (error) {
                console.error('Error:', error);
                showErrorSnackbar('Error declining request. Please try again.');
            }
        }
    },

    showError(message) {
        const tbody = document.getElementById('reservationsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'block';
        this.removePagination();
    }
};

window.addEventListener('DOMContentLoaded', function () {
    StudentApprovals.init();
});
