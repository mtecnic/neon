// tests.js — release-hardening suite for neon.html.
// Usage: node tests.js [suiteFilter] [--seed=N] [--soak=N] [selftest]
'use strict';
var loader = require('./run.js');
var mulberry32 = require('./env.js').mulberry32;

// ---------- CLI ----------
var args = process.argv.slice(2);
var FILTER = null, SEED = 0xC0FFEE, SOAK_N = 10000, SELFTEST = false;
args.forEach(function (a) {
    if (a === 'selftest') SELFTEST = true;
    else if (a.indexOf('--seed=') === 0) SEED = parseInt(a.slice(7), 10) >>> 0;
    else if (a.indexOf('--soak=') === 0) SOAK_N = parseInt(a.slice(7), 10);
    else if (a.indexOf('--') !== 0) FILTER = a;
});

// ---------- micro-framework ----------
var GLOBAL_LOAD_OPTS = null;      // selftest injects mutations here
var results = [];                 // {suite, test, ok, msg}
var curSuite = '', curTest = '', curAsserts = 0, lastHandle = null;
var QUIET = false;

function fresh(opts) {
    opts = Object.assign({}, opts || {});
    if (GLOBAL_LOAD_OPTS) opts = Object.assign({}, GLOBAL_LOAD_OPTS, opts);
    lastHandle = loader.loadGame(opts);
    return lastHandle;
}
function record(ok, msg) {
    results.push({ suite: curSuite, test: curTest, ok: ok, msg: msg || '' });
    if (!ok && !QUIET) console.log('  FAIL ' + curSuite + ' :: ' + curTest + (msg ? ' — ' + msg : ''));
}
function ok(cond, msg) { curAsserts++; if (!cond) record(false, msg); return !!cond; }
function eq(a, b, msg) { return ok(a === b, (msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function near(a, b, tol, msg) { return ok(Math.abs(a - b) <= tol, (msg || '') + ' — expected ~' + b + '±' + tol + ', got ' + a); }
function deepEq(a, b, msg) {
    var ja = JSON.stringify(a), jb = JSON.stringify(b);
    return ok(ja === jb, (msg || '') + ' — mismatch\n    A: ' + ja.slice(0, 200) + '\n    B: ' + jb.slice(0, 200));
}
function test(name, fn) {
    curTest = name; curAsserts = 0;
    var before = results.length;
    try { fn(); } catch (e) {
        record(false, 'THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    }
    if (curAsserts === 0) record(false, 'empty test (0 assertions)');
    // global invariant: whatever handle is live, money must be sane
    if (lastHandle && lastHandle.NEON) {
        var c = lastHandle.NEON.S.credits;
        if (!(typeof c === 'number' && isFinite(c) && c >= 0))
            record(false, 'GLOBAL INVARIANT: credits invalid after test (' + c + ')');
    }
    if (results.length === before) results.push({ suite: curSuite, test: name, ok: true, msg: '' });
}
var suites = [];
function suite(name, fn) { suites.push({ name: name, fn: fn }); }

// ---------- shared helpers ----------
function moneySnap(N) {
    return JSON.parse(JSON.stringify({
        credits: N.S.credits, inv: N.S.inv,
        stash: N.S.stash, stash2: N.S.stash2,
        home: N.S.home.inv, deco: N.S.deco.owned
    }));
}
function itemTotal(N, id) {
    var n = N.S.inv[id] || 0;
    n += N.S.home.inv[id] || 0;
    [N.S.stash, N.S.stash2].forEach(function (st) {
        for (var di = 0; di < 4; di++) n += st.inv[di][id] || 0;
    });
    return n;
}
function worldFingerprint(N) {
    return {
        col: N.getColliders().length,
        lots: N.getLots().length,
        tt: N.getTowerTops().length,
        edge: N.getEdge(),
        doors: N.DOORS.map(function (d) {
            return [d.id, Math.round(d.x * 100) / 100, Math.round(d.z * 100) / 100];
        })
    };
}
function placeOnPlaza(h, di) {
    var p = h.NEON.DISTRICTS[di].pos;
    h.NEON.player.position.set(p.x, 0.5, p.z);
    h.env.pumpFrames(2);
}
function firstStocked(N, di, skipIds) {
    var models = N.tradeableModels();
    for (var i = 0; i < models.length; i++) {
        if (skipIds && skipIds.indexOf(models[i].id) >= 0) continue;
        if (N.inStock(di, models[i])) return models[i];
    }
    return null;
}
function vendorIdx(N, pred) {
    for (var i = 0; i < N.VENDORS.length; i++) if (pred(N.VENDORS[i])) return i;
    return -1;
}
function vclick(h, act, extra) {
    var evt = { target: { dataset: Object.assign({ act: act }, extra || {}) } };
    return h.env.click('vendorPanel', evt);
}
function eclick(h, act, extra) {
    var evt = { target: { dataset: Object.assign({ act: act }, extra || {}) } };
    return h.env.click('estatePanel', evt);
}
function finiteVec(v) { return isFinite(v.x) && isFinite(v.y) && isFinite(v.z); }
function giveHome(N, tier, mode) { N.S.home.tier = tier; N.S.home.mode = mode || 'own'; N.S.home.missed = 0; }
function enterHome(h) {
    h.NEON.world.exit = { x: 0, z: 8, yaw: 0 };
    h.NEON.enterInterior('home');
}

// ================================================================ S1 boot
suite('boot', function () {
    test('fresh boot city 0', function () {
        var h = fresh();
        eq(h.NEON.getCity(), 0, 'city');
        ok(h.NEON.getColliders().length > 300, 'colliders built: ' + h.NEON.getColliders().length);
        eq(h.NEON.DOORS.length, 10, 'doors (home+4wh+club+noodle+den+chapel+gate)');
        ok(finiteVec(h.NEON.player.position), 'player position finite');
    });
    test('start click begins the run', function () {
        var h = fresh().start();
        eq(h.NEON.S.credits, 5000, 'seed capital');
        h.env.pumpFrames(30);
        ok(finiteVec(h.NEON.player.position), 'player finite after frames');
    });
    test('boot from a city-1 save builds city 1 before start', function () {
        var save = {
            v: 2, credits: 8000, capacity: 25, inv: {}, owned: {}, trades: 0, peak: 300000,
            rank: 4, losses: 0, runStart: 1700000000000, seed: 424242,
            lastSeenGen: { gpu: 3, ram: 3, cpu: 3 }, quest: { stage: 0, builds: 0 },
            courier: null, bounties: null,
            stash: { own: [0, 0, 0, 0], inv: [{}, {}, {}, {}] },
            stash2: { own: [1, 0, 0, 0], inv: [{ 'gpu-3': 2 }, {}, {}, {}] },
            drone: { fam: null, buyDi: 0, sellDi: 1, earned: 0 }, gambleNet: 0, avatar: 0,
            day: 3, snd: 0, city: 1, home: { tier: -1, mode: '', missed: 0, inv: {} },
            energy: 90, buffs: [], dayT: 0.3, story: { act: 0, visited: 0, couriers: 0, rumors: 0, denWins: 0, done: false }
        };
        var h = fresh({ save: { 'neoncity.save.v2': save } });
        eq(h.NEON.getCity(), 1, 'peekSavedCity built city 1');
        var h0 = fresh();
        ok(JSON.stringify(worldFingerprint(h.NEON)) !== JSON.stringify(worldFingerprint(h0.NEON)),
            'city-1 world differs from city-0 world');
        h.start();
        eq(h.NEON.S.credits, 8000, 'save applied on start');
        eq(h.NEON.getCity(), 1, 'still city 1 after start (no mismatch rebuild)');
        eq(h.NEON.curStash().own[0], 1, 'city-1 warehouse lease restored');
    });
    test('5500-frame pump across 2+ day cycles', function () {
        var h = fresh().start();
        var day0 = h.NEON.S.day;
        for (var b = 0; b < 11; b++) {
            h.env.pumpFrames(500, 55);
            ok(finiteVec(h.NEON.player.position), 'player finite @batch ' + b);
            ok(isFinite(h.NEON.S.credits), 'credits finite @batch ' + b);
        }
        ok(h.NEON.S.day >= day0 + 2, 'at least two dawns crossed (day ' + day0 + ' → ' + h.NEON.S.day + ')');
    });
    test('every market tab renders', function () {
        var h = fresh().start();
        h.NEON.S.credits = 100000;
        placeOnPlaza(h, 0);
        eq(h.NEON.getMarket(), 0, 'proximity detected plaza 0');
        h.NEON.openMarket();
        ok(h.NEON.UI.open, 'market open');
        ['trade', 'upgrades', 'transit', 'rigs', 'scan'].forEach(function (tab) {
            h.NEON.UI.tab = tab;
            h.NEON.syncTabs();
            h.NEON.renderMarket();
            ok(h.env.els.tabBody.innerHTML.length > 40, 'tab ' + tab + ' rendered content');
        });
        h.NEON.closeMarket();
    });
    test('every vendor type renders + chats', function () {
        var h = fresh().start();
        [function (v) { return !!v.den; }, function (v) { return !!v.bar; },
        function (v) { return !!v.food; }, function (v) { return !v.den && !v.bar && !v.food && !v.inside; }]
            .forEach(function (pred, k) {
                var vi = vendorIdx(h.NEON, pred);
                ok(vi >= 0, 'vendor type ' + k + ' exists');
                h.NEON.openVendor(vi);
                ok(h.env.els.vName.textContent.length > 0, 'vendor name rendered');
                vclick(h, 'chat');
                h.NEON.closeVendor();
            });
    });
    test('estate renders in all four states', function () {
        var h = fresh().start();
        var N = h.NEON;
        // no home
        N.openEstate();
        ok(h.env.els.eBody.innerHTML.indexOf('NO FIXED ADDRESS') >= 0, 'no-home state');
        // renting
        giveHome(N, 0, 'rent');
        N.renderEstate();
        ok(h.env.els.eBody.innerHTML.indexOf('renting') >= 0, 'renting state');
        // owned + furniture catalog visible
        giveHome(N, 2, 'own');
        N.renderEstate();
        ok(h.env.els.eBody.innerHTML.indexOf('FURNISHINGS') >= 0, 'owned state shows furnishings');
        // evicted with impounded locker
        N.S.home.tier = -1; N.S.home.mode = '';
        N.S.home.inv['gpu-3'] = 2;
        N.renderEstate();
        ok(h.env.els.eBody.innerHTML.indexOf('IMPOUNDED LOCKER') >= 0, 'evicted locker section');
        delete N.S.home.inv['gpu-3'];
        N.closeEstate();
    });
    test('interiors build and panels render', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 1, 'own');
        enterHome(h);
        eq(N.world.interior, 'home', 'inside home');
        ['bed', 'homestash', 'wardrobe'].forEach(function (k) {
            N.openIntPanel(k);
            ok(h.env.els.iBody.innerHTML.length > 20, 'intPanel ' + k + ' rendered');
            N.closeIntPanel();
        });
        N.exitInterior();
        h.env.flushTimers();
        eq(N.world.interior, null, 'back outside');
        // the other pockets build without throwing
        ['club', 'noodle', 'den', 'chapel'].forEach(function (k) {
            N.world.exit = { x: 0, z: 8, yaw: 0 };
            N.S.rank = 4;                       // club comped
            N.enterInterior(k);
            eq(N.world.interior, k, 'entered ' + k);
            h.env.pumpFrames(10);               // venue anims tick
            N.exitInterior();
            h.env.flushTimers();
        });
    });
    test('minimap and big map draw', function () {
        var h = fresh().start();
        h.env.pumpFrames(40);
        var mctx = h.env.els.minimap._ctx2d;
        ok(mctx && (mctx._calls.arc || 0) > 0, 'minimap drew arcs');
        h.env.key('KeyN');                      // toggle big map
        h.env.pumpFrames(40);
        var bctx = h.env.els.bigMap._ctx2d;
        ok(bctx && (bctx._calls.fillRect || 0) > 0, 'big map drew');
        h.env.key('KeyN');
    });
});

// ================================================================ S2 world/travel
suite('world-travel', function () {
    test('regeneration identity across round trips', function () {
        var h = fresh().start();
        var N = h.NEON;
        var fp0 = worldFingerprint(N);
        N.travelTo(1); h.settle();
        eq(N.getCity(), 1, 'in city 1');
        var fp1 = worldFingerprint(N);
        N.travelTo(0); h.settle();
        deepEq(worldFingerprint(N), fp0, 'city 0 regenerated identically');
        N.travelTo(1); h.settle();
        deepEq(worldFingerprint(N), fp1, 'city 1 regenerated identically');
        N.travelTo(0); h.settle();
        deepEq(worldFingerprint(N), fp0, 'city 0 identical again');
    });
    test('gateway landings are in-bounds and finite', function () {
        var h = fresh().start();
        var N = h.NEON;
        [1, 0, 1, 0].forEach(function (ci) {
            N.travelTo(ci); h.settle();
            var p = N.player.position;
            ok(finiteVec(p), 'finite landing in city ' + ci);
            ok(Math.abs(p.x) < N.getEdge() && Math.abs(p.z) < N.getEdge(), 'inside EDGE in city ' + ci);
            ok(p.y >= 0 && p.y < 2, 'grounded (y=' + p.y.toFixed(2) + ')');
        });
    });
    test('interior door round trip restores position', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 0, 'rent');
        var door = null;
        for (var i = 0; i < N.DOORS.length; i++) if (N.DOORS[i].id === 'home') door = N.DOORS[i];
        ok(!!door, 'home door exists');
        N.player.position.set(door.x + door.nx * 1.5, 0, door.z + door.nz * 1.5);
        h.env.pumpFrames(2);
        N.useDoor(door);
        h.env.flushTimers();
        eq(N.world.interior, 'home', 'entered via door');
        near(N.player.position.x, 560, 40, 'interior band x');
        h.env.pumpFrames(60);                 // let doorT decay before re-use
        N.exitInterior();
        h.env.flushTimers();
        h.env.pumpFrames(60);
        eq(N.world.interior, null, 'exited');
        near(N.player.position.x, door.x, 4, 'returned near door x');
        near(N.player.position.z, door.z, 4, 'returned near door z');
        eq(N.player.position.y, 0, 'on the street');
    });
    test('transit lands on each plaza', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.owned.transit = true;
        N.S.credits = 50000;
        placeOnPlaza(h, 0);
        [1, 2, 3, 0].forEach(function (to) {
            var from = N.getMarket();
            if (from === to) return;
            N.doTransit(to);
            var d = N.DISTRICTS[to];
            var dist = Math.hypot(N.player.position.x - d.pos.x, N.player.position.z - d.pos.z);
            ok(dist < d.radius, 'landed on plaza ' + to + ' (dist ' + dist.toFixed(1) + ')');
            eq(N.player.position.y, 0.5, 'on the platform');
            eq(N.getMarket(), to, 'market follows');
        });
    });
    test('EDGE soft-push returns the player', function () {
        var h = fresh().start();
        var N = h.NEON;
        var E = N.getEdge();
        N.player.position.set(E + 10, 0, 0);
        h.env.pumpFrames(400);
        ok(N.player.position.x < E - 5, 'pushed back inside (x=' + N.player.position.x.toFixed(1) + ', EDGE=' + E + ')');
        ok(finiteVec(N.player.position), 'finite');
    });
    test('collide() finite for 500 random positions per city', function () {
        var h = fresh().start();
        var N = h.NEON;
        var rng = mulberry32(SEED);
        [0, 1].forEach(function (ci) {
            if (N.getCity() !== ci) { N.travelTo(ci); h.settle(); }
            var E = N.getEdge();
            for (var i = 0; i < 500; i++) {
                var r = N.collide((rng() * 2 - 1) * E, (rng() * 2 - 1) * E, 0.55);
                if (!isFinite(r[0]) || !isFinite(r[1])) { ok(false, 'non-finite collide in city ' + ci); return; }
            }
            ok(true, 'city ' + ci + ' collide sweep clean');
        });
    });
    test('warp sweep never produces NaN', function () {
        var h = fresh().start();
        var N = h.NEON;
        for (var i = 0; i < 40; i++) {
            N.warp(i);
            h.env.pumpFrames(3);
            if (!finiteVec(N.player.position)) { ok(false, 'NaN after warp ' + i); return; }
        }
        ok(true, 'warp sweep clean');
    });
});

