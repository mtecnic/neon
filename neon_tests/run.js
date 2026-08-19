// run.js — extracts the game script from ../neon.html and boots it inside a
// vm context built by env.js, with real three.js and a fake WebGLRenderer.
'use strict';
var vm = require('vm');
var fs = require('fs');
var path = require('path');
var makeEnv = require('./env.js').makeEnv;

var GAME_HTML = path.join(__dirname, '..', 'neon.html');
var THREE_PATH = path.join(__dirname, 'vendor', 'three.min.js');

if (!fs.existsSync(THREE_PATH)) {
    console.error('vendor/three.min.js missing — run:\n  curl -sL https://unpkg.com/three@0.160.0/build/three.min.js -o vendor/three.min.js');
    process.exit(2);
}

var _gameSrc = null;
function extractGameSource() {
    if (_gameSrc) return _gameSrc;
    var html = fs.readFileSync(GAME_HTML, 'utf8');
    var m, best = '';
    var re = /<script>([\s\S]*?)<\/script>/g;
    while ((m = re.exec(html))) if (m[1].length > best.length) best = m[1];
    if (best.length < 100000) throw new Error('game script extraction failed (' + best.length + ' chars)');
    _gameSrc = best;
    return best;
}

var _threeScript = null;
function threeScript() {
    if (!_threeScript) _threeScript = new vm.Script(fs.readFileSync(THREE_PATH, 'utf8'), { filename: 'three.min.js' });
    return _threeScript;
}

function patchRenderer(ctx) {
    var T = ctx.THREE;
    var mk = ctx.document.createElement.bind(ctx.document);
    function FakeRenderer() {
        this.domElement = mk('canvas');
        this.shadowMap = { enabled: false, type: 0 };
        this.toneMapping = 0;
        this.toneMappingExposure = 1;
        this.autoClear = true;
        this.capabilities = { isWebGL2: false };
    }
    FakeRenderer.prototype.setSize = function () { };
    FakeRenderer.prototype.setPixelRatio = function () { };
    FakeRenderer.prototype.setClearColor = function () { };
    FakeRenderer.prototype.setRenderTarget = function () { };
    FakeRenderer.prototype.render = function () { };
    FakeRenderer.prototype.dispose = function () { };
    FakeRenderer.prototype.getDrawingBufferSize = function (v) { return v.set(1280, 720); };
    T.WebGLRenderer = FakeRenderer;
}

// loadGame(opts):
//   opts.save      — object map of localStorage key → value(string|obj)
//   opts.t0        — virtual epoch ms
//   opts.mathSeed  — seed for sandboxed Math.random
//   opts.mutate    — array of [patternRegExp|string, replacement] applied to
//                    the extracted source IN MEMORY (selftest only)
function loadGame(opts) {
    opts = opts || {};
    var env = makeEnv(opts);
    var ctx = vm.createContext(env.sandbox);
    vm.runInContext('window = globalThis; self = globalThis; globalThis.global = globalThis;', ctx);
    threeScript().runInContext(ctx);
    patchRenderer(ctx);

    var src = extractGameSource();
    if (opts.mutate) {
        opts.mutate.forEach(function (mu) {
            var before = src;
            src = src.replace(mu[0], mu[1]);
            if (src === before) throw new Error('mutation did not apply: ' + mu[0]);
        });
    }
    vm.runInContext(src, ctx, { filename: 'neon-game.js' });

    var h = {
        env: env,
        ctx: ctx,
        NEON: env.sandbox.NEON,
        // settle: flush pending transition timers (travel 420ms, doors 260ms) + a few frames
        settle: function () {
            env.flushTimers();
            env.pumpFrames(5);
        },
        start: function () {
            env.click('start');           // starts the run (skips avatar cards: target.closest → null)
            env.pumpFrames(5);
            return h;
        }
    };
    if (!h.NEON) throw new Error('NEON debug surface not found after boot');
    return h;
}

module.exports = { loadGame: loadGame, extractGameSource: extractGameSource };
