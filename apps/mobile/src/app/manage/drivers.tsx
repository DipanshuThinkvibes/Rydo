import { useState } from 'react';
import { api, errText } from '@/lib/api';
import type { DriverForReview } from '@/lib/driver-signup';
import { useData } from '@/lib/hooks';
import { DriverReviewCard } from '@/components/driver-review-card';
import { ManageScreen } from '@/components/manage-screen';
import { Chip, ChipRow, Empty, Loading, Notice } from '@/components/ui';

const TABS = [
  { key: 'PENDING', label: 'Needs review' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'REJECTED', label: 'Waiting for re-upload' },
  { key: '', label: 'All drivers' },
] as const;

/** Web Admin → Drivers, with our Uber-style review card (checklist, every document, records checks, verify). */
export default function ManageDrivers() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('PENDING');
  const { data: rows, reload, error } = useData(() => api<DriverForReview[]>('GET', `/admin/drivers${tab ? `?status=${tab}` : ''}`), [tab]);
  return (
    <ManageScreen title="Drivers" sub="Check each driver's licence, vehicle papers and photos before they can offer rides. Every document you open is logged." roles={['ORG_ADMIN', 'HR_ADMIN']} onRefresh={reload}>
      <ChipRow>
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </ChipRow>
      {error && !rows ? <Notice tone="error">{errText(error, 'Could not load drivers.')}</Notice> : null}
      {!rows && !error ? <Loading /> : null}
      {rows?.length === 0 ? <Empty title={tab === 'PENDING' ? 'Nothing to review' : 'No drivers here'}>{tab === 'PENDING' ? 'New driver documents will appear here.' : undefined}</Empty> : null}
      {rows?.map((d) => <DriverReviewCard key={d.id} driver={d} onChanged={reload} />)}
    </ManageScreen>
  );
}
