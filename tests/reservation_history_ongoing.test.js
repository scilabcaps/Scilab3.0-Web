const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function loadPageScript(file) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
}

test('student and professor history include approved work and label it Upcoming', () => {
    const states = "['Approved', 'Ongoing', 'Partially Returned', 'Unreturned', 'Completed', 'Cancelled', 'Declined']";
    const student = loadPageScript('student_history.js');
    const professor = loadPageScript('professor_history.js');

    assert.ok(student.includes(`.in('status', ${states})`));
    assert.ok(professor.includes(`.in('status', ${states})`));
    assert.match(student, /status === 'Approved'[\s\S]*?return 'Upcoming'/);
    assert.match(student, /'Unreturned': '#e74c3c'/);
    assert.match(professor, /res\.status === 'Approved' \? 'Upcoming' : res\.status/);
    assert.match(professor, /res\.status === 'Declined' \|\| res\.status === 'Unreturned'/);
});

test('only fully approved reservations active now in Manila are promoted to Ongoing', async () => {
    const reads = [
        { reservation_id: 11, reservation_date: '2026-10-25', start_time: '11:00', end_time: '12:00' },
        { reservation_id: 12, reservation_date: '2026-10-25', start_time: '12:00', end_time: '13:00' },
        { reservation_id: 13, reservation_date: '2026-10-25', start_time: '10:00', end_time: '11:30' },
        { reservation_id: 14, reservation_date: '2026-10-24', start_time: '23:00', end_time: '12:00' },
        { reservation_id: 15, reservation_date: '2026-10-25', start_time: '12:00', end_time: '13:00' }
    ];
    const queries = [];
    const updates = [];
    const supabase = {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }) },
        from(table) {
            const query = { table, filters: [], operation: 'select', values: null };
            queries.push(query);
            const builder = {
                select(columns) { query.columns = columns; return this; },
                eq(column, value) { query.filters.push(['eq', column, value]); return this; },
                gte(column, value) { query.filters.push(['gte', column, value]); return this; },
                lte(column, value) { query.filters.push(['lte', column, value]); return this; },
                in(column, values) { query.filters.push(['in', column, values]); return this; },
                update(values) { query.operation = 'update'; query.values = values; updates.push(query); return this; },
                then(resolve, reject) {
                    if (query.operation === 'select') return Promise.resolve({ data: reads, error: null }).then(resolve, reject);
                    return Promise.resolve({ data: null, error: null }).then(resolve, reject);
                }
            };
            return builder;
        }
    };
    class FixedDate extends Date {
        static now() { return Date.parse('2026-10-25T11:30:00+08:00'); }
    }
    const context = vm.createContext({
        Date: FixedDate,
        Intl,
        window: { supabase, addEventListener() {}, location: { pathname: '/pages/student/student_history.html' } },
        document: { visibilityState: 'visible', addEventListener() {} },
        sessionStorage: { getItem: () => '{}' },
        localStorage: { length: 0, key: () => null, removeItem() {} },
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 1,
        clearInterval() {},
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
    });
    vm.runInContext(mainSource, context);
    await vm.runInContext('promoteActiveApprovedReservations()', context);

    assert.equal(queries.length, 2);
    assert.deepEqual(updates[0].filters.find(([type, column]) => type === 'in' && column === 'reservation_id')[2], [11, 14]);
    assert.deepEqual(updates[0].values.status, 'Ongoing');
    assert.ok(updates[0].filters.some(([type, column, value]) => type === 'eq' && column === 'status' && value === 'Approved'));
    assert.ok(updates[0].filters.some(([type, column, value]) => type === 'eq' && column === 'professor_approval' && value === 'Approved'));
    assert.ok(updates[0].filters.some(([type, column, value]) => type === 'eq' && column === 'admin_approval' && value === 'Approved'));
});

test('Manila interval helper handles exact boundaries and overnight bookings', () => {
    const context = vm.createContext({
        Date,
        Intl,
        window: { addEventListener() {}, location: { pathname: '/pages/student/student_history.html' } },
        document: { addEventListener() {} },
        sessionStorage: { getItem: () => '{}' },
        localStorage: { length: 0, key: () => null, removeItem() {} },
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 1,
        clearInterval() {},
        CustomEvent: class {}
    });
    vm.runInContext(mainSource, context);
    const interval = vm.runInContext("manilaReservationInterval({ reservation_date: '2026-10-25', start_time: '23:30:00', end_time: '00:30:00' })", context);
    assert.equal(interval.startAt, Date.parse('2026-10-25T23:30:00+08:00'));
    assert.equal(interval.endAt, Date.parse('2026-10-26T00:30:00+08:00'));
    assert.equal(vm.runInContext("manilaReservationInterval({ reservation_date: '2026-10-25', start_time: '25:00', end_time: '26:00' })", context), null);
});
