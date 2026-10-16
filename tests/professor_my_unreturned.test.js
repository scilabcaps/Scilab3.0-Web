const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'professor_my_unreturned.js'),
    'utf8'
);
const context = vm.createContext({
    URLSearchParams,
    window: {
        location: { search: '', pathname: '' },
        addEventListener() {}
    }
});
vm.runInContext(source, context);
const isUnreturnedItem = vm.runInContext(
    'ProfessorMyUnreturned.isUnreturnedItem.bind(ProfessorMyUnreturned)',
    context
);

const overdueNow = new Date('2026-10-16T12:00:00').getTime();
const makeItem = (reservation = {}, item = {}) => ({
    quantity_borrowed: 8,
    quantity_returned: 0,
    reservations: {
        reservation_date: '2026-10-16',
        end_time: '10:00:00',
        status: 'Approved',
        professor_approval: 'Approved',
        admin_approval: 'Approved',
        ...reservation
    },
    ...item
});

test('excludes declined, rejected, and cancelled reservation states', () => {
    assert.equal(isUnreturnedItem(makeItem({ status: 'Declined' }), overdueNow), false);
    assert.equal(isUnreturnedItem(makeItem({ professor_approval: ' rejected ' }), overdueNow), false);
    assert.equal(isUnreturnedItem(makeItem({ admin_approval: 'CANCELLED' }), overdueNow), false);
});

test('keeps valid overdue reservations with outstanding quantities', () => {
    assert.equal(isUnreturnedItem(makeItem(), overdueNow), true);
    assert.equal(isUnreturnedItem(makeItem({ status: 'Ongoing' }), overdueNow), true);
    assert.equal(isUnreturnedItem(makeItem({ status: 'Partially Returned' }), overdueNow), true);
});

test('excludes future and fully returned reservations', () => {
    const beforeEnd = new Date('2026-10-16T09:28:00').getTime();
    assert.equal(isUnreturnedItem(makeItem(), beforeEnd), false);
    assert.equal(isUnreturnedItem(makeItem({}, { quantity_returned: 8 }), overdueNow), false);
});
