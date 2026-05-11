// pages/write/write.js
const app = getApp()
import { submitLetter, getCategories } from '../../utils/api'

Page({
  data: {
    loading: false,
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
    this.loadCategories()
  },

  onShow() {
    const formData = app.globalData.formData
    if (formData && Object.keys(formData).length > 0) {
      this.setData({ form: { ...this.data.form, ...formData } })
      app.globalData.formData = null
    }
    // 设置 tabBar 选中状态
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
      }
    } catch (e) { console.error(e) }
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

  onColumnChange(e) {
    // 微信的 columnchange 只提供列和值，不提供完整索引
    // 简化处理：不做级联实时更新，在 change 时统一更新
  },

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
