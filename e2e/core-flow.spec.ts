import { test, expect } from '@playwright/test'

/**
 * 核心闭环：登录 → 新建项目 → 编辑器保存 → 刷新重开 → 小说剧场。
 *
 * 只依赖 UI 文本与稳定 id（#create-name / #script-synopsis），
 * 不依赖 mock 数据的具体条数。
 */
test('登录 → 新建项目 → 编辑器保存重开 → 小说详情', async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `e2e-${suffix}@example.com`
  // 每次运行生成一次性凭据，不提交任何固定口令。
  const credential = `pw-${suffix}`
  const username = `e2e_${suffix.replace(/[^a-z0-9]/gi, '').slice(0, 16)}`

  const register = await request.post('/api/auth/register', {
    data: { username, email, password: credential },
  })
  expect(register.status(), '注册测试账号').toBe(201)

  // 1) 登录
  await page.goto('/login')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(credential)
  await page.locator('form').getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.dr-page').first()).toBeVisible()

  // 2) 项目库 → 新建项目
  const projectName = `E2E 项目 ${suffix}`
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: /项目库|Projects/ })).toBeVisible()
  await page.getByRole('button', { name: /新建项目|New project/ }).first().click()
  await page.locator('#create-name').fill(projectName)
  await page.getByRole('button', { name: /创建项目|Create project/ }).click()

  await expect(page).toHaveURL(/\/project\/[^/]+/)
  const projectUrl = page.url()

  // 3) 编辑器：空剧本先手动添加场次，再填写梗概并保存
  await expect(page.locator('#script-synopsis')).toHaveCount(0)
  await page.getByRole('button', { name: /手动添加场次|Add scene manually/ }).click()
  await expect(page.locator('#script-synopsis')).toBeVisible()

  const synopsis = `E2E 保存校验 ${suffix}`
  await page.locator('#script-synopsis').fill(synopsis)
  await page.getByRole('button', { name: /保存剧本|Save script/ }).click()
  await expect(page.getByText(/已保存|Saved/).first()).toBeVisible()

  // 4) 刷新重开：内容必须从服务端重新加载出来
  await page.reload()
  await expect(page.locator('#script-synopsis')).toHaveValue(synopsis)

  // 5) 小说剧场：列表 → 详情
  await page.goto('/novels')
  await expect(page.getByText('殖装').first()).toBeVisible()
  await page.getByText('殖装').first().click()
  await expect(page).toHaveURL(/\/novel\//)

  // 6) 回到项目库，新项目仍在
  await page.goto('/projects')
  await expect(page.getByText(projectName).first()).toBeVisible()

  expect(projectUrl).toMatch(/\/project\//)
})
