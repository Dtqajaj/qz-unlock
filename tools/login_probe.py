#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
4399 登录链路探针 —— 验证账号密码登录，以及 sign 怎么拿。

流程：
  1. GET  ptlogin.4399.com/ptlogin/login.do?client=web   拿 USESSIONID
  2. POST ptlogin.4399.com/ptlogin/login.do?v=1          账号密码登录
  3. POST h.api.4399.com/intermodal/user/grant2          用 Cookie 换 sign
  4. 拼出 index_hao.html?userId=&userName=&time=&sign=

密码加密：AES-CBC，密钥 'lzYW5qaXVqa'
来源：ptlogin 的 validation.js 中 encryptAES() 函数
"""

import sys
import json
import base64
import argparse

try:
    import requests
except ImportError:
    print("需要 requests: pip3 install requests")
    sys.exit(1)

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad
    HAVE_AES = True
except ImportError:
    HAVE_AES = False

AES_KEY = b'lzYW5qaXVqa'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

LOGIN_PAGE = 'https://ptlogin.4399.com/ptlogin/login.do'
LOGIN_POST = 'https://ptlogin.4399.com/ptlogin/login.do?v=1'
GRANT2 = 'https://h.api.4399.com/intermodal/user/grant2'
GAME_ID = '100068063'


def encrypt_aes(plain):
    if not HAVE_AES:
        raise RuntimeError('pycryptodome 未安装')
    cipher = AES.new(AES_KEY, AES.MODE_CBC, iv=AES_KEY)
    ct = cipher.encrypt(pad(plain.encode('utf-8'), AES.block_size))
    return base64.b64encode(ct).decode('ascii')


def make_session():
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9'})
    return s


def step1(s):
    r = s.get(LOGIN_PAGE, params={'client': 'web'}, timeout=20,
              headers={'Referer': 'https://www.4399.com/'})
    print('[1] GET login.do  HTTP', r.status_code, 'len', len(r.text))
    print('    cookies:', dict(s.cookies))
    return r


def step2(s, username, password, encrypt):
    pwd = encrypt_aes(password) if encrypt else password
    data = {
        'username': username, 'password': pwd,
        'loginFrom': 'uframe', 'postLoginHandler': '',
        'layoutSelfAdapting': 'true', 'externalLogin': '',
        'displayMode': '', 'layout': 'vertical',
        'bizId': '', 'appId': '', 'gameId': '', 'css': '',
        'redirectUrl': '', 'sessionId': '',
        'mainDivId': 'embed_login_div', 'includeFcmInfo': 'false',
        'level': '0', 'regLevel': '0',
        'userNameLabel': '', 'userNameTip': '', 'welcomeTip': '', 'sec': '',
    }
    r = s.post(LOGIN_POST, data=data, timeout=20, headers={
        'Referer': 'https://ptlogin.4399.com/ptlogin/login.do?client=web',
        'Origin': 'https://ptlogin.4399.com',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    print('[2] POST login.do  HTTP', r.status_code, 'len', len(r.text))

    err = None
    if "errorCallback('" in r.text:
        i = r.text.index("errorCallback('") + len("errorCallback('")
        j = r.text.index("'", i)
        err = r.text[i:j]

    if err:
        print('    登录失败:', err)
    else:
        print('    登录成功（无 errorCallback）')
    print('    cookies:', dict(s.cookies))
    return err, r


def step3(s):
    r = s.post(GRANT2, data={'gameId': GAME_ID}, timeout=20, headers={
        'Referer': 'https://www.4399.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    print('[3] POST grant2  HTTP', r.status_code)
    try:
        j = r.json()
    except Exception:
        print('    非 JSON:', r.text[:300])
        return None
    print('    code:', j.get('code'), 'message:', j.get('message'))
    d = j.get('data') or {}
    if isinstance(d, dict):
        for k in ('userId', 'userName', 'sign', 'time', 'nick'):
            if k in d:
                print('    %-10s %s' % (k + ':', d[k]))
        if 'loginUrl' in d:
            print('    需要登录:', str(d['loginUrl'])[:140])
    return j


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('username', nargs='?', default='')
    ap.add_argument('password', nargs='?', default='')
    ap.add_argument('--no-encrypt', action='store_true')
    a = ap.parse_args()

    print('AES 可用:', HAVE_AES, ' 密钥:', AES_KEY.decode())
    if a.password:
        print('加密样本:', encrypt_aes(a.password))
        print()

    if not a.username:
        print('\n用法: python3 login_probe.py <账号> <密码>')
        print('      不带参数只测连通性\n')
        s = make_session()
        step1(s)
        step3(s)
        return

    s = make_session()
    step1(s)
    err, r = step2(s, a.username, a.password, not a.no_encrypt)
    if err:
        return
    step3(s)


if __name__ == '__main__':
    main()
