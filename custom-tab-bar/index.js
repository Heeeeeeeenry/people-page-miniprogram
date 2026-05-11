// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "AI助手",
        icon: "chat"
      },
      {
        pagePath: "/pages/write/write",
        text: "写信",
        icon: "write"
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的",
        icon: "profile"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      wx.switchTab({ url })
      this.setData({
        selected: data.index
      })
    }
  }
})