// ================================================================ S3 money
suite('money', function () {
    test('buy+sell round trip never profits', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.credits = 500000;
        N.setMarket(0);
        var tried = 0, skips = [];
        while (tried < 3) {
            var m = firstStocked(N, 0, skips);
            if (!m) break;
            skips.push(m.id);
            var before = N.S.credits;
            var invBefore = N.S.inv[m.id] || 0;
            N.doBuy(m.id, 1);
            N.doSell(m.id, 1);
            ok(N.S.credits <= before, m.id + ' round trip ≤ 0 (delta ' + (N.S.credits - before) + ')');
            eq(N.S.inv[m.id] || 0, invBefore, m.id + ' inventory restored');
            tried++;
        }
        ok(tried > 0, 'at least one stocked model tested');
    });
    test('bulk buy near the wallet edge never overdrafts (price-ramp bug)', function () {
        // pinned: playerImpact raises the price per unit inside the buy loop, so
        // the up-front afford estimate undercounts the real total — pre-fix this
        // drove credits negative on B10/MAX near-broke buys
        var h = fresh().start();
        var N = h.NEON;
        N.setMarket(0);
        var m = firstStocked(N, 0);
        var p1 = N.buyPrice(0, m.id);
        N.S.credits = Math.round(p1 * 3.05);   // roughly three units before the ramp
        N.doBuy(m.id, 10);
        ok(N.S.credits >= 0, 'no overdraft (credits ' + N.S.credits + ')');
        ok((N.S.inv[m.id] || 0) >= 2, 'still bought the affordable units (' + (N.S.inv[m.id] || 0) + ')');
    });
    test('buy refused when broke — state untouched', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.setMarket(0);
        var m = firstStocked(N, 0);
        N.S.credits = 0;
        var snap = moneySnap(N);
        N.doBuy(m.id, 5);
        deepEq(moneySnap(N), snap, 'broke buy is a no-op');
    });
    test('buy refused when cargo full — state untouched', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.setMarket(0);
        var m = firstStocked(N, 0);
        N.S.credits = 500000;
        N.S.inv[m.id] = N.S.capacity;       // rig full
        var snap = moneySnap(N);
        N.doBuy(m.id, 1);
        deepEq(moneySnap(N), snap, 'full-cargo buy is a no-op');
    });
    test('sell of unowned stock refused', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.setMarket(0);
        var m = N.tradeableModels()[0];
        var snap = moneySnap(N);
        N.doSell(m.id, 3);
        deepEq(moneySnap(N), snap, 'unowned sell is a no-op');
    });
    test('warehouse + home storage conserve items across cities', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.credits = 500000;
        N.setMarket(0);
        var m = firstStocked(N, 0);
        N.doBuy(m.id, 5);
        var total0 = itemTotal(N, m.id);
        eq(total0, 5, 'bought 5');
        N.doStashBuy();
        eq(N.S.stash.own[0], 1, 'city-0 lease');
        N.doDeposit(m.id, 'max', 0);
        eq(itemTotal(N, m.id), total0, 'conserved after deposit');
        eq(N.S.inv[m.id] || 0, 0, 'cargo empty');
        var c0stash = JSON.stringify(N.S.stash);
        // cross-city: city-1 ops cannot touch city-0 racks
        N.travelTo(1); h.settle();
        eq(JSON.stringify(N.S.stash), c0stash, 'city-0 stash untouched by travel');
        ok(N.curStash() === N.S.stash2, 'curStash routes to stash2 in city 1');
        N.setMarket(0);
        N.doStashBuy();
        eq(N.S.stash2.own[0], 1, 'city-1 lease independent');
        N.doWithdraw(m.id, 'max', 0);        // nothing there — must be a no-op
        eq(itemTotal(N, m.id), total0, 'conserved after cross-city withdraw attempt');
        N.travelTo(0); h.settle();
        eq(JSON.stringify(N.S.stash), c0stash, 'city-0 stash intact after round trip');
        N.doWithdraw(m.id, 'max', 0);
        eq(N.S.inv[m.id] || 0, 5, 'withdrew all 5');
        eq(itemTotal(N, m.id), total0, 'conserved end to end');
        // home locker conservation
        giveHome(N, 1, 'own');
        N.doHomeDeposit(m.id, 'max');
        eq(itemTotal(N, m.id), total0, 'conserved in home locker');
        N.doHomeWithdraw(m.id, 'max');
        eq(N.S.inv[m.id] || 0, 5, 'home withdraw complete');
    });
    test('den: stake debited once, cashout equals pot, walkaway forfeits stake', function () {
        var h = fresh().start();
        var N = h.NEON;
        var di = vendorIdx(N, function (v) { return !!v.den; });
        N.S.credits = 100000;
        N.openVendor(di);
        var stake = N.DEN.stake;
        var before = N.S.credits;
        vclick(h, 'g_deal');
        eq(N.S.credits, before - stake, 'stake debited exactly once');
        eq(N.DEN.pot, stake, 'pot equals stake');
        // play one guess; both outcomes must keep the books exact
        var potBefore = N.DEN.pot;
        var credBefore = N.S.credits;
        vclick(h, 'g_hi');
        if (N.DEN.card > 0 && N.DEN.rung >= 1) {
            var pot = N.DEN.pot;
            vclick(h, 'g_cash');
            eq(N.S.credits, credBefore + pot, 'cashout credited exactly the pot');
        } else {
            eq(N.S.credits, credBefore, 'loss costs nothing beyond the stake');
            eq(N.DEN.pot, 0, 'pot cleared on loss');
        }
        // walk away mid-hand with rung 0 → forfeit exactly the stake
        var b2 = N.S.credits;
        vclick(h, 'g_deal');
        eq(N.S.credits, b2 - N.DEN.stake, 'second stake debited');
        N.closeVendor();
        eq(N.S.credits, b2 - stake, 'walkaway forfeits exactly the stake');
        eq(N.DEN.pot, 0, 'den state reset');
    });
    test('den house edge: 2000 simulated hands lose on average', function () {
        var h = fresh().start();
        var N = h.NEON;
        var di = vendorIdx(N, function (v) { return !!v.den; });
        N.S.credits = 10000000;
        N.openVendor(di);
        // force minimum stake
        while (N.DEN.stake !== 100) vclick(h, 'g_stake');
        var start = N.S.credits;
        for (var i = 0; i < 2000; i++) {
            vclick(h, 'g_deal');
            vclick(h, N.DEN.card > 7 ? 'g_lo' : 'g_hi');
            if (N.DEN.rung >= 1 && N.DEN.pot > 0) vclick(h, 'g_cash');
        }
        var net = N.S.credits - start;
        ok(net < 0, 'house wins over 2000 hands (net ' + net + ')');
        ok(net > -2000 * 100, 'player never loses more than total stakes');
        N.closeVendor();
    });
    test('vendor purchases debit exactly once', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.credits = 100000;
        N.S.energy = 40;
        // noodles
        var food = vendorIdx(N, function (v) { return !!v.food; });
        N.openVendor(food);
        var b = N.S.credits;
        vclick(h, 'eat');
        eq(N.S.credits, b - 80, 'noodles cost 80');
        eq(N.S.energy, 70, '+30 energy');
        vclick(h, 'eat');
        eq(N.S.credits, b - 80, 'kitchen cooldown blocks a second bowl');
        N.closeVendor();
        // bar drinks
        var bar = vendorIdx(N, function (v) { return !!v.bar; });
        N.openVendor(bar);
        b = N.S.credits;
        vclick(h, 'd_volt'); eq(N.S.credits, b - 90, 'volt cola 90');
        vclick(h, 'd_wired'); eq(N.S.credits, b - 90 - 350, 'wired 350');
        vclick(h, 'd_synth'); eq(N.S.credits, b - 90 - 350 - 900, 'synth 900');
        N.closeVendor();
        // rumor from a street contact
        var street = vendorIdx(N, function (v) { return !v.den && !v.bar && !v.food; });
        N.openVendor(street);
        b = N.S.credits;
        vclick(h, 'rumor');
        ok(N.S.credits < b && b - N.S.credits <= 400, 'rumor debited its quoted cost once (' + (b - N.S.credits) + ')');
        N.closeVendor();
    });
    test('upgrade prereqs enforced, cost debited once', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.credits = 100000;
        var snap = moneySnap(N);
        N.doUpgrade('legs');                       // requires grips
        deepEq(moneySnap(N), snap, 'prereq-blocked upgrade is a no-op');
        N.doUpgrade('grips');
        eq(N.S.credits, 100000 - 1900, 'grips 1900');
        N.doUpgrade('legs');
        eq(N.S.credits, 100000 - 1900 - 3400, 'legs 3400');
        N.doUpgrade('grips');
        eq(N.S.credits, 100000 - 1900 - 3400, 'double-buy of non-repeat upgrade refused');
    });
    test('furniture buys once, double-buy refused, tier gate enforced', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.credits = 100000;
        giveHome(N, 0, 'rent');                    // pod: tier-0 items only
        N.openEstate();
        var b = N.S.credits;
        eclick(h, 'd_buy', { id: 'mattress' });
        eq(N.S.credits, b - 900, 'mattress 900');
        eq(N.S.deco.owned.mattress, 1, 'owned');
        eclick(h, 'd_buy', { id: 'mattress' });
        eq(N.S.credits, b - 900, 'double-buy refused');
        eclick(h, 'd_buy', { id: 'aquarium' });    // tier 2 item in a pod
        eq(N.S.credits, b - 900, 'tier-locked item refused');
        ok(!N.S.deco.owned.aquarium, 'aquarium not granted');
        N.closeEstate();
    });
    test('gate fee: locked/broke/valid paths', function () {
        var h = fresh().start();
        var N = h.NEON;
        // locked
        N.S.netWorthPeak = 100000;
        N.S.credits = 5000;
        N.tryGate(); h.settle();
        eq(N.getCity(), 0, 'locked gate refused travel');
        eq(N.S.credits, 5000, 'locked gate took nothing');
        // eligible but broke
        N.S.netWorthPeak = 250000;
        N.S.credits = 700;
        N.tryGate(); h.settle();
        eq(N.getCity(), 0, 'broke traveler refused');
        eq(N.S.credits, 700, 'no partial fare taken');
        // valid
        N.S.credits = 10000;
        N.tryGate(); h.settle();
        eq(N.getCity(), 1, 'travelled');
        eq(N.S.credits, 10000 - 750, 'fee exactly 750, once');
        // return trip needs no unlock but still the fare (after doorT decays)
        h.env.pumpFrames(120);
        N.tryGate(); h.settle();
        eq(N.getCity(), 0, 'returned');
        eq(N.S.credits, 10000 - 1500, 'return fare 750');
    });
    test('rent charges once per dawn', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 0, 'rent');
        // sleeping can legitimately clear bounties (+reward); account for them
        // exactly so a double rent charge still shows up as a mismatch
        function bountyPaid() {
            if (!N.S.bounties) return 0;
            return N.S.bounties.list.reduce(function (s, b) { return s + (b.done ? b.reward : 0); }, 0);
        }
        N.S.credits = 10000;
        var b0 = N.S.credits;
        N.performSleepSkip('dawn');
        eq(N.S.credits, b0 - 150 + bountyPaid(), 'one dawn, one rent (150) + exact bounty payouts');
        var b1 = N.S.credits;
        h.env.pumpFrames(60);
        eq(N.S.credits, b1, 'no re-charge without a dawn');
        N.performSleepSkip('dawn');
        // dawn rerolled the bounty list, so bountyPaid() now only counts the
        // second night's completions
        eq(N.S.credits, b1 - 150 + bountyPaid(), 'second dawn charges again');
    });
});

