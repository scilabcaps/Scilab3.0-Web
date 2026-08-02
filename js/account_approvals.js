/**
 * account_approvals.js
 * Handles functionality for professor account approvals page
 */

const CACHE_KEY = 'account_approvals_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const AccountApprovals = {
    accounts: [],
    currentPage: 1,
    pageSize: 10,

    init() {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.username && user.role === 'Professor') {
            this.loadPendingAccounts();
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

    async loadPendingAccounts() {
        try {
            console.log('Loading pending account approvals');

            const cachedData = this.getCachedData();
            if (cachedData) {
                this.accounts = cachedData;
                this.currentPage = 1;
                this.displayAccounts();
                return;
            }

            const { data: accounts, error } = await supabase
                .from('user_info')
                .select('*')
                .eq('isApproved', 0)
                .order('created_at', { ascending: false });

            console.log('Pending accounts found:', accounts);
            console.log('Error:', error);

            if (error) throw error;

            this.accounts = accounts || [];
            this.currentPage = 1;
            this.setCachedData(this.accounts);
            this.displayAccounts();
        } catch (error) {
            console.error('Error loading pending accounts:', error);
            this.showError('Failed to load pending accounts');
        }
    },

    displayAccounts() {
        const emptyState = document.getElementById('emptyState');

        if (!this.accounts || this.accounts.length === 0) {
            const tbody = document.getElementById('accountsTable');
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
        const tbody = document.getElementById('accountsTable');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.accounts.slice(start, end);

        tbody.innerHTML = pageData.map(account => {
            const fullName = account.first_name && account.last_name
                ? `${account.first_name} ${account.last_name}`
                : 'N/A';
            const email = account.email || 'N/A';
            const course = account.course || 'N/A';
            const yearSection = account.year_section || 'N/A';

            return `
                <tr>
                    <td>${fullName}</td>
                    <td>${email}</td>
                    <td>${course}</td>
                    <td>${yearSection}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-approve" onclick="AccountApprovals.approveAccount('${account.id}')">Approve</button>
                            <button class="btn btn-decline" onclick="AccountApprovals.rejectAccount('${account.id}')">Reject</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderPaginationControls() {
        this.removePagination();
        if (this.accounts.length <= this.pageSize) return;

        const totalPages = Math.ceil(this.accounts.length / this.pageSize);
        const container = document.createElement('div');
        container.className = 'pagination-container';
        container.id = 'paginationContainer';
        container.innerHTML = `
            <div class="pagination-info" id="paginationInfo">Showing ${this.currentPage} of ${totalPages}</div>
            <div class="pagination-controls">
                <button onclick="AccountApprovals.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo; First</button>
                <button onclick="AccountApprovals.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <button onclick="AccountApprovals.goToPage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                <button onclick="AccountApprovals.goToPage(${totalPages})" ${this.currentPage === totalPages ? 'disabled' : ''}>Last &raquo;</button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Rows:</label>
                <select id="pageSizeSelect" onchange="AccountApprovals.changePageSize(this.value)">
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
        const totalPages = Math.ceil(this.accounts.length / this.pageSize);
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

    async approveAccount(id) {
        const confirmed = await showConfirmDialog(
            'Approve Account',
            'Are you sure you want to approve this account?',
            'Approve',
            'Cancel',
            'success'
        );

        if (confirmed) {
            try {
                const { error } = await supabase
                    .from('user_info')
                    .update({ isApproved: 1 })
                    .eq('id', id);

                if (error) throw error;

                this.clearCache();
                showSuccessSnackbar('Account approved successfully!');
                this.loadPendingAccounts();
            } catch (error) {
                console.error('Error:', error);
                showErrorSnackbar('Error approving account. Please try again.');
            }
        }
    },

    async rejectAccount(id) {
        const confirmed = await showConfirmDialog(
            'Reject Account',
            'Are you sure you want to reject this account? This action cannot be undone.',
            'Reject',
            'Cancel',
            'danger'
        );

        if (confirmed) {
            try {
                const { error } = await supabase
                    .from('user_info')
                    .update({ isApproved: 2 })
                    .eq('id', id);

                if (error) throw error;

                this.clearCache();
                showSuccessSnackbar('Account rejected successfully.');
                this.loadPendingAccounts();
            } catch (error) {
                console.error('Error:', error);
                showErrorSnackbar('Error rejecting account. Please try again.');
            }
        }
    },

    showError(message) {
        const tbody = document.getElementById('accountsTable');
        const emptyState = document.getElementById('emptyState');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #e74c3c;">${message}</td></tr>`;
        }
        if (emptyState) emptyState.style.display = 'block';
        this.removePagination();
    }
};

window.addEventListener('DOMContentLoaded', function () {
    AccountApprovals.init();
});
