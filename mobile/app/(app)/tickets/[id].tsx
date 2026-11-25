import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

import { Badge, ticketTone } from '@/components/Badge';
import { Button, ErrorText, Loading, Muted, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime, formatKzt } from '@/lib/format';
import type { Ticket } from '@/lib/types';

export default function TicketScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const all = await api<Ticket[]>('/my-tickets');
      const found = all.find((tk) => tk.id === id) ?? null;
      setTicket(found);
      setNotFound(!found);
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error) {
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (notFound) {
    return (
      <Screen>
        <Muted>{t('tickets.notFound')}</Muted>
      </Screen>
    );
  }
  if (!ticket) return <Loading />;

  const gone = ticket.status === 'cancelled' || ticket.status === 'refunded';
  const status = t(`ticketStatus.${ticket.status}`);

  return (
    <Screen>
      <Title>{ticket.event.title}</Title>
      <Badge label={status} tone={ticketTone(ticket.status)} />

      {gone ? (
        <Text style={styles.noEntry} accessibilityRole="alert">
          {ticket.status === 'refunded' ? t('tickets.noEntryRefunded') : t('tickets.noEntryCancelled')}
        </Text>
      ) : (
        <View style={styles.qrBox}>
          <View
            style={styles.qr}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('tickets.qrLabel', { event: ticket.event.title })}
          >
            <QRCode value={ticket.qr_code} size={240} ecl="H" quietZone={12} backgroundColor="#ffffff" />
          </View>
          <Text style={styles.qrHint}>
            {ticket.status === 'checked_in' ? t('tickets.used') : t('tickets.showAtEntrance')}
          </Text>
          {ticket.status === 'valid' ? <Muted>{t('tickets.brightness')}</Muted> : null}
        </View>
      )}

      {ticket.event.status === 'cancelled' ? (
        <Text style={styles.noEntry}>{t('tickets.eventCancelled')}</Text>
      ) : null}

      <View style={styles.facts}>
        <Fact label={t('tickets.date')}>{formatDateTime(ticket.event.date)}</Fact>
        <Fact label={t('tickets.venue')}>{ticket.event.venue || '-'}</Fact>
        <Fact label={t('tickets.type')}>{ticket.ticket_type.name}</Fact>
        <Fact label={t('tickets.price')}>{formatKzt(ticket.ticket_type.price)}</Fact>
        <Fact label={t('tickets.status')}>
          {status}
          {ticket.checked_in_at ? ` · ${formatDateTime(ticket.checked_in_at)}` : ''}
        </Fact>
        <Fact label={t('tickets.ticketId')}>{ticket.id}</Fact>
      </View>

      <Button
        title={t('tickets.viewEvent')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/events/[id]', params: { id: ticket.event.id } })}
      />
      <Muted>{t('tickets.problem')}</Muted>
      <Button
        title={t('tickets.contactSupport')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/tickets/support/new', params: { ticket: ticket.id } })}
      />
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} selectable>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  qrBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  qr: { padding: spacing.sm, backgroundColor: '#ffffff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  qrHint: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  noEntry: { fontSize: 15, fontWeight: '600', color: colors.danger },
  facts: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  fact: { gap: 2 },
  factLabel: { fontSize: 13, color: colors.muted },
  factValue: { fontSize: 15, color: colors.text },
});