// ================================================================ S4 save/load
suite('save-load', function () {
    test('full round trip incl. city, stash2, deco', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.credits = 424242;
        N.S.netWorthPeak = 500000;
        var m = N.tradeableModels()[0];
        N.S.inv[m.id] = 3;
        N.S.stash.own[2] = 1; N.S.stash.inv[2][m.id] = 4;
        N.S.stash2.own[1] = 1; N.S.stash2.inv[1][m.id] = 6;
        N.S.deco.owned.mattress = 1; N.S.deco.owned.holoplant = 1;
        giveHome(N, 2, 'own');
        N.S.home.inv[m.id] = 2;
        N.travelTo(1); h.settle();
        N.saveGame();
        var raw = h.env.storage.getItem('neoncity.save.v2');
        ok(!!raw, 'save written');
        var h2 = fresh({ save: { 'neoncity.save.v2': raw } });
        eq(h2.NEON.getCity(), 1, 'boots into saved city');
        h2.start();
        var M = h2.NEON;
        eq(M.S.credits, 424242, 'credits (travelTo is the raw ride — no fee outside tryGate)');
        eq(M.S.inv[m.id], 3, 'cargo');
        eq(M.S.stash.inv[2][m.id], 4, 'city-0 stash');
        eq(M.S.stash2.inv[1][m.id], 6, 'city-1 stash');
        eq(M.S.deco.owned.mattress, 1, 'deco');
        eq(M.S.home.tier, 2, 'home tier');
        eq(M.S.home.inv[m.id], 2, 'home locker');
    });
    test('reload cannot reroll stock windows or prices', function () {
        var h = fresh().start();
        h.NEON.saveGame();
        var raw = h.env.storage.getItem('neoncity.save.v2');
        var a = fresh({ save: { 'neoncity.save.v2': raw } }).start();
        var b = fresh({ save: { 'neoncity.save.v2': raw } }).start();
        var models = a.NEON.tradeableModels();
        var same = true;
        for (var i = 0; i < models.length; i++) {
            var mb = b.NEON.tradeableModels()[i];
            for (var di = 0; di < 4; di++) {
                if (a.NEON.inStock(di, models[i]) !== b.NEON.inStock(di, mb)) same = false;
                if (a.NEON.buyPrice(di, models[i].id) !== b.NEON.buyPrice(di, mb.id)) same = false;
            }
        }
        ok(same, 'two boots from one save agree on stock + prices');
    });
    test('v1 save migrates without throwing', function () {
        var v1 = { credits: 12345, capacity: 33, inv: { gpu: 2, ram: 5, cpu: 0 }, owned: { scanner: true }, trades: 9, peak: 20000, seed: 777, runStart: 1690000000000 };
        var h = fresh({ save: { 'neoncity.save.v1': v1 } });
        h.start();
        eq(h.NEON.S.credits, 12345, 'v1 credits kept');
        eq(h.NEON.S.inv['gpu-2'], 2, 'flat gpu became gpu-2');
        eq(h.NEON.S.inv['ram-2'], 5, 'flat ram became ram-2');
        eq(h.NEON.getCity(), 0, 'v1 lands in city 0');
    });
    test('corrupt save falls back to a fresh run', function () {
        var h = fresh({ save: { 'neoncity.save.v2': '{broken json!!' } });
        h.start();
        eq(h.NEON.S.credits, 5000, 'fresh 5000c run');
        eq(h.NEON.getCity(), 0, 'city 0');
    });
});

