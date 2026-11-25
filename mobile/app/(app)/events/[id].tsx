import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Button, ErrorText, Loading, Muted, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatKzt } from '@/lib/format';
import type { EventDetail, RegisterResponse, TicketType } from '@/lib/types';

const MAX_PER_ORDER = 10;

export default function EventDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, promo } = useLocalSearchParams<{ id: string; promo?: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    setNotFound(false);
    try {
      setEvent(await api<EventDetail>(`/events/${id}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setLoadError(errorText(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (notFound) {
    return (
      <Screen>
        <Muted>{t('events.notFound')}</Muted>
      </Screen>
    );
  }
  if (loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!event) return <Loading />;

  if (issued !== null) {
    return (
      <Screen>
        <Title>{t('events.successTitle')}</Title>
        <Text style={styles.body}>{event.title}</Text>
        <Muted>{t('events.successText', { n: issued })}</Muted>
        <Button title={t('events.goTickets')} onPress={() => router.navigate('/tickets')} />
        <Button title={t('events.backToEvent')} variant="secondary" onPress={() => setIssued(null)} />
      </Screen>
    );
  }

  const blocked = blockedReason(event, t);
  const paidOn = event.paid_sales === 'active';
  const buyable = (tt: TicketType) => (tt.price === 0 || paidOn) && onSale(tt) && tt.quantity_left > 0;
  const freeTypes = event.ticket_types.filter((tt) => tt.price === 0);
  const hasPaid = event.ticket_types.some((tt) => tt.price > 0);
  const chosen = Object.entries(quantities).filter(([, q]) => q > 0);
  const chosenTotal = chosen.reduce((sum, [, q]) => sum + q, 0);
  const chosenPaid = chosen.some(([typeId]) => (event.ticket_types.find((tt) => tt.id === typeId)?.price ?? 0) > 0);

  function checkout() {
    router.push({
      pathname: '/events/checkout',
      params: { id, items: JSON.stringify(Object.fromEntries(chosen)), promo: promo ?? '' },
    });
  }

  function change(tt: TicketType, delta: number) {
    setError('');
    setQuantities((prev) => {
      const current = prev[tt.id] ?? 0;
      const othersTotal = chosenTotal - current;
      const max = Math.min(tt.quantity_left, tt.max_per_order ?? MAX_PER_ORDER, MAX_PER_ORDER - othersTotal);
      return { ...prev, [tt.id]: Math.max(0, Math.min(max, current + delta)) };
    });
  }

  async function register() {
    if (chosen.length === 0) return;
    setBusy(true);
    setError('');
    let count = 0;
    try {
      for (const [typeId, quantity] of chosen) {
        const res = await api<RegisterResponse>(`/events/${id}/register`, {
          method: 'POST',
          body: { ticket_type_id: typeId, quantity },
        });
        count += res.tickets.length;
      }
      setQuantities({});
      setIssued(count);
      void load();
    } catch (err) {
      setError(errorText(err));
      if (count > 0) {
        setQuantities({});
        setIssued(count);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.category}>{t(`categories.${categoryKey(event.category)}`)}</Text>
      <Title>{event.title}</Title>

      <View style={styles.facts}>
        <Fact label={t('events.date')}>
          {formatDateTime(event.date)}
          {event.ends_at ? ` - ${formatDateTime(event.ends_at)}` : ''}
        </Fact>
        <Fact label={t('events.venue')}>{[event.venue, event.venue_address].filter(Boolean).join(', ')}</Fact>
        <Fact label={t('events.organizer')}>{event.organizer_name || '-'}</Fact>
      </View>

      <Text style={styles.heading}>{t('events.about')}</Text>
      <Text style={styles.body}>{event.description || t('events.noDescription')}</Text>

      <Text style={styles.heading}>{t('events.tickets')}</Text>
      {blocked ? (
        <Text style={styles.blocked} accessibilityRole="alert">
          {blocked}
        </Text>
      ) : null}
      {event.ticket_types.length === 0 ? <Muted>{t('events.noTicketTypes')}</Muted> : null}

      {event.ticket_types.map((tt) => {
        const canPick = !blocked && buyable(tt);
        const q = quantities[tt.id] ?? 0;
        return (
          <View key={tt.id} style={styles.type}>
            <View style={styles.typeInfo}>
              <Text style={styles.typeName}>{tt.name}</Text>
              {tt.description ? <Text style={styles.typeDesc}>{tt.description}</Text> : null}
              <Text style={styles.typePrice}>{formatKzt(tt.price)}</Text>
              <Text style={styles.typeLeft}>
                {tt.quantity_left > 0 ? t('events.left', { n: tt.quantity_left }) : t('events.soldOut')}
              </Text>
              {!onSale(tt) ? <Text style={styles.typeLeft}>{t('checkout.notOnSale')}</Text> : null}
              {tt.sales_starts_at || tt.sales_ends_at ? (
                <Text style={styles.typeLeft}>
                  {t('checkout.sales', { from: formatDateTime(tt.sales_starts_at), to: formatDateTime(tt.sales_ends_at) })}
                </Text>
              ) : null}
              {tt.max_per_order ? <Text style={styles.typeLeft}>{t('checkout.maxPerOrder', { n: tt.max_per_order })}</Text> : null}
            </View>
            {canPick ? (
              <View style={styles.stepper}>
                <StepButton
                  label="-"
                  a11y={t('events.less', { name: tt.name })}
                  onPress={() => change(tt, -1)}
                  disabled={q === 0}
                />
                <Text style={styles.qty} accessibilityLabel={`${t('events.quantity')}: ${q}`}>
                  {q}
                </Text>
                <StepButton label="+" a11y={t('events.more', { name: tt.name })} onPress={() => change(tt, 1)} />
              </View>
            ) : null}
          </View>
        );
      })}

      {!blocked && hasPaid && !paidOn ? <Muted>{t('checkout.paidOff')}</Muted> : null}
      {!blocked && event.registration_closes_at ? (
        <Muted>{t('events.closesAt', { date: formatDateTime(event.registration_closes_at) })}</Muted>
      ) : null}

      <ErrorText>{error}</ErrorText>
      {!blocked && chosenPaid ? <Button title={t('checkout.buy')} onPress={checkout} /> : null}
      {!blocked && !chosenPaid && (freeTypes.length > 0 || paidOn) ? (
        <Button
          title={t('events.getFree')}
          onPress={() => void register()}
          loading={busy}
          disabled={chosenTotal === 0}
        />
      ) : null}
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{children}</Text>
    </View>
  );
}

function StepButton({
  label,
  a11y,
  onPress,
  disabled = false,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

function onSale(tt: TicketType): boolean {
  const now = Date.now();
  if (tt.sales_starts_at && now < new Date(tt.sales_starts_at).getTime()) return false;
  if (tt.sales_ends_at && now > new Date(tt.sales_ends_at).getTime()) return false;
  return true;
}

function blockedReason(ev: EventDetail, t: TFunction): string {
  const now = Date.now();
  if (ev.status === 'cancelled') return t('events.cancelled');
  if (ev.status !== 'published') return t('events.draft');
  if (ev.suspended) return t('events.suspended');
  if (ev.registration_opens_at && now < new Date(ev.registration_opens_at).getTime()) {
    return t('events.notOpen', { date: formatDateTime(ev.registration_opens_at) });
  }
  if (ev.registration_closes_at && now > new Date(ev.registration_closes_at).getTime()) return t('events.closed');
  if (now > new Date(ev.date).getTime()) return t('events.started');
  return '';
}

function categoryKey(c: string): 'music' | 'education' | 'sports' | 'other' {
  return c === 'music' || c === 'education' || c === 'sports' ? c : 'other';
}

const styles = StyleSheet.create({
  category: { fontSize: 12, fontWeight: '600', color: colors.blue, textTransform: 'uppercase' },
  facts: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  fact: { gap: 2 },
  factLabel: { fontSize: 13, color: colors.muted },
  factValue: { fontSize: 15, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  blocked: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  typeInfo: { flex: 1, gap: 2 },
  typeName: { fontSize: 16, fontWeight: '700', color: colors.text },
  typeDesc: { fontSize: 14, color: colors.muted },
  typePrice: { fontSize: 15, fontWeight: '600', color: colors.text },
  typeLeft: { fontSize: 13, color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, color: colors.blue, fontWeight: '600' },
  qty: { fontSize: 18, fontWeight: '700', minWidth: 24, textAlign: 'center', color: colors.text },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.35 },
});
