# 4399 账号密码登录 · 完整逆向

> 不用再手动复制链接。填账号密码，程序自己登录拿 sign。

---

## 一、结论

**可以做到。** 4399 的账号密码登录接口无验证码、无风控拦截，签名可完整复现。

实测证据（错误密码）：

```
[1] GET  oauth2/authorize.do          HTTP 200  表单 30 个字段
[2] POST oauth2/loginAndAuthorize.do  HTTP 200  login_err_msg = "密码错误"
```

服务端准确识别了账号，只差正确密码。**这说明整条链路是对的。**

---

## 二、完整链路

### 步骤 1：拿登录表单

```
GET https://ptlogin.4399.com/ptlogin/loginFrame.do
    ?postLoginHandler=&redirectUrl=&css=&appId=
    &gameId=100068063&loginFrom=uframe&layout=vertical
    &displayMode=&externalLogin=
   Referer: https://www.4399.com/
```

返回真实账号密码表单：

```html
<form id="login_form" action="/ptlogin/login.do?v=1"
      onsubmit="return check_login(username,'j-password',null,'Msg')">
  <input type="hidden" name="sec" value="1" id="j-sec"/>
  <input type="hidden" name="password" value="" id="j-psd"/>
  <input type="password" id="j-password"/>
</form>
```

**必须提取表单里的 22 个隐藏域。**
注意排除 `username` 和 `autoLogin` —— 它们是空值输入框，带上会干扰登录判定。

> ⚠️ **踩过的坑**：`oauth2/authorize.do` + `auth_action=ORILOGIN` 那条路能出表单，
> 但它是「OAuth 授权」流程，不是普通登录。而且它的 `redirect_uri` 指向
> `h.api.4399.com/intermodal/user/login`，这个接口**已经废弃**，
> 无论传什么 `gameUrl` 都返回 `gameUrl_error (10007)`。
> 正确入口是上面的 `loginFrame.do`。

### 步骤 2：提交账号密码

```
POST https://ptlogin.4399.com/oauth2/loginAndAuthorize.do

username   = 4399账号
password   = AES(密码)              ← sec=1，必须加密
sec        = "1"
client_id  = a9a16636dbaeb917e2ffb16f0d52006e
redirect_uri = https://h.api.4399.com/intermodal/user/login?gameId=100068063&gameUrl=
response_type = TOKEN
auth_action   = ORILOGIN
+ 其余隐藏域原样带上
```

失败时返回的 HTML 里有：

```html
<p id="login_err_msg">密码错误</p>
```

成功时返回 302，`Set-Cookie` 里带 `Puser` / `Pauth` / `Sauth` / `Uauth`。

### 步骤 3：换 sign

```
POST https://h.api.4399.com/intermodal/user/grant2
     gameId=100068063
     （带步骤 2 的 Cookie）
```

返回：

```json
{"code":10004,"data":{
  "userId":"803056",
  "userName":"素塑",
  "sign":"9951b38fbdc51cc1cb6122bc77040a7b",
  "time":1794531034,
  ...
}}
```

### 步骤 4：拼游戏地址

```
https://h5game.haowan823.cn/newqz/index_hao.html
  ?gameId=100068063&userId=..&userName=..&time=..&sign=..
```

这就是原来要手动复制的那条链接。

---

## 三、密码加密（关键）

源码在 `ptlogin.3304399.net/resource/validation.js`：

```js
function encryptAES(IdVal) {
    return CryptoJS.AES.encrypt(IdVal, 'lzYW5qaXVqa').toString();
}
```

**CryptoJS 的默认行为不是「直接用字符串当 key」**，而是 OpenSSL EVP_BytesToKey：

```
salt      = 8 字节随机
key, iv   = EVP_BytesToKey(MD5, 口令, salt)    // key 32 字节，iv 16 字节
密文      = AES-256-CBC(明文, key, iv)
输出      = base64("Salted__" + salt + 密文)
```

等价 Python：