// ================================================================ S5 regressions
suite('regressions', function () {
    test('H6: evicted mid-sleep wakes outside, no rested buff, locker claimable', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 0, 'rent');
        var m = N.tradeableModels()[0];
        N.S.home.inv[m.id] = 3;                      // stash to reclaim later
        N.S.credits = 0;
        N.S.home.missed = 1;                         // one strike already
        enterHome(h);
        N.sleepStart('dawn');
        h.env.pumpFrames(300);                       // fade → skip → fade
        eq(N.SLEEP.phase, 0, 'sleep machine finished');
        eq(N.S.home.tier, -1, 'evicted during the night');
        var rested = N.S.buffs.some(function (b) { return b.id === 'rested'; });
        ok(!rested, 'no rested buff after eviction');
        h.env.flushTimers();
        eq(N.world.interior, null, 'woke up outside');
        // claim the impounded locker
        N.doHomeWithdraw(m.id, 'max');
        eq(N.S.inv[m.id], 3, 'claimed impounded stock');
        // deposit is blocked while homeless
        var snap = moneySnap(N);
        N.doHomeDeposit(m.id, 'max');
        deepEq(moneySnap(N), snap, 'deposit refused while evicted');
    });
    test('rested magnitude caps at 3 with mattress', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 3, 'own');
        N.S.deco.owned.mattress = 1;
        N.S.credits = 10000;
        N.performSleepSkip('dawn');
        var rested = null;
        N.S.buffs.forEach(function (b) { if (b.id === 'rested') rested = b; });
        ok(!!rested, 'rested applied');
        eq(rested.mag, 3, 'capped at penthouse tier');
    });
    test('courier blocks the maglev gate', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.netWorthPeak = 300000;
        N.S.credits = 10000;
        N.S.courier = { destType: 'pad', destIdx: 0, destName: 'X', size: 2, pay: 100, deadline: Date.now() + 9e7, fromName: 'T' };
        N.tryGate(); h.settle();
        eq(N.getCity(), 0, 'gate refused while courier active');
        eq(N.S.credits, 10000, 'no fee taken');
        ok(!!N.S.courier, 'contract intact');
        N.S.courier = null;
        N.tryGate(); h.settle();
        eq(N.getCity(), 1, 'gate works once the package is gone');
    });
    test('gate spam charges exactly once', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.netWorthPeak = 300000;
        N.S.credits = 10000;
        for (var i = 0; i < 5; i++) N.tryGate();
        h.settle();
        eq(N.getCity(), 1, 'one travel happened');
        eq(N.S.credits, 10000 - 750, 'one fee for five presses');
    });
    test('door spam during transition is a single entry', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 0, 'rent');
        var door = N.DOORS.filter(function (d) { return d.id === 'home'; })[0];
        N.player.position.set(door.x + door.nx * 1.5, 0, door.z + door.nz * 1.5);
        for (var i = 0; i < 4; i++) N.useDoor(door);
        h.env.flushTimers();
        eq(N.world.interior, 'home', 'entered once');
        ok(finiteVec(N.player.position), 'position sane');
        h.env.pumpFrames(60);                 // doorT decay
        N.exitInterior();
        N.exitInterior();
        h.env.flushTimers();
        h.env.pumpFrames(60);
        eq(N.world.interior, null, 'single exit');
        ok(Math.abs(N.player.position.x) < N.getEdge(), 'back in the city');
    });
    test('sleep refused while courier active', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 0, 'rent');
        N.S.courier = { destType: 'pad', destIdx: 0, destName: 'X', size: 2, pay: 100, deadline: Date.now() + 9e7, fromName: 'T' };
        N.sleepStart('dawn');
        eq(N.SLEEP.phase, 0, 'sleep never started');
        N.S.courier = null;
    });
    test('raids do not follow you between cities', function () {
        var h = fresh().start();
        var N = h.NEON;
        // a raid locks down district 0 in city 0...
        N.S.events.push({ text: 'RAID test', district: 0, city: 0, mult: 1.3, t: 600, kind: 'bad', phys: 'raid' });
        h.env.pumpFrames(3);
        N.setMarket(0);
        N.openMarket();
        ok(!N.UI.open, 'city-0 market locked down during its raid');
        // ...but the same district index in city 1 trades normally
        N.travelTo(1); h.settle();
        N.setMarket(0);
        N.openMarket();
        ok(N.UI.open, 'city-1 market open despite city-0 raid');
        N.closeMarket();
        // and the raid is still waiting back home
        N.travelTo(0); h.settle();
        N.setMarket(0);
        N.openMarket();
        ok(!N.UI.open, 'city-0 raid persists after the round trip');
        N.S.events.length = 0;
        h.env.pumpFrames(3);
    });
    test('governor ignores tab-switch frame spikes', function () {
        var h = fresh().start();
        var N = h.NEON;
        h.env.pumpFrames(60, 16);
        eq(N.GFX.tier, 0, 'steady at HIGH');
        h.env.pumpFrames(1, 5000);          // one 5 s frame (backgrounded tab)
        h.env.pumpFrames(10, 16);
        eq(N.GFX.tier, 0, 'spike frame did not drop the tier');
    });
    test('wardrobe change re-keys the home dressing', function () {
        var h = fresh().start();
        var N = h.NEON;
        giveHome(N, 1, 'own');
        enterHome(h);
        var k0 = N.INTERIORS.home.dressKey;
        N.S.avatar = (N.S.avatar + 1) % 5;
        N.dressHome(1);
        var k1 = N.INTERIORS.home.dressKey;
        ok(k0 !== k1, 'dress key includes the avatar (' + k0 + ' → ' + k1 + ')');
        N.INTERIORS.home.grp.visible = true;
        N.exitInterior();
        h.env.flushTimers();
    });
    test('club rope lifts at rank 3+', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.rank = 3;
        N.world.exit = { x: 0, z: 8, yaw: 0 };
        N.enterInterior('club');
        eq(N.CLUB.ropeCols.length, 0, 'rope colliders removed');
        ok(N.CLUB.ropeMesh && N.CLUB.ropeMesh.visible === false, 'rope hidden');
        N.exitInterior();
        h.env.flushTimers();
    });
    test('BUG1: sell price never exceeds buy price, even with every stacking bonus', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.owned.broker = 1;                       // shrinks spread
        N.S.owned.neural = 1;                        // +8% sell
        N.S.buffs.push({ id: 'rested', mag: 3 });    // penthouse-tier +5% sell (max)
        var models = N.tradeableModels();
        for (var di = 0; di < N.DISTRICTS.length; di++) {
            for (var i = 0; i < models.length; i++) {
                var id = models[i].id;
                ok(N.sellPrice(di, id) <= N.buyPrice(di, id), 'sell <= buy @district ' + di + ' item ' + id);
            }
        }
    });
    test('BUG2: tierMult anchors exactly at 0.70 when age===3', function () {
        var h = fresh().start();
        var N = h.NEON;
        var m = N.tradeableModels()[0];
        var age3 = Object.assign({}, m, { gen: N.newestGen(m.fi) - 3 });
        near(N.tierMult(age3), 0.70, 1e-9, 'age===3 anchors at exactly 0.70');
        var age4 = Object.assign({}, m, { gen: N.newestGen(m.fi) - 4 });
        near(N.tierMult(age4), 0.70 * 1.13, 1e-9, 'age===4 is one 13% step above the anchor');
    });
    test('BUG3: NPCs never spawn past the turn-flip threshold', function () {
        var h = fresh().start();
        var N = h.NEON;
        var turn = N.getNpcTurn();
        // the vulnerable spawn branch is player-relative (s = pAlong ± [40,110]) —
        // position the player so that sweep actually crosses the NPC_TURN boundary
        N.player.position.set(100, 0.5, 100);
        for (var i = 0; i < N.npcs.length && i < 20; i++) {
            var n = N.npcs[i];
            n.mode = 0;
            for (var trial = 0; trial < 300; trial++) {
                N.respawnNPC(n);
                ok(Math.abs(n.s) <= turn, 'spawn s=' + n.s + ' must be <= NPC_TURN=' + turn);
            }
        }
    });
    test('BUG4: door colliders are oriented to match the door\'s facing', function () {
        var h = fresh().start();
        var N = h.NEON;
        var W = { home: 2.4, wh: 2.2, club: 2.6, noodle: 2.0, den: 2.0, chapel: 2.2 };
        var cols = N.getColliders();
        function approx(a, b) { return Math.abs(a - b) < 1e-6; }
        N.DOORS.forEach(function (d) {
            var w = W[d.id]; if (!w) return;
            var wide = Math.max(0.9, w / 2);
            var match = null;
            for (var i = 0; i < cols.length; i++) {
                var c = cols[i];
                if (Math.abs(c.x - d.x) > 1 || Math.abs(c.z - d.z) > 1) continue;
                var doorShaped = (approx(c.hw, wide) && approx(c.hd, 0.5)) || (approx(c.hw, 0.5) && approx(c.hd, wide));
                if (doorShaped) { match = c; break; }
            }
            ok(!!match, 'door-shaped collider exists near door ' + d.id);
            if (match) {
                if (d.nx !== 0) {
                    near(match.hw, 0.5, 1e-6, d.id + ' hw thin along the facing axis');
                    near(match.hd, wide, 1e-6, d.id + ' hd wide across the doorway');
                } else {
                    near(match.hw, wide, 1e-6, d.id + ' hw wide across the doorway');
                    near(match.hd, 0.5, 1e-6, d.id + ' hd thin along the facing axis');
                }
            }
        });
    });
    test('BUG5: skybridges are centered on the true face-to-face gap, not tower centers', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.travelTo(1); h.env.flushTimers(); h.env.pumpFrames(5);   // Obsidian Sprawl: bigger, more towers/bridges
        var spots = N.getBridgeSpots();
        ok(spots.length > 0, 'at least one skybridge generated at this seed');
        spots.forEach(function (sp) {
            var A = sp.a, B = sp.b;
            var expected;
            if (sp.axis === 'z') {
                var aFirst = A[2] < B[2];
                var s0 = aFirst ? A[2] + A[4] / 2 : B[2] + B[4] / 2;
                var s1 = aFirst ? B[2] - B[4] / 2 : A[2] - A[4] / 2;
                expected = (s0 + s1) / 2;
                near(sp.mz, expected, 0.01, 'z-axis bridge centered on the true gap');
            } else {
                var aFirstX = A[0] < B[0];
                var s0x = aFirstX ? A[0] + A[3] / 2 : B[0] + B[3] / 2;
                var s1x = aFirstX ? B[0] - B[3] / 2 : A[0] - A[3] / 2;
                expected = (s0x + s1x) / 2;
                near(sp.mx, expected, 0.01, 'x-axis bridge centered on the true gap');
            }
        });
        var anyAsymmetric = spots.some(function (sp) {
            return sp.axis === 'z' ? sp.a[4] !== sp.b[4] : sp.a[3] !== sp.b[3];
        });
        ok(anyAsymmetric, 'sanity: at least one pair has unequal footprints at this seed');
    });
    test('BUG6: rebuildShell disposes the previous interior\'s geometry/material/textures', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.deco.owned.mattress = 1;
        N.S.deco.owned.neonsign = 1;          // exercises the placeDeco untracked-texture path too
        giveHome(N, 1, 'own');
        N.dressHome(1);                        // first build: nothing to dispose yet, must not throw
        var oldGrp = N.INTERIORS.home.grp;
        var disposedGeo = 0, disposedMat = 0, disposedTex = 0;
        oldGrp.traverse(function (o) {
            if (!o.isMesh) return;
            if (o.geometry) { var g0 = o.geometry.dispose; o.geometry.dispose = function () { disposedGeo++; g0.call(this); }; }
            var ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach(function (m) {
                if (!m) return;
                var m0 = m.dispose; m.dispose = function () { disposedMat++; m0.call(this); };
                if (m.map) { var t0 = m.map.dispose; m.map.dispose = function () { disposedTex++; t0.call(this); }; }
            });
        });
        N.S.avatar = (N.S.avatar + 1) % 5;     // force a dressKey change -> triggers a real rebuild
        N.dressHome(1);
        ok(disposedGeo > 0, 'old geometries were disposed on rebuild');
        ok(disposedMat > 0, 'old materials were disposed on rebuild');
        ok(disposedTex > 0, 'old canvas textures (skyline + neonsign) were disposed on rebuild');
    });
    test('BUG7 (defensive): checkStory tolerates a stale act index beyond STORY_ACTS.length', function () {
        var h = fresh().start();
        var N = h.NEON;
        N.S.story.act = 9999;
        N.S.story.done = false;
        h.env.pumpFrames(30);                  // checkStory runs on the ~0.4s-throttled UI tick, not every frame
        eq(N.S.story.done, true, 'stale act index is treated as story-complete, not a crash');
    });
    test('BUG8: doDeposit/doWithdraw refuse empty quantities without mutating state', function () {
        var h = fresh().start();
        var N = h.NEON;
        var di = 0;
        giveHome(N, 0, 'own');
        N.curStash().own[di] = 1;
        var m = N.tradeableModels()[0];
        N.S.inv[m.id] = 0;
        var snap1 = moneySnap(N);
        N.doDeposit(m.id, 5, di);
        deepEq(moneySnap(N), snap1, 'deposit of nothing does not move inventory');
        N.curStash().inv[di][m.id] = 0;
        N.S.capacity = 999;
        var snap2 = moneySnap(N);
        N.doWithdraw(m.id, 5, di);
        deepEq(moneySnap(N), snap2, 'withdraw of nothing does not move inventory');
    });
    test('BUG10: median-planter trees don\'t register a redundant nested trunk collider', function () {
        var h = fresh().start();
        var N = h.NEON;
        var cols = N.getColliders();
        var nestedCount = 0;
        for (var i = 0; i < cols.length; i++) {
            if (Math.abs(cols[i].hw - 1.6) < 0.01 && Math.abs(cols[i].hd - 0.7) < 0.01) {
                for (var j = 0; j < cols.length; j++) {
                    if (j === i) continue;
                    if (Math.abs(cols[j].hw - 0.3) < 0.01 && Math.abs(cols[j].hd - 0.3) < 0.01 &&
                        Math.abs(cols[j].x - cols[i].x) < 0.01 && Math.abs(cols[j].z - cols[i].z) < 0.01) nestedCount++;
                }
            }
        }
        eq(nestedCount, 0, 'no trunk collider nested inside a planter collider');
    });
});

