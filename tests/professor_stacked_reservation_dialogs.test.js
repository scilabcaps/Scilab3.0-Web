const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/professor/professor_new_reservation.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/professor_new_reservation.css'), 'utf8');

test('professor review is a native dialog stacked above reservation details', () => {
    assert.match(html, /<dialog id="reservationDetailsModal"/);
    assert.match(html, /<dialog id="summaryModal" class="reservation-dialog summary-dialog"/);
    assert.match(html, /\['cartModal', 'reservationDetailsModal', 'summaryModal'\]/);

    const summaryStart = html.indexOf('function showSummary(formData) {');
    const summaryEnd = html.indexOf('async function confirmReservation()', summaryStart);
    assert.notEqual(summaryStart, -1, 'showSummary handler exists');
    assert.notEqual(summaryEnd, -1, 'confirmReservation handler follows summary');
    const showSummary = html.slice(summaryStart, summaryEnd);
    assert.doesNotMatch(showSummary, /closeModal\('reservationDetailsModal'\)/);
    assert.match(showSummary, /summaryDialog\.showModal\(\)/);

    const returnToSchedule = html.match(/function returnToScheduleFromReview\(\) \{([\s\S]*?)\n        \}/);
    assert.ok(returnToSchedule, 'review close handler exists');
    assert.match(returnToSchedule[1], /closeModal\('summaryModal'\)/);
    assert.doesNotMatch(returnToSchedule[1], /closeModal\('reservationDetailsModal'\)/);
});

test('professor stacked review has a constrained scrollable body and closes both dialogs after success', () => {
    assert.match(css, /\.professor-reservation-page \.reservation-dialog::backdrop/);
    assert.match(css, /\.professor-reservation-page \.summary-dialog \.modal-body\s*\{[^}]*overflow-y:\s*auto/s);

    const success = html.match(/showSuccessSnackbar\('Reservation submitted successfully![\s\S]*?await loadResources\(\);/);
    assert.ok(success, 'success branch exists');
    assert.match(success[0], /closeModal\('summaryModal'\);\s*closeModal\('reservationDetailsModal'\)/);
});
