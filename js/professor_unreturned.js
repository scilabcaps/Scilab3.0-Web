/**
 * professor_unreturned.js
 * Handles functionality for professor unreturned items page
 */

const CACHE_KEY = 'professor_unreturned_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ProfessorUnreturned = {
    formattedItems: [],
    studentsArray: [],
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.loadUnreturnedItems();
        } else {
            window.location.href = '../../index.html';
        }
    },

    getCachedData() {
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
    },

    setCachedData(data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    },

    clearCache() {
        localStorage.removeItem(CACHE_KEY);
    },

    async loadUnreturnedItems() {
        try {
            const cachedData = this.getCachedData();
            if (cachedData) {
                this.formattedItems = cachedData.formattedItems;
                this.studentsArray = cachedData.studentsArray;
                this.currentPage = 1;
                this.displayItems();
                this.displayStudents();
                return;
            }

            const { data: items, error } = await supabase
                .from('reservation_items')
                .select(`
                    *,
                    reservations!inner(
                        reservation_date,
                        start_time,
                        user_info!inner(first_name, last_name, email, year_section)
                    ),
                    lab_assets!inner(item_name, category)
                `)
                .eq('is_returned', false)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const unreturnedItems = items.filter(item => item.quantity_returned < item.quantity_borrowed);

            const formattedItems = unreturnedItems.map(item => ({
                student_name: item.reservations.user_info ?
                    `${item.reservations.user_info.first_name} ${item.reservations.user_info.last_name}` : 'N/A',
                student_email: item.reservations.user_info?.email || 'N/A',
                year_section: item.reservations.user_info?.year_section || 'N/A',
                resource_name: item.lab_assets.item_name,
                resource_type: item.lab_assets.category,
                borrowed_quantity: item.quantity_borrowed,
                returned_quantity: item.quantity_returned,
                unreturned_quantity: item.quantity_borrowed - item.quantity_returned,
                reservation_date: item.reservations.reservation_date,
                reservation_time: item.reservations.start_time
            }));

            const studentsMap = new Map();
            formattedItems.forEach(item => {
                const key = item.student_name;
                if (!studentsMap.has(key)) {
                    studentsMap.set(key, {
                        student_name: item.student_name,
                        student_email: item.student_email,
                        year_section: item.year_section,
                        items: []
                    });
                }
                studentsMap.get(key).items.push(item);
            });

            const studentsArray = Array.from(studentsMap.values());

            this.formattedItems = formattedItems;
            this.studentsArray = studentsArray;
            this.currentPage = 1;
            this.setCachedData({ formattedItems, studentsArray });

            this.displayItems();
            this.displayStudents();
        } catch (error) {
            console.error('Error loading unreturned items:', error);
            this.displayItems([]);
            this.displayStudents([]);
        }
    },

    displayItems(items) {
        const itemsToDisplay = items || this.formattedItems;
        const tbody = document.getElementById('itemsTable');

        if (itemsToDisplay.length === 0) {
            document.getElementById('itemsEmptyState').style.display = 'block';
            tbody.innerHTML = '';
            this.removePagination();
        } else {
            document.getElementById('itemsEmptyState').style.display = 'none';
            this.renderPage(itemsToDisplay);
            this.renderPaginationControls(itemsToDisplay.length);
        }
    },

    renderPage(items) {
        const tbody = document.getElementById('itemsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = items.slice(start, end);

        tbody.innerHTML = pageData.map(item => {
            return `
                <tr>
                    <td>${item.student_name || 'N/A'}</td>
                    <td>${item.year_section || 'N/A'}</td>
                    <td>${item.resource_name}</td>
                    <td>${item.resource_type}</td>
                    <td>${item.borrowed_quantity}</td>
                    <td>${item.returned_quantity}</td>
                    <td class="unreturned-qty">${item.unreturned_quantity}</td>
                    <td>${item.reservation_date}</td>
                </tr>
            `;
        }).join('');
    },

    renderPaginationControls(totalCount) {
        this.removePagination();
        if (totalCount <= this.pageSize) return;

        const totalPages = Math.ceil(totalCount / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" id="paginationInfo">Showing ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button onclick="ProfessorUnreturned.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="ProfessorUnreturned.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="ProfessorUnreturned.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="ProfessorUnreturned.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="ProfessorUnreturned.changePageSize(this.value)">
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
        const totalPages = Math.ceil(this.formattedItems.length / this.pageSize);
        if (page < 1 || page > totalPages) return;
        this.currentPage = page;
        this.renderPage(this.formattedItems);
        this.renderPaginationControls(this.formattedItems.length);
    },

    changePageSize(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        this.renderPage(this.formattedItems);
        this.renderPaginationControls(this.formattedItems.length);
    },

    displayStudents() {
        const container = document.getElementById('studentsList');
        if (this.studentsArray.length === 0) {
            document.getElementById('studentsEmptyState').style.display = 'block';
            container.innerHTML = '';
        } else {
            document.getElementById('studentsEmptyState').style.display = 'none';
            container.innerHTML = `
                <h3 style="color: #152614; margin-bottom: 20px;">Students Grouped by Student</h3>
                ${this.studentsArray.map(student => {
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
                                ${student.year_section || 'N/A'} |
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
};

window.addEventListener('DOMContentLoaded', function () {
    ProfessorUnreturned.init();
});
