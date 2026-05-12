// utils/api.js
const app = getApp()

function request(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const baseUrl = app.globalData.baseUrl
    if (!baseUrl) {
      reject(new Error('baseUrl 未设置，请先连接后端'))
      return
    }
    const header = { 'Content-Type': 'application/json' }
    const token = app.globalData.token
    if (token) {
      header['Authorization'] = 'Bearer ' + token
    }
    wx.request({
      url: baseUrl + url,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode === 401) {
          app.globalData.token = ''
          wx.removeStorageSync('token')
          wx.removeStorageSync('user')
          reject(new Error('未登录'))
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(res.data?.error || `HTTP ${res.statusCode}`))
        }
      },
      fail(err) { reject(err) }
    })
  })
}

// ===== 认证 =====

// 微信小程序登录
export function wechatLogin(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + '/auth/wechat/login',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { code },
      success(res) { resolve(res.data) },
      fail(err) { reject(err) }
    })
  })
}

// 微信绑定手机号
export function bindPhone(wxOpenid, phone, code) {
  return request('/auth/wechat/bind-phone', 'POST', { wx_openid: wxOpenid, phone, code })
}

// 发送验证码
export function sendCode(phone) {
  return request('/auth/send-code', 'POST', { phone })
}

// 获取当前用户
export function getCurrentUser() {
  return request('/auth/me')
}

// ===== AI对话 =====

export function getPrompt() {
  return request('/prompt')
}

// ===== 工具 =====

export function searchPOI(keywords) {
  return request('/amap/poi/search?keywords=' + encodeURIComponent(keywords))
}

// ===== 信件 =====

export function submitLetter(data) {
  return request('/letter/submit', 'POST', data)
}

export function getCategories() {
  return request('/letter/categories')
}

export function classifyLetter(data) {
  return request('/letter/classify', 'POST', data)
}
