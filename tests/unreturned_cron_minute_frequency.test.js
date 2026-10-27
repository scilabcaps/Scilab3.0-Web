const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '20261025_update_unreturned_reservations_every_minute.sql'), 'utf8');

test('unreturned cron migration makes reservations due at the exact Manila end time', () => {
    assert.match(migration, /reservation_date\s*\+\s*r\.end_time\)\s*<=\s*\(NOW\(\) AT TIME ZONE 'Asia\/Manila'\)/i);
    assert.match(migration, /ri\.is_returned IS NOT TRUE/);
    assert.match(migration, /THEN 'Unreturned'[\s\S]*ELSE 'Completed'/);
    assert.match(migration, /r\.status IN \('Ongoing', 'Approved', 'Pending', 'Partially Returned'\)/);
});

test('unreturned cron migration replaces the existing job with a one-minute cadence', () => {
    assert.match(migration, /WHERE jobname = 'update_unreturned_reservations_job'/);
    assert.match(migration, /cron\.unschedule\(existing_job_id\)/);
    assert.match(migration, /'update_unreturned_reservations_job',\s+'\* \* \* \* \*',\s+'SELECT public\.update_unreturned_reservations\(\);'/s);
});
