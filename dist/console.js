(function () {
  'use strict';
  if (window.__QZUNLOCK) { console.log('已经运行过了'); return; }

  var GUN_IDS = [1,2,3,4,5,6,11,12,13,14,15,16,21,22,23,24,25,26,31,32,33,34,35,41,42,43,44,45,48,
    51,52,53,54,58,61,62,63,64,67,71,72,73,74,81,82,83,84,87,88,91,92,93,94,101,102,103,104,
    107,111,112,113,114,115,121,122,123,124,128,151,152,153,154,156,161,162,163,164,165,201,
    202,203,204,205,211,212,213,214,215,216];
  var ROLE_IDS = [1,2,3,4,5,6,7];
  var SLOT_IDS = [0,1,2,3,4,5];

  function VI(v){var o=[],x=BigInt(v);if(x<0n)x+=18446744073709551616n;while(x>127n){o.push(Number((x&127n)+128n));x>>=7n}o.push(Number(x));return o}
  function TG(n,w){return VI((n<<3)|w)}
  function FI(n,v){return TG(n,0).concat(VI(v))}
  function U8(s){var b=[],i,c,c2,cp;for(i=0;i<s.length;i++){c=s.charCodeAt(i);
    if(c<128)b.push(c);else if(c<2048)b.push(192|(c>>6),128|(c&63));
    else if(c<55296||c>57343)b.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
    else{c2=s.charCodeAt(++i);cp=65536+((c&1023)<<10)+(c2&1023);
      b.push(240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63));}}return b}
  function FS(n,s){var a=U8(s);return TG(n,2).concat(VI(a.length),a)}
  function FB(n,a){return TG(n,2).concat(VI(a.length),a)}
  function RV(b,i){var v=0n,s=0n,c;while(i<b.length){c=b[i++];v|=BigInt(c&127)<<s;s+=7n;if(!(c&128))break}return{v:v,i:i}}
  function PF(b){var o=[],i=0;while(i<b.length){var r=RV(b,i);if(r.i===i)break;i=r.i;
    var t=Number(r.v),f=t>>>3,w=t&7,val=null;
    if(w===0){var r2=RV(b,i);val=r2.v;i=r2.i}
    else if(w===2){var r3=RV(b,i);i=r3.i;var nn=Number(r3.v);val=b.subarray(i,i+nn);i+=nn}
    else if(w===5){val=b.subarray(i,i+4);i+=4}
    else if(w===1){val=b.subarray(i,i+8);i+=8}
    else break;o.push({n:f,w:w,v:val})}return o}

  var q = location.search.replace(/^\?/, '').split('&'), c = {};
  for (var i = 0; i < q.length; i++) {
    var t = q[i].split('=');
    c[t[0]] = decodeURIComponent(t.slice(1).join('=') || '');
  }
  if (!c.userId || !c.sign) {
    console.log('%c[QZ] 没找到凭证，请先正常进入游戏再运行', 'color:red');
    return;
  }

  var S = { guns: [], roles: [], items: {}, adShop: [], ok: 0, fail: 0 };
  window.__QZUNLOCK = S;

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
  var P = WebSocket.prototype;
  if (!P.__qzU) {
    P.__qzU = 1;
    var oa = P.addEventListener;
    P.addEventListener = function (ty, fn, op) {
      if (ty !== 'message' || typeof fn !== 'function') return oa.call(this, ty, fn, op);
      var self = this;
      return oa.call(this, ty, function (ev) {
        try {
          var d = ev && ev.data;
          if (d && d.byteLength >= 3 && !DONE.has(d)) {
            var u8 = new Uint8Array(d);
            var rw = rewriteGuns(u8);
            if (rw) { DONE.add(rw.buffer); return fn.call(self, new MessageEvent('message', { data: rw.buffer })); }
          }
        } catch (e) {}
        return fn.apply(self, arguments);
      }, op);
    };
    var H = [];
    var dd = Object.getOwnPropertyDescriptor(P, 'onmessage');
    if (!dd || !dd.set) {
      try {
        Object.defineProperty(P, 'onmessage', {
          configurable: true, enumerable: true,
          get: function () { return H[0] || null; },
          set: function (fn) {
            H[0] = fn; var self = this;
            if (typeof fn !== 'function') return;
            oa.call(this, 'message', function (ev) {
              try {
                var d = ev && ev.data;
                if (d && d.byteLength >= 3 && !DONE.has(d)) {
                  var u8 = new Uint8Array(d);
                  var rw = rewriteGuns(u8);
                  if (rw) { DONE.add(rw.buffer); return fn.call(self, new MessageEvent('message', { data: rw.buffer })); }
                }
              } catch (e) {}
              return fn.call(self, ev);
            });
          }
        });
      } catch (e) {}
    }
  }

  var WS = new WebSocket('wss://csdj23.haowan823.cn:7385/');
  WS.binaryType = 'arraybuffer';

  function send(m, b) {
    if (WS.readyState !== 1) return;
    b = b || [];
    var w = new Uint8Array(2 + b.length);
    w[0] = (m >> 8) & 255; w[1] = m & 255;
    for (var i = 0; i < b.length; i++) w[2 + i] = b[i];
    WS.send(w.buffer);
  }

  WS.onmessage = function (ev) {
    var u8 = new Uint8Array(ev.data), mid = (u8[0] << 8) | u8[1], body = u8.subarray(2);
    try {
      if (mid === 10001) {
        var f = PF(body), code = 0;
        for (var i = 0; i < f.length; i++) if (f[i].n === 1) code = Number(f[i].v);
        if (code !== 1) { console.log('%c[QZ] 登录失败 code=' + code, 'color:red'); return; }
        console.log('%c[QZ] 登录成功', 'color:lime');
        [22001, 22003, 22005, 22007, 22050, 22056].forEach(function (m, k) {
          setTimeout(function () { send(m, []); }, k * 700);
        });
        setTimeout(doWrite, 5200);
      }
      if (mid === 22006) {
        S.guns = [];
        PF(body).forEach(function (f) {
          if (f.n !== 1 || f.w !== 2) return;
          var o = {}, s = PF(f.v);
          s.forEach(function (g) { if (g.n === 1) o.id = Number(g.v); });
          if (o.id) S.guns.push(o.id);
        });
      }
      if (mid === 22004) {
        S.roles = [];
        PF(body).forEach(function (f) {
          if (f.n !== 1) return;
          var o = {}, s = PF(f.v);
          s.forEach(function (g) { if (g.n === 1) o.id = Number(g.v); });
          if (o.id) S.roles.push(o.id);
        });
      }
      if (mid === 22051) {
        S.adShop = [];
        PF(body).forEach(function (f) {
          if (f.n !== 1 || f.w !== 2) return;
          var o = { id: 0, fxt: 0, tlr: 0 }, s = PF(f.v);
          s.forEach(function (g) {
            if (g.n === 1) o.id = Number(g.v);
            if (g.n === 5) o.fxt = Number(g.v);
            if (g.n === 6) o.tlr = Number(g.v);
          });
          if (o.id) S.adShop.push(o);
        });
      }
      if (mid === 22065 || mid === 22067 || mid === 22016 || mid === 22053 || mid === 22055) {
        var c2 = 0, ff = PF(body);
        for (var z = 0; z < ff.length; z++) if (ff[z].n === 1) c2 = Number(ff[z].v);
        if (c2 === 1) S.ok++; else S.fail++;
      }
    } catch (e) {}
  };

  WS.onopen = function () {
    var b = [];
    b = b.concat(FS(1, c.userId)).concat(FI(2, 13)).concat(FS(3, '4399h5')).concat(FI(4, 0));
    b = b.concat(FB(5, [].concat(FS(1, 'userId'), FS(2, c.userId), FI(3, 1))));
    b = b.concat(FB(5, [].concat(FS(1, 'userName'), FS(2, c.userName), FI(3, 1))));
    b = b.concat(FB(5, [].concat(FS(1, 'time'), FS(2, c.time), FI(3, 1))));
    b = b.concat(FB(5, [].concat(FS(1, 'sign'), FS(2, c.sign), FI(3, 1))));
    send(10000, b);
  };

  function doWrite() {
    console.log('%c[QZ] 当前枪械 ' + S.guns.length + '/89，角色 ' + S.roles.length + '/7', 'color:cyan');
    var q = [];
    GUN_IDS.forEach(function (id) {
      if (S.guns.indexOf(id) < 0) q.push({ m: 22064, b: FI(1, 1).concat(FI(2, id)) });
    });
    ROLE_IDS.forEach(function (id) {
      if (S.roles.indexOf(id) < 0) q.push({ m: 22066, b: FI(1, 1).concat(FI(2, id)) });
    });
    SLOT_IDS.forEach(function (id) {
      q.push({ m: 22015, b: FI(1, id).concat(FI(2, 1)) });
    });
    S.adShop.forEach(function (po) {
      if (po.fxt > 0 && po.tlr >= po.fxt) return;
      q.push({ m: 22052, b: FI(1, po.id) });
      q.push({ m: 22054, b: FI(1, po.id) });
    });

    console.log('%c[QZ] 待写 ' + q.length + ' 条，约 ' + Math.ceil(q.length / 120) + ' 分钟', 'color:yellow');
    var i = 0;
    function step() {
      if (i >= q.length) {
        console.log('%c[QZ] 完成！成功 ' + S.ok + ' 失败 ' + S.fail, 'color:lime;font-size:14px');
        setTimeout(function () {
          [22001, 22003, 22005, 22007].forEach(function (m, k) {
            setTimeout(function () { send(m, []); }, k * 700);
          });
          setTimeout(function () {
            console.log('%c[QZ] 复核：枪械 ' + S.guns.length + '/89，角色 ' + S.roles.length + '/7', 'color:lime');
          }, 3500);
        }, 1500);
        return;
      }
      var t = q[i++];
      send(t.m, t.b);
      if (i % 20 === 0) console.log('[QZ] ' + i + '/' + q.length);
      setTimeout(step, (i % 40 === 0) ? 1500 : 500);
    }
    step();
  }

  console.log('%c[QZ] 已启动，正在连接…', 'color:orange');
})();
