// pages/write/write.js
const app = getApp()
import { submitLetter, getCategories, classifyLetter } from '../../utils/api'

Page({
  data: {
    loading: false,
    aiLoading: false,
    aiSuggestion: null,
    categories: [],
    categoryIndex: [0, 0, 0],
    categoryColumns: [[], [], []],
    categoryIds: [[], [], []],
    displayCategory: '',
    form: {
      citizen_name: '',
      phone: '',
      id_card: '',
      content: ''
    }
  },

  onLoad() {
    this.initPage()
  },

  async initPage() {
    if (!app.globalData.token) await app.autoLogin()
    await this.loadCategories()
  },

  onShow() {
    if (!app.globalData.token) app.autoLogin()
    const formData = app.globalData.formData
    if (formData && Object.keys(formData).length > 0) {
      this.setData({ form: { ...this.data.form, citizen_name: formData.citizen_name || '', phone: formData.phone || '', id_card: formData.id_card || '', content: formData.content || '' } })
      // 等分类加载完再回填
      this._pendingCats = { cat1: formData.cat1, cat2: formData.cat2, cat3: formData.cat3 }
      app.globalData.formData = null
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  async loadCategories() {
    try {
      const res = await getCategories()
      if (res && res.data) {
        this.setData({ categories: res.data })
        this.updatePickerRange(res.data, [0, 0, 0])
        if (this._pendingCats) {
          this.fillCategory(this._pendingCats.cat1, this._pendingCats.cat2, this._pendingCats.cat3)
          this._pendingCats = null
        }
      }
    } catch (e) {
      console.error('加载分类失败', e)
      wx.showToast({ title: '加载分类失败，请重试', icon: 'none' })
    }
  },

  fillCategory(cat1, cat2, cat3) {
    const tree = this.data.categories
    if (!tree || tree.length === 0) return
    let idx1 = 0, idx2 = 0, idx3 = 0
    if (cat1) {
      const i = tree.findIndex(c => c.name === cat1)
      if (i >= 0) idx1 = i
    }
    const l1Children = tree[idx1]?.children || []
    if (cat2) {
      const i = l1Children.findIndex(c => c.name === cat2)
      if (i >= 0) idx2 = i
    }
    const l2Children = l1Children[idx2]?.children || []
    if (cat3) {
      const i = l2Children.findIndex(c => c.name === cat3)
      if (i >= 0) idx3 = i
    }
    this.updatePickerRange(tree, [idx1, idx2, idx3])
    this.setData({ categoryIndex: [idx1, idx2, idx3] })
  },

  // ===== AI 一键分类 =====
  async doAIClassify() {
    const content = this.data.form.content
    if (!content || !content.trim()) {
      wx.showToast({ title: '请先填写诉求内容', icon: 'none' })
      return
    }
    this.setData({ aiLoading: true, aiSuggestion: null })
    try {
      const res = await classifyLetter({ 描述: content.trim() })
      const data = res?.data || res
      if (data) {
        this.setData({ aiSuggestion: data })
      } else {
        wx.showToast({ title: '未识别到分类', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: 'AI分类失败', icon: 'none' })
    }
    this.setData({ aiLoading: false })
  },

  acceptAIClassify() {
    const s = this.data.aiSuggestion
    if (!s) return
    this.fillCategory(s['一级分类'] || '', s['二级分类'] || '', s['三级分类'] || '')
    this.setData({ aiSuggestion: null })
  },

  updatePickerRange(tree, index) {
    const cols = [[], [], []]
    const ids = [[], [], []]
    tree.forEach(n => { cols[0].push(n.name); ids[0].push(n.id || 0) })
    const l1 = tree[index[0]]
    if (l1?.children) {
      l1.children.forEach(n => { cols[1].push(n.name); ids[1].push(n.id || 0) })
      const l2 = l1.children[Math.min(index[1], l1.children.length - 1)] || l1.children[0]
      if (l2?.children) {
        l2.children.forEach(n => { cols[2].push(n.name); ids[2].push(n.id || 0) })
      }
    }
    const catIdx = [
      Math.min(index[0], Math.max(0, cols[0].length - 1)),
      Math.min(index[1], Math.max(0, cols[1].length - 1)),
      Math.min(index[2], Math.max(0, cols[2].length - 1))
    ]
    const parts = [cols[0][catIdx[0]], cols[1][catIdx[1]], cols[2][catIdx[2]]].filter(Boolean)
    this.setData({
      categoryColumns: cols,
      categoryIds: ids,
      categoryIndex: catIdx,
      displayCategory: parts.join(' / ') || '请选择分类'
    })
  },

  onCategoryChange(e) {
    this.updatePickerRange(this.data.categories, e.detail.value)
  },

  onColumnChange(e) {},

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const form = { ...this.data.form }
    form[field] = e.detail.value
    this.setData({ form })
  },

  async onSubmit() {
    const { form, categoryIndex, categoryIds } = this.data
    if (!form.citizen_name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!form.phone || !/^1\d{10}$/.test(form.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (!form.content.trim()) {
      wx.showToast({ title: '请输入诉求内容', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const categoryId = categoryIds[2]?.[categoryIndex[2]]
        || categoryIds[1]?.[categoryIndex[1]]
        || categoryIds[0]?.[categoryIndex[0]]
        || 0

      const data = {
        citizen_name: form.citizen_name,
        phone: form.phone,
        id_card: form.id_card,
        content: form.content,
        category_id: categoryId
      }

      const res = await submitLetter(data)
      if (res && (res.success || res.message)) {
        wx.showToast({ title: '提交成功', icon: 'success' })
        this.setData({
          form: { citizen_name: '', phone: '', id_card: '', content: '' }
        })
      } else {
        wx.showToast({ title: res.error || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
    this.setData({ loading: false })
  }
})
