#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
吃鸡枪王战场 一键刷档（账号密码 → 自动登录 → 写服务端存档）

用法:
  python3 flush.py <4399账号> <密码>
  python3 flush.py <4399账号> <密码> --guns-only
  python3 flush.py --cred "<游戏链接>"        # 已有链接时直接用

流程:
  login.py 拿 sign → 连 wss://csdj23.haowan823.cn:7385/ → 登录 → 拉包 → 写入 → 复核
"""

import sys
import json
import time
import argparse

try:
    import websocket
except ImportError:
    websocket = None

import login as LoginMod

SRV = 'wss://csdj23.haowan823.cn:7385/'
GAP = 0.5

GUN_IDS = [1,2,3,4,5,6,11,12,13,14,15,16,21,22,23,24,25,26,31,32,33,34,35,41,42,43,44,45,48,
    51,52,53,54,58,61,62,63,64,67,71,72,73,74,81,82,83,84,87,88,91,92,93,94,101,102,103,104,
    107,111,112,113,114,115,121,122,123,124,128,151,152,153,154,156,161,162,163,164,165,201,
    202,203,204,205,211,212,213,214,215,216]
ROLE_IDS = [1, 2, 3, 4, 5, 6, 7]
SLOT_IDS = [0, 1, 2, 3, 4, 5]


def varint(v):
    out = []
    x = int(v)
    if x < 0:
        x += 1 << 64
    while x > 127:
        out.append((x & 127) | 128)
        x >>= 7
    out.append(x)
    return bytes(out)


def tag(n, w):
    return varint((n << 3) | w)


def fi(n, v):
    return tag(n, 0) + varint(v)


def fs(n, s):
    b = s.encode('utf-8')
    return tag(n, 2) + varint(len(b)) + b


def fb(n, data):
    return tag(n, 2) + varint(len(data)) + data


def frame(mid, body=b''):
    return bytes([(mid >> 8) & 255, mid & 255]) + body


def read_varint(buf, i):
    v = 0
    s = 0
    while i < len(buf):
        c = buf[i]
        i += 1
        v |= (c & 127) << s
        s += 7
        if not (c & 128):
            break
    return v, i


def parse(buf):
    out = []
    i = 0
    n = len(buf)
    while i < n:
        t, i = read_varint(buf, i)
        f, w = t >> 3, t & 7
        if w == 0:
            v, i = read_varint(buf, i)
            out.append((f, w, v))
        elif w == 2:
            ln, i = read_varint(buf, i)
            out.append((f, w, buf[i:i + ln]))
            i += ln
        elif w == 5:
            out.append((f, w, buf[i:i + 4]))
            i += 4
        elif w == 1:
            out.append((f, w, buf[i:i + 8]))
            i += 8
        else:
            break
    return out


class Flush(object):
    def __init__(self, cred, quiet=False):
        self.cred = cred
        self.quiet = quiet
        self.state = {'guns': [], 'roles': [], 'items': {}, 'adShop': [], 'ok': 0, 'fail': 0}
        self.ws = None

    def log(self, *a):
        if not self.quiet:
            print(*a)

    def connect(self):
        if websocket is None:
            raise RuntimeError('需要 websocket-client: pip3 install websocket-client')
        self.ws = websocket.create_connection(SRV, timeout=20,
                                              header=['User-Agent: Mozilla/5.0'])
        self.log('[4] 已连接', SRV)
        c = self.cred
        body = (fs(1, str(c['userId'])) + fi(2, 13) + fs(3, '4399h5') + fi(4, 0))
        body += fb(5, fs(1, 'userId') + fs(2, str(c['userId'])) + fi(3, 1))
        body += fb(5, fs(1, 'userName') + fs(2, str(c['userName'])) + fi(3, 1))
        body += fb(5, fs(1, 'time') + fs(2, str(c['time'])) + fi(3, 1))
        body += fb(5, fs(1, 'sign') + fs(2, str(c['sign'])) + fi(3, 1))
        self.send(10000, body)
        t0 = time.time()
        while time.time() - t0 < 10:
            mid, b = self.recv()
            if mid == 10001:
                code = 0
                for f, w, v in parse(b):
                    if f == 1:
                        code = v
                if code != 1:
                    raise RuntimeError('登录游戏失败 code=%d' % code)
                self.log('    登录成功')
                return True
        raise RuntimeError('登录超时')

    def send(self, mid, body=b''):
        self.ws.send_binary(frame(mid, body))

    def recv(self):
        while True:
            raw = self.ws.recv()
            if isinstance(raw, str):
                continue
            if not raw:
                continue
            return (raw[0] << 8) | raw[1], raw[2:]

    def drain(self, seconds=1.2):
        t0 = time.time()
        self.ws.settimeout(0.4)
        while time.time() - t0 < seconds:
            try:
                mid, b = self.recv()
                self.handle(mid, b)
            except Exception:
                pass
        self.ws.settimeout(20)

    def handle(self, mid, b):
        st = self.state
        if mid == 22006:
            st['guns'] = []
            for f, w, v in parse(b):
                if f == 1 and w == 2:
                    for f2, w2, v2 in parse(v):
                        if f2 == 1:
                            st['guns'].append(v2)
        elif mid == 22004:
            st['roles'] = []
            for f, w, v in parse(b):
                if f == 1:
                    for f2, w2, v2 in parse(v):
                        if f2 == 1:
                            st['roles'].append(v2)
        elif mid == 22008:
            st['items'] = {}
            for f, w, v in parse(b):
                if f == 1:
                    o = {}
                    for f2, w2, v2 in parse(v):
                        if f2 == 1:
                            o['id'] = v2
                        if f2 == 2:
                            o['n'] = v2
                    if o.get('id'):
                        st['items'][o['id']] = o.get('n', 0)
        elif mid == 22051:
            st['adShop'] = []
            for f, w, v in parse(b):
                if f == 1 and w == 2:
                    o = {'id': 0, 'fxt': 0, 'tlr': 0}
                    for f2, w2, v2 in parse(v):
                        if f2 == 1:
                            o['id'] = v2
                        if f2 == 5:
                            o['fxt'] = v2
                        if f2 == 6:
                            o['tlr'] = v2
                    if o['id']:
                        st['adShop'].append(o)
        elif mid in (22065, 22067, 22016, 22053, 22055):
            code = 0
            for f, w, v in parse(b):
                if f == 1:
                    code = v
            if code == 1:
                st['ok'] += 1
            else:
                st['fail'] += 1

    def pull(self):
        self.log('[5] 拉取当前存档')
        for mid in (22001, 22003, 22005, 22007, 22050):
            self.send(mid)
            time.sleep(0.7)
            self.drain(0.5)
        self.drain(0.6)
        self.log('    枪械 %d/89  角色 %d/7' % (len(self.state['guns']), len(self.state['roles'])))

    def write(self, guns=True, roles=True, slots=True, shop=True):
        q = []
        if guns:
            for g in GUN_IDS:
                if g not in self.state['guns']:
                    q.append((22064, fi(1, 1) + fi(2, g)))
        if roles:
            for r in ROLE_IDS:
                if r not in self.state['roles']:
                    q.append((22066, fi(1, 1) + fi(2, r)))
        if slots:
            for s in SLOT_IDS:
                q.append((22015, fi(1, s) + fi(2, 1)))
        if shop:
            for po in self.state['adShop']:
                if po['fxt'] > 0 and po['tlr'] >= po['fxt']:
                    continue
                q.append((22052, fi(1, po['id'])))
                q.append((22054, fi(1, po['id'])))

        self.log('[6] 待写 %d 条（间隔 500ms，约 %d 秒）' % (len(q), len(q) // 2))
        for i, (mid, b) in enumerate(q, 1):
            self.send(mid, b)
            if i % 40 == 0:
                time.sleep(1.5)
                self.drain(0.5)
            else:
                time.sleep(GAP)
            if i % 20 == 0 or i == len(q):
                self.log('    %d/%d  ok=%d fail=%d' % (i, len(q), self.state['ok'], self.state['fail']))
        self.drain(1.5)

    def verify(self):
        self.log('[7] 复核')
        self.state['guns'] = []
        self.state['roles'] = []
        for mid in (22001, 22003, 22005, 22007):
            self.send(mid)
            time.sleep(0.7)
            self.drain(0.5)
        self.drain(0.8)
        g, r = len(self.state['guns']), len(self.state['roles'])
        miss = [x for x in GUN_IDS if x not in self.state['guns']]
        self.log('    枪械 %d/89  角色 %d/7' % (g, r))
        if miss:
            self.log('    仍缺:', miss)
        return g, r, miss

    def close(self):
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('username', nargs='?')
    ap.add_argument('password', nargs='?')
    ap.add_argument('--cred', help='直接给游戏链接')
    ap.add_argument('--guns-only', action='store_true')
    a = ap.parse_args()

    cred = None
    if a.cred:
        import urllib.parse as up
        q = up.parse_qs(up.urlparse(a.cred).query)
        cred = {k: q[k][0] for k in ('userId', 'userName', 'time', 'sign') if k in q}
        print('[3] 使用已有链接凭证 userId=%s' % cred.get('userId'))
    elif a.username and a.password:
        s, cred, err = LoginMod.login(a.username, a.password)
        if err:
            print('\n登录失败:', err)
            return 1
        print('    拿到 sign:', str(cred.get('sign'))[:16] + '...')
    else:
        print(__doc__)
        return 1

    f = Flush(cred)
    try:
        f.connect()
        f.pull()
        f.write(guns=True, roles=not a.guns_only, slots=not a.guns_only, shop=not a.guns_only)
        f.verify()
    finally:
        f.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
