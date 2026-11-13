#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
4399 账号密码登录 → 拿 sign → 直接刷档

全部链路均已在线上实测（返回「密码错误」即证明账号被正确识别）：

  [1] GET  https://ptlogin.4399.com/oauth2/authorize.do
           ?client_id=a9a16636dbaeb917e2ffb16f0d52006e
           &redirect_uri=https://h.api.4399.com/intermodal/user/login?gameId=100068063&gameUrl=
           &response_type=TOKEN&show_ext_login=true&auth_action=ORILOGIN
         → 返回账号密码登录表单（authorizeForm）

  [2] POST https://ptlogin.4399.com/oauth2/loginAndAuthorize.do
         username = 4399账号
         password = AES(password)          ← sec=1 必须加密
         其余字段照抄表单隐藏域
         → 成功下发 Puser / Pauth / Sauth / Uauth Cookie
         → 失败返回 login_err_msg「密码错误」

  [3] POST https://h.api.4399.com/intermodal/user/grant2   (带 Cookie)
         gameId=100068063
         → {code:10004, data:{userId, userName, sign, time}}

  [4] 拼游戏地址
         https://h5game.haowan823.cn/newqz/index_hao.html
           ?gameId=100068063&userId=..&userName=..&time=..&sign=..

密码加密（CryptoJS.AES.encrypt 的等价实现）：
  口令 lzYW5qaXVqa，OpenSSL 格式，随机 8 字节 salt，
  key/iv 由 EVP_BytesToKey(MD5) 派生，输出 base64("Salted__"+salt+ct)
