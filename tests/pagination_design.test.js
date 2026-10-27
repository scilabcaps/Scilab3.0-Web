const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const styles = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
const upcomingReservations = fs.readFileSync(path.join(__dirname, '..', 'js', 'student_upcoming_reservations.js'), 'utf8');
const studentResourcePage = fs.readFileSync(path.join(__dirname, '..', 'pages', 'student', 'reservation_student.html'), 'utf8');
const professorResourcePage = fs.readFileSync(path.join(__dirname, '..', 'pages', 'professor', 'professor_new_reservation.html'), 'utf8');

test('shared pagination uses the compact reference footer and attaches to data tables', () => {
    assert.match(styles, /\.pagination-container\s*\{[^}]*display:\s*flex[^}]*padding:\s*12px 14px[^}]*background:\s*#f8fafc/s);
    assert.match(styles, /\.data-table\s*>\s*\.pagination-container\s*\{[^}]*margin-top:\s*0[^}]*border-top:\s*1px solid/s);
    assert.match(styles, /\.pagination-controls\s*\{[^}]*gap:\s*8px/s);
    assert.match(styles, /\.pagination-controls button\s*\{[^}]*min-height:\s*32px[^}]*padding:\s*6px 12px/s);
    assert.match(styles, /\.pagination-size select\s*\{[^}]*min-height:\s*32px/s);
    assert.match(styles, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.pagination-container\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test('table page summaries use consistent wording and resource pagers retain fixed grid paging', () => {
    assert.match(upcomingReservations, /pagination-info[^>]*>Showing \$\{this\.currentPage\} of \$\{totalPages\}/);
    assert.match(studentResourcePage, /const resourcePageSize = 9/);
    assert.match(professorResourcePage, /const resourcePageSize = 9/);
    assert.match(studentResourcePage, /class="pagination-container"/);
    assert.match(professorResourcePage, /class="pagination-container"/);
});
