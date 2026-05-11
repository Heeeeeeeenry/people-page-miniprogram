// pages/index/index.js
const app = getApp()
import { getPrompt } from '../../utils/api'

let msgId = 0
function nextId() { return 'm' + (++msgId) }

Page({
  data: {
    messages: [],
    inputValue: '',
    loading: false,
    keyboardHeight: 0,
    msgListTop: 100,
    msgListBottom: 120,
    inputBarBottom: 60
  },

  onLoad() {
    this.initChat()
    this.initKeyboardListener()
    this.calcLayout()
  },

  onShow() {
    this.setData({ loading: false, inputValue: '' })
    if (!app.globalData.token) app.autoLogin()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.calcLayout()
    setTimeout(() => this.scrollToBottom(), 600)
  },

  onHide() {
    this.removeKeyboardListener()
  },

  onUnload() {
    this.removeKeyboardListener()
  },

  calcLayout() {
    const info = wx.getSystemInfoSync()
    const ww = info.windowWidth
    const rpx = function(r) { return r * ww / 750 }

    // 导航栏高度: padding-top(safe top + 32rpx) + title(36rpx) + subtitle(24rpx + 4rpx margin) + padding-bottom(24rpx)
    const safeTop = info.safeArea ? info.safeArea.top : info.statusBarHeight || 0
    const navH = safeTop + rpx(32 + 36 + 4 + 24 + 24)

    // 输入栏高度: padding-top(16rpx) + input(80rpx) + padding-bottom(16rpx) + border-top + safe-bottom
    const safeBottom = info.safeArea ? (info.screenHeight - info.safeArea.bottom) : 0
    const inputH = rpx(16 + 80 + 16) + safeBottom + 2

    // Tab bar 高度
    const tabH = rpx(112) + safeBottom

    this._navH = navH
    this._inputH = inputH
    this._tabH = tabH
    this._safeBottom = safeBottom

    this.setData({
      msgListTop: navH,
      msgListBottom: inputH + tabH - safeBottom,
      inputBarBottom: tabH - safeBottom
    })
  },

  initKeyboardListener() {
    this.keyboardHeightChange = (res) => {
      const kbH = res.height
      this.setData({ keyboardHeight: kbH })
      if (kbH > 0) {
        this.setData({
          inputBarBottom: kbH,
          msgListBottom: this._inputH + kbH
        })
        setTimeout(() => this.scrollToBottom(), 150)
      } else {
        const tabH = this._tabH || 60
        const safeBottom = this._safeBottom || 0
        this.setData({
          inputBarBottom: tabH - safeBottom,
          msgListBottom: (this._inputH || 60) + tabH - safeBottom
        })
      }
    }
    wx.onKeyboardHeightChange(this.keyboardHeightChange)
  },

  removeKeyboardListener() {
    if (this.keyboardHeightChange) {
      wx.offKeyboardHeightChange(this.keyboardHeightChange)
    }
  },

  onInputFocus() {
    setTimeout(() => this.scrollToBottom(), 300)
  },

  onInputBlur() {
    const tabH = this._tabH || 60
    const safeBottom = this._safeBottom || 0
    this.setData({
      keyboardHeight: 0,
      inputBarBottom: tabH - safeBottom,
      msgListBottom: (this._inputH || 60) + tabH - safeBottom
    })
  },

  async initChat() {
    try {
      const res = await getPrompt()
      const text = (res && res.data && (res.data.content || (typeof res.data === 'string' ? res.data : ''))) || '您好！我是民意智感AI助手，请问有什么可以帮助您的？'
      this.addMessage('assistant', text)
    } catch {
      this.addMessage('assistant', '您好！我是民意智感AI助手，请问有什么可以帮助您的？')
    }
  },

  addMessage(role, content, actions) {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const msg = { id: nextId(), role, content, time }
    if (actions) msg.actions = actions
    this.data.messages.push(msg)
    this.setData({ messages: this.data.messages })
    this.scrollToBottom()
    return msg
  },

  quickAsk(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ inputValue: text })
    this.sendMessage()
  },

  scrollToBottom() {
    this.setData({ scrollToView: '' })
    setTimeout(() => this.setData({ scrollToView: 'msg-end' }), 50)
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  async sendMessage() {
    const content = this.data.inputValue.trim()
    if (!content || this.data.loading) return

    this.setData({ loading: true, inputValue: '' })
    this.addMessage('user', content)

    try {
      const apiMessages = this.data.messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))

      const token = app.globalData.token
      const header = { 'Content-Type': 'application/json' }
      if (token) header['Authorization'] = 'Bearer ' + token

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.baseUrl + '/chat/completions',
          method: 'POST',
          header,
          timeout: 10000,
          data: { 
            messages: apiMessages,
            stream: false
          },
          success: resolve,
          fail: reject
        })
      })

      if (res.statusCode === 200 && res.data) {
        let reply = ''
        if (res.data.choices && res.data.choices[0]) {
          reply = res.data.choices[0].message?.content || res.data.choices[0].text || ''
        } else if (res.data.data) {
          reply = res.data.data.reply || res.data.data.content || res.data.data.message || ''
        } else if (res.data.reply) {
          reply = res.data.reply
        } else if (res.data.content) {
          reply = res.data.content
        } else if (res.data.message) {
          reply = res.data.message
        }
        
        if (typeof reply !== 'string') {
          reply = JSON.stringify(reply)
        }
        
        if (reply) {
          this.addMessage('assistant', reply)
        } else {
          this.addMessage('assistant', '抱歉，我没有理解您的问题，请重新描述一下。')
        }
      } else {
        this.mockReply(content)
      }
    } catch (e) {
      console.error('Chat error:', e)
      this.mockReply(content)
    }
    this.setData({ loading: false })
  },

  mockReply(content) {
    const replies = [
      '您好！我已收到您的问题，让我为您查询一下相关信息。',
      '感谢您的咨询，这个问题我可以帮您解答。',
      '明白了，关于您提到的这个问题，我建议您可以尝试以下方法...',
      '好的，我来为您详细说明一下。',
      '收到！这是一个很好的问题，让我为您解答。'
    ]
    const randomReply = replies[Math.floor(Math.random() * replies.length)]
    this.addMessage('assistant', randomReply + '\n\n【提示：当前使用的是演示模式，如需连接真实AI服务，请配置正确的服务器地址】')
  },

  updateLastAssistantMsg(content, actions) {
    const msgs = this.data.messages
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      last.content = content
      if (actions) last.actions = actions
      this.setData({ messages: msgs })
    } else {
      this.addMessage('assistant', content, actions)
    }
    this.scrollToBottom()
  },

  handleAction(e) {
    const action = e.currentTarget.dataset.action
    if (!action) return
    if (action.type === 'send') {
      this.setData({ inputValue: action.value || action.label })
      this.sendMessage()
    } else if (action.type === 'navigate') {
      wx.navigateTo({ url: action.url })
    } else if (action.type === 'fillForm') {
      app.globalData.formData = action.data || {}
      wx.switchTab({ url: '/pages/write/write' })
    }
  }
})
