-- 012 兼容过渡：legacy 写路径暂不填 logical_key，空值不参与唯一约束。
DROP INDEX IF EXISTS episodes_novel_logical_uq;
CREATE UNIQUE INDEX IF NOT EXISTS episodes_novel_logical_uq
  ON episodes (novel_id, logical_key)
  WHERE deleted_at IS NULL AND logical_key <> '';
