import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authService } from '../src/services/authService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_USER = {
  username: '测试用户',
  email: 'test@example.com',
  password: 'password123',
}

// 清理可能残留的测试用户
if (storageService.data.users) {
  for (const [uid, u] of Object.entries(storageService.data.users)) {
    if (u.email === TEST_USER.email) {
      delete storageService.data.users[uid]
    }
  }
  storageService.save()
}

test('authService: register should create a user and return token', () => {
  const result = authService.register(TEST_USER)
  assert.ok(result.user.id)
  assert.equal(result.user.username, '测试用户')
  assert.equal(result.user.email, 'test@example.com')
  assert.ok(result.token)
  assert.ok(result.expiresIn > 0)
  // 不应该返回密码哈希
  assert.equal(result.user.passwordHash, undefined)
})

test('authService: register should reject duplicate email', () => {
  assert.throws(() => {
    authService.register({
      username: '另一个用户',
      email: 'test@example.com',
      password: 'anotherpass',
    })
  }, /已被注册/)
})

test('authService: register should reject short username', () => {
  assert.throws(() => {
    authService.register({ username: 'a', email: 'a@b.com', password: '123456' })
  }, /用户名至少/)
})

test('authService: register should reject short password', () => {
  assert.throws(() => {
    authService.register({ username: '用户', email: 'short@b.com', password: '123' })
  }, /密码至少/)
})

test('authService: login should succeed with correct credentials', () => {
  const result = authService.login({
    email: 'test@example.com',
    password: 'password123',
  })
  assert.ok(result.token)
  assert.equal(result.user.email, 'test@example.com')
})

test('authService: login should fail with wrong password', () => {
  assert.throws(() => {
    authService.login({ email: 'test@example.com', password: 'wrongpassword' })
  }, /邮箱或密码错误/)
})

test('authService: login should fail with nonexistent email', () => {
  assert.throws(() => {
    authService.login({ email: 'nonexistent@example.com', password: 'password123' })
  }, /邮箱或密码错误/)
})

test('authService: verifyToken should return user for valid token', () => {
  const { token, user } = authService.login({
    email: 'test@example.com',
    password: 'password123',
  })
  const verified = authService.verifyToken(token)
  assert.ok(verified)
  assert.equal(verified.id, user.id)
  assert.equal(verified.username, '测试用户')
})

test('authService: verifyToken should return null for invalid token', () => {
  const result = authService.verifyToken('invalid.token.here')
  assert.equal(result, null)
})

test('authService: getUserById should return user', () => {
  const { user } = authService.login({
    email: 'test@example.com',
    password: 'password123',
  })
  const found = authService.getUserById(user.id)
  assert.ok(found)
  assert.equal(found.username, '测试用户')
})

test('authService: getUserById should return null for nonexistent user', () => {
  const result = authService.getUserById('nonexistent-id')
  assert.equal(result, null)
})
