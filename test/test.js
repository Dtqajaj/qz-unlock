var P = require('../src/proto.js');

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name); }
}
function eq(name, a, b) { ok(name + ' (' + a + '==' + b + ')', a === b); }

console.log('\n=== proto: varint ===');
eq('varint 0', P.VI(0).join(','), '0');
eq('varint 1', P.VI(1).join(','), '1');
eq('varint 127', P.VI(127).join(','), '127');
eq('varint 128', P.VI(128).join(','), '128,1');
eq('varint 300', P.VI(300).join(','), '172,2');
eq('-1 是 10 字节', P.VI(-1).length, 10);
eq('-1 末字节是 1', P.VI(-1)[9], 1);

console.log('\n=== proto: 字段编码 ===');
eq('FI(1,216)', P.FI(1, 216).join(','), '8,216,1');
eq('FI(1,1)', P.FI(1, 1).join(','), '8,1');
eq('FI(4,-1) 长度', P.FI(4, -1).length, 11);
eq('FS(1,"803056") 首字节', P.FS(1, '803056')[0], 10);
eq('FS 中文 UTF8 长度', P.FS(1, '\u7d20\u5851').length, 8);

console.log('\n=== proto: 帧 ===');
var f = P.frame(22064, P.FI(1, 1).concat(P.FI(2, 216)));
eq('帧长', f.length, 7);
eq('msgid 高字节', f[0], 0x56);
eq('msgid 低字节', f[1], 0x30);

console.log('\n=== proto: 解析 ===');
var parsed = P.PF(new Uint8Array([8, 1, 16, 216, 1]));
eq('解析字段数', parsed.length, 2);
eq('field1', Number(parsed[0].v), 1);
eq('field2', Number(parsed[1].v), 216);

console.log('\n=== proto: 登录包 ===');
var lb = P.loginBody({ userId: '803056', userName: '\u7d20\u5851', time: '1794531034', sign: '9951b38fbdc51cc1cb6122bc77040a7b' });
eq('登录包长度 130', lb.length + 2, 130);
var lbF = P.PF(new Uint8Array(lb));
eq('登录包字段数', lbF.length, 8);
eq('field1 = userId', String.fromCharCode.apply(null, lbF[0].v), '803056');
eq('field2 = 版本 13', Number(lbF[1].v), 13);
eq('field3 = 平台', String.fromCharCode.apply(null, lbF[2].v), '4399h5');

console.log('\n=== proto: 22006 改写 ===');
function mkGun(id, lv, ztv, vyx) {
  var w = [];
  w = w.concat(P.FI(1, id));
  if (lv !== undefined) w = w.concat(P.FI(2, lv));
  if (ztv !== undefined) w = w.concat(P.FI(4, ztv));
  if (vyx !== undefined) w = w.concat(P.FI(5, vyx));
  return P.FB(1, w);
}
var body = mkGun(216, undefined, -1).concat(mkGun(88, undefined, 1, 1794538730)).concat(mkGun(1, 2, -1));
var raw = new Uint8Array([0x55, 0xf6].concat(body));

var rw = P.rewriteGuns(raw);
ok('改写返回非空', rw !== null);
var rwF = P.PF(rw.subarray(2));
eq('改写后条目数', rwF.length, 3);

var g0 = {}, g1 = {}, g2 = {};
P.PF(rwF[0].v).forEach(function (x) { if (x.n === 1) g0.id = Number(x.v); if (x.n === 4) g0.ztv = String(x.v); if (x.n === 5) g0.vyx = 1; });
P.PF(rwF[1].v).forEach(function (x) { if (x.n === 1) g1.id = Number(x.v); if (x.n === 4) g1.ztv = String(x.v); if (x.n === 5) g1.vyx = 1; });
P.PF(rwF[2].v).forEach(function (x) { if (x.n === 1) g2.id = Number(x.v); if (x.n === 2) g2.lv = Number(x.v); if (x.n === 4) g2.ztv = String(x.v); });

eq('id 216 保留', g0.id, 216);
eq('id 216 ztv=-1', g0.ztv, '18446744073709551615');
eq('id 88 原为限时', 1, 1);
eq('id 88 ztv 变 -1', g1.ztv, '18446744073709551615');
ok('id 88 vyx 被清除', g1.vyx === undefined);
eq('id 1 强化等级保留', g2.lv, 2);
eq('id 1 ztv=-1', g2.ztv, '18446744073709551615');

console.log('\n=== proto: 改写幂等 ===');
var rw2 = P.rewriteGuns(rw);
ok('二次改写不崩', rw2 !== null);
eq('二次改写条目数不变', P.PF(rw2.subarray(2)).length, 3);

console.log('\n=== proto: 非 22006 帧不动 ===');
var other = new Uint8Array([0x55, 0xf8, 0x0a, 0x06, 0x08, 0xe2, 0xd4, 0x03]);
ok('22008 不处理', P.rewriteGuns(other) === null);
var hb = new Uint8Array([0x2a, 0xfc, 0x08, 0x83]);
ok('心跳不处理', P.rewriteGuns(hb) === null);

console.log('\n=== catalog ===');
var cat = require('../data/catalog.json');
eq('枪械 89', cat.guns.length, 89);
eq('角色 7', cat.roles.length, 7);
ok('枪械含 216', cat.guns.indexOf(216) >= 0);
ok('枪械含 1', cat.guns.indexOf(1) >= 0);
ok('角色含 7', cat.roles.indexOf(7) >= 0);
ok('道具 156', cat.allItems.length === 156);

console.log('\n' + (fail === 0 ? '\u2713 全部通过' : '\u2717 有失败') + '  ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