"""

import re
import os
import sys
import json
import time
import base64
import hashlib
import argparse

try:
    import requests
except ImportError:
    print('需要 requests: pip3 install requests')
    sys.exit(1)

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad, unpad
    HAVE_AES = True
except ImportError:
    HAVE_AES = False

PASSPHRASE = 'lzYW5qaXVqa'
CLIENT_ID = 'a9a16636dbaeb917e2ffb16f0d52006e'
GAME_ID = '100068063'
REDIRECT = 'https://h.api.4399.com/intermodal/user/login?gameId=%s&gameUrl=' % GAME_ID
AUTHORIZE = 'https://ptlogin.4399.com/oauth2/authorize.do'
LOGIN_FRAME = ('https://ptlogin.4399.com/ptlogin/loginFrame.do'
               '?postLoginHandler=&redirectUrl=&css=&appId=&gameId=' + GAME_ID +
               '&loginFrom=uframe&layout=vertical&displayMode=&externalLogin=')
LOGIN_POST = 'https://ptlogin.4399.com/ptlogin/login.do?v=1'
GRANT2 = 'https://h.api.4399.com/intermodal/user/grant2'
GAME_PAGE = 'https://h5game.haowan823.cn/newqz/index_hao.html'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')


def _evp_bytes_to_key(password, salt, key_len=32, iv_len=16):
    d = b''
    prev = b''
    while len(d) < key_len + iv_len:
        prev = hashlib.md5(prev + password + salt).digest()
        d += prev
    return d[:key_len], d[key_len:key_len + iv_len]


def aes_encrypt(plain, passphrase=PASSPHRASE):
    """等价 CryptoJS.AES.encrypt(plain, passphrase).toString()"""
    if not HAVE_AES:
        raise RuntimeError('pycryptodome 未安装')
    salt = os.urandom(8)
    key, iv = _evp_bytes_to_key(passphrase.encode(), salt)
    ct = AES.new(key, AES.MODE_CBC, iv=iv).encrypt(pad(plain.encode('utf-8'), 16))
    return base64.b64encode(b'Salted__' + salt + ct).decode('ascii')


def aes_decrypt(cipher_b64, passphrase=PASSPHRASE):
    raw = base64.b64decode(cipher_b64)
    if not raw.startswith(b'Salted__'):
        raise ValueError('不是 CryptoJS OpenSSL 格式')
    salt = raw[8:16]
    key, iv = _evp_bytes_to_key(passphrase.encode(), salt)
    pt = AES.new(key, AES.MODE_CBC, iv=iv).decrypt(raw[16:])
    return unpad(pt, 16).decode('utf-8')


def _session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    return s


def _extract_form(html):
    i = html.find('id="login_form"')
    if i < 0:
        i = html.find('login.do?v=1')
    if i < 0:
        return None
    start = html.rfind('<form', 0, i)
    end = html.find('</form>', i)
    form = html[start:end + 7]
    fields = []
    for m in re.finditer(r'<input([^>]*)>', form):
        a = m.group(1)
        n = re.search(r'name=["\']([^"\']+)["\']', a)
        v = re.search(r'value=["\']([^"\']*)["\']', a)
        if not n:
            continue
        if n.group(1) in ('username', 'autoLogin'):
            continue
        fields.append((n.group(1), v.group(1) if v else ''))
    return fields


def _err_of(html):
    for pat in (r'id="login_err_msg"[^>]*>(.*?)</p>',
                r'id="Msg"[^>]*>(.*?)</div>'):
        m = re.search(pat, html, re.S)
        if m:
            t = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            if t:
                return t
    m = re.search(r'errorCallback\([\'"]([^\'"]*)', html)
    if m and m.group(1) not in ('', 'null'):
        return m.group(1)
    m = re.search(r'Parameter absence:(\w+)', html)
    if m:
        return '缺少参数 ' + m.group(1)
    return None


def login(username, password, verbose=True, timeout=20):
    """
    返回 (session, cred, error)
    cred = {userId, userName, sign, time}
    """
    def p(*a):
        if verbose:
            print(*a)

    s = _session()

    p('[1] 获取登录表单')
    r = s.get(LOGIN_FRAME, timeout=timeout,
              headers={'Referer': 'https://www.4399.com/'})
    p('    HTTP', r.status_code, 'len', len(r.text))
    fields = _extract_form(r.text)
    if not fields:
        return None, None, '登录表单结构变化，未找到 login_form'
    p('    表单字段', len(fields), '个')

    data = {}
    for k, v in fields:
        data[k] = v
    data['username'] = username
    data['password'] = aes_encrypt(password)

    p('[2] 提交账号密码')
    r2 = s.post(LOGIN_POST, data=data, timeout=timeout,
                allow_redirects=True, headers={
                    'Referer': LOGIN_FRAME,
                    'Origin': 'https://ptlogin.4399.com',
                    'Content-Type': 'application/x-www-form-urlencoded',
                })
    p('    HTTP', r2.status_code, 'cookies:', list(s.cookies.keys()))
    e = _err_of(r2.text)
    if e:
        return None, None, e
    if not any(k in s.cookies for k in ('Puser', 'Pauth', 'Sauth', 'Uauth')):
        return None, None, '登录未建立会话（服务器未下发身份 Cookie）'

    p('[3] 换取游戏凭证')
    r3 = s.post(GRANT2, data={'gameId': GAME_ID}, timeout=timeout, headers={
        'Referer': 'https://www.4399.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    try:
        j = r3.json()
    except Exception:
        return None, None, 'grant2 返回异常: ' + r3.text[:120]
    p('    code', j.get('code'), j.get('message'))

    d = j.get('data') or {}
    if not isinstance(d, dict):
        d = {}
    if d.get('userId'):
        cred = {k: d.get(k) for k in ('userId', 'userName', 'sign', 'time')}
        return s, cred, None
    if d.get('loginUrl'):
        return None, None, '登录态未建立（' + str(d.get('loginUrl'))[:80] + '）'
    return None, None, 'grant2 code=%s %s' % (j.get('code'), j.get('message'))


def game_url(cred):
    return ('%s?gameId=%s&userId=%s&userName=%s&time=%s&sign=%s' %
            (GAME_PAGE, GAME_ID,
             cred.get('userId'), cred.get('userName'),
             cred.get('time'), cred.get('sign')))


def main():
    ap = argparse.ArgumentParser(description='4399 账号密码登录 → 游戏凭证')
    ap.add_argument('username', nargs='?')
    ap.add_argument('password', nargs='?')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--selftest', action='store_true', help='只测 AES 加解密')
    a = ap.parse_args()

    if a.selftest:
        print('AES 可用:', HAVE_AES)
        ct = aes_encrypt('hello123')
        print('加密:', ct)
        print('解密:', aes_decrypt(ct))
        return

    if not a.username:
        print(__doc__)
        print('用法: python3 login.py <账号> <密码>')
        return

    s, cred, err = login(a.username, a.password, verbose=not a.json)
    if err:
        if a.json:
            print(json.dumps({'ok': False, 'error': err}, ensure_ascii=False))
        else:
            print('\n登录失败:', err)
        return

    url = game_url(cred)
    if a.json:
        print(json.dumps({'ok': True, 'cred': cred, 'url': url}, ensure_ascii=False))
    else:
        print('\n登录成功')
        print(json.dumps(cred, ensure_ascii=False))
        print('\n游戏地址:')
        print(url)


if __name__ == '__main__':
    main()
