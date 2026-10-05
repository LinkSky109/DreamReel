/**
 * 多语言支持模块
 * 支持中文（zh）和英文（en）
 */

const translations = {
  zh: {
    // 通用
    appName: '梦卷',
    appTagline: 'AI 短片创作平台',
    loading: '加载中...',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    confirm: '确认',
    close: '关闭',
    search: '搜索',
    all: '全部',
    none: '无',
    yes: '是',
    no: '否',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    submit: '提交',
    reset: '重置',
    export: '导出',
    import: '导入',
    copy: '复制',
    duplicate: '复制项目',
    archive: '归档',
    unarchive: '取消归档',
    favorite: '收藏',
    unfavorite: '取消收藏',
    selectAll: '全选',
    deselectAll: '取消全选',
    batchDelete: '批量删除',
    batchArchive: '批量归档',
    batchFavorite: '批量收藏',
    selectedCount: '已选择 {count} 个项目',
    selectMode: '多选',
    exitSelectMode: '退出多选',

    // 导航
    navProjects: '我的项目',
    navStats: '统计',
    navPricing: '订阅',
    navDocs: 'API 文档',
    navLogin: '登录',
    navRegister: '注册',
    navLogout: '退出登录',
    navUpgrade: '升级 Pro',

    // 项目列表
    myProjects: '我的项目',
    newProject: '新建项目',
    projectName: '项目名称',
    projectDescription: '项目描述',
    targetDuration: '目标时长',
    style: '风格',
    platform: '平台',
    createProject: '创建项目',
    noProjects: '还没有项目，点击上方按钮创建第一个项目吧',
    projectCount: '共 {count} 个项目',
    searchPlaceholder: '搜索项目名称...',
    importProject: '导入项目',
    importSuccess: '项目导入成功',
    importFailed: '项目导入失败',

    // 筛选
    filterStatus: '状态',
    filterStyle: '风格',
    filterPlatform: '平台',
    filterTag: '标签',
    filterFavorite: '收藏',
    filterArchived: '归档',
    filterSort: '排序',
    statusAll: '全部状态',
    statusInProgress: '进行中',
    statusCompleted: '已完成',
    statusEmpty: '未开始',
    styleAll: '全部风格',
    platformAll: '全部平台',
    platformLandscape: '横屏 16:9',
    platformPortrait: '竖屏 9:16',
    platformSquare: '方形 1:1',
    tagAll: '全部标签',
    favoriteAll: '全部项目',
    favoriteOnly: '⭐ 仅收藏',
    archivedActive: '活跃项目',
    archivedOnly: '📦 已归档',
    archivedAll: '全部（含归档）',
    sortUpdated: '最近更新',
    sortCreated: '最近创建',
    sortName: '名称排序',

    // 项目状态
    statusEmpty: '未开始',
    statusInProgress: '进行中',
    statusCompleted: '已完成',
    progress: '进度',

    // 编辑器
    editorTabs: {
      script: '剧本',
      images: '图片',
      video: '视频',
      audio: '音频',
      edit: '剪辑',
      characters: '角色',
      shots: '镜头',
      dubbing: '配音字幕',
      analysis: 'AI 影评',
      collaboration: '协作',
      versions: '版本',
    },
    generateScript: '生成剧本',
    generatingScript: '正在生成剧本...',
    scriptGenerated: '剧本生成成功',
    scriptIdea: '输入你的想法，AI 帮你生成完整剧本',
    scriptPlaceholder: '例如：一个关于未来城市的科幻短片',
    generateVideo: '生成视频',
    batchGenerate: '批量生成',
    generatingVideo: '正在生成视频...',
    exportVideo: '导出成片',
    exporting: '正在导出...',
    exportSuccess: '导出成功',
    exportFailed: '导出失败',
    saveVersion: '保存版本',
    versionSaved: '版本已保存',
    rollback: '回滚',
    rollbackSuccess: '已回滚到该版本',

    // 角色
    addCharacter: '添加角色',
    characterName: '角色名称',
    characterDescription: '角色描述',
    characterAppearance: '外貌特征',
    referenceImages: '参考图',
    lockCharacter: '锁定角色',
    unlockCharacter: '解锁角色',

    // 镜头
    shotDescription: '镜头描述',
    shotDialogue: '台词',
    shotNarration: '旁白',
    shotDuration: '时长（秒）',
    shotType: '镜头类型',
    cameraMovement: '运镜',
    shotStatus: '状态',
    statusPending: '待生成',
    statusProcessing: '生成中',
    statusCompleted: '已完成',
    statusFailed: '失败',

    // 配音
    generateDubbing: '生成配音',
    generatingDubbing: '正在生成配音...',
    voice: '音色',
    language: '语言',
    subtitle: '字幕',
    autoSubtitle: '自动生成字幕',

    // 影评
    analyzeFilm: 'AI 影评分析',
    analyzing: '正在分析...',
    overallScore: '综合评分',
    cinematography: '镜头语言',
    narrative: '叙事结构',
    pacing: '节奏控制',
    consistency: '角色一致性',
    strengths: '优点',
    weaknesses: '不足',
    suggestions: '改进建议',
    shotByShot: '逐镜点评',

    // 协作
    comments: '评论',
    addComment: '添加评论',
    activities: '活动记录',
    share: '分享',
    shareProject: '分享项目',
    publicAccess: '公开访问',
    privateAccess: '私有',
    copyLink: '复制链接',
    linkCopied: '链接已复制',

    // 认证
    login: '登录',
    register: '注册',
    username: '用户名',
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    loginSuccess: '登录成功',
    registerSuccess: '注册成功',
    loginFailed: '登录失败',
    registerFailed: '注册失败',
    noAccount: '还没有账号？',
    haveAccount: '已有账号？',
    logoutSuccess: '已退出登录',

    // 订阅
    pricing: '订阅计划',
    monthly: '月付',
    yearly: '年付',
    currentPlan: '当前计划',
    upgrade: '升级',
    downgrade: '降级',
    cancel: '取消订阅',
    resume: '恢复订阅',
    free: '免费',
    basic: '基础',
    pro: '专业',
    enterprise: '企业',
    perMonth: '/月',
    perYear: '/年',
    videoGenerations: '视频生成次数',
    maxDuration: '最大时长',
    maxResolution: '最大分辨率',
    maxCharacters: '最大角色数',
    dubbingMinutes: '配音时长',
    maxProjects: '最大项目数',
    watermark: '水印',
    noWatermark: '无水印',
    priorityQueue: '优先队列',
    collaboration: '协作权限',
    demoPayment: '演示支付（不会真实扣费）',
    cardNumber: '卡号',
    expiryDate: '有效期',
    cvv: 'CVV',
    subscribeSuccess: '订阅成功',
    subscribeFailed: '订阅失败',

    // 统计
    dashboard: '数据仪表盘',
    totalProjects: '项目总数',
    completedProjects: '已完成项目',
    totalShots: '镜头总数',
    completedShots: '已完成镜头',
    totalDuration: '总时长',
    videoGenerated: '已生成视频',
    usageTrend: '创作趋势',
    styleDistribution: '风格分布',
    platformDistribution: '平台分布',
    quotaUsage: '额度使用',
    recentProjects: '最近项目',
    completionRate: '完成率',

    // 通知
    notifications: '通知',
    markAllRead: '全部已读',
    noNotifications: '暂无通知',
    videoCompleted: '视频生成完成',
    videoFailed: '视频生成失败',
    scriptCompleted: '剧本生成完成',
    exportCompleted: '导出完成',
    exportFailed: '导出失败',
    analysisCompleted: '影评分析完成',
    collaborationNotification: '协作通知',
    systemNotification: '系统通知',

    // 快捷键
    shortcuts: '快捷键',
    shortcutsHelp: '快捷键帮助',
    newProject: '新建项目',
    focusSearch: '聚焦搜索',
    goHome: '回到首页',
    goStats: '统计页面',
    goPricing: '订阅页面',
    saveVersion: '保存版本',
    exportVideo: '导出视频',
    generateScript: '生成剧本',
    batchGenerate: '批量生成',
    switchTab: '切换标签页',
    closeModal: '关闭弹窗',

    // 主题
    darkMode: '暗色模式',
    lightMode: '亮色模式',
    switchTheme: '切换主题',

    // 语言
    language: '语言',
    chinese: '中文',
    english: 'English',

    // 额度
    quota: '额度',
    videoQuota: '视频生成',
    dubbingQuota: '配音时长',
    quotaReset: '额度重置',
    upgradeForMore: '升级获取更多额度',

    // 模板
    templates: '模板',
    useTemplate: '使用模板',
    customize: '定制',
    templateName: '模板名称',
    templateDescription: '模板描述',

    // 风格
    styles: '风格',
    stylePreview: '风格预览',
    noStyle: '无风格',

    // 版本
    versions: '版本历史',
    version: '版本',
    autoSaved: '自动保存',
    manuallySaved: '手动保存',
    noVersions: '暂无版本记录',
    rollbackConfirm: '确定回滚到该版本吗？当前修改会丢失。',

    // 内容审核
    contentModeration: '内容审核',
    contentPassed: '内容通过审核',
    contentWarning: '内容存在风险',
    contentRejected: '内容被拒绝',
    moderationResult: '审核结果',

    // 错误
    error: '错误',
    errorOccurred: '发生错误',
    networkError: '网络错误',
    serverError: '服务器错误',
    notFound: '未找到',
    permissionDenied: '权限不足',
    quotaExceeded: '额度已用完',
    pleaseUpgrade: '请升级订阅',

    // 确认
    confirmDelete: '确定删除这个项目吗？关联的视频和音频文件也会被清理。',
    confirmBatchDelete: '确定删除选中的 {count} 个项目吗？关联的视频和音频文件也会被清理。',
    confirmArchive: '确定归档这个项目吗？',
    confirmRollback: '确定回滚到该版本吗？',

    // 成功
    success: '成功',
    saved: '已保存',
    deleted: '已删除',
    archived: '已归档',
    unarchived: '已取消归档',
    favorited: '已收藏',
    unfavorited: '已取消收藏',
    duplicated: '已复制',
    updated: '已更新',
  },

  en: {
    // Common
    appName: 'DreamReel',
    appTagline: 'AI Short Film Creation Platform',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    confirm: 'Confirm',
    close: 'Close',
    search: 'Search',
    all: 'All',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    submit: 'Submit',
    reset: 'Reset',
    export: 'Export',
    import: 'Import',
    copy: 'Copy',
    duplicate: 'Duplicate',
    archive: 'Archive',
    unarchive: 'Unarchive',
    favorite: 'Favorite',
    unfavorite: 'Unfavorite',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    batchDelete: 'Batch Delete',
    batchArchive: 'Batch Archive',
    batchFavorite: 'Batch Favorite',
    selectedCount: '{count} items selected',
    selectMode: 'Select',
    exitSelectMode: 'Exit Select',

    // Navigation
    navProjects: 'My Projects',
    navStats: 'Stats',
    navPricing: 'Pricing',
    navDocs: 'API Docs',
    navLogin: 'Login',
    navRegister: 'Register',
    navLogout: 'Logout',
    navUpgrade: 'Upgrade Pro',

    // Project list
    myProjects: 'My Projects',
    newProject: 'New Project',
    projectName: 'Project Name',
    projectDescription: 'Description',
    targetDuration: 'Target Duration',
    style: 'Style',
    platform: 'Platform',
    createProject: 'Create Project',
    noProjects: 'No projects yet. Click the button above to create your first project.',
    projectCount: '{count} projects',
    searchPlaceholder: 'Search projects...',
    importProject: 'Import Project',
    importSuccess: 'Project imported successfully',
    importFailed: 'Failed to import project',

    // Filters
    filterStatus: 'Status',
    filterStyle: 'Style',
    filterPlatform: 'Platform',
    filterTag: 'Tag',
    filterFavorite: 'Favorite',
    filterArchived: 'Archive',
    filterSort: 'Sort',
    statusAll: 'All Status',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
    statusEmpty: 'Not Started',
    styleAll: 'All Styles',
    platformAll: 'All Platforms',
    platformLandscape: 'Landscape 16:9',
    platformPortrait: 'Portrait 9:16',
    platformSquare: 'Square 1:1',
    tagAll: 'All Tags',
    favoriteAll: 'All Projects',
    favoriteOnly: '⭐ Favorites Only',
    archivedActive: 'Active',
    archivedOnly: '📦 Archived',
    archivedAll: 'All (incl. archived)',
    sortUpdated: 'Recently Updated',
    sortCreated: 'Recently Created',
    sortName: 'Name',

    // Project status
    statusEmpty: 'Not Started',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
    progress: 'Progress',

    // Editor
    editorTabs: {
      script: 'Script',
      images: 'Images',
      video: 'Video',
      audio: 'Audio',
      edit: 'Edit',
      characters: 'Characters',
      shots: 'Shots',
      dubbing: 'Dubbing',
      analysis: 'AI Review',
      collaboration: 'Collab',
      versions: 'Versions',
    },
    generateScript: 'Generate Script',
    generatingScript: 'Generating script...',
    scriptGenerated: 'Script generated',
    scriptIdea: 'Enter your idea, AI will generate a complete script',
    scriptPlaceholder: 'e.g., A sci-fi short film about a future city',
    generateVideo: 'Generate Video',
    batchGenerate: 'Batch Generate',
    generatingVideo: 'Generating video...',
    exportVideo: 'Export',
    exporting: 'Exporting...',
    exportSuccess: 'Export successful',
    exportFailed: 'Export failed',
    saveVersion: 'Save Version',
    versionSaved: 'Version saved',
    rollback: 'Rollback',
    rollbackSuccess: 'Rolled back to this version',

    // Characters
    addCharacter: 'Add Character',
    characterName: 'Name',
    characterDescription: 'Description',
    characterAppearance: 'Appearance',
    referenceImages: 'Reference Images',
    lockCharacter: 'Lock',
    unlockCharacter: 'Unlock',

    // Shots
    shotDescription: 'Description',
    shotDialogue: 'Dialogue',
    shotNarration: 'Narration',
    shotDuration: 'Duration (s)',
    shotType: 'Shot Type',
    cameraMovement: 'Camera Movement',
    shotStatus: 'Status',
    statusPending: 'Pending',
    statusProcessing: 'Processing',
    statusCompleted: 'Completed',
    statusFailed: 'Failed',

    // Dubbing
    generateDubbing: 'Generate Dubbing',
    generatingDubbing: 'Generating dubbing...',
    voice: 'Voice',
    language: 'Language',
    subtitle: 'Subtitle',
    autoSubtitle: 'Auto Subtitle',

    // Film analysis
    analyzeFilm: 'AI Film Analysis',
    analyzing: 'Analyzing...',
    overallScore: 'Overall Score',
    cinematography: 'Cinematography',
    narrative: 'Narrative',
    pacing: 'Pacing',
    consistency: 'Consistency',
    strengths: 'Strengths',
    weaknesses: 'Weaknesses',
    suggestions: 'Suggestions',
    shotByShot: 'Shot-by-Shot',

    // Collaboration
    comments: 'Comments',
    addComment: 'Add Comment',
    activities: 'Activities',
    share: 'Share',
    shareProject: 'Share Project',
    publicAccess: 'Public',
    privateAccess: 'Private',
    copyLink: 'Copy Link',
    linkCopied: 'Link copied',

    // Auth
    login: 'Login',
    register: 'Register',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    loginSuccess: 'Login successful',
    registerSuccess: 'Registration successful',
    loginFailed: 'Login failed',
    registerFailed: 'Registration failed',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    logoutSuccess: 'Logged out',

    // Pricing
    pricing: 'Pricing',
    monthly: 'Monthly',
    yearly: 'Yearly',
    currentPlan: 'Current Plan',
    upgrade: 'Upgrade',
    downgrade: 'Downgrade',
    cancel: 'Cancel',
    resume: 'Resume',
    free: 'Free',
    basic: 'Basic',
    pro: 'Pro',
    enterprise: 'Enterprise',
    perMonth: '/mo',
    perYear: '/yr',
    videoGenerations: 'Video Generations',
    maxDuration: 'Max Duration',
    maxResolution: 'Max Resolution',
    maxCharacters: 'Max Characters',
    dubbingMinutes: 'Dubbing Minutes',
    maxProjects: 'Max Projects',
    watermark: 'Watermark',
    noWatermark: 'No Watermark',
    priorityQueue: 'Priority Queue',
    collaboration: 'Collaboration',
    demoPayment: 'Demo Payment (no real charge)',
    cardNumber: 'Card Number',
    expiryDate: 'Expiry',
    cvv: 'CVV',
    subscribeSuccess: 'Subscribed successfully',
    subscribeFailed: 'Subscription failed',

    // Stats
    dashboard: 'Dashboard',
    totalProjects: 'Total Projects',
    completedProjects: 'Completed Projects',
    totalShots: 'Total Shots',
    completedShots: 'Completed Shots',
    totalDuration: 'Total Duration',
    videoGenerated: 'Videos Generated',
    usageTrend: 'Usage Trend',
    styleDistribution: 'Style Distribution',
    platformDistribution: 'Platform Distribution',
    quotaUsage: 'Quota Usage',
    recentProjects: 'Recent Projects',
    completionRate: 'Completion Rate',

    // Notifications
    notifications: 'Notifications',
    markAllRead: 'Mark All Read',
    noNotifications: 'No notifications',
    videoCompleted: 'Video completed',
    videoFailed: 'Video failed',
    scriptCompleted: 'Script completed',
    exportCompleted: 'Export completed',
    exportFailed: 'Export failed',
    analysisCompleted: 'Analysis completed',
    collaborationNotification: 'Collaboration',
    systemNotification: 'System',

    // Shortcuts
    shortcuts: 'Shortcuts',
    shortcutsHelp: 'Keyboard Shortcuts',
    newProject: 'New Project',
    focusSearch: 'Focus Search',
    goHome: 'Go Home',
    goStats: 'Stats',
    goPricing: 'Pricing',
    saveVersion: 'Save Version',
    exportVideo: 'Export Video',
    generateScript: 'Generate Script',
    batchGenerate: 'Batch Generate',
    switchTab: 'Switch Tab',
    closeModal: 'Close Modal',

    // Theme
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    switchTheme: 'Switch Theme',

    // Language
    language: 'Language',
    chinese: '中文',
    english: 'English',

    // Quota
    quota: 'Quota',
    videoQuota: 'Video Generation',
    dubbingQuota: 'Dubbing',
    quotaReset: 'Quota Reset',
    upgradeForMore: 'Upgrade for more quota',

    // Templates
    templates: 'Templates',
    useTemplate: 'Use Template',
    customize: 'Customize',
    templateName: 'Template Name',
    templateDescription: 'Description',

    // Styles
    styles: 'Styles',
    stylePreview: 'Style Preview',
    noStyle: 'No Style',

    // Versions
    versions: 'Version History',
    version: 'Version',
    autoSaved: 'Auto-saved',
    manuallySaved: 'Manually saved',
    noVersions: 'No versions yet',
    rollbackConfirm: 'Rollback to this version? Current changes will be lost.',

    // Content moderation
    contentModeration: 'Content Moderation',
    contentPassed: 'Content passed',
    contentWarning: 'Content warning',
    contentRejected: 'Content rejected',
    moderationResult: 'Moderation Result',

    // Errors
    error: 'Error',
    errorOccurred: 'An error occurred',
    networkError: 'Network error',
    serverError: 'Server error',
    notFound: 'Not found',
    permissionDenied: 'Permission denied',
    quotaExceeded: 'Quota exceeded',
    pleaseUpgrade: 'Please upgrade',

    // Confirm
    confirmDelete: 'Delete this project? Associated video and audio files will also be cleaned up.',
    confirmBatchDelete: 'Delete {count} selected projects? Associated files will also be cleaned up.',
    confirmArchive: 'Archive this project?',
    confirmRollback: 'Rollback to this version?',

    // Success
    success: 'Success',
    saved: 'Saved',
    deleted: 'Deleted',
    archived: 'Archived',
    unarchived: 'Unarchived',
    favorited: 'Favorited',
    unfavorited: 'Unfavorited',
    duplicated: 'Duplicated',
    updated: 'Updated',
  },
}

let currentLang = 'zh'
try {
  currentLang = localStorage.getItem('dreamreel-lang') || 'zh'
} catch (e) {
  // localStorage 不可用时使用默认值
}

function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang
    try {
      localStorage.setItem('dreamreel-lang', lang)
    } catch (e) {
      // localStorage 不可用时跳过
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
    return true
  }
  return false
}

function getLanguage() {
  return currentLang
}

function t(key, params = {}) {
  const keys = key.split('.')
  let value = translations[currentLang]
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k]
    } else {
      value = undefined
      break
    }
  }
  if (value === undefined) {
    // Fallback to Chinese
    value = translations.zh
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k]
      } else {
        return key
      }
    }
  }
  if (typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
  }
  return value
}

function getAvailableLanguages() {
  return Object.keys(translations).map((code) => ({
    code,
    name: translations[code].language,
    nativeName: code === 'zh' ? '中文' : 'English',
  }))
}

export const i18n = {
  setLanguage,
  getLanguage,
  t,
  getAvailableLanguages,
}

export default i18n
