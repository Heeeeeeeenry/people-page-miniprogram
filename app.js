// app.js
const ENV_URLS = {
  home:    'http://192.168.3.15:8081/api',
  company: 'http://172.21.239.49:8081/api',
  local:   'http://127.0.0.1:8081/api',
}

App({
  onLaunch() {
    const token = wx.getStorageSync('token')
    const user = wx.getStorageSync('user')
    if (token) this.globalData.token = token
    if (user) this.globalData.user = JSON.parse(user)

    // 将探测包装成 Promise，供页面等待
    this.globalData.envReady = new Promise((resolve) => {
      this.detectEnv(() => {
        this.autoLogin()
        resolve()
      })
    })
  },

  detectEnv(callback) {
    const sys = wx.getSystemInfoSync()
    const isDevTools = sys.platform === 'devtools'

    if (isDevTools) {
      // 模拟器跑在 Mac 上，后端也在同一台机器 → 固定用 127.0.0.1
      // /config/env 返回的 WORK_ENV 只用于展示，不能覆盖 baseUrl
      // 否则 WORK_ENV=company 时会映射到公司内网IP 172.21.239.49，DevTools 连不上
      this.globalData.baseUrl = ENV_URLS.local
      wx.request({
        url: ENV_URLS.local + '/config/env',
        method: 'GET',
        timeout: 3000,
        success: (res) => {
          const env = (res.data && res.data.env) || 'local'
          this.globalData.env = env
          console.log('[ENV] devtools WORK_ENV=' + env + ' | baseUrl 固定=' + ENV_URLS.local)
        },
        fail: () => {
          this.globalData.env = 'local'
          console.log('[ENV] devtools /config/env 不可达, env=local')
        }
      })
      callback()
      return
    }

    // 真机：检查是否有手动指定的地址
    const manualUrl = wx.getStorageSync('BASE_URL')
    if (manualUrl) {
      this.globalData.baseUrl = manualUrl
      this.globalData.env = 'manual'
      console.log('[ENV] manual -> ' + manualUrl)
      callback()
      return
    }

    // 真机：127.0.0.1 指向手机自己，没有意义 — 跳过
    // 并发探测 home/company 两个局域网 IP（真机调试代理不转发 localhost）
    const targets = [
      { env: 'home',    url: ENV_URLS.home },
      { env: 'company', url: ENV_URLS.company },
    ]

    let resolved = false
    let remaining = targets.length

    targets.forEach(t => {
      wx.request({
        url: t.url + '/config/ping',
        method: 'GET',
        timeout: 5000,
        success: () => {
          if (!resolved) {
            resolved = true
            // 直接用连通的 IP，不要被 /config/env 返回的 WORK_ENV 覆盖
            this.globalData.baseUrl = t.url
            this.globalData.env = t.env
            console.log('[ENV] probed ->', t.env, t.url)
            callback()
          }
        },
        fail: () => {
          remaining--
          if (remaining === 0 && !resolved) {
            // 全部不通 → 弹窗提示，不设 baseUrl（避免误用 127.0.0.1）
            this.globalData.env = 'offline'
            wx.showModal({
              title: '无法连接后端',
              content: 'home(192.168.3.15) 和 company(172.21.239.49) 均无法连接。\n\n原因：WiFi AP隔离，手机无法直接访问Mac。\n\n解决办法：\n1. Mac开热点，手机连Mac热点后重试\n2. 或在DevTools控制台执行：\n   wx.setStorageSync(\'BASE_URL\', \'http://172.21.239.49:8081/api\')\n   然后重新扫码进入',
              showCancel: false,
              success: () => {
                // 用户关闭弹窗后依然 resolve，让页面显示离线状态而非卡住
                callback()
              }
            })
          }
        }
      })
    })
  },

  async autoLogin() {
    // 已有 token → 直接返回
    if (this.globalData.token) return

    // baseUrl 未就绪 → 等探测完成
    if (!this.globalData.baseUrl) {
      if (this.globalData.envReady) await this.globalData.envReady
      if (!this.globalData.baseUrl) {
        console.error('[Login] baseUrl 为空，放弃登录')
        return
      }
    }

    // 防并发：多个页面同时调用时共用同一个 Promise
    if (this._loginPromise) return this._loginPromise

    this._loginPromise = (async () => {
      try {
        const res = await new Promise((resolve, reject) => {
          wx.login({ success: resolve, fail: reject })
        })
        if (!res.code) return

        // 获取本小程序 appid，传给后端匹配对应的 secret
        const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null
        const appid = (accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.appId) || ''

        const loginRes = await new Promise((resolve, reject) => {
          wx.request({
            url: this.globalData.baseUrl + '/auth/wechat/login',
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            data: { code: res.code, appid: appid },
            success: resolve,
            fail: reject
          })
        })

        if (loginRes.statusCode === 200 && loginRes.data && loginRes.data.token) {
          const { token, user } = loginRes.data
          this.globalData.token = token
          this.globalData.user = user
          wx.setStorageSync('token', token)
          wx.setStorageSync('user', JSON.stringify(user))
          console.log('[Login] 成功, token:', token.substring(0, 20) + '...')
        } else if (loginRes.data && loginRes.data.need_bind_phone) {
          this.globalData.wxOpenid = loginRes.data.wx_openid
          this.globalData.needBindPhone = true
          console.log('[Login] 需要绑定手机号, openid:', loginRes.data.wx_openid)
        } else {
          console.error('[Login] 异常响应:', loginRes.statusCode, JSON.stringify(loginRes.data))
          wx.showToast({ title: '登录失败: ' + (loginRes.data?.message || loginRes.statusCode), icon: 'none', duration: 3000 })
        }
      } catch (e) {
        console.error('自动登录失败', e)
        wx.showToast({ title: '登录失败: ' + (e.errMsg || e.message || '网络错误'), icon: 'none', duration: 3000 })
      } finally {
        this._loginPromise = null
      }
    })()

    return this._loginPromise
  },

  globalData: {
    user: null,
    token: '',
    wxOpenid: '',
    needBindPhone: false,
    baseUrl: '',       // 探测完成前为空，防止误用 127.0.0.1
    env: 'detecting',
    envReady: null
  }
})
