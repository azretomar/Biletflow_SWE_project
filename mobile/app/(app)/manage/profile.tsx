import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Notice } from '@/components/Notice';
import { Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import type { OrganizerProfile } from '@/lib/types';

export default function OrganizerProfileScreen() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setProfile(await api<OrganizerProfile>('/organizer/profile'));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setProfile(await api<OrganizerProfile>('/organizer/profile', { method: 'PUT', body: profile }));
      setNotice(t('orgProfile.saved'));
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  if (!profile && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!profile) return <Loading />;

  const set = (patch: Partial<OrganizerProfile>) => setProfile((p) => (p ? { ...p, ...patch } : p));
  const setPayout = (patch: Partial<OrganizerProfile['payout']>) =>
    setProfile((p) => (p ? { ...p, payout: { ...p.payout, ...patch } } : p));

  return (
    <Screen>
      <Muted>{t('orgProfile.intro')}</Muted>
      <Heading>{t('orgProfile.publicTitle')}</Heading>
      <Field label={t('orgProfile.displayName')} value={profile.display_name} onChangeText={(v) => set({ display_name: v })} />
      <Field label={t('orgProfile.bio')} value={profile.bio} onChangeText={(v) => set({ bio: v })} multiline />
      <Field
        label={t('orgProfile.contactEmail')}
        value={profile.contact_email}
        onChangeText={(v) => set({ contact_email: v })}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field label={t('orgProfile.phone')} value={profile.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
      <Field label={t('orgProfile.website')} value={profile.website} onChangeText={(v) => set({ website: v })} autoCapitalize="none" keyboardType="url" />
      <Field label={t('orgProfile.city')} value={profile.city} onChangeText={(v) => set({ city: v })} />

      <Heading>{t('orgProfile.payoutTitle')}</Heading>
      <Field label={t('orgProfile.holder')} value={profile.payout.holder_name} onChangeText={(v) => setPayout({ holder_name: v })} />
      <Field label={t('orgProfile.bank')} value={profile.payout.bank_name} onChangeText={(v) => setPayout({ bank_name: v })} />
      <Field label={t('orgProfile.iban')} value={profile.payout.iban} onChangeText={(v) => setPayout({ iban: v })} autoCapitalize="characters" />
      <Field label={t('orgProfile.binIin')} value={profile.payout.bin_iin} onChangeText={(v) => setPayout({ bin_iin: v })} keyboardType="number-pad" />

      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>
      <Button title={t('common.save')} onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
