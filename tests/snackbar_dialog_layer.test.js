const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'snackbar.js'), 'utf8');

test('snackbar is placed in the topmost native dialog and moved out when that dialog closes', () => {
    const body = {
        children: [],
        appendChild(element) {
            if (element.parent?.children) element.parent.children = element.parent.children.filter(child => child !== element);
            element.parent = this;
            this.children.push(element);
            element.isConnected = true;
            return element;
        }
    };
    const openDialog = {
        open: true,
        children: [],
        listeners: {},
        appendChild(element) {
            if (element.parent?.children) element.parent.children = element.parent.children.filter(child => child !== element);
            element.parent = this;
            this.children.push(element);
            element.isConnected = true;
            return element;
        },
        addEventListener(type, callback) { this.listeners[type] = callback; }
    };
    class HTMLDialogElement {}
    Object.setPrototypeOf(openDialog, HTMLDialogElement.prototype);

    const document = {
        body,
        querySelector(selector) {
            if (selector !== '.snackbar') return null;
            return [...body.children, ...openDialog.children].find(element => element.className?.includes('snackbar')) || null;
        },
        querySelectorAll(selector) { return selector === 'dialog[open]' && openDialog.open ? [openDialog] : []; },
        createElement() {
            return {
                className: '',
                attributes: {},
                classList: { add() {}, remove() {} },
                setAttribute(name, value) { this.attributes[name] = value; },
                remove() {
                    if (this.parent?.children) this.parent.children = this.parent.children.filter(child => child !== this);
                    this.isConnected = false;
                }
            };
        }
    };
    const context = vm.createContext({ document, HTMLDialogElement, setTimeout() {} });
    vm.runInContext(source, context);

    context.showWarningSnackbar('Choose a date');
    const snackbar = openDialog.children[0];
    assert.ok(snackbar);
    assert.equal(snackbar.attributes.role, 'status');
    assert.match(snackbar.className, /warning/);

    openDialog.open = false;
    openDialog.listeners.close();
    assert.equal(openDialog.children.length, 0);
    assert.equal(body.children[0], snackbar);
});
