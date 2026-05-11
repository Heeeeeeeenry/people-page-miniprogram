// pages/profile/profile.js
const app = getApp()
import { bindPhone, sendCode, getCurrentUser } from '../../utils/api'

Page({
  data: {
    isLogin: false,
    user: null,
    phone: '',
    code: '',
    sending: false,
    countdown: 0,
    binding: false
  },

  onShow() {
    this.checkLogin()
    // 设置 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  checkLogin() {
    const token = wx.getStorageSync('token')
    const user = wx.getStorageSync('user')

    if (token && user) {
      app.globalData.token = token
      const userObj = JSON.parse(user)
      app.globalData.user = userObj
      this.setData({ isLogin: true, user: userObj })
      return
    }

    // 检查是否需要绑定手机号
    if (app.globalData.needBindPhone && app.globalData.wxOpenid) {
      this.setData({ isLogin: false })
      return
    }

    // 尝试自动微信登录
    this.setData({ isLogin: false })
    app.autoLogin().then(() => {
      if (app.globalData.token) {
        const u = app.globalData.user
        this.setData({ isLogin: true, user: u })
        wx.setStorageSync('user', JSON.stringify(u))
      }
    })
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value })
  },

  async onSendCode() {
    const phone = this.data.phone
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    this.setData({ sending: true })
    try {
      const res = await sendCode(phone)
      if (res && res.message) {
        wx.showToast({ title: '验证码已发送', icon: 'success' })
        this.setData({ countdown: 60 })
        const timer = setInterval(() => {
          if (this.data.countdown <= 1) {
            clearInterval(timer)
            this.setData({ countdown: 0 })
          } else {
            this.setData({ countdown: this.data.countdown - 1 })
          }
        }, 1000)
      } else {
        wx.showToast({ title: res.error || '发送失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '发送失败', icon: 'none' })
    }
    this.setData({ sending: false })
  },

  async onBindPhone() {
    const { phone, code } = this.data
    const wxOpenid = app.globalData.wxOpenid
    if (!wxOpenid) {
      wx.showToast({ title: '微信授权已过期，请重试', icon: 'none' })
      return
    }
    this.setData({ binding: true })
    try {
      const res = await bindPhone(wxOpenid, phone, code)
      if (res && res.token) {
        const { token, user } = res
        app.globalData.token = token
        app.globalData.user = user
        app.globalData.needBindPhone = false
        wx.setStorageSync('token', token)
        wx.setStorageSync('user', JSON.stringify(user))
        this.setData({ isLogin: true, user })
        wx.showToast({ title: '登录成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.error || res.message || '绑定失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '绑定失败', icon: 'none' })
    }
    this.setData({ binding: false })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.token = ''
          app.globalData.user = null
          wx.removeStorageSync('token')
          wx.removeStorageSync('user')
          this.setData({ isLogin: false, user: null })
          wx.reLaunch({ url: '/pages/index/index' })
        }
      }
    })
  },

  onMyLetters() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  }
})