// ================================================================ S5b perf (pinned: performance pass)
suite('perf', function () {
    test('economy still ticks under the 8 Hz throttle', function () {
        var h = fresh().start();
        var N = h.NEON;
        var m = N.tradeableModels()[0];
        N.ensureMarket(m);
        var t0 = N.S.trend[m.id];
        h.env.pumpFrames(300);                   // ~4.8 s → ~38 market ticks
        var t1 = N.S.trend[m.id];
        ok(isFinite(t1), 'trend finite');
        ok(t1 >= 0.55 && t1 <= 1.85, 'trend inside clamp band (' + t1 + ')');
        ok(t1 !== t0, 'trend actually moved (' + t0 + ' → ' + t1 + ')');
        // locals for both cities stay seeded and finite
        var l0 = N.S.locals[0][0][m.id], l1 = N.S.locals[1][0][m.id];
        ok(isFinite(l0) && isFinite(l1), 'both cities have finite local prices');
    });
    test('quality governor drops under load, locks manually, persists', function () {
        var h = fresh().start();
        var N = h.NEON;
        eq(N.GFX.tier, 0, 'starts at HIGH');
        // sustained 40 ms frames → EMA ~40 > 22 → drop within ~2 s
        h.env.pumpFrames(400, 40);
        ok(N.GFX.tier > 0, 'auto tier dropped under load (tier ' + N.GFX.tier + ')');
        // manual lock via the V key: AUTO → HIGH
        h.env.key('KeyV');
        eq(N.S.gfx, 1, 'V cycles to locked HIGH');
        eq(N.GFX.tier, 0, 'locked HIGH applied');
        h.env.pumpFrames(400, 40);
        eq(N.GFX.tier, 0, 'manual lock ignores load');
        // persists through save/load
        N.saveGame();
        var raw = h.env.storage.getItem('neoncity.save.v2');
        var h2 = fresh({ save: { 'neoncity.save.v2': raw } }).start();
        eq(h2.NEON.S.gfx, 1, 'gfx setting survives the save');
        eq(h2.NEON.GFX.tier, 0, 'locked tier re-applied on load');
    });
    test('zero-opacity layers are hidden, not just faded', function () {
        var h = fresh().start();
        var N = h.NEON;
        // dry, bright daylight (nightFactor bottoms out near dayTime 0.3)
        N.world.weather = 0; N.world.wetness = 0; N.world.dayTime = 0.3;
        h.env.pumpFrames(60);                    // settle without drifting into dusk
        var scene3 = N.player.parent;            // the root scene
        var hiddenRain = true, hiddenStars = true;
        scene3.traverse(function (o) {
            if (o.isPoints && o.geometry.attributes.position.count === 5200 && o.visible) hiddenRain = false;
            if (o.isPoints && o.geometry.attributes.position.count === 900 && o.visible) hiddenStars = false;
        });
        ok(hiddenRain, 'rain field hidden when dry');
        ok(hiddenStars, 'stars hidden at midday');
    });
});