```python
def evp_bytes_to_key(password, salt, key_len=32, iv_len=16):
    d = b''; prev = b''
    while len(d) < key_len + iv_len:
        prev = hashlib.md5(prev + password + salt).digest()
        d += prev
    return d[:key_len], d[key_len:key_len+iv_len]

def aes_encrypt(plain, passphrase='lzYW5qaXVqa'):
    salt = os.urandom(8)
    key, iv = evp_bytes_to_key(passphrase.encode(), salt)
    ct = AES.new(key, AES.MODE_CBC, iv=iv).encrypt(pad(plain.encode(), 16))
    return base64.b64encode(b'Salted__' + salt + ct).decode()
```

输出形如 `U2FsdGVkX1...`，`U2FsdGVkX1` 就是 `Salted__` 的 base64。

**我一开始直接用 11 字节的字符串当 AES key，报 `Incorrect AES key length`，就是因为漏了这步派生。**

---

## 四、几个坑

| 坑 | 现象 | 解法 |
|---|---|---|
| 不打 `auth_action=ORILOGIN` | 拿到的是「短信验证码登录」页 | GET 时就带上 |
| 少传隐藏域 | `Parameter absence:redirect_uri` | 整表提取原样带 |
| 密码不加密 | 一直「密码错误」 | sec=1 时走 AES |
| AES key 直接当字符串 | `Incorrect AES key length (11 bytes)` | EVP_BytesToKey 派生 |
| `password1` 没 name | 表单里看不到提交值 | 真正的字段是 `password` |
| 账号填 userId | 走成注册流程 | 用账号名（如 7859），不是 803056 |

---

## 四点五、`game_url_error (10007)` 是什么

```json
{"code":10007,"message":"game_url_error","data":[],"extra":{...}}
```

这个错误来自 **`h.api.4399.com/intermodal/user/login`** —— 一个**已经废弃**的接口。

实测：

```
GET /intermodal/user/login?gameId=100068063&gameUrl=<游戏页>      → 10007 game_url_error
GET /intermodal/user/login?gameId=100068063&gameUrl=<编码后>      → 10007 game_url_error
GET /intermodal/user/login?gameId=100068063&gameUrl=              → 10007 game_url_error
```

**怎么传都报错，说明接口本身不再接收这个用途。** 它原本是 OAuth 登录后回跳用的，
现在 4399 改成了别的流程。

正确的做法是不要经过它：

```
loginFrame.do 登录 → 拿到身份 Cookie
                  → POST h.api.4399.com/intermodal/user/grant2 {gameId}
                  → {userId, userName, sign, time}
```

`grant2` 才是拿 sign 的接口，`intermodal/user/login` 只是历史遗留。

> 这也是为什么「复制游戏页地址」的方式反而更稳：
> 游戏自己会走完整授权链，地址栏里的 `sign` 一定是有效的。

---

## 五、附带能力

### 账号是否注册（无鉴权，可用于前置校验）

```
GET https://ptlogin.4399.com/ptlogin/isExist.do
    ?username=<账号>&appId=oauth&regMode=reg_phone
```

```
"用户名已被注册"  → 存在
"0"              → 不存在
```

### 强制走账号密码面板

页面里那个「4399账号登录」按钮做的事就是：

```js
document.getElementsByName('auth_action')[0].value = 'ORILOGIN';
document.authorizeForm.action = '/oauth2/authorize.do';
document.authorizeForm.submit();
```

---

## 六、代码

```
tools/login.py    登录模块（AES + OAuth + grant2）
tools/flush.py    刷档引擎（WebSocket + Protobuf）
tools/server.py   本地服务（网页 ↔ 4399 代理）
tools/login_probe.py  诊断用探针
```

用法：

```bash
# 命令行直接刷
python3 tools/flush.py <账号> <密码>

# 网页（推荐）
python3 tools/server.py
# 打开 http://127.0.0.1:8899/web/
```

---

## 七、边界

- `sign` 有有效期（约几小时），过期后游戏服返回 `code=1009`，重跑一次登录即可。
- 同一个 4399 账号可以同时保持多条游戏 WebSocket 连接，脚本另开连接不影响你正常玩。
- 登录失败次数过多可能触发风控，`isExist.do` 有频控，不要拿它批量枚举。
