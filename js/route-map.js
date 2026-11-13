// Maps clean URLs (e.g. /student/dashboard) to their physical page files.
// Page scripts use scilabPagePath() so their page checks work on both URL styles.
(function () {
    const routes = {
        '/': '/index.html',
        '/login': '/index.html',
        '/signup': '/pages/signup.html',
        '/forgot-password': '/pages/forgot-password.html',
        '/reset-password': '/pages/reset-password.html',
        '/student/dashboard': '/pages/student/student_dashboard.html',
        '/student/reservation': '/pages/student/reservation_student.html',
        '/student/pending': '/pages/student/student_pending.html',
        '/student/approved': '/pages/student/student_approved.html',
        '/student/history': '/pages/student/student_history.html',
        '/student/unreturned': '/pages/student/student_unreturned.html',
        '/student/upcoming': '/pages/student/student_upcoming.html',
        '/student/settings': '/pages/student/settings.html',
        '/professor/dashboard': '/pages/professor/professor_dashboard.html',
        '/professor/reservation': '/pages/professor/professor_new_reservation.html',
        '/professor/pending': '/pages/professor/professor_pending_approval.html',
        '/professor/history': '/pages/professor/professor_reservation_history.html',
        '/professor/my-upcoming': '/pages/professor/professor_my_upcoming.html',
        '/professor/my-unreturned': '/pages/professor/professor_my_unreturned.html',
        '/professor/account-approvals': '/pages/professor/account_approvals.html',
        '/professor/student-approvals': '/pages/professor/student_approvals.html',
        '/professor/approved': '/pages/professor/student_approved_reservation.html',
        '/professor/upcoming': '/pages/professor/student_upcoming_reservations.html',
        '/professor/unreturned': '/pages/professor/professor_unreturned.html',
        '/professor/settings': '/pages/professor/settings.html',
        '/reports/history': '/pages/history_reports.html',
        '/reports/reservations': '/pages/reservation_reports.html'
    };

    window.scilabPagePath = function (path) {
        let p = path || window.location.pathname;
        try { p = new URL(p, window.location.origin).pathname; } catch (e) { /* keep raw */ }
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        if (routes[p]) return routes[p];
        // Vercel cleanUrls serves /pages/x/y.html as /pages/x/y
        if (p.startsWith('/pages/') && !p.endsWith('.html')) return p + '.html';
        return p;
    };
})();
