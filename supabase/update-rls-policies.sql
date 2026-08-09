-- ============================================================
-- JOYZWORK 安全策略更新 — 将 RLS 从 allow_all 改为仅认证用户
-- 在 Supabase Dashboard > SQL Editor 中执行此文件
-- 执行前请确保已在 Authentication > Users 中创建了你的账号
-- ============================================================

-- ===== 1. joyzwork_data 表：仅认证用户可读写 =====

-- 删除旧的宽松策略
drop policy if exists "allow_all" on joyzwork_data;

-- 创建新的认证策略
create policy "auth_read" on joyzwork_data
  for select using (auth.role() = 'authenticated');

create policy "auth_insert" on joyzwork_data
  for insert with check (auth.role() = 'authenticated');

create policy "auth_update" on joyzwork_data
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_delete" on joyzwork_data
  for delete using (auth.role() = 'authenticated');

-- ===== 2. push_subscriptions 表：仅认证用户可读写 =====

-- 删除旧的宽松策略
drop policy if exists "allow_all_push" on push_subscriptions;

-- 创建新的认证策略
create policy "auth_push_read" on push_subscriptions
  for select using (auth.role() = 'authenticated');

create policy "auth_push_insert" on push_subscriptions
  for insert with check (auth.role() = 'authenticated');

create policy "auth_push_update" on push_subscriptions
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_push_delete" on push_subscriptions
  for delete using (auth.role() = 'authenticated');

-- ===== 3. 验证策略已生效 =====
select tablename, policyname, cmd, qual from pg_policies
  where schemaname = 'public' and tablename in ('joyzwork_data', 'push_subscriptions');

-- ============================================================
-- 使用说明：
-- 1. 先在 Supabase Dashboard > Authentication > Users 中创建你的账号
-- 2. 然后执行此 SQL 更新安全策略
-- 3. 之后在 JOYZWORK 登录页面用邮箱密码登录
-- 4. 未登录状态下，云端数据将无法读写（受 RLS 保护）
--
-- 注意：Edge Function 使用 service_role_key，不受 RLS 限制，仍可正常推送
-- ============================================================
