#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
4399 完整账号密码登录 → 拿 sign → 可直接刷档

链路（全部来自线上静态资源反解，非猜测）：

  1. GET  https://ptlogin.4399.com/oauth2/authorize.do
          ?client_id=a9a16636dbaeb917e2ffb16f0d52006e
          &redirect_uri=https://h.api.4399.com/intermodal/user/login?gameId=100068063&gameUrl=
          &response_type=token&show_ext_login=true
       → 下发 USESSIONID，页面里有 authorizeForm

  2. POST https://ptlogin.4399.com/oauth2/authorize.do
       username / password / client_id / redirect_uri / response_type
       → 302 跳回 redirect_uri 并带 token，或直接下发登录态 Cookie
           (Puser / Pauth / Sauth / Uauth)

  3. POST https://h.api.4399.com/intermodal/user/grant2
       gameId=100068063（带步骤2的 Cookie）
       → {code:10004, data:{userId, userName, sign, time, nick}}

  4. 拼游戏地址：
       https://h5game.haowan823.cn/newqz/index_hao.html
         ?gameId=100068063&userId=..&userName=..&time=..&sign=..

密码加密：AES-CBC，key = iv = 'lzYW5qaXVqa'，base64 输出
来源：ptlogin 的 validation.js / oauthValidation.js 中 encryptAES()
      仅当页面存在 id=j-sec 且 value=1 时才加密；oauth 页面无此元素，默认不加密
"""

import sys
import json
import base64
import argparse

try:
    import requests
except ImportError:
    print('需要 requests: pip3 install requests')
    sys.exit(1)

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad
    HAVE_AES = True
except ImportError:
    HAVE_AES = False

AES_KEY = b'lzYW5qaXVqa'
CLIENT_ID = 'a9a16636dbaeb917e2ffb16f0d52006e'
GAME_ID = '100068063'
REDIRECT = 'https://h.api.4399.com/intermodal/user/login?gameId=%s&gameUrl=' % GAME_ID
AUTHORIZE = 'https://ptlogin.4399.com/oauth2/authorize.do'
GRANT2 = 'https://h.api.4399.com/intermodal/user/grant2'
GAME_PAGE = 'https://h5game.haowan823.cn/newqz/index_hao.html'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')


def encrypt_aes(plain):
    if not HAVE_AES:
        raise RuntimeError('pycryptodome 未安装')
    c = AES.new(AES_KEY, AES.MODE_CBC, iv=AES_KEY)
    return base64.b64encode(c.encrypt(pad(plain.encode('utf-8'), AES.block_size))).decode()


def session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    return s


def login(username, password, encrypt=False, verbose=True):
    def p(*a):
        if verbose:
            print(*a)

    s = session()

    p('[1] 打开 OAuth 授权页')
    r = s.get(AUTHORIZE, params={
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT,
        'response_type': 'token',
        'show_ext_login': 'true',
    }, timeout=20, headers={'Referer': 'https://www.4399.com/'})
    p('    HTTP', r.status_code, 'cookies:', list(s.cookies.keys()))

    pwd = encrypt_aes(password) if encrypt else password

    p('[2] 提交账号密码')
    r2 = s.post(AUTHORIZE, data={
        'username': username,
        'password': pwd,
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT,
        'response_type': 'token',
        'scope': 'basic',
        'bizId': '',
        '_d': '',
        'show_ext_login': 'true',
        'autoCreateAccount': 'false',
        'css': '',
        'ref': '',
    }, timeout=20, allow_redirects=True, headers={
        'Referer': AUTHORIZE,
        'Origin': 'https://ptlogin.4399.com',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    p('    HTTP', r2.status_code, 'url:', r2.url[:100])
    p('    cookies:', list(s.cookies.keys()))

    err = None
    if "errorCallback('" in r2.text:
        i = r2.text.index("errorCallback('") + 15
        j = r2.text.index("'", i)
        err = r2.text[i:j]
    if err and err not in ('', 'null'):
        p('    登录失败:', err)
        return None, err

    p('[3] 用 Cookie 换 sign')
    r3 = s.post(GRANT2, data={'gameId': GAME_ID}, timeout=20, headers={
        'Referer': 'https://www.4399.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    try:
        j = r3.json()
    except Exception:
        p('    非 JSON:', r3.text[:200])
        return None, 'grant2 返回异常'

    p('    code:', j.get('code'), j.get('message'))
    if j.get('code') != 10004:
        d = j.get('data') or {}
        if isinstance(d, dict) and d.get('userId'):
            return s, None
        if isinstance(d, dict) and d.get('loginUrl'):
            p('    仍未登录:', str(d['loginUrl'])[:120])
            return None, 'grant2 未返回登录态'

    d = j.get('data') or {}
    if isinstance(d, dict) and d.get('userId'):
        return s, None
    return None, 'grant2 无 userId'


def grant(s):
    r = s.post(GRANT2, data={'gameId': GAME_ID}, timeout=20, headers={
        'Referer': 'https://www.4399.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    try:
        return r.json()
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('username', nargs='?', default='')
    ap.add_argument('password', nargs='?', default='')
    ap.add_argument('--encrypt', action='store_true', help='密码走 AES')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    if not a.username:
        print(__doc__)
        print('用法: python3 login_full.py <账号> <密码> [--encrypt]')
        return

    s, err = login(a.username, a.password, a.encrypt)
    if err:
        print('\n失败:', err)
        return

    j = grant(s)
    d = (j or {}).get('data') or {}
    info = {k: d.get(k) for k in ('userId', 'userName', 'sign', 'time', 'nick')}
    print('\n登录成功:', json.dumps(info, ensure_ascii=False))
    url = ('%s?gameId=%s&userId=%s&userName=%s&time=%s&sign=%s' %
           (GAME_PAGE, GAME_ID, info.get('userId'), info.get('userName'),
            info.get('time'), info.get('sign')))
    print('游戏地址:')
    print(url)
    if a.json:
        print(json.dumps({'ok': True, 'cred': info, 'url': url}, ensure_ascii=False))


if __name__ == '__main__':
    main()
