-- 013 删除小说域 legacy outbox（写路径已直接写 PG）
-- 009_outbox.sql 保留不动；本迁移只移除已无生产者的表。
DROP TABLE IF EXISTS outbox_events;
