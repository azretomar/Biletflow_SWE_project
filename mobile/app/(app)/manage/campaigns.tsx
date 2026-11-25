import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/Badge';
import { Chips } from '@/components/Chips';
import { Notice } from '@/components/Notice';
import { Card, Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api, WEB_URL } from '@/lib/api';
import { dayLabel } from '@/components/dayLabel';
import { formatKzt, fromDateInput, toDateInput } from '@/lib/format';
import type { Campaign, OrganizerEvent } from '@/lib/types';

// The campaign QR opens the event page with the code applied (SRS 4.14). It carries only an
// opaque code, never a price, and the scanner rejects it as an entry ticket.
function campaignLink(c: Campaign): string {
  return c.qr_url || `${WEB_URL}/events/${c.event_id ?? ''}?promo=${encodeURIComponent(c.code)}`;
}

// Promo campaigns (package 2-2, SRS 4.14): GET/POST /api/organizer/campaigns,
// PATCH /api/organizer/campaigns/{id} { disabled }.
export default function CampaignsScreen() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [listError, setListError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [list, evs] = await Promise.all([api<Campaign[]>('/organizer/campaigns'), api<OrganizerEvent[]>('/organizer/events')]);
      setCampaigns(list);
      setEvents(evs.filter((e) => e.status !== 'cancelled'));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggle(c: Campaign) {
    setListError('');
    try {
      await api(`/organizer/campaigns/${c.id}`, { method: 'PATCH', body: { disabled: !c.disabled } });
      await load();
    } catch (err) {
      setListError(errorText(err));
    }
  }

  if (!campaigns && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!campaigns) return <Loading />;

  return (
    <Screen>
      <Muted>{t('campaigns.intro')}</Muted>
      <Notice>{notice}</Notice>
      {creating ? (
        <NewCampaign
          events={events}
          onCancel={() => setCreating(false)}
          onCreated={async (c) => {
            setCreating(false);
            setNotice(t('campaigns.created', { code: c.code }));
            setQrFor(c.id);
            await load();
          }}
        />
      ) : (
        <Button title={t('campaigns.new')} onPress={() => setCreating(true)} disabled={events.length === 0} />
      )}

      <ErrorText>{listError}</ErrorText>
      {campaigns.length === 0 ? <Muted>{t('campaigns.empty')}</Muted> : null}
      {campaigns.map((c) => (
        <Card key={c.id}>
          <View style={styles.head}>
            <Text style={styles.name}>{c.name}</Text>
            {c.disabled ? <Badge label={t('campaigns.disabled')} tone="neutral" /> : null}
          </View>
          <Text style={styles.code} selectable>
            {t('campaigns.code', { code: c.code })}
          </Text>
          {c.event_title ? <Text style={styles.meta}>{c.event_title}</Text> : null}
          <Text style={styles.meta}>
            {c.discount_type === 'percent'
              ? t('campaigns.discountPercent', { n: c.amount })
              : t('campaigns.discountFixed', { amount: formatKzt(c.amount) })}
            {' · '}
            {t('campaigns.used', { n: c.redemptions, max: c.max_redemptions })}
          </Text>
          <Text style={styles.meta}>{t('campaigns.period', { from: dayLabel(c.starts_at), to: dayLabel(c.ends_at) })}</Text>
          {qrFor === c.id && c.event_id ? (
            <View style={styles.qrBox}>
              <QRCode value={campaignLink(c)} size={200} />
              <Text style={styles.qrNote}>{t('campaigns.qrNote')}</Text>
              <Text style={styles.link} selectable>
                {campaignLink(c)}
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {c.event_id ? (
              <Button
                title={qrFor === c.id ? t('campaigns.hideQr') : t('campaigns.showQr')}
                variant="secondary"
                onPress={() => setQrFor(qrFor === c.id ? null : c.id)}
              />
            ) : null}
            <Button title={c.disabled ? t('campaigns.enable') : t('campaigns.disable')} variant="secondary" onPress={() => void toggle(c)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function NewCampaign({
  events,
  onCancel,
  onCreated,
}: {
  events: OrganizerEvent[];
  onCancel: () => void;
  onCreated: (c: Campaign) => Promise<void>;
}) {
  const { t } = useTranslation();
  const now = new Date();
  const inMonth = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [name, setName] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [amount, setAmount] = useState('10');
  const [startsAt, setStartsAt] = useState(toDateInput(now.toISOString()));
  const [endsAt, setEndsAt] = useState(toDateInput(inMonth.toISOString()));
  const [max, setMax] = useState('100');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    const amountN = Number(amount);
    const maxN = Number(max);
    if (!eventId || !name.trim() || !amount.trim() || !max.trim()) {
      setError(t('errors.required'));
      return;
    }
    if (!Number.isInteger(amountN) || !Number.isInteger(maxN)) {
      setError(t('ticketTypes.badNumber'));
      return;
    }
    const start = fromDateInput(startsAt);
    const end = fromDateInput(endsAt);
    if (!start || !end) {
      setError(t('eventForm.badDate'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const c = await api<Campaign>('/organizer/campaigns', {
        method: 'POST',
        body: { event_id: eventId, name: name.trim(), discount_type: type, amount: amountN, starts_at: start, ends_at: end, max_redemptions: maxN },
      });
      await onCreated(c);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>{t('campaigns.new')}</Heading>
      <View style={styles.form}>
        <Text style={styles.label}>{t('campaigns.event')}</Text>
        <Chips label={t('campaigns.pickEvent')} value={eventId} onChange={setEventId} options={events.map((e) => ({ value: e.id, label: e.title }))} />
        <Field label={t('campaigns.name')} value={name} onChangeText={setName} />
        <Text style={styles.label}>{t('campaigns.type')}</Text>
        <Chips
          label={t('campaigns.type')}
          value={type}
          onChange={setType}
          options={[
            { value: 'percent', label: t('campaigns.percent') },
            { value: 'fixed', label: t('campaigns.fixed') },
          ]}
        />
        <Field label={t('campaigns.amount')} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        <Field label={t('campaigns.startsAt')} hint={t('eventForm.dateHint')} value={startsAt} onChangeText={setStartsAt} />
        <Field label={t('campaigns.endsAt')} hint={t('eventForm.dateHint')} value={endsAt} onChangeText={setEndsAt} />
        <Field label={t('campaigns.maxRedemptions')} value={max} onChangeText={setMax} keyboardType="number-pad" />
        <ErrorText>{error}</ErrorText>
        <Button title={t('campaigns.create')} onPress={() => void create()} loading={busy} />
        <Button title={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={busy} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  code: { fontSize: 16, fontWeight: '700', color: colors.blue },
  meta: { fontSize: 14, color: colors.muted },
  qrBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 2, borderColor: colors.warning, borderStyle: 'dashed' },
  qrNote: { fontSize: 14, fontWeight: '700', color: colors.warning, textAlign: 'center' },
  link: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  form: { gap: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
});
