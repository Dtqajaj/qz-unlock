var QZEngine = (function (P) {
  var MSG = P.MSG;

  var DEFAULT_SERVER = 'wss://csdj23.haowan823.cn:7385/';
  var SERVER_LIST = 'https://wwjres.haowan823.cn/newqz/serverlist_4399.json';

  var GAP = 500;
  var GAP_REST = 1500;
  var REST_EVERY = 40;

  function Engine(opt) {
    opt = opt || {};
    this.onLog = opt.onLog || function () {};
    this.onProgress = opt.onProgress || function () {};
    this.onDone = opt.onDone || function () {};
    this.server = opt.server || DEFAULT_SERVER;
    this.gap = opt.gap || GAP;
    this.ws = null;
    this.state = {
      login: false, guns: [], roles: [], items: {},
      adShop: [], zsShop: [],
      ok: 0, fail: 0, rejected: [], phase: 'idle',
      startedAt: 0, doneAt: 0
    };
  }

  Engine.prototype.log = function (m) { this.onLog(m, this.state); };

  Engine.prototype.send = function (m, b) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(P.frame(m, b || []).buffer);
    return true;
  };

  Engine.prototype.connect = function (cred) {
    var self = this;
    this.cred = cred;
    this.state.phase = 'connect';
    this.state.startedAt = Date.now();
    return new Promise(function (resolve, reject) {
      var ws;
      try { ws = new WebSocket(self.server); } catch (e) { reject(e); return; }
      self.ws = ws;
      ws.binaryType = 'arraybuffer';
      var settled = false;
      ws.onopen = function () {
        self.state.phase = 'login';
        self.send(MSG.LOGIN, P.loginBody(cred));
      };
      ws.onerror = function () { if (!settled) { settled = true; reject(new Error('ws error')); } };
      ws.onclose = function () { if (!settled) { settled = true; reject(new Error('ws closed')); } };
      ws.onmessage = function (ev) {
        var u8 = new Uint8Array(ev.data);
        var mid = (u8[0] << 8) | u8[1];
        var body = u8.subarray(2);
        try { self.handle(mid, body); } catch (e) {}
        if (mid === MSG.LOGIN_ACK) {
          var f = P.PF(body), code = 0;
          for (var i = 0; i < f.length; i++) if (f[i].n === 1) code = Number(f[i].v);
          if (!settled) {
            settled = true;
            if (code === 1) { self.state.login = true; resolve(true); }
            else reject(new Error('login code=' + code));
          }
        }
      };
    });
  };

  Engine.prototype.handle = function (mid, body) {
    var st = this.state, i, o, sub, f;
    if (mid === MSG.GUNS) {
      st.guns = [];
      f = P.PF(body);
      for (i = 0; i < f.length; i++) {
        if (f[i].n !== 1 || f[i].w !== 2) continue;
        o = {}; sub = P.PF(f[i].v);
        for (var j = 0; j < sub.length; j++) if (sub[j].n === 1) o.id = Number(sub[j].v);
        if (o.id) st.guns.push(o.id);
      }
      return;
    }
    if (mid === MSG.ROLES) {
      st.roles = [];
      f = P.PF(body);
      for (i = 0; i < f.length; i++) {
        if (f[i].n !== 1) continue;
        o = {}; sub = P.PF(f[i].v);
        for (var k = 0; k < sub.length; k++) if (sub[k].n === 1) o.id = Number(sub[k].v);
        if (o.id) st.roles.push(o.id);
      }
      return;
    }
    if (mid === MSG.ITEMS) {
      st.items = {};
      f = P.PF(body);
      for (i = 0; i < f.length; i++) {
        if (f[i].n !== 1) continue;
        o = {}; sub = P.PF(f[i].v);
        for (var m = 0; m < sub.length; m++) {
          if (sub[m].n === 1) o.id = Number(sub[m].v);
          if (sub[m].n === 2) o.ztv = Number(sub[m].v);
        }
        if (o.id) st.items[o.id] = o.ztv || 0;
      }
      return;
    }
    if (mid === MSG.AD_SHOP_LIST) {
      st.adShop = [];
      f = P.PF(body);
      for (i = 0; i < f.length; i++) {
        if (f[i].n !== 1 || f[i].w !== 2) continue;
        o = { id: 0, nbo: 0, fxt: 0, tlr: 0 };
        sub = P.PF(f[i].v);
        for (var n = 0; n < sub.length; n++) {
          if (sub[n].n === 1) o.id = Number(sub[n].v);
          if (sub[n].n === 3) o.nbo = Number(sub[n].v);
          if (sub[n].n === 5) o.fxt = Number(sub[n].v);
          if (sub[n].n === 6) o.tlr = Number(sub[n].v);
        }
        if (o.id) st.adShop.push(o);
      }
      return;
    }
    if (mid === MSG.ZS_SHOP_LIST) {
      st.zsShop = [];
      f = P.PF(body);
      for (i = 0; i < f.length; i++) {
        if (f[i].n !== 1 || f[i].w !== 2) continue;
        o = { id: 0, limit: 0, tlr: 0 };
        sub = P.PF(f[i].v);
        for (var q = 0; q < sub.length; q++) {
          if (sub[q].n === 1) o.id = Number(sub[q].v);
          if (sub[q].n === 4) o.limit = Number(sub[q].v);
          if (sub[q].n === 5) o.tlr = Number(sub[q].v);
        }
        if (o.id) st.zsShop.push(o);
      }
      return;
    }
    if (mid === MSG.TRY_GUN_ACK || mid === MSG.TRY_ROLE_ACK ||
        mid === MSG.SLOT_ACK || mid === MSG.AD_BUY_ACK ||
        mid === MSG.AD_CLAIM_ACK || mid === MSG.ZS_BUY_ACK) {
      var c = 0;
      f = P.PF(body);
      for (var r = 0; r < f.length; r++) if (f[r].n === 1) c = Number(f[r].v);
      if (c === 1) st.ok++;
      else { st.fail++; st.rejected.push({ mid: mid, code: c }); }
    }
  };

  Engine.prototype.pull = function () {
    var self = this;
    var seq = [MSG.PULL_PLAN, MSG.PULL_GUN, MSG.PULL_ROLE, MSG.PULL_ITEM,
               MSG.AD_SHOP, MSG.ZS_SHOP];
    self.state.phase = 'pull';
    return new Promise(function (resolve) {
      var i = 0;
      function step() {
        if (i >= seq.length) { setTimeout(resolve, 1200); return; }
        self.send(seq[i++], []);
        setTimeout(step, 700);
      }
      step();
    });
  };

  Engine.prototype.plan = function (catalog, opt) {
    opt = opt || {};
    var st = this.state, q = [], i;

    if (opt.guns !== false) {
      for (i = 0; i < catalog.guns.length; i++) {
        if (st.guns.indexOf(catalog.guns[i]) < 0) {
          q.push({ m: MSG.TRY_GUN, b: P.FI(1, 1).concat(P.FI(2, catalog.guns[i])),
                   tag: 'gun:' + catalog.guns[i] });
        }
      }
    }
    if (opt.roles !== false) {
      for (i = 0; i < catalog.roles.length; i++) {
        if (st.roles.indexOf(catalog.roles[i]) < 0) {
          q.push({ m: MSG.TRY_ROLE, b: P.FI(1, 1).concat(P.FI(2, catalog.roles[i])),
                   tag: 'role:' + catalog.roles[i] });
        }
      }
    }
    if (opt.slots !== false) {
      for (i = 0; i < 6; i++) {
        q.push({ m: MSG.SLOT, b: P.FI(1, i).concat(P.FI(2, 1)), tag: 'slot:' + i });
      }
    }
    if (opt.shopAd !== false) {
      for (i = 0; i < st.adShop.length; i++) {
        var po = st.adShop[i];
        if (po.fxt > 0 && po.tlr >= po.fxt) continue;
        q.push({ m: MSG.AD_BUY, b: P.FI(1, po.id), tag: 'adBuy:' + po.id });
        q.push({ m: MSG.AD_CLAIM, b: P.FI(1, po.id), tag: 'adClaim:' + po.id });
      }
    }
    if (opt.shopDiamond === true) {
      for (i = 0; i < st.zsShop.length; i++) {
        var zo = st.zsShop[i];
        if (zo.limit > 0 && zo.tlr >= zo.limit) continue;
        q.push({ m: MSG.ZS_BUY, b: P.FI(1, zo.id), tag: 'zs:' + zo.id });
      }
    }
    return q;
  };

  Engine.prototype.run = function (queue, opt) {
    var self = this;
    opt = opt || {};
    self.state.phase = 'write';
    self.state.total = queue.length;
    self.state.sent = 0;
    return new Promise(function (resolve) {
      var i = 0;
      function step() {
        if (i >= queue.length) {
          self.state.phase = 'verify';
          setTimeout(function () {
            self.pull().then(function () {
              self.state.phase = 'done';
              self.state.doneAt = Date.now();
              self.onDone(self.state);
              resolve(self.state);
            });
          }, 1200);
          return;
        }
        var t = queue[i++];
        self.send(t.m, t.b);
        self.state.sent = i;
        self.onProgress(i, queue.length, t.tag, self.state);
        var d = (i % REST_EVERY === 0) ? GAP_REST : (opt.gap || self.gap);
        setTimeout(step, d);
      }
      step();
    });
  };

  Engine.prototype.close = function () {
    try { if (this.ws) this.ws.close(); } catch (e) {}
    this.ws = null;
  };

  return {
    Engine: Engine,
    fetchServer: function () {
      return fetch(SERVER_LIST + '?t=' + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (j) { return j.server[0]; })
        .catch(function () { return DEFAULT_SERVER; });
    }
  };
})(QZProto);

if (typeof module !== 'undefined' && module.exports) module.exports = QZEngine;
