const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'professor_approved.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'professor', 'student_approved_reservation.html'), 'utf8');

function renderRow(reservation) {
    const tbody = { innerHTML: '' };
    const context = vm.createContext({
        window: { addEventListener() {}, location: { pathname: '/student_approved_reservation.html' } },
        document: { getElementById: id => id === 'reservationsTable' ? tbody : null },
        sessionStorage: { getItem: () => '{}' },
        console,
        formatResourceCell: () => ''
    });
    vm.runInContext(script, context);
    context.reservation = reservation;
    vm.runInContext('ProfessorApproved.reservations = [reservation]; ProfessorApproved.renderPage();', context);
    return tbody.innerHTML;
}

test('student reservations page shows only Unreturned for an unreturned row', () => {
    const row = renderRow({
        reservation_id: 5,
        reservation_date: '2026-10-25',
        start_time: '09:00',
        end_time: '10:00',
        status: 'Unreturned',
        admin_approval: 'Approved',
        user_info: { first_name: 'Student', last_name: 'A' }
    });

    assert.match(row, /status-unreturned">Unreturned/);
    assert.equal((row.match(/Unreturned/g) || []).length, 1);
    assert.match(html, /<th>Status<\/th>/);
    assert.match(html, /\.status-unreturned\s*\{[^}]*color:\s*#dc2626/s);
    assert.match(html, /\.approval-status\s*\{[^}]*background-color:\s*transparent/s);
});

test('a reservation status takes priority over the admin approval in the table', () => {
    const row = renderRow({
        reservation_id: 6,
        reservation_date: '2026-10-25',
        start_time: '09:00',
        end_time: '10:00',
        status: 'Ongoing',
        admin_approval: 'Approved',
        user_info: { first_name: 'Student', last_name: 'B' }
    });

    assert.match(row, /status-ongoing">Ongoing/);
    assert.doesNotMatch(row, />Approved</);
});

test('table displays each reservation lifecycle status and maps Approved to Upcoming', () => {
    const cases = [
        ['Approved', 'Upcoming', 'status-approved'],
        ['Completed', 'Completed', 'status-completed'],
        ['Declined', 'Declined', 'status-declined'],
        ['Cancelled', 'Cancelled', 'status-declined'],
        ['Pending', 'Pending', 'status-pending'],
        ['Partially Returned', 'Partially Returned', 'status-partial'],
        ['Unreturned', 'Unreturned', 'status-unreturned']
    ];

    for (const [status, label, statusClass] of cases) {
        const row = renderRow({
            reservation_id: 7,
            reservation_date: '2026-10-25',
            start_time: '09:00',
            end_time: '10:00',
            status,
            admin_approval: 'Approved',
            user_info: { first_name: 'Student', last_name: 'C' }
        });
        assert.match(row, new RegExp(`class="approval-status ${statusClass}">${label}<`));
        assert.doesNotMatch(row, /class="approval-status status-approved">Approved</);
    }
});

test('table falls back to admin approval when a reservation has no status', () => {
    const row = renderRow({
        reservation_id: 8,
        reservation_date: '2026-10-25',
        start_time: '09:00',
        end_time: '10:00',
        status: '',
        admin_approval: 'Approved',
        user_info: { first_name: 'Student', last_name: 'D' }
    });

    assert.match(row, /status-approved">Approved/);
});

test('view details still shows reservation, admin, and professor statuses', () => {
    const details = [];
    const context = vm.createContext({
        window: { addEventListener() {}, location: { pathname: '/student_approved_reservation.html' } },
        document: { getElementById: () => ({ innerHTML: '' }) },
        sessionStorage: { getItem: () => '{}' },
        console,
        formatResourceCell: () => '',
        renderReservationDetails: fields => { details.push(...fields); return 'details'; }
    });
    vm.runInContext(script, context);
    context.reservation = {
        reservation_id: 9,
        status: 'Ongoing',
        admin_approval: 'Approved',
        professor_approval: 'Approved',
        user_info: { first_name: 'Student', last_name: 'E' },
        reservation_items: [],
        chemical_usage: []
    };
    vm.runInContext(`
        ProfessorApproved.reservations = [reservation];
        ProfessorApproved.reservationModal = { open: (_title, content) => { modalContent = content; } };
        var modalContent = '';
        ProfessorApproved.viewDetails(9);
    `, context);

    assert.deepEqual(details.map(field => field.label), ['Student', 'Date', 'Time', 'Reservation Status', 'Admin Status', 'Professor Status']);
});
