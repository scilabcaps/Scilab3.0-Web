const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

async function createApp(pathname, extra = {}) {
    const documentListeners = {};
    const windowListeners = {};
    const handlers = {};
    const storage = new Map([
        ['professor_history_cache_v3', 'stale'],
        ['professor_approved_cache_v4', 'stale'],
        ['professor_unreturned_cache_v5', 'stale'],
        ['account_approvals_cache:prof-1', 'stale'],
        ['professor_pending_cache:prof-1', 'stale'],
        ['student_approvals_cache:professor a', 'stale'],
        ['user', 'session']
    ]);
    const localStorage = {
        get length() { return storage.size; },
        key(index) { return [...storage.keys()][index] ?? null; },
        removeItem(key) { storage.delete(key); }
    };
    let reloads = 0;
    let statusCallback;
    const channel = {
        on(event, options, callback) {
            handlers[options.table] = callback;
            return this;
        },
        subscribe(callback) {
            statusCallback = callback;
            return this;
        }
    };
    const window = {
        location: { pathname, href: 'https://example.test' + pathname, reload() { reloads += 1; } },
        addEventListener(type, callback) { (windowListeners[type] ||= []).push(callback); },
        dispatchEvent(event) { (windowListeners[event.type] || []).forEach(callback => callback(event)); },
        scrollTo() {}
    };
    const document = {
        body: {},
        title: 'Test',
        addEventListener(type, callback) { (documentListeners[type] ||= []).push(callback); },
        querySelectorAll() { return []; },
        getElementById(id) { return extra.getElementById ? extra.getElementById(id) : null; }
    };
    class CustomEvent {
        constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
    const context = vm.createContext({
        window,
        document,
        localStorage,
        sessionStorage: extra.sessionStorage || { getItem: () => '{}' },
        CustomEvent,
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 1,
        clearInterval() {},
        ...extra
    });
    window.supabase = {
        channel: name => { context.channelName = name; return channel; },
        removeChannel: async () => 'ok',
        auth: { getSession: async () => ({ data: { session: { user: { id: 'test-user' } } }, error: null }) }
    };
    vm.runInContext(source, context);
    (documentListeners.DOMContentLoaded || []).forEach(callback => callback());
    await window.__appRealtimeStartPromise;
    return {
        context,
        handlers,
        storage,
        status: value => statusCallback(value),
        get reloads() { return reloads; }
    };
}

test('shared channel subscribes to reservation, inventory, announcement, and notification tables', async () => {
    const app = await createApp('/pages/student/student_dashboard.html');
    assert.equal(app.context.channelName, 'app-live-data');
    for (const table of ['reservations', 'reservation_items', 'chemical_usage', 'user_info', 'rooms', 'lab_assets', 'chemicals', 'announcement', 'user_notifications']) {
        assert.equal(typeof app.handlers[table], 'function', `expected a Realtime handler for ${table}`);
    }
    for (const key of app.storage.keys()) assert.equal(key, 'user', `unexpected retained cache key ${key}`);
});

test('table changes refresh the student approvals table without reloading the page', async () => {
    let refreshes = 0;
    const app = await createApp('/pages/professor/student_approvals.html', {
        StudentApprovals: { loadPendingRequests: () => { refreshes += 1; } }
    });
    app.handlers.reservations({ eventType: 'INSERT', new: { reservation_id: 1 }, old: {} });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(refreshes, 1);
    assert.equal(app.reloads, 0);

    app.handlers.announcement({ eventType: 'INSERT', new: {}, old: {} });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(refreshes, 1);
    assert.equal(app.reloads, 0);
});

test('approval changes refresh the professor approval table in place even when a request leaves Pending', async () => {
    let refreshes = 0;
    const app = await createApp('/pages/professor/student_approvals.html', {
        StudentApprovals: { loadPendingRequests: () => { refreshes += 1; } }
    });
    app.handlers.reservations({
        eventType: 'UPDATE',
        new: { professor_approval: 'Approved' },
        old: { professor_approval: 'Pending' }
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(refreshes, 1);
    assert.equal(app.reloads, 0);
});

test('reservation table pages call their existing row loaders instead of reloading the page', async () => {
    const calls = [];
    const spy = name => (...args) => calls.push([name, ...args]);
    const app = await createApp('/pages/professor/student_approvals.html', {
        sessionStorage: { getItem: () => JSON.stringify({ id: 'user-1', username: 'professor', role: 'Professor' }) },
        getElementById: id => id === 'reportResultsSection' ? { style: { display: 'block' } } : null,
        StudentApprovals: { loadPendingRequests: spy('student approvals') },
        AccountApprovals: { loadPendingAccounts: spy('account approvals') },
        ProfessorPending: { loadPendingReservations: spy('professor pending') },
        ProfessorApproved: { loadApprovedReservations: spy('professor approved') },
        ProfessorHistory: { loadCompletedReservations: spy('professor history') },
        ProfessorMyUpcoming: { loadReservations: spy('professor upcoming') },
        ProfessorUnreturned: { loadUnreturnedItems: spy('professor unreturned') },
        ProfessorMyUnreturned: { refresh: spy('professor my unreturned') },
        studentPending: { loadPendingReservations: spy('student pending') },
        StudentUpcoming: { init: spy('student upcoming') },
        studentApproved: { loadApprovedReservations: spy('student approved') },
        StudentHistory: { loadReservations: spy('student history') },
        StudentUnreturnedItems: { loadItems: spy('student unreturned') },
        UpcomingStudentReservations: { loadReservations: spy('professor student upcoming') },
        loadHistoryStatistics: spy('history report stats'),
        generateHistoryReport: spy('history report rows'),
        generateReport: spy('reservation report rows')
    });
    const routes = [
        ['student_approvals.html', 'reservations'], ['account_approvals.html', 'user_info'],
        ['professor_pending_approval.html', 'reservations'], ['student_approved_reservation.html', 'reservations'],
        ['professor_reservation_history.html', 'reservations'], ['professor_my_upcoming.html', 'reservations'],
        ['professor_unreturned.html', 'reservation_items'], ['professor_my_unreturned.html', 'reservation_items'],
        ['student_pending.html', 'reservations'], ['student_upcoming.html', 'reservations'],
        ['student_approved.html', 'reservations'], ['student_history.html', 'reservations'],
        ['student_unreturned.html', 'reservation_items'], ['student_upcoming_reservations.html', 'reservations'],
        ['history_reports.html', 'reservations'], ['reservation_reports.html', 'reservations']
    ];

    for (const [pageName, table] of routes) app.context.refreshRealtimePageInPlace(pageName, table);
    assert.deepEqual(calls.map(([name]) => name), [
        'student approvals', 'account approvals', 'professor pending', 'professor approved',
        'professor history', 'professor upcoming', 'professor unreturned', 'professor my unreturned',
        'student pending', 'student upcoming', 'student approved', 'student history',
        'student unreturned', 'professor student upcoming', 'history report stats',
        'history report rows', 'reservation report rows'
    ]);
    assert.equal(app.reloads, 0);
});

test('reservation form updates resource data without reloading or losing its cart', async () => {
    const cart = [{ resource: 'keep-selection' }];
    const calls = [];
    const app = await createApp('/pages/professor/professor_new_reservation.html', {
        cart,
        selectedDate: '2099-01-01',
        loadResources: () => calls.push('resources'),
        loadTimelineForDate: date => calls.push(`timeline:${date}`)
    });
    app.handlers.chemicals({ eventType: 'UPDATE', new: {}, old: {} });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.deepEqual(calls, ['resources', 'timeline:2099-01-01']);
    assert.equal(app.reloads, 0);
    assert.equal(cart[0].resource, 'keep-selection');
});

test('settings refresh from the server without overwriting an edited profile form', async () => {
    let dirty = false;
    let refreshes = 0;
    const app = await createApp('/pages/student/settings.html', {
        profileHasUnsavedChanges: () => dirty,
        loadUserData: () => { refreshes += 1; }
    });
    app.handlers.user_info({ eventType: 'UPDATE', new: {}, old: {} });
    assert.equal(refreshes, 1);

    dirty = true;
    app.handlers.user_info({ eventType: 'UPDATE', new: {}, old: {} });
    assert.equal(refreshes, 1);
    assert.equal(app.reloads, 0);
});

test('a Realtime reconnect refreshes dashboard content in place', async () => {
    let metrics = 0;
    let requests = 0;
    let upcoming = 0;
    let schedule = 0;
    let announcements = 0;
    const app = await createApp('/pages/professor/professor_dashboard.html', {
        loadProfessorData: () => { metrics += 1; },
        loadStudentRequests: () => { requests += 1; },
        loadUpcomingReservations: () => { upcoming += 1; },
        updateProfessorWeekDisplay: () => { schedule += 1; },
        loadAnnouncements: () => { announcements += 1; }
    });
    app.status('CHANNEL_ERROR');
    app.status('SUBSCRIBED');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.deepEqual([metrics, requests, upcoming, schedule, announcements], [1, 1, 1, 1, 1]);
    assert.equal(app.reloads, 0);
});

test('dashboard reservation and announcement changes refresh only their affected content', async () => {
    const calls = [];
    const app = await createApp('/pages/student/student_dashboard.html', {
        loadStudentData: () => calls.push('cards-and-upcoming'),
        updateWeekDisplay: () => calls.push('schedule'),
        loadAnnouncements: () => calls.push('announcements')
    });
    app.handlers.reservations({ eventType: 'INSERT', new: {}, old: {} });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.deepEqual(calls, ['cards-and-upcoming', 'schedule']);

    app.handlers.announcement({ eventType: 'UPDATE', new: {}, old: {} });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.deepEqual(calls, ['cards-and-upcoming', 'schedule', 'announcements']);
    assert.equal(app.reloads, 0);
});
