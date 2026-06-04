// utils/upload.js
const app = getApp()

/**
 * 根据文件扩展名判断文件类型
 * @param {string} ext - 文件扩展名（不含点）
 * @returns {string} 'image' | 'video' | 'audio' | 'doc' | 'other'
 */
export function getFileType(ext) {
  if (!ext) return 'other'
  const e = ext.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(e)) return 'image'
  if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(e)) return 'video'
  if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(e)) return 'audio'
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(e)) return 'doc'
  return 'other'
}

/**
 * 根据扩展名返回文件图标emoji
 */
export function getFileIcon(ext) {
  const type = getFileType(ext)
  switch (type) {
    case 'image': return '🖼️'
    case 'video': return '🎬'
    case 'audio': return '🎵'
    case 'doc': return '📄'
    default: return '📎'
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

/**
 * 从路径中提取扩展名
 */
export function getExtFromPath(path) {
  if (!path) return ''
  const match = path.match(/\.([^.]+)$/)
  return match ? match[1] : ''
}

/**
 * 从路径中提取文件名
 */
export function getFileNameFromPath(path) {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * 上传单个文件
 * @param {string} filePath - 本地文件路径
 * @param {Function} onProgress - 进度回调 (percent)
 * @returns {Promise<{url: string}>}
 */
export function uploadFile(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    const baseUrl = app.globalData.baseUrl
    if (!baseUrl) {
      reject(new Error('baseUrl 未设置'))
      return
    }

    const token = app.globalData.token
    const header = {}
    if (token) {
      header['Authorization'] = 'Bearer ' + token
    }

    const uploadTask = wx.uploadFile({
      url: baseUrl + '/api/upload',
      filePath,
      name: 'file',
      header,
      success(res) {
        try {
          const data = JSON.parse(res.data)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data)
          } else {
            reject(new Error(data?.error || data?.message || `上传失败 ${res.statusCode}`))
          }
        } catch (e) {
          reject(new Error('解析上传结果失败'))
        }
      },
      fail(err) {
        reject(err)
      }
    })

    if (onProgress && uploadTask.onProgressUpdate) {
      uploadTask.onProgressUpdate((res) => {
        onProgress(res.progress)
      })
    }
  })
}
