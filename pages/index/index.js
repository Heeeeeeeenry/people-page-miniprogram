// pages/index/index.js
const app = getApp()
import { getPrompt, searchPOI, classifyLetter, submitLetter } from '../../utils/api'

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
    inputBarBottom: 60,
    // 提交弹窗
    showSubmitDialog: false,
    submitDraft: {},
    draftName: '', draftPhone: '', draftIdCard: '', draftCategory: '', draftDesc: ''
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
    // 保持键盘监听，不在这里移除。onShow 重新进入时可正常工作
  },

  onUnload() {
    this.removeKeyboardListener()
  },

  calcLayout() {
    const info = wx.getSystemInfoSync()
    const ww = info.windowWidth
    const rpx = function(r) { return r * ww / 750 }
    const safeTop = info.safeArea ? info.safeArea.top : info.statusBarHeight || 0
    const navH = safeTop + rpx(32 + 36 + 4 + 24 + 24)
    const safeBottom = info.safeArea ? (info.screenHeight - info.safeArea.bottom) : 0
    const inputH = rpx(16 + 80 + 16) + safeBottom + 2
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
        this.setData({ inputBarBottom: kbH, msgListBottom: this._inputH + kbH })
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

  // ===================== 初始化 =====================

  async initChat() {
    const defaultPrompt = '你是一个乐于助人的AI助手，请用中文回答用户的问题。'
    try {
      const res = await getPrompt()
      const basePrompt = (res && res.prompt) || defaultPrompt
      // 非流式模式下，LLM 倾向于直接问用户而不是调用工具
      // 在前面强制加上工具命令使用提示
      this._systemPrompt = `【重要工具命令规则】你可以使用以下工具命令来搜索信息，请写在回复中：\n- :["map-search", "地点名称"] 搜索地址和单位\n- :["classify", "描述内容"] 对信件内容进行分类\n如果需要查询地址、单位、路段、分类等信息，必须使用工具命令搜索，严禁直接反问用户。\n\n${basePrompt}`
      console.log('[Init] prompt长度:', (this._systemPrompt || '').length)
      this.addMessage('assistant', '您好！我是民意智感AI助手，请问有什么可以帮助您的？')
    } catch (e) {
      console.error('[Init] prompt加载失败:', e)
      this._systemPrompt = defaultPrompt
      this.addMessage('assistant', '您好！我是民意智感AI助手，请问有什么可以帮助您的？')
    }
  },

  // ===================== 消息管理 =====================

  addMessage(role, content, actions) {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const msg = { id: nextId(), role, content, time, hasActions: !!(actions && actions.length) }
    if (actions) msg.actions = actions
    this.data.messages.push(msg)
    this.setData({ messages: this.data.messages })
    this.scrollToBottom()
    return msg
  },

  updateLastAssistantMsg(content, actions) {
    const msgs = this.data.messages
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      last.content = content
      last.hasActions = !!(actions && actions.length)
      if (actions) last.actions = actions
      this.setData({ messages: msgs })
    } else {
      this.addMessage('assistant', content, actions)
    }
    this.scrollToBottom()
  },

  // ===================== 发送消息 =====================

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
    this._toolCommandCount = 0

    try {
      await this.doChatAndProcess()
    } catch (e) {
      console.error('Chat error:', e)
      this.addMessage('assistant', '抱歉，网络异常，请重试。')
    }
    this.setData({ loading: false })
  },

  // 构建并发送请求 → 处理工具命令 → 提取草稿
  async doChatAndProcess(extraSystemMsg) {
    // 构建消息列表
    const apiMessages = [{ role: 'system', content: this._systemPrompt }]
    if (extraSystemMsg) {
      apiMessages.push({ role: 'system', content: extraSystemMsg })
    }
    this.data.messages.forEach(m => {
      if (m.role === 'user' || m.role === 'assistant') {
        apiMessages.push({ role: m.role, content: m.content })
      }
    })

    const reply = await this.callChatAPI(apiMessages)
    if (!reply) {
      this.addMessage('assistant', '抱歉，我没有理解您的问题，请重新描述一下。')
      return
    }

    // 检查工具命令
    const toolResult = await this.processToolCommands(reply)
    if (toolResult) {
      // 有工具命令，将结果回传 AI 继续对话
      await this.doChatAndProcess(
        `工具执行结果：\n${toolResult}\n\n请根据以上结果继续处理。`
      )
      return
    }

    // 最终回复：提取草稿、检查是否建议提交
    this.processAIResponse(reply)
  },

  // 调用聊天 API
  callChatAPI(messages) {
    return new Promise((resolve, reject) => {
      const header = { 'Content-Type': 'application/json' }
      const token = app.globalData.token
      if (token) header['Authorization'] = 'Bearer ' + token

      wx.request({
        url: app.globalData.baseUrl + '/chat',
        method: 'POST',
        header,
        timeout: 60000,
        data: { messages, stream: false },
        success(res) {
          if (res.statusCode === 200 && res.data) {
            let reply = res.data.reply || res.data.content || res.data.message || ''
            if (res.data.choices && res.data.choices[0]) {
              reply = res.data.choices[0].message?.content || res.data.choices[0].text || ''
            }
            if (typeof reply !== 'string') reply = JSON.stringify(reply)
            resolve(reply)
          } else {
            resolve('')
          }
        },
        fail(err) { reject(err) }
      })
    })
  },

  // ===================== 工具命令处理（与 Web 端一致）=====================

  async processToolCommands(content) {
    const regex = /:\["(map-search|classify)",\s*"([^"]+)"\]/g
    const commands = [...content.matchAll(regex)]
    console.log('[Tool] 检查工具命令:', commands.length, '个')
    if (commands.length === 0) return null

    // 防止无限循环
    this._toolCommandCount++
    if (this._toolCommandCount > 3) {
      console.warn('工具命令执行次数过多，停止')
      return null
    }

    // 从回复内容中移除命令文本
    const cleanContent = content.replace(regex, '').trim()
    const lastMsg = this.data.messages[this.data.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content = cleanContent
    }

    const results = []
    for (const [, command, param] of commands) {
      const result = await this.executeToolCommand(command, param)
      if (result) results.push(result)
    }
    return results.length > 0 ? results.join('\n') : null
  },

  async executeToolCommand(command, param) {
    try {
      if (command === 'map-search') {
        const res = await searchPOI(param)
        const pois = (res && res.pois) || []
        if (pois.length > 0) {
          const poi = pois[0]
          return `[map-search结果] 查询"${param}"结果：${poi.name}，地址：${poi.address}，坐标：${poi.location}`
        }
        return `[map-search结果] 未找到"${param}"的相关信息`
      }
      if (command === 'classify') {
        const res = await classifyLetter({ 描述: param })
        const data = (res && res.data) || {}
        if (data['一级分类']) {
          return `[classify结果] 分类建议：${data['一级分类'] || ''}/${data['二级分类'] || ''}/${data['三级分类'] || ''}`
        }
        return `[classify结果] 分类分析完成`
      }
    } catch (e) {
      return `[${command}错误] ${e.message || '执行失败'}`
    }
    return null
  },

  // ===================== AI 回复处理（与 Web 端一致）=====================

  processAIResponse(content) {
    const draft = this.extractDraft(content)
    if (draft && Object.keys(draft).length > 0) {
      const actions = [{ label: '填写信件', type: 'fillForm', data: draft }]
      this.updateLastAssistantMsg(content, actions)
    } else {
      this.addMessage('assistant', content)
    }
  },

  extractDraft(content) {
    const draft = {}
    // 1. 从 AI 回复中提取分类信息
    const clean = content.replace(/\*\*/g, '')
    const cat1 = clean.match(/一级分类[：:]\s*([^\n,，]+)/)
    if (cat1) draft['一级分类'] = cat1[1].trim()
    const cat2 = clean.match(/二级分类[：:]\s*([^\n,，]+)/)
    if (cat2) draft['二级分类'] = cat2[1].trim()
    const cat3 = clean.match(/三级分类[：:]\s*([^\n,，]+)/)
    if (cat3) draft['三级分类'] = cat3[1].trim()

    // 2. 从用户原始消息中提取姓名/手机号/身份证号，描述用原文
    const userMsg = this.getLastUserMessage()
    if (userMsg) {
      let name = userMsg.match(/群众\s*([^\s（(，,。.\d]{2,4})/)
      if (!name) name = userMsg.match(/^([^\s（(，,。.\d]{2,4})/)
      if (name) draft['姓名'] = name[1].trim()

      const idMatch = userMsg.match(/(\d{17}[\dXx])/)
      if (idMatch) draft['身份证号'] = idMatch[1]

      const phoneMatch = userMsg.match(/(\d{11})/)
      if (phoneMatch) draft['手机号'] = phoneMatch[1]

      let desc = userMsg
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/^[^反诉要建表根求说报称我其].*?[：:，,。.]\s*/, '')
        .trim()
      if (desc.length < 10) desc = userMsg.trim()
      draft['描述'] = desc
    }
    return draft
  },

  getLastUserMessage() {
    const msgs = this.data.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return msgs[i].content
    }
    return ''
  },

  // ===================== 提交弹窗 =====================

  closeSubmitDialog() {
    this.setData({ showSubmitDialog: false })
  },

  handleEditDraft() {
    app.globalData.formData = this.mapDraftToForm(this.data.submitDraft)
    this.setData({ showSubmitDialog: false })
    wx.switchTab({ url: '/pages/write/write' })
  },

  // 将 AI 提取的中文 key 映射到写信页的英文字段
  mapDraftToForm(draft) {
    return {
      citizen_name: draft['姓名'] || '',
      phone: draft['手机号'] || '',
      id_card: draft['身份证号'] || '',
      content: draft['描述'] || '',
      cat1: draft['一级分类'] || '',
      cat2: draft['二级分类'] || '',
      cat3: draft['三级分类'] || '',
    }
  },

  async handleSubmitDraft() {
    try {
      const formData = this.mapDraftToForm(this.data.submitDraft)
      const res = await submitLetter(formData)
      const letterNo = (res && (res.letter_no || (res.data && res.data.letter_no))) || ''
      if (letterNo) {
        this.addMessage('assistant', `✅ 信件已成功提交！信件编号：**${letterNo}**`)
      } else {
        const err = (res && res.error) || '未知错误'
        this.addMessage('assistant', `❌ 提交失败：${err}`)
      }
    } catch (e) {
      this.addMessage('assistant', `❌ 提交失败：${e.message || '网络错误'}`)
    }
    this.setData({ showSubmitDialog: false, submitDraft: {}, draftName: '', draftPhone: '', draftIdCard: '', draftCategory: '', draftDesc: '' })
  },

  // ===================== 消息操作 =====================

  handleAction(e) {
    const action = e.currentTarget.dataset.action
    if (!action) return
    if (action.type === 'send') {
      this.setData({ inputValue: action.value || action.label })
      this.sendMessage()
    } else if (action.type === 'navigate') {
      wx.navigateTo({ url: action.url })
    } else if (action.type === 'fillForm') {
      app.globalData.formData = this.mapDraftToForm(action.data || {})
      wx.switchTab({ url: '/pages/write/write' })
    }
  },

  onLongPressMsg(e) {
    const content = e.currentTarget.dataset.content
    if (content) {
      wx.setClipboardData({
        data: content,
        success() { wx.showToast({ title: '已复制', icon: 'success', duration: 1500 }) }
      })
    }
  },

  noop() {}
})
