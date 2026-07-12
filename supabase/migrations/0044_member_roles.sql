-- Team roles: rename the membership vocabulary from owner/staff to
-- admin/employee. The account creator is an admin; app code enforces that every
-- account always keeps at least one admin (no lockout).
alter table public.operator_members drop constraint if exists operator_members_role_check;
update public.operator_members set role = 'admin' where role = 'owner';
update public.operator_members set role = 'employee' where role = 'staff';
alter table public.operator_members alter column role set default 'admin';
alter table public.operator_members
  add constraint operator_members_role_check check (role in ('admin', 'employee'));
