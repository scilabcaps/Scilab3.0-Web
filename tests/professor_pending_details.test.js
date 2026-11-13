const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'professor_pending.js'),
    'utf8'
);
const pageSource = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'professor', 'professor_pending_approval.html'),
    'utf8'
);
const sharedSource = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'main.js'),
    'utf8'
);
const context = vm.createContext({
    Date,
    window: { addEventListener() {} },
    document: { addEventListener() {} }
});
vm.runInContext(sharedSource, context);
vm.runInContext(source, context);

test('pending approval page loads Modal before its View handler module', () => {
    const modalScriptIndex = pageSource.indexOf('../../js/modal.js');
    const pendingScriptIndex = pageSource.indexOf('../../js/professor_pending.js');
    assert.notEqual(modalScriptIndex, -1);
    assert.ok(modalScriptIndex < pendingScriptIndex);
});

const renderDetails = vm.runInContext(`(reservation) => {
    ProfessorPending.allReservations = [reservation];
    ProfessorPending.viewDetails(reservation.reservation_id);
    return ProfessorPending.lastRenderedDetails;
}`, context);
vm.runInContext(`ProfessorPending.showReservationDetails = function(content) {
    this.lastRenderedDetails = content;
};`, context);

test('pending approval details include receipt fields and resources', () => {
    const markup = renderDetails({
        reservation_id: 42,
        created_at: '2026-10-24T04:05:00.000Z',
        reservation_date: '2026-11-02',
        start_time: '09:00',
        end_time: '10:00',
        status: 'Pending',
        professor_approval: 'Approved',
        admin_approval: 'Pending',
        additional_note: 'Please prepare the room',
        rooms: { room_name: 'Lab A' }
    });

    for (const text of [
        'Reservation ID',
        '42',
        'Created At',
        new Date('2026-10-24T04:05:00.000Z').toLocaleString(),
        'Reservation Date',
        '2026-11-02',
        'Reservation Time',
        '09:00 - 10:00',
        'Pending',
        'Additional Note',
        'Please prepare the room',
        'Resources',
        'Lab A'
    ]) {
        assert.ok(markup.includes(text), `expected details to include ${text}`);
    }
});

test('pending approval details state None when no resources exist', () => {
    const markup = renderDetails({
        reservation_id: 43,
        reservation_date: '2026-11-02',
        start_time: '09:00',
        end_time: '10:00'
    });

    assert.match(markup, /reservation-detail-empty[^>]*>None</);
    assert.match(markup, /Created At<\/strong><span>N\/A<\/span>/);
});
