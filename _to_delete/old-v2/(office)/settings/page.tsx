import { requireCtx } from '@/lib/session';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/format';
import { categories, fleet, sizesWithRates } from '@/lib/data/queries';
import { PageHeader } from '@/components/ui/core';
import { LanguageSwitcher } from '@/components/language-switcher';
import { BusinessSection, CategoriesSection, FleetSection, SizesSection, UsersSection } from '@/components/settings/settings-client';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await requireCtx({ office: true });
  const { t } = await getT();
  const owner = ctx.role === 'owner';
  const lang = (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <h2 className="text-lg font-semibold">{t('c.language')}</h2><LanguageSwitcher />
    </section>
  );
  if (!owner) return <div className="mx-auto max-w-2xl space-y-4"><PageHeader title={t('nav.settings')} />{lang}</div>;

  const supabase = await createClient();
  const today = todayIST();
  const [{ data: biz }, { data: rawSizes }, sale, purchase, f, { data: members }, cats] = await Promise.all([
    supabase.from('businesses').select('name, phone, email, address, gstin, settings').eq('id', ctx.businessId).single(),
    supabase.from('bird_sizes').select('id, name, name_mr, name_hi, sort_order, active').eq('business_id', ctx.businessId).order('sort_order'),
    sizesWithRates(ctx, 'SALE', today), sizesWithRates(ctx, 'PURCHASE', today), fleet(ctx),
    supabase.from('business_members').select('user_id, display_name, role, permissions, active').eq('business_id', ctx.businessId).order('created_at'),
    categories(ctx),
  ]);
  const sizes = (rawSizes ?? []).map((s) => ({ ...s, sale: sale.find((x) => x.id === s.id)?.rate ?? null, purchase: purchase.find((x) => x.id === s.id)?.rate ?? null }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t('nav.settings')} />
      {lang}
      {biz && <BusinessSection biz={biz} />}
      <SizesSection sizes={sizes} today={today} />
      <FleetSection vehicles={f.vehicles as any} drivers={f.drivers} />
      <UsersSection members={(members ?? []) as any} me={ctx.userId} serviceKey={!!process.env.SUPABASE_SERVICE_ROLE_KEY} />
      <CategoriesSection cats={cats} />
    </div>
  );
}
