const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/student/reservation_student.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/student_reservation.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/student_reservation.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

test('student reservation cart is a floating, accessible entry point with distinct-resource badge', () => {
    assert.match(html, /id="floatingCartButton"[^>]*aria-haspopup="dialog"/);
    assert.match(html, /id="cartCountBadge"[^>]*hidden/);
    assert.match(js, /const cartCount = cart\.length/);
    assert.match(js, /cartBadge\.hidden = cartCount === 0/);
    assert.match(js, /setAttribute\('aria-label', 'Open reservation cart, ' \+ cartCount/);
    assert.match(css, /\.floating-cart-button\s*\{[^}]*position:\s*fixed/s);
    assert.match(css, /\.floating-cart-badge\s*\{[^}]*background:\s*#c62828/s);
});

test('cart changes continue to render within its dialog and empty carts cannot continue', () => {
    assert.match(html, /<dialog id="cartModal"/);
    assert.match(html, /id="cartItems"/);
    assert.match(html, /id="chooseScheduleButton"[^>]*disabled/);
    assert.match(js, /if \(scheduleButton\) scheduleButton\.disabled = cartCount === 0/);
    assert.match(js, /function addToCart[\s\S]*?updateCart\(\)/);
    assert.match(js, /function removeFromCart[\s\S]*?updateCart\(\)/);
    assert.match(js, /function updateChemicalQuantity[\s\S]*?item\.quantity = quantity/);
});

test('schedule dialog retains the original form and opens the existing review/confirm flow', () => {
    assert.match(html, /<dialog id="reservationDetailsModal"/);
    assert.match(html, /<form id="reservationForm"/);
    for (const id of ['calendarDays', 'timelineSlots', 'date', 'startTime', 'endTime', 'year_section', 'course', 'professor']) {
        assert.match(html, new RegExp('id="' + id + '"'));
    }
    assert.match(js, /form\.addEventListener\('submit', handleReservationSubmit\)/);
    assert.match(js, /function openReservationDetailsModal[\s\S]*?dialog\.showModal\(\)/);
    assert.match(js, /function openReservationDetailsModal[\s\S]*?if \(!selectedDate\) selectDate\(getNextBookableDate\(\)\)/);
    assert.match(js, /function getNextBookableDate\(\)[\s\S]*?date\.getDay\(\) === 0 \|\| date\.getDay\(\) === 6/);
    assert.match(js, /function selectDate\(dateStr\)[\s\S]*?loadTimelineForDate\(dateStr\)/);
    assert.match(js, /function showSummary[\s\S]*?summaryDialog\.showModal\(\)/);
    assert.match(js, /closeModal\('summaryModal'\);\s*closeModal\('reservationDetailsModal'\)/);
});

test('student detail fields are balanced on desktop and stacked on phones', () => {
    assert.match(css, /\.schedule-dialog-body > \.reservation-details-row\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.schedule-dialog-body > \.reservation-details-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test('student resource cards use a taller desktop footprint with bottom-aligned actions', () => {
    assert.match(css, /\.student-reservation-page \.resource-card\s*\{[^}]*min-height:\s*180px;[^}]*flex-direction:\s*column/s);
    assert.match(css, /\.student-reservation-page \.resource-card \.add-to-cart-btn\s*\{[^}]*margin-top:\s*auto/s);
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.student-reservation-page \.resource-card\s*\{[^}]*min-height:\s*168px/s);
});

test('reservation confirmation ignores rapid repeat calls and restores the button after submission', async () => {
    const button = {
        innerHTML: 'Confirm',
        disabled: false,
        isConnected: true,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: { getElementById: id => id === 'confirmReservationButton' ? button : null }
    });
    vm.runInContext(js, context);

    let resolveSubmission;
    let submissionCount = 0;
    context.submitReservation = async () => {
        submissionCount++;
        await new Promise(resolve => { resolveSubmission = resolve; });
    };

    const firstSubmission = context.confirmReservation();
    assert.equal(button.disabled, true);
    assert.equal(button.attributes['aria-busy'], 'true');
    assert.match(button.innerHTML, /Submitting/);

    const repeatedSubmission = context.confirmReservation();
    assert.equal(submissionCount, 1);
    resolveSubmission();
    await Promise.all([firstSubmission, repeatedSubmission]);

    assert.equal(button.disabled, false);
    assert.equal(button.attributes['aria-busy'], undefined);
    assert.equal(button.innerHTML, 'Confirm');
    assert.equal(submissionCount, 1);
});

test('reservation confirmation restores the button after a failed submission', async () => {
    const button = {
        innerHTML: 'Confirm',
        disabled: false,
        isConnected: true,
        setAttribute() {},
        removeAttribute() {}
    };
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: { getElementById: id => id === 'confirmReservationButton' ? button : null }
    });
    vm.runInContext(js, context);
    context.submitReservation = async () => { throw new Error('temporary failure'); };

    await assert.rejects(context.confirmReservation(), /temporary failure/);
    assert.equal(button.disabled, false);
    assert.equal(button.innerHTML, 'Confirm');
});

test('reservation confirmation control includes spinner styling and an accessible busy label', () => {
    assert.match(html, /id="confirmReservationButton"[^>]*onclick="confirmReservation\(\)"/);
    assert.match(js, /confirmButton\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(js, /class="reservation-submit-spinner" aria-hidden="true"/);
    assert.match(css, /\.reservation-submit-spinner\s*\{[^}]*animation:\s*reservation-submit-spin/s);
});

test('reservation viewport and dialog bodies constrain document scrolling', () => {
    assert.match(html, /class="student-reservation-page"/);
    assert.match(css, /body\.student-reservation-page\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.resource-results-viewport\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /\.schedule-dialog-body\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(html, /<dialog id="summaryModal"/);
    assert.match(css, /\.summary-dialog > \.modal-content\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.summary-dialog \.modal-footer\s*\{[^}]*flex-shrink:\s*0/s);
});

test('client-side page navigation syncs floating cart portals and reservation page layout class', () => {
    assert.match(mainJs, /const pagePortals = '\.modal, \.reservation-dialog, \.floating-cart-button'/);
    assert.match(mainJs, /documentFragment\.querySelectorAll\(pagePortals\)/);
    assert.match(mainJs, /document\.body\.classList\.toggle\([\s\S]*?'student-reservation-page',[\s\S]*?documentFragment\.body\.classList\.contains\('student-reservation-page'\)/);
});