// ================================================================ S6 soak
suite('soak', function () {
    test('fuzz agent, ' + SOAK_N + ' actions, invariants hold', function () {
        var h = fresh({ mathSeed: SEED }).start();
        var N = h.NEON;
        var rng = mulberry32(SEED ^ 0x9E3779B9);
        N.S.credits = 20000;
        var modelIds = N.tradeableModels().map(function (m) { return m.id; });
        modelIds.push('bogus-99', 'gpu-999');

        function ri(a, b) { return a + Math.floor(rng() * (b - a + 1)); }
        var actions = [
            ['frames', 25, function () { h.env.pumpFrames(ri(1, 30)); }],
            ['clock-jump', 8, function () { h.env.advance(ri(1, 21600) * 1000); h.env.pumpFrames(3); }],
            ['move', 10, function () {
                var E = N.getEdge();
                N.player.position.set((rng() * 2 - 1) * (E + 5), 0, (rng() * 2 - 1) * (E + 5));
                h.env.pumpFrames(2);
            }],
            ['buy', 8, function () { N.setMarket(ri(0, 3)); N.doBuy(modelIds[ri(0, modelIds.length - 1)], [1, 10, 'max'][ri(0, 2)]); }],
            ['sell', 8, function () { N.setMarket(ri(0, 3)); N.doSell(modelIds[ri(0, modelIds.length - 1)], [1, 10, 'max'][ri(0, 2)]); }],
            ['tabs', 5, function () {
                N.setMarket(ri(0, 3));
                N.openMarket();
                N.UI.tab = ['trade', 'upgrades', 'transit', 'rigs', 'scan'][ri(0, 4)];
                N.renderMarket();
                N.closeMarket();
            }],
            ['stash', 6, function () {
                var di = ri(0, 3), id = modelIds[ri(0, modelIds.length - 1)];
                N.setMarket(di);
                var op = ri(0, 2);
                if (op === 0) N.doStashBuy();
                else if (op === 1) N.doDeposit(id, [1, 'max'][ri(0, 1)], di);
                else N.doWithdraw(id, [1, 'max'][ri(0, 1)], di);
            }],
            ['homestash', 4, function () {
                var id = modelIds[ri(0, modelIds.length - 1)];
                if (rng() < 0.5) N.doHomeDeposit(id, 'max'); else N.doHomeWithdraw(id, 'max');
            }],
            ['vendor', 8, function () {
                var vi = ri(0, N.VENDORS.length - 1);
                N.openVendor(vi);
                var act = ['chat', 'eat', 'd_volt', 'd_wired', 'd_synth', 'rumor', 'job',
                    'g_stake', 'g_deal', 'g_hi', 'g_lo', 'g_cash'][ri(0, 11)];
                vclick(h, act);
                N.closeVendor();
            }],
            ['estate', 4, function () {
                N.openEstate();
                var act = ri(0, 4);
                if (act === 0) eclick(h, 'h_rent', { tier: String(ri(0, 1)) });
                else if (act === 1) eclick(h, 'h_buy', { tier: String(ri(0, 3)) });
                else if (act === 2) eclick(h, 'd_buy', { id: ['mattress', 'holoplant', 'lava', 'aquarium'][ri(0, 3)] });
                else if (act === 3) eclick(h, 'h_stop');
                else eclick(h, 'h_swd', { item: modelIds[ri(0, modelIds.length - 1)], q: 'max' });
                N.closeEstate();
            }],
            ['sleep', 3, function () {
                if (N.S.home.tier >= 0 && !N.world.interior) {
                    N.world.exit = { x: 0, z: 8, yaw: 0 };
                    N.enterInterior('home');
                    N.sleepStart(rng() < 0.5 ? 'dawn' : 'dusk');
                    h.env.pumpFrames(300);
                    N.exitInterior();
                    h.env.flushTimers();
                }
            }],
            ['transit', 4, function () { N.setMarket(ri(0, 3)); N.doTransit(ri(0, 3)); }],
            ['gate', 3, function () { N.tryGate(); h.settle(); }],
            ['door', 4, function () {
                var d = N.DOORS[ri(0, N.DOORS.length - 1)];
                N.useDoor(d);
                h.env.flushTimers();
                if (N.world.interior) { N.exitInterior(); h.env.flushTimers(); }
            }],
            ['upgrade', 3, function () {
                N.doUpgrade(['cargo', 'scanner', 'grips', 'legs', 'transit', 'broker', 'neural', 'ghost'][ri(0, 7)]);
            }],
            ['saveload', 2, function () {
                N.saveGame();
                var raw = h.env.storage.getItem('neoncity.save.v2');
                if (raw) N.applySave(JSON.parse(raw));
            }],
            ['upearn', 2, function () { N.S.credits += ri(100, 5000); if (N.S.credits > N.S.netWorthPeak) N.S.netWorthPeak = N.S.credits; }]
        ];
        var pool = [];
        actions.forEach(function (a) { for (var w = 0; w < a[1]; w++) pool.push(a); });

        var lastPeak = N.S.netWorthPeak;
        var failed = false;
        for (var step = 0; step < SOAK_N && !failed; step++) {
            var act = pool[ri(0, pool.length - 1)];
            try {
                act[2]();
            } catch (e) {
                ok(false, 'CRASH at step ' + step + ' action=' + act[0] + ' seed=' + SEED + ' :: ' +
                    (e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
                failed = true;
                break;
            }
            // invariants
            var c = N.S.credits;
            if (!(isFinite(c) && c >= 0)) { ok(false, 'credits invalid (' + c + ') step ' + step + ' after ' + act[0] + ' seed=' + SEED); failed = true; }
            var p = N.player.position;
            if (!finiteVec(p)) { ok(false, 'position NaN step ' + step + ' after ' + act[0]); failed = true; }
            var inCity = Math.abs(p.x) <= N.getEdge() + 16 && Math.abs(p.z) <= N.getEdge() + 16;
            var inPocket = Math.abs(p.x - 560) < 45;
            if (!inCity && !inPocket) { ok(false, 'position out of world (' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ') step ' + step + ' after ' + act[0]); failed = true; }
            if (!(N.S.energy >= 0 && N.S.energy <= 100)) { ok(false, 'energy out of range (' + N.S.energy + ') step ' + step); failed = true; }
            if (N.S.netWorthPeak < lastPeak - 1e-6) { ok(false, 'netWorthPeak decreased step ' + step + ' after ' + act[0]); failed = true; }
            lastPeak = N.S.netWorthPeak;
            if (h.env.reloadRequested) { ok(false, 'unexpected reload request step ' + step); failed = true; }
            // integer, non-negative item counts everywhere
            if (step % 250 === 0) {
                var bad = null;
                [N.S.inv, N.S.home.inv].concat(N.S.stash.inv, N.S.stash2.inv).forEach(function (map) {
                    for (var k in map) {
                        var v = map[k];
                        if (!(typeof v === 'number' && isFinite(v) && v >= 0 && v === Math.round(v))) bad = k + '=' + v;
                    }
                });
                if (bad) { ok(false, 'bad item count ' + bad + ' step ' + step); failed = true; }
            }
        }
        if (!failed) ok(true, 'soak of ' + SOAK_N + ' actions clean (seed ' + SEED + ')');
    });
});

// ================================================================ runner
function runSuites(filter) {
    results = [];
    for (var i = 0; i < suites.length; i++) {
        if (filter && suites[i].name.indexOf(filter) < 0) continue;
        curSuite = suites[i].name;
        if (!QUIET) console.log('== ' + curSuite);
        try {
            suites[i].fn();
        } catch (e) {
            curTest = '(suite body)';
            record(false, 'SUITE THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
        }
        lastHandle = null;   // let contexts go between suites
    }
    var failed = results.filter(function (r) { return !r.ok; });
    return { total: results.length, failed: failed };
}

function summarize(tag, run) {
    var passed = run.total - run.failed.length;
    console.log('\n' + tag + ': ' + passed + ' checks passed, ' + run.failed.length + ' failed');
    return run.failed.length === 0;
}

// ---------- selftest: prove the suite catches real breakage ----------
var MUTATIONS = [
    // note: mutating the up-front afford estimate alone is now harmless — the
    // per-unit wallet check added for the price-ramp fix independently prevents
    // overdraft. The guard that must be load-bearing is the in-loop one:
    ['no-wallet-check-in-buy-loop',
        'if (cost + pu > S.credits) break;',
        'if (false) break;'],
    ['free-gate',
        'var GATE_UNLOCK = 250000, GATE_FEE = 750;',
        'var GATE_UNLOCK = 250000, GATE_FEE = 0;'],
    ['save-drops-stash2',
        'courier: S.courier, bounties: S.bounties, stash: S.stash, stash2: S.stash2,',
        'courier: S.courier, bounties: S.bounties, stash: S.stash,'],
    ['double-rent',
        'chargeRent();                       // before the ledger snapshot',
        'chargeRent(); chargeRent();'],
    ['travel-skips-clearWorld',
        /clearWorld\(\);\s*\n\s*buildWorld\(ci\);/,
        'buildWorld(ci);']
];

if (SELFTEST) {
    console.log('SELFTEST — baseline must pass, every mutation must fail\n');
    QUIET = true;
    var oldSoak = SOAK_N; SOAK_N = 300;   // keep mutation runs quick
    var base = runSuites(null);
    var allGood = true;
    if (base.failed.length) {
        console.log('BASELINE FAILED (' + base.failed.length + ' failures) — fix the suite first:');
        base.failed.slice(0, 5).forEach(function (f) { console.log('  ' + f.suite + ' :: ' + f.test + ' — ' + f.msg); });
        allGood = false;
    } else {
        console.log('baseline: green (' + base.total + ' checks)');
        MUTATIONS.forEach(function (mu) {
            GLOBAL_LOAD_OPTS = { mutate: [[mu[1], mu[2]]] };
            var run;
            try { run = runSuites(null); }
            catch (e) { run = { total: 0, failed: [{ msg: 'harness threw: ' + e }] }; }
            GLOBAL_LOAD_OPTS = null;
            var caught = run.failed.length > 0;
            console.log((caught ? 'ok    ' : 'MISS  ') + 'mutation "' + mu[0] + '" → ' + run.failed.length + ' failures');
            if (!caught) allGood = false;
        });
    }
    SOAK_N = oldSoak;
    console.log(allGood ? '\nSELFTEST PASS' : '\nSELFTEST FAIL');
    process.exitCode = allGood ? 0 : 1;
} else {
    var runA = runSuites(FILTER);
    var okA = summarize('run 1', runA);
    // determinism double-run (full runs only)
    if (!FILTER) {
        var sigA = JSON.stringify(runA.failed.map(function (f) { return f.suite + '::' + f.test; }));
        var runB = runSuites(null);
        var okB = summarize('run 2 (determinism)', runB);
        var sigB = JSON.stringify(runB.failed.map(function (f) { return f.suite + '::' + f.test; }));
        if (sigA !== sigB) { console.log('NON-DETERMINISTIC RESULTS between runs'); okA = false; }
        process.exitCode = okA && okB ? 0 : 1;
    } else {
        process.exitCode = okA ? 0 : 1;
    }
}
