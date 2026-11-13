var QZProto = (function () {
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

  function frame(msgid, body) {
    body = body || [];
    var w = new Uint8Array(2 + body.length);
    w[0] = (msgid >> 8) & 255;
    w[1] = msgid & 255;
    for (var i = 0; i < body.length; i++) w[2 + i] = body[i];
    return w;
  }

  function loginBody(c) {
    return []
      .concat(FS(1, String(c.userId || '')))
      .concat(FI(2, 13))
      .concat(FS(3, '4399h5'))
      .concat(FI(4, 0))
      .concat(FB(5, [].concat(FS(1, 'userId'), FS(2, String(c.userId || '')), FI(3, 1))))
      .concat(FB(5, [].concat(FS(1, 'userName'), FS(2, String(c.userName || '')), FI(3, 1))))
      .concat(FB(5, [].concat(FS(1, 'time'), FS(2, String(c.time || '')), FI(3, 1))))
      .concat(FB(5, [].concat(FS(1, 'sign'), FS(2, String(c.sign || '')), FI(3, 1))));
  }

  function rewriteGuns(u8) {
    if (!u8 || u8.length < 3) return null;
    if (u8[0] !== 0x55 || u8[1] !== 0xf6) return null;
    var out = [];
    try {
      var fs = PF(u8.subarray(2));
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (f.n !== 1 || f.w !== 2) continue;
        var w = {}, sub = PF(f.v);
        for (var j = 0; j < sub.length; j++) {
          if (sub[j].n === 1) w.id = Number(sub[j].v);
          else if (sub[j].n === 2) w.lv = Number(sub[j].v);
          else if (sub[j].n === 3) w.n3 = Number(sub[j].v);
        }
        if (w.id === undefined) continue;
        var nb = [].concat(FI(1, w.id));
        if (w.lv !== undefined) nb = nb.concat(FI(2, w.lv));
        if (w.n3 !== undefined) nb = nb.concat(FI(3, w.n3));
        nb = nb.concat(FI(4, -1));
        out = out.concat(FB(1, nb));
      }
    } catch (e) { return null; }
    if (!out.length) return null;
    var res = new Uint8Array(2 + out.length);
    res[0] = 0x55; res[1] = 0xf6;
    for (var k = 0; k < out.length; k++) res[2 + k] = out[k];
    return res;
  }

  return {
    VI: VI, TG: TG, FI: FI, FS: FS, FB: FB, U8: U8,
    PF: PF, RV: RV, frame: frame,
    loginBody: loginBody, rewriteGuns: rewriteGuns,
    MSG: {
      LOGIN: 10000, LOGIN_ACK: 10001,
      PULL_PLAN: 22001, PLAN: 22002,
      PULL_GUN: 22003, GUNS: 22006,
      PULL_ROLE: 22005, ROLES: 22004,
      PULL_ITEM: 22007, ITEMS: 22008,
      SLOT: 22015, SLOT_ACK: 22016,
      MEV: 22020, MEV_ACK: 22021,
      GUN_ADD: 22024, ROLE_ADD: 22025, ITEM_ADD: 22026,
      AD_SHOP: 22050, AD_SHOP_LIST: 22051,
      AD_BUY: 22052, AD_BUY_ACK: 22053,
      AD_CLAIM: 22054, AD_CLAIM_ACK: 22055,
      ZS_SHOP: 22056, ZS_SHOP_LIST: 22057,
      ZS_BUY: 22058, ZS_BUY_ACK: 22059,
      TRY_GUN: 22064, TRY_GUN_ACK: 22065,
      TRY_ROLE: 22066, TRY_ROLE_ACK: 22067
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QZProto;
