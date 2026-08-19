// env.js — sandbox/stub factory for running neon.html headless in Node.
// The sandbox object BECOMES the vm context global, so bare identifiers
// (innerWidth, addEventListener, requestAnimationFrame...) resolve on it.
'use strict';

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function makeCtx2d() {
    var ctx = { _calls: {} };
    var methods = ['fillRect', 'clearRect', 'strokeRect', 'fillText', 'beginPath', 'closePath',
        'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate'];
    methods.forEach(function (m) {
        ctx[m] = function () { ctx._calls[m] = (ctx._calls[m] || 0) + 1; };
    });
    ctx.createLinearGradient = ctx.createRadialGradient = function () {
        ctx._calls.gradient = (ctx._calls.gradient || 0) + 1;
        return { addColorStop: function () { } };
    };
    // style props are plain writable slots
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.font = ''; ctx.textAlign = ''; ctx.textBaseline = '';
    ctx.shadowColor = ''; ctx.shadowBlur = 0;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return ctx;
}

function makeElement(tag, id) {
    var listeners = {};
    var classSet = new Set();
    var el = {
        tagName: (tag || 'div').toUpperCase(),
        id: id || '',
        style: {},
        dataset: {},
        children: [],
        firstChild: null,
        parentNode: null,
        width: 300,
        height: 150,
        _listeners: listeners,
        _innerHTML: '',
        _textContent: '',
        classList: {
            add: function (c) { classSet.add(c); },
            remove: function (c) { classSet.delete(c); },
            toggle: function (c, on) {
                if (on === undefined) on = !classSet.has(c);
                if (on) classSet.add(c); else classSet.delete(c);
                return on;
            },
            contains: function (c) { return classSet.has(c); }
        },
        addEventListener: function (type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
        removeEventListener: function (type, fn) {
            var a = listeners[type]; if (!a) return;
            var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
        },
        appendChild: function (c) {
            el.children.push(c);
            c.parentNode = el;
            if (!el.firstChild) el.firstChild = c;
            return c;
        },
        removeChild: function (c) {
            var i = el.children.indexOf(c);
            if (i >= 0) el.children.splice(i, 1);
            c.parentNode = null;
            el.firstChild = el.children.length ? el.children[0] : null;
            return c;
        },
        insertBefore: function (c) { return el.appendChild(c); },
        querySelector: function (sel) {
            // vivify a stable stub per selector — covers panel code that styles
            // buttons looked up by [data-act=...]
            el._q = el._q || {};
            return el._q[sel] || (el._q[sel] = makeElement('button'));
        },
        querySelectorAll: function () { return []; },
        closest: function () { return null; },
        getContext: function (kind) {
            if (kind === '2d') return el._ctx2d || (el._ctx2d = makeCtx2d());
            return null;   // webgl/webgl2 probes fail → POST_OK false
        },
        requestPointerLock: function () { return { catch: function () { } }; }
    };
    Object.defineProperty(el, 'innerHTML', {
        get: function () { return el._innerHTML; },
        set: function (v) {
            el._innerHTML = String(v);
            // cheap approximation: non-empty markup yields a first child so
            // "while (el.firstChild) removeChild" style loops still terminate
            el.children.length = 0;
            el.firstChild = el._innerHTML ? makeElement('div') : null;
            if (el.firstChild) { el.firstChild.parentNode = el; el.children.push(el.firstChild); }
        }
    });
    Object.defineProperty(el, 'textContent', {
        get: function () { return el._textContent; },
        set: function (v) { el._textContent = String(v); }
    });
    Object.defineProperty(el, 'className', {
        get: function () { return Array.from(classSet).join(' '); },
        set: function (v) {
            classSet.clear();
            String(v).split(/\s+/).forEach(function (c) { if (c) classSet.add(c); });
        }
    });
    return el;
}

function makeEnv(opts) {
    opts = opts || {};
    var T0 = opts.t0 !== undefined ? opts.t0 : 1700000000000;
    var clock = { now: T0, t0: T0 };

    // ---- virtual timers ----
    var timers = [];
    var timerId = 1;
    function setTimeoutStub(fn, d) {
        var id = timerId++;
        timers.push({ id: id, at: clock.now + Math.max(0, d || 0), fn: fn });
        return id;
    }
    function clearTimeoutStub(id) {
        for (var i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1);
    }
    function runDueTimers() {
        var guard = 0;
        for (;;) {
            if (++guard > 10000) throw new Error('timer flush runaway');
            var due = null, di = -1;
            for (var i = 0; i < timers.length; i++)
                if (timers[i].at <= clock.now && (due === null || timers[i].at < due.at)) { due = timers[i]; di = i; }
            if (!due) break;
            timers.splice(di, 1);
            due.fn();
        }
    }
    function flushTimers() {
        // run everything currently queued regardless of due time
        var guard = 0;
        while (timers.length) {
            if (++guard > 10000) throw new Error('timer flush runaway');
            var next = timers.reduce(function (a, b) { return a.at <= b.at ? a : b; });
            if (next.at > clock.now) clock.now = next.at;
            runDueTimers();
        }
    }

    // ---- rAF pump ----
    var rafQueue = [];
    function requestAnimationFrameStub(cb) { rafQueue.push(cb); return rafQueue.length; }
    function pumpFrames(n, dtMs) {
        n = n || 1; dtMs = dtMs === undefined ? 16 : dtMs;
        for (var f = 0; f < n; f++) {
            clock.now += dtMs;
            runDueTimers();
            var batch = rafQueue;
            rafQueue = [];
            for (var i = 0; i < batch.length; i++) batch[i](clock.now - clock.t0);
        }
    }
    function advance(ms) { clock.now += ms; runDueTimers(); }
    function advanceGame(ms, stepMs) {
        stepMs = stepMs || 250;
        var left = ms;
        while (left > 0) {
            var step = Math.min(stepMs, left);
            clock.now += step - 16;   // pumpFrames adds the last 16ms
            pumpFrames(1, 16);
            left -= step;
        }
    }

    // ---- DOM ----
    var els = {};
    var docListeners = {};
    var doc = {
        getElementById: function (id) { return els[id] || (els[id] = makeElement('div', id)); },
        createElement: function (tag) { return makeElement(tag); },
        querySelectorAll: function () { return []; },
        addEventListener: function (type, fn) { (docListeners[type] || (docListeners[type] = [])).push(fn); },
        removeEventListener: function () { },
        write: function () { },
        hidden: false,
        pointerLockElement: null,
        _listeners: docListeners
    };
    doc.body = makeElement('body');
    doc.body.insertBefore = function (c) { return doc.body.appendChild(c); };

    // ---- localStorage ----
    var store = new Map();
    if (opts.save) {
        for (var k in opts.save) store.set(k, typeof opts.save[k] === 'string' ? opts.save[k] : JSON.stringify(opts.save[k]));
    }
    var localStorageStub = {
        getItem: function (k) { return store.has(k) ? store.get(k) : null; },
        setItem: function (k, v) { store.set(k, String(v)); },
        removeItem: function (k) { store.delete(k); },
        clear: function () { store.clear(); },
        _map: store
    };

    // ---- sandbox global ----
    var sandbox = {};
    sandbox.console = {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: function (msg) {
            if (typeof msg === 'string' && msg.indexOf('deprecated with r150') >= 0) return;
            console.warn.apply(console, arguments);
        }
    };
    sandbox.Math = Object.create(Math);
    sandbox.Math.random = opts.realRandom ? Math.random : mulberry32(opts.mathSeed !== undefined ? opts.mathSeed : 0x5EED);
    // Date subclass over the virtual clock
    var RealDate = Date;
    function VDate() {
        var a = arguments;
        if (a.length === 0) return new RealDate(clock.now);
        if (a.length === 1) return new RealDate(a[0]);
        return new RealDate(a[0], a[1], a[2] || 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
    }
    VDate.now = function () { return clock.now; };
    VDate.parse = RealDate.parse;
    VDate.UTC = RealDate.UTC;
    VDate.prototype = RealDate.prototype;
    sandbox.Date = VDate;
    sandbox.performance = { now: function () { return clock.now - clock.t0; } };
    sandbox.setTimeout = setTimeoutStub;
    sandbox.clearTimeout = clearTimeoutStub;
    sandbox.setInterval = function () { return 0; };   // only audio scheduler uses it; inert headless
    sandbox.clearInterval = function () { };
    sandbox.requestAnimationFrame = requestAnimationFrameStub;
    sandbox.cancelAnimationFrame = function () { };
    sandbox.document = doc;
    sandbox.localStorage = localStorageStub;
    sandbox.navigator = { userAgent: 'node-test', maxTouchPoints: 0 };
    sandbox.location = { href: 'file:///neon.html', reload: function () { env.reloadRequested = true; } };
    sandbox.innerWidth = 1280;
    sandbox.innerHeight = 720;
    sandbox.devicePixelRatio = 1;
    var winListeners = {};
    sandbox.addEventListener = function (type, fn) { (winListeners[type] || (winListeners[type] = [])).push(fn); };
    sandbox.removeEventListener = function () { };
    sandbox._winListeners = winListeners;

    // ---- event driving ----
    function fire(target, type, evt) {
        evt = evt || {};
        if (evt.preventDefault === undefined) evt.preventDefault = function () { };
        if (evt.stopPropagation === undefined) evt.stopPropagation = function () { };
        var list = target === 'window' ? winListeners[type]
            : target === 'document' ? docListeners[type]
                : (target._listeners || {})[type];
        if (!list) return 0;
        list.slice().forEach(function (fn) { fn(evt); });
        return list.length;
    }
    function click(id, evtProps) {
        var el = doc.getElementById(id);
        var evt = Object.assign({ target: makeElement('div') }, evtProps || {});
        return fire(el, 'click', evt);
    }
    function key(code) {
        fire('window', 'keydown', { code: code, repeat: false });
        fire('window', 'keyup', { code: code });
    }

    var env = {
        sandbox: sandbox,
        clock: clock,
        timers: timers,
        els: els,
        storage: localStorageStub,
        reloadRequested: false,
        fire: fire,
        click: click,
        key: key,
        pumpFrames: pumpFrames,
        advance: advance,
        advanceGame: advanceGame,
        flushTimers: flushTimers,
        makeElement: makeElement
    };
    return env;
}

module.exports = { makeEnv: makeEnv, makeElement: makeElement, mulberry32: mulberry32 };
