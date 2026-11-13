const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'professor_my_upcoming.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'professor', 'professor_my_upcoming.html'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '20261024_professor_cancel_own_approved_reservation.sql'), 'utf8');
const elements = {
    myUpcomingReservationsTable: { innerHTML: '' },
    myUpcomingEmpty: { style: {} },
    professorUpcomingDetailsBody: { innerHTML: '' },
    professorUpcomingDialogCancel: { hidden: true },
    professorUpcomingDetailsModal: { classList: { add() {}, remove() {} } }
};
const context = vm.createContext({
    Date,
    document: { getElementById: id => elements[id], addEventListener() {} },
    window: { location: { pathname: '/professor_my_upcoming.html', href: '' }, addEventListener() {} },
    sessionStorage: { getItem: () => JSON.stringify({ role: 'professor' }) },
    console,
    formatResourceCell: () => '',
    renderReservationDetails: (fields, resources) => [
        ...fields.map(field => `${field.label}: ${field.value}`),
        ...resources.map(resource => resource.name)
    ].join('|'),
    getReservationAssetDetails: () => [],
    getReservationChemicalDetails: () => []
});
vm.runInContext(source, context);

test('upcoming reservation rows show View without a row-level Cancel action', () => {
    const row = vm.runInContext(`(() => {
        ProfessorMyUpcoming.render([{
            reservation_id: 8, reservation_date: '2099-01-01', start_time: '09:00', end_time: '10:00',
            status: 'Approved', rooms: { room_name: 'Lab A' }
        }]);
        return document.getElementById('myUpcomingReservationsTable').innerHTML;
    })()`, context);
    assert.match(row, /ProfessorMyUpcoming\.viewDetails\(8\)/);
    assert.doesNotMatch(row, /ProfessorMyUpcoming\.cancelReservation\(8\)/);

    const ongoingRow = vm.runInContext(`(() => {
        ProfessorMyUpcoming.render([{
            reservation_id: 9, reservation_date: '2099-01-01', start_time: '09:00', end_time: '10:00',
            status: 'Ongoing'
        }]);
        return document.getElementById('myUpcomingReservationsTable').innerHTML;
    })()`, context);
    assert.match(ongoingRow, /ProfessorMyUpcoming\.viewDetails\(9\)/);
    assert.doesNotMatch(ongoingRow, /ProfessorMyUpcoming\.cancelReservation\(9\)/);
});

test('view action renders receipt details and opens the modal', () => {
    vm.runInContext(`
        ProfessorMyUpcoming.reservations = [{
            reservation_id: 12, created_at: '2026-10-24T00:00:00Z', reservation_date: '2099-01-01',
            start_time: '09:00', end_time: '10:00', status: 'Approved', professor_approval: 'Approved',
            admin_approval: 'Approved', year_section: 'BSIT 3A', course: 'Chemistry', professor: 'Prof A',
            additional_note: 'Prepare lab', rooms: { room_name: 'Lab A' }, reservation_items: [], chemical_usage: []
        }];
        ProfessorMyUpcoming.detailsModal = { open: (title, content) => { modalTitle = title; modalContent = content; }, close: () => {} };
        var modalTitle = '', modalContent = '';
        ProfessorMyUpcoming.viewDetails(12);
    `, context);
    assert.equal(vm.runInContext('modalTitle', context), 'Reservation Details');
    const content = vm.runInContext('modalContent', context);
    for (const field of ['Reservation ID: 12', 'Reservation Date: 2099-01-01', 'Reservation Time: 09:00 - 10:00', 'Status: Approved', 'Lab A']) {
        assert.ok(content.includes(field), `expected receipt to include ${field}`);
    }
    assert.match(html, /id="professorUpcomingDetailsModal"/);
    assert.match(html, /id="professorUpcomingDialogCancel"[\s\S]*?ProfessorMyUpcoming\.cancelReservationFromDetails\(\)/);
    assert.equal(elements.professorUpcomingDialogCancel.hidden, false);
    assert.ok(html.indexOf('../../js/modal.js') < html.indexOf('../../js/professor_my_upcoming.js'));
});

test('details dialog hides cancellation for ineligible reservations', () => {
    vm.runInContext(`
        ProfessorMyUpcoming.reservations = [{
            reservation_id: 14, reservation_date: '2099-01-01', start_time: '09:00', end_time: '10:00',
            status: 'Ongoing', professor_approval: 'Approved', admin_approval: 'Approved'
        }];
        ProfessorMyUpcoming.viewDetails(14);
    `, context);
    assert.equal(elements.professorUpcomingDialogCancel.hidden, true);
});

test('confirmed cancellation calls RPC and refreshes; rejection does not call RPC', async () => {
    vm.runInContext(`
        var confirmed = true, calls = [], reloads = 0, successCount = 0;
        showConfirmDialog = async () => confirmed;
        showSuccessSnackbar = () => { successCount += 1; };
        showErrorSnackbar = () => {};
        supabase = { rpc: async (...args) => { calls.push(args); return { error: null }; } };
        ProfessorMyUpcoming.userId = 'professor-user';
        ProfessorMyUpcoming.loadReservations = async id => { if (id === 'professor-user') reloads += 1; };
    `, context);
    vm.runInContext(`ProfessorMyUpcoming.reservations = [{
        reservation_id: 12, reservation_date: '2099-01-01', start_time: '09:00', end_time: '10:00',
        status: 'Approved', professor_approval: 'Approved', admin_approval: 'Approved'
    }]; ProfessorMyUpcoming.viewDetails(12);`, context);
    await vm.runInContext('ProfessorMyUpcoming.cancelReservationFromDetails()', context);
    assert.equal(vm.runInContext('calls[0][0]', context), 'professor_cancel_own_approved_reservation');
    assert.equal(vm.runInContext('calls[0][1].p_reservation_id', context), 12);
    assert.equal(vm.runInContext('reloads', context), 1);
    assert.equal(vm.runInContext('successCount', context), 1);
    assert.equal(vm.runInContext('ProfessorMyUpcoming.activeReservationId', context), null);

    vm.runInContext('confirmed = false', context);
    await vm.runInContext('ProfessorMyUpcoming.cancelReservation(13)', context);
    assert.equal(vm.runInContext('calls.length', context), 1);
});

test('professor cancellation RPC validates role, owner, future approved state, and sets Cancelled', () => {
    assert.match(migration, /caller_role IS DISTINCT FROM 'professor'/);
    assert.match(migration, /user_id\s*=\s*auth\.uid\(\)/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /reservation_row\.reservation_date \+ reservation_row\.start_time\) <= now\(\)/);
    assert.match(migration, /SET status = 'Cancelled',[\s\S]*professor_approval = 'Cancelled',[\s\S]*admin_approval = 'Cancelled'/);
    const professorHistory = fs.readFileSync(path.join(__dirname, '..', 'js', 'professor_history.js'), 'utf8');
    const adminHistory = fs.readFileSync(path.join(__dirname, '..', 'pages', 'history_reports.html'), 'utf8');
    assert.match(professorHistory, /'Approved', 'Ongoing', 'Partially Returned', 'Unreturned', 'Completed', 'Cancelled', 'Declined'/);
    assert.match(adminHistory, /status === 'Cancelled'/);
});
