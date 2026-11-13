// ==UserScript==
// @name         吃鸡枪王战场 全解锁
// @namespace    https://github.com/bz/qz-unlock
// @version      4.0
// @description  服务端写入 89 把枪 + 7 角色 + 备战栏位，改写下行 22006 让界面显示「永久」，清空广告商店。
// @author       敝帚
// @match        *://h5game.haowan823.cn/*
// @match        *://h.api.4399.com/g.php*
// @run-at       document-start
// @ua           both
// @panel        true
// @func unlockServer|写入服务端|89 枪 + 7 角色，重进还在|=true
// @func forcePermanent|显示永久|改写 22006 的 ztv 为 -1|=true
// @func shopAd|清空广告商店|免广告领取全部商品|=true
// @func autoRun|自动执行|进游戏自动刷|=true
// ==/UserScript==

(function () {
  'use strict';

  var GUN_IDS = [1,2,3,4,5,6,11,12,13,14,15,16,21,22,23,24,25,26,31,32,33,34,35,41,42,43,44,45,48,
    51,52,53,54,58,61,62,63,64,67,71,72,73,74,81,82,83,84,87,88,91,92,93,94,101,102,103,104,
    107,111,112,113,114,115,121,122,123,124,128,151,152,153,154,156,161,162,163,164,165,201,
    202,203,204,205,211,212,213,214,215,216];
  var ROLE_IDS = [1,2,3,4,5,6,7];
  var SLOT_IDS = [0,1,2,3,4,5];

  var CFG_KEY = 'qzunlock_cfg';
  var RAN_KEY = 'qzunlock_ran';
  var CFG = { unlockServer: true, forcePermanent: true, shopAd: true, autoRun: true };

  var S = {
    phase: '', login: false, rewrites: 0,
    guns: [], roles: [], adShop: [], ok: 0, fail: 0,
    log: [], errors: []
  };
  window.__QZUNLOCK = S;

  function log(m) {
    var l = '[' + S.phase + '] ' + m;
    S.log.push(l);
    if (S.log.length > 120) S.log.shift();
    try { if (typeof GM_log === 'function') GM_log(l); } catch (e) {}
    try { console.log('[QZ] ' + l); } catch (e) {}
  }
  function err(m) {
    S.errors.push(m);
    if (S.errors.length > 40) S.errors.shift();
    try { console.log('[QZ-ERR] ' + m); } catch (e) {}
  }

  function loadCfg() {
    try {
      var s = window.localStorage.getItem(CFG_KEY);
      if (!s) return;
      var o = JSON.parse(s);
      for (var k in CFG) if (o[k] !== undefined) CFG[k] = o[k] === true;
    } catch (e) {}
  }
  function saveCfg() {
    try { window.localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); } catch (e) {}
  }

  function VI(v) {
    var o = [], x = BigInt(v);
    if (x < 0n) x += 18446744073709551616n;
    while (x > 127n) { o.push(Number((x & 127n) + 128n)); x >>= 7n; }
    o.push(Number(x));
    return o;
  }
  function TG(n, w) { return VI((n << 3) | w); }
  function FI(n, v) { return TG(n, 0).concat(VI(v)); }
  function U8(s) {
    var b = [], i, c, c2, cp;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 128) b.push(c);
      else if (c < 2048) b.push(192 | (c >> 6), 128 | (c & 63));
      else if (c < 55296 || c > 57343) b.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      else {
        c2 = s.charCodeAt(++i);
        cp = 65536 + ((c & 1023) << 10) + (c2 & 1023);
        b.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
      }
    }
    return b;
  }
  function FS(n, s) { var a = U8(s); return TG(n, 2).concat(VI(a.length), a); }
  function FB(n, a) { return TG(n, 2).concat(VI(a.length), a); }

  function RV(b, i) {
    var v = 0n, s = 0n, c;
    while (i < b.length) {
      c = b[i++];
      v |= BigInt(c & 127) << s;
      s += 7n;
      if (!(c & 128)) break;
    }
    return { v: v, i: i };
  }
  function PF(b) {
    var o = [], i = 0;
    while (i < b.length) {
      var r = RV(b, i);
      if (r.i === i) break;
      i = r.i;
      var t = Number(r.v), f = t >>> 3, w = t & 7, val = null;
      if (w === 0) { var r2 = RV(b, i); val = r2.v; i = r2.i; }
      else if (w === 2) {
        var r3 = RV(b, i); i = r3.i;
        var n = Number(r3.v);
        val = b.subarray(i, i + n); i += n;
      } else if (w === 5) { val = b.subarray(i, i + 4); i += 4; }
      else if (w === 1) { val = b.subarray(i, i + 8); i += 8; }
      else break;
      o.push({ n: f, w: w, v: val });
    }
    return o;
  }

  function rewriteGuns(u8) {
    if (!u8 || u8.length < 3 || u8[0] !== 0x55 || u8[1] !== 0xf6) return null;
    var out = [];
    try {
      PF(u8.subarray(2)).forEach(function (f) {
        if (f.n !== 1 || f.w !== 2) return;
        var w = {}, sub = PF(f.v);
        sub.forEach(function (s) {
          if (s.n === 1) w.id = Number(s.v);
          if (s.n === 2) w.lv = Number(s.v);
          if (s.n === 3) w.n3 = Number(s.v);
        });
        if (w.id === undefined) return;
        var nb = [].concat(FI(1, w.id));
        if (w.lv !== undefined) nb = nb.concat(FI(2, w.lv));
        if (w.n3 !== undefined) nb = nb.concat(FI(3, w.n3));
        nb = nb.concat(FI(4, -1));
        out = out.concat(FB(1, nb));
      });
    } catch (e) { return null; }
    if (!out.length) return null;
    var res = new Uint8Array(2 + out.length);
    res[0] = 0x55; res[1] = 0xf6;
    for (var k = 0; k < out.length; k++) res[2 + k] = out[k];
    return res;
  }

  var DONE = new WeakSet();

  function deliver(ev, fn, self) {
    try {
      if (!CFG.forcePermanent) return fn.call(self, ev);
      var d = ev && ev.data;
      if (!d || !d.byteLength || d.byteLength < 3) return fn.call(self, ev);
      if (DONE.has(d)) return fn.call(self, ev);
      var u8 = new Uint8Array(d);
      var rw = rewriteGuns(u8);
      if (!rw) return fn.call(self, ev);
      DONE.add(rw.buffer);
      S.rewrites++;
      return fn.call(self, new MessageEvent('message', { data: rw.buffer }));
    } catch (e) {
      err('deliver ' + e.message);
      try { return fn.call(self, ev); } catch (e2) {}
    }
  }

  function installHook() {
    var P = WebSocket.prototype;
    if (P.__qzU) return;
    P.__qzU = 1;
    var oa = P.addEventListener;
    P.addEventListener = function (ty, fn, op) {
      if (ty !== 'message' || typeof fn !== 'function') return oa.call(this, ty, fn, op);
      var self = this;
      return oa.call(this, ty, function (ev) { return deliver(ev, fn, self); }, op);
    };
    var H = [];
    var dd = Object.getOwnPropertyDescriptor(P, 'onmessage');
    if (!dd || !dd.set) {
      try {
        Object.defineProperty(P, 'onmessage', {
          configurable: true, enumerable: true,
          get: function () { return H[0] || null; },
          set: function (fn) {
            H[0] = fn;
            var self = this;
            if (typeof fn !== 'function') return;
            oa.call(this, 'message', function (ev) { return deliver(ev, fn, self); });
          }
        });
      } catch (e) {}
    }
  }

  function qmap() {
    var p = {}, q = String(window.location.search || '').replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      if (!q[i]) continue;
      var t = q[i].split('=');
      try { p[t[0]] = decodeURIComponent(t.slice(1).join('=') || ''); }
      catch (e) { p[t[0]] = t.slice(1).join('='); }
    }
    return p;
  }

  var WS = null;

  function send(m, b) {
    if (!WS || WS.readyState !== 1) return;
    b = b || [];
    var w = new Uint8Array(2 + b.length);
    w[0] = (m >> 8) & 255; w[1] = m & 255;
    for (var i = 0; i < b.length; i++) w[2 + i] = b[i];
    WS.send(w.buffer);
  }

  function openConn() {
    var c = qmap();
    if (!c.userId || !c.sign) { err('no creds'); return; }
    try { WS = new WebSocket('wss://csdj23.haowan823.cn:7385/'); }
    catch (e) { err('ws ' + e.message); return; }
    WS.binaryType = 'arraybuffer';
    WS.onopen = function () {
      S.phase = 'login';
      var b = [];
      b = b.concat(FS(1, String(c.userId))).concat(FI(2, 13))
           .concat(FS(3, '4399h5')).concat(FI(4, 0));
      b = b.concat(FB(5, [].concat(FS(1, 'userId'), FS(2, String(c.userId)), FI(3, 1))));
      b = b.concat(FB(5, [].concat(FS(1, 'userName'), FS(2, String(c.userName || '')), FI(3, 1))));
      b = b.concat(FB(5, [].concat(FS(1, 'time'), FS(2, String(c.time || '')), FI(3, 1))));
      b = b.concat(FB(5, [].concat(FS(1, 'sign'), FS(2, String(c.sign || '')), FI(3, 1))));
      send(10000, b);
    };
    WS.onmessage = function (ev) {
      var u8 = new Uint8Array(ev.data), m = (u8[0] << 8) | u8[1], b = u8.subarray(2);
      try { onDown(m, b); } catch (e) {}
    };
  }

  function onDown(m, b) {
    if (m === 10001) {
      var f = PF(b), code = 0;
      for (var i = 0; i < f.length; i++) if (f[i].n === 1) code = Number(f[i].v);
      if (code !== 1) { err('login ' + code); return; }
      S.login = true;
      log('登录成功');
      pullAll();
      return;
    }
    if (m === 22006) {
      S.guns = [];
      PF(b).forEach(function (f) {
        if (f.n !== 1 || f.w !== 2) return;
        var o = {}, s = PF(f.v);
        s.forEach(function (g) { if (g.n === 1) o.id = Number(g.v); });
        if (o.id) S.guns.push(o.id);
      });
      return;
    }
    if (m === 22004) {
      S.roles = [];
      PF(b).forEach(function (f) {
        if (f.n !== 1) return;
        var o = {}, s = PF(f.v);
        s.forEach(function (g) { if (g.n === 1) o.id = Number(g.v); });
        if (o.id) S.roles.push(o.id);
      });
      return;
    }
    if (m === 22051) {
      S.adShop = [];
      PF(b).forEach(function (f) {
        if (f.n !== 1 || f.w !== 2) return;
        var o = { id: 0, fxt: 0, tlr: 0 }, s = PF(f.v);
        s.forEach(function (g) {
          if (g.n === 1) o.id = Number(g.v);
          if (g.n === 5) o.fxt = Number(g.v);
          if (g.n === 6) o.tlr = Number(g.v);
        });
        if (o.id) S.adShop.push(o);
      });
      return;
    }
    if (m === 22065 || m === 22067 || m === 22016 || m === 22053 || m === 22055) {
      var c2 = 0, ff = PF(b);
      for (var z = 0; z < ff.length; z++) if (ff[z].n === 1) c2 = Number(ff[z].v);
      if (c2 === 1) S.ok++; else S.fail++;
    }
  }

  var q = [];
  function enq(m, b) { q.push({ m: m, b: b }); }

  function pullAll() {
    S.phase = 'pull';
    send(22001, []);
    setTimeout(function () { send(22003, []); }, 700);
    setTimeout(function () { send(22005, []); }, 1400);
    setTimeout(function () { send(22007, []); }, 2100);
    setTimeout(function () { send(22050, []); }, 2800);
    setTimeout(doWrite, 4200);
  }

  function doWrite() {
    if (!CFG.unlockServer) { S.phase = 'idle'; return; }
    var last = 0;
    try { last = Number(window.localStorage.getItem(RAN_KEY) || 0); } catch (e) {}
    if (last && Date.now() - last < 180000) { log('3 分钟内跑过，跳过'); return; }
    try { window.localStorage.setItem(RAN_KEY, String(Date.now())); } catch (e) {}

    S.phase = 'write';
    q = [];
    var i;
    for (i = 0; i < GUN_IDS.length; i++) {
      if (S.guns.indexOf(GUN_IDS[i]) < 0) enq(22064, FI(1, 1).concat(FI(2, GUN_IDS[i])));
    }
    for (i = 0; i < ROLE_IDS.length; i++) {
      if (S.roles.indexOf(ROLE_IDS[i]) < 0) enq(22066, FI(1, 1).concat(FI(2, ROLE_IDS[i])));
    }
    for (i = 0; i < SLOT_IDS.length; i++) {
      enq(22015, FI(1, SLOT_IDS[i]).concat(FI(2, 1)));
    }
    if (CFG.shopAd) {
      for (i = 0; i < S.adShop.length; i++) {
        var po = S.adShop[i];
        if (po.fxt > 0 && po.tlr >= po.fxt) continue;
        enq(22052, FI(1, po.id));
        enq(22054, FI(1, po.id));
      }
    }
    log('待写 ' + q.length + ' 条');
    drain(0);
  }

  function drain(c) {
    if (!q.length) {
      S.phase = 'done';
      log('完成 枪 ' + S.guns.length + '/89 角色 ' + S.roles.length + '/7 ok=' + S.ok + ' fail=' + S.fail);
      setTimeout(pullAll, 3000);
      return;
    }
    var t = q.shift();
    send(t.m, t.b);
    c++;
    setTimeout(function () { drain(c); }, c % 40 === 0 ? 1500 : 500);
  }

  loadCfg();
  installHook();

  var boot = setInterval(function () {
    var c = qmap();
    if (c.userId && c.sign) {
      clearInterval(boot);
      if (CFG.autoRun) openConn();
    }
  }, 400);
  setTimeout(function () { clearInterval(boot); }, 60000);

  var ID = null;
  function useFunc(key, apply) {
    if (typeof BZ_use === 'function' && ID) {
      var box = BZ_use(ID, key);
      box.fn = function (v) { apply(v === true); };
      apply(box.v === true);
      return;
    }
    var on = CFG[key] === true;
    if (typeof BZ_isOn === 'function' && ID) {
      try { on = BZ_isOn(ID, key) === true; } catch (e) {}
    }
    apply(on);
  }
  function bind(k) { useFunc(k, function (v) { CFG[k] = v; saveCfg(); }); }
  bind('unlockServer');
  bind('forcePermanent');
  bind('shopAd');
  bind('autoRun');
})();
