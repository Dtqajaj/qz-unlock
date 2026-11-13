#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地服务：网页 ↔ 4399 登录 / 游戏服务端

浏览器不能跨域 POST 到 ptlogin.4399.com，所以由这个本地服务代理。
跑起来后打开 http://127.0.0.1:8899/web/

  GET  /             → 网页
  POST /api/login    {username, password}
       → 走 4399 OAuth 登录，返回 {ok, cred:{userId,userName,sign,time}, url}
  POST /api/flush    {userId,userName,time,sign, opts}
       → 连游戏服，写入 89 枪 + 7 角色，返回进度
  GET  /api/status   → 当前刷取进度
"""

import os
import sys
import json
import time
import threading
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import login as LoginMod
import flush as FlushMod

PROGRESS = {
    'phase': 'idle', 'guns': 0, 'roles': 0, 'ok': 0, 'fail': 0,
    'total': 0, 'sent': 0, 'log': [], 'error': None,
}


def log(msg):
    PROGRESS['log'].append(msg)
    if len(PROGRESS['log']) > 300:
        PROGRESS['log'].pop(0)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self._send(204, '')

    def do_GET(self):
        p = urlparse(self.path)
        path = p.path

        if path == '/api/status':
            self._send(200, PROGRESS)
            return

        if path == '/' or path == '/index.html':
            self._send(302, '', 'text/plain')
            self.send_header('Location', '/web/')
            return

        # 静态文件
        rel = path.lstrip('/')
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT):
            self._send(403, {'error': 'forbidden'})
            return
        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')
        if not os.path.exists(full):
            self._send(404, {'error': 'not found'})
            return
        ctype = 'text/plain; charset=utf-8'
        if full.endswith('.html'):
            ctype = 'text/html; charset=utf-8'
        elif full.endswith('.js'):
            ctype = 'application/javascript; charset=utf-8'
        elif full.endswith('.json'):
            ctype = 'application/json; charset=utf-8'
        elif full.endswith('.css'):
            ctype = 'text/css; charset=utf-8'
        with open(full, 'rb') as f:
            self._send(200, f.read(), ctype)

    def do_POST(self):
        p = urlparse(self.path)

        if p.path == '/api/login':
            body = self._read_json()
            u = (body.get('username') or '').strip()
            pw = body.get('password') or ''
            if not u or not pw:
                self._send(200, {'ok': False, 'error': '账号或密码为空'})
                return
            try:
                s, cred, err = LoginMod.login(u, pw, verbose=False)
            except Exception as e:
                self._send(200, {'ok': False, 'error': '登录异常: %s' % e})
                return
            if err:
                self._send(200, {'ok': False, 'error': err})
                return
            self._send(200, {'ok': True, 'cred': cred,
                             'url': LoginMod.game_url(cred)})
            return

        if p.path == '/api/flush':
            body = self._read_json()
            cred = {k: body.get(k) for k in ('userId', 'userName', 'time', 'sign')}
            if not cred['userId'] or not cred['sign']:
                self._send(200, {'ok': False, 'error': '凭证不完整'})
                return
            opts = body.get('opts') or {}
            t = threading.Thread(target=_run_flush, args=(cred, opts))
            t.daemon = True
            t.start()
            self._send(200, {'ok': True, 'msg': '已开始'})
            return

        self._send(404, {'error': 'not found'})


def _run_flush(cred, opts):
    PROGRESS.update({'phase': 'connect', 'guns': 0, 'roles': 0, 'ok': 0,
                     'fail': 0, 'sent': 0, 'error': None})
    f = FlushMod.Flush(cred, quiet=True)
    try:
        PROGRESS['phase'] = 'login'
        log('连接游戏服务器…')
        f.connect()
        log('登录成功')

        PROGRESS['phase'] = 'pull'
        log('拉取当前存档…')
        f.pull()
        PROGRESS['guns'] = len(f.state['guns'])
        PROGRESS['roles'] = len(f.state['roles'])
        log('当前 枪械 %d/89 角色 %d/7' % (PROGRESS['guns'], PROGRESS['roles']))

        # 包装 write 以汇报进度
        orig_send = f.send
        counter = {'n': 0}

        PROGRESS['phase'] = 'write'
        f.write(guns=opts.get('guns', True),
                roles=opts.get('roles', True),
                slots=opts.get('slots', True),
                shop=opts.get('shop', True))

        PROGRESS['phase'] = 'verify'
        log('复核…')
        g, r, miss = f.verify()
        PROGRESS['guns'] = g
        PROGRESS['roles'] = r
        PROGRESS['ok'] = f.state['ok']
        PROGRESS['fail'] = f.state['fail']
        PROGRESS['phase'] = 'done'
        log('完成 枪械 %d/89 角色 %d/7 成功 %d 失败 %d' %
            (g, r, PROGRESS['ok'], PROGRESS['fail']))
        if miss:
            log('仍缺: %s' % miss)
    except Exception as e:
        PROGRESS['phase'] = 'error'
        PROGRESS['error'] = str(e)
        log('出错: %s' % e)
    finally:
        f.close()


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8899)
    ap.add_argument('--host', default='127.0.0.1')
    a = ap.parse_args()

    srv = ThreadedHTTPServer((a.host, a.port), Handler)
    print('服务已启动: http://%s:%d/' % (a.host, a.port))
    print('打开 http://%s:%d/web/ 开始使用' % (a.host, a.port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')


if __name__ == '__main__':
    main()
