// pages/write/write.js
const app = getApp()
import { submitLetter, getCategories, classifyLetter, uploadFileRequest } from '../../utils/api'
import { getExtFromPath, getFileIcon, formatSize } from '../../utils/upload'

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
    files: [],
    uploadingFiles: {},
    form: {
      citizen_name: '',
      phone: '',
      id_card: '',
      content: ''
    }
  },

  async onLoad() {
    // 等待环境探测完成
    if (app.globalData.envReady) {
      await app.globalData.envReady
    }
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

  // ===== 文件选择与上传 =====

  /**
   * 添加附件：优先使用 wx.chooseMedia（图片+视频），
   * 其他文件类型通过 wx.chooseMessageFile 选择
   */
  chooseFile() {
    const that = this
    wx.showActionSheet({
      itemList: ['拍摄/选择图片或视频', '从聊天文件选择'],
      success(res) {
        if (res.tapIndex === 0) {
          that.chooseMedia()
        } else if (res.tapIndex === 1) {
          that.chooseMessageFile()
        }
      }
    })
  },

  chooseMedia() {
    const that = this
    wx.chooseMedia({
      count: 9,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 60,
      success(res) {
        const newFiles = res.tempFiles.map(f => {
          const ext = getExtFromPath(f.tempFilePath) || (f.fileType === 'video' ? 'mp4' : 'jpg')
          return {
            path: f.tempFilePath,
            name: f.tempFilePath.split('/').pop() || 'file.' + ext,
            ext: ext,
            size: f.size || 0,
            sizeText: formatSize(f.size || 0),
            type: f.fileType === 'video' ? 'video' : 'image',
            icon: f.fileType === 'video' ? '🎬' : '🖼️',
            uploaded: false,
            url: '',
            progress: 0
          }
        })
        that.setData({ files: [...that.data.files, ...newFiles] })
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  chooseMessageFile() {
    const that = this
    wx.chooseMessageFile({
      count: 9,
      type: 'all',
      success(res) {
        const newFiles = res.tempFiles.map(f => {
          const ext = getExtFromPath(f.path) || getExtFromPath(f.name)
          return {
            path: f.path,
            name: f.name,
            ext: ext,
            size: f.size || 0,
            sizeText: formatSize(f.size || 0),
            type: getExtFromPath(f.path) || getExtFromPath(f.name),
            icon: getFileIcon(ext),
            uploaded: false,
            url: '',
            progress: 0
          }
        })
        that.setData({ files: [...that.data.files, ...newFiles] })
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 删除已选文件
   */
  removeFile(e) {
    const index = e.currentTarget.dataset.index
    const files = [...this.data.files]
    const removing = files[index]
    // 如果正在上传中，尝试取消（微信暂不支持主动取消）
    files.splice(index, 1)
    const uploadingFiles = { ...this.data.uploadingFiles }
    if (removing && removing.path) {
      delete uploadingFiles[removing.path]
    }
    this.setData({ files, uploadingFiles })
  },

  /**
   * 上传单个文件
   */
  async uploadSingleFile(file, index) {
    if (file.uploaded && file.url) return file

    const uploadingFiles = { ...this.data.uploadingFiles }
    uploadingFiles[file.path] = 0
    this.setData({ uploadingFiles })

    try {
      const result = await uploadFileRequest(file.path, (progress) => {
        const uf = { ...this.data.uploadingFiles }
        uf[file.path] = progress
        this.setData({ uploadingFiles: uf })

        // 同步更新 files 中的进度
        const files = [...this.data.files]
        const fi = files.findIndex(f => f.path === file.path)
        if (fi >= 0) {
          files[fi].progress = progress
          this.setData({ files })
        }
      })

      const files = [...this.data.files]
      const fi = files.findIndex(f => f.path === file.path)
      if (fi >= 0) {
        files[fi].uploaded = true
        files[fi].url = result.url || result.data?.url || ''
        files[fi].progress = 100
      }

      const uf = { ...this.data.uploadingFiles }
      delete uf[file.path]
      this.setData({ files, uploadingFiles: uf })

      return files[fi]
    } catch (e) {
      const uf = { ...this.data.uploadingFiles }
      delete uf[file.path]
      this.setData({ uploadingFiles: uf })
      throw e
    }
  },

  /**
   * 获取已上传文件的 URL 列表
   */
  getUploadedUrls() {
    return this.data.files
      .filter(f => f.uploaded && f.url)
      .map(f => f.url)
  },

  async onSubmit() {
    const { form, categoryIndex, categoryIds, files } = this.data
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
      // 1. 先上传所有未上传的文件
      const uploadPromises = files
        .filter(f => !f.uploaded || !f.url)
        .map((f, i) => this.uploadSingleFile(f, i))

      if (uploadPromises.length > 0) {
        wx.showLoading({ title: '上传附件中...' })
        await Promise.all(uploadPromises)
        wx.hideLoading()
      }

      // 2. 收集已上传的文件 URL
      const uploadedUrls = this.getUploadedUrls()

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

      // 如果有附件，带上文件 URL
      if (uploadedUrls.length > 0) {
        data.file_urls = uploadedUrls
      }

      const res = await submitLetter(data)
      if (res && (res.success || res.message)) {
        wx.showToast({ title: '提交成功', icon: 'success' })
        this.setData({
          form: { citizen_name: '', phone: '', id_card: '', content: '' },
          files: [],
          uploadingFiles: {}
        })
      } else {
        wx.showToast({ title: res.error || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
    this.setData({ loading: false })
  }
})
