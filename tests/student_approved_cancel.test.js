const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'student-approved.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'pages', 'student', 'student_approved.html'), 'utf8');
const elements = {
    studentApprovedDetailsBody: { innerHTML: '' },
    studentApprovedDetailsModal: { classList: { add() {}, remove() {} } },
    studentApprovedDialogCancel: { hidden: true }
};
const context = vm.createContext({
    Date,
    document: {
        addEventListener() {},
        readyState: 'loading',
        getElementById(id) { return elements[id] || null; },
        body: { style: {} }
    },
    sessionStorage: { getItem() { return JSON.stringify({}); } },
    window: { addEventListener() {}, location: { href: '', pathname: '/student_approved.html' } },
    formatResourceCell() { return ''; },
    renderReservationDetails(fields) { return fields.map(field => `${field.label}: ${field.value}`).join('|'); },
    getReservationAssetDetails() { return []; },
    getReservationChemicalDetails() { return []; },
    console
});
vm.runInContext(source, context);

test('approved reservation rows expose View without a row-level Cancel action', () => {
    const row = vm.runInContext(`studentApproved.createReservationRow({
        id: 7,
        date: '2099-01-01',
        startTime: '09:00',
        endTime: '10:00',
        resources: [],
        professor_approval: 'Approved',
        admin_approval: 'Approved',
        canCancel: true
    })`, context);

    assert.match(row, /studentApproved\.viewDetails\(7\)/);
    assert.doesNotMatch(row, /studentApproved\.cancelReservation\(7\)/);
    assert.match(row, /class="approved-reservation-actions"/);
});

test('details dialog shows Cancel for eligible reservations and has dialog actions', () => {
    vm.runInContext(`
        studentApproved.reservations = [{
            id: 17, date: '2099-01-01', startTime: '09:00', endTime: '10:00',
            reservation_date: '2099-01-01', start_time: '09:00', end_time: '10:00',
            resources: [], reservation_items: [], chemical_usage: [], canCancel: true,
            status: 'Approved', professor_approval: 'Approved', admin_approval: 'Approved'
        }];
        studentApproved.viewDetails(17);
    `, context);
    assert.equal(vm.runInContext('studentApproved.activeReservationId', context), 17);
    assert.equal(elements.studentApprovedDialogCancel.hidden, false);
    assert.match(page, /approved-reservation-dialog-actions/);
    assert.match(page, /Cancel Reservation/);
    assert.match(page, /class="btn approved-reservation-cancel-btn"/);
    assert.match(page, /\.approved-reservation-cancel-btn\s*\{[^}]*min-width:\s*164px;[^}]*min-height:\s*40px;/s);
    assert.match(page, /\.approved-reservation-cancel-btn\s*\{[^}]*color:\s*#ffffff;[^}]*background:\s*#f44336;[^}]*border:\s*1\.5px solid #f44336;/s);
    assert.doesNotMatch(page, /studentApprovedDialogCancel[\s\S]*?<svg/);
    assert.doesNotMatch(page, /onclick="studentApproved\.closeDetails\(\)"\s*>Close</);

    vm.runInContext(`
        studentApproved.reservations = [{
            id: 18, date: '2099-01-01', startTime: '09:00', endTime: '10:00',
            reservation_date: '2099-01-01', start_time: '09:00', end_time: '10:00',
            resources: [], reservation_items: [], chemical_usage: [], canCancel: false,
            status: 'Ongoing', professor_approval: 'Approved', admin_approval: 'Approved'
        }];
        studentApproved.viewDetails(18);
    `, context);
    assert.equal(elements.studentApprovedDialogCancel.hidden, true);
});

test('cancellation calls RPC and refreshes only after confirmation', async () => {
    let confirmation = true;
    const rpcCalls = [];
    let reloads = 0;
    let successes = 0;
    vm.runInContext(`
        showConfirmDialog = async () => confirmation;
        showSuccessSnackbar = () => { successes += 1; };
        showErrorSnackbar = () => {};
        supabase = { rpc: async (...args) => { rpcCalls.push(args); return { error: null }; } };
        studentApproved.loadApprovedReservations = async () => { reloads += 1; };
        var confirmation = true, rpcCalls = [], reloads = 0, successes = 0;
    `, context);

    vm.runInContext('studentApproved.activeReservationId = 19', context);
    await vm.runInContext('studentApproved.cancelReservationFromDetails()', context);
    assert.equal(vm.runInContext('rpcCalls[0][0]', context), 'student_cancel_approved_reservation');
    assert.equal(vm.runInContext('rpcCalls[0][1].p_reservation_id', context), 19);
    assert.equal(vm.runInContext('reloads', context), 1);
    assert.equal(vm.runInContext('successes', context), 1);

    vm.runInContext('confirmation = false', context);
    await vm.runInContext('studentApproved.cancelReservation(20)', context);
    assert.equal(vm.runInContext('rpcCalls.length', context), 1);
});

test('cancellation RPC failures show an error without refreshing the list', async () => {
    vm.runInContext(`
        confirmation = true;
        showErrorSnackbar = () => { errors += 1; };
        supabase = { rpc: async () => ({ error: new Error('denied') }) };
        var errors = 0;
    `, context);

    await vm.runInContext('studentApproved.cancelReservation(21)', context);
    assert.equal(vm.runInContext('errors', context), 1);
    assert.equal(vm.runInContext('reloads', context), 1);
});

test('student and admin history already include Cancelled reservations', () => {
    const studentHistory = fs.readFileSync(path.join(__dirname, '..', 'js', 'student_history.js'), 'utf8');
    const adminHistory = fs.readFileSync(path.join(__dirname, '..', 'pages', 'history_reports.html'), 'utf8');
    assert.match(studentHistory, /Cancelled/);
    assert.match(adminHistory, /status\s*===\s*'Cancelled'/);
});

test('SQL RPC locks owner reservation and marks approvals and status cancelled', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '20261024_student_cancel_approved_reservation.sql'), 'utf8');
    assert.match(sql, /user_id\s*=\s*auth\.uid\(\)/);
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /professor_approval\s*=\s*'Cancelled'/);
    assert.match(sql, /admin_approval\s*=\s*'Cancelled'/);
    assert.match(sql, /status\s*=\s*'Cancelled'/);
});
