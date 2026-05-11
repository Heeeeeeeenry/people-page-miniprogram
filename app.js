// app.js
App({
  onLaunch() {
    // 恢复登录态
    const token = wx.getStorageSync('token')
    const user = wx.getStorageSync('user')
    if (token) this.globalData.token = token
    if (user) this.globalData.user = JSON.parse(user)

    // 自动微信登录
    this.autoLogin()
  },

  async autoLogin() {
    // 已有有效 token 则跳过
    if (this.globalData.token) return

    try {
      const res = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })
      if (!res.code) return

      // 发送 code 到后端
      const loginRes = await new Promise((resolve, reject) => {
        wx.request({
          url: this.globalData.baseUrl + '/auth/wechat/login',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: res.code },
          success: resolve,
          fail: reject
        })
      })

      if (loginRes.statusCode === 200 && loginRes.data.token) {
        const { token, user } = loginRes.data
        this.globalData.token = token
        this.globalData.user = user
        wx.setStorageSync('token', token)
        wx.setStorageSync('user', JSON.stringify(user))
      } else if (loginRes.data && loginRes.data.need_bind_phone) {
        // 需要绑定手机号，跳到个人中心
        this.globalData.wxOpenid = loginRes.data.wx_openid
        this.globalData.needBindPhone = true
      }
    } catch (e) {
      console.error('自动登录失败', e)
    }
  },

  globalData: {
    user: null,
    token: '',
    wxOpenid: '',
    needBindPhone: false,
    baseUrl: 'http://10.25.65.177:8081/api'
  }
})
