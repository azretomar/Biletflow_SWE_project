import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Loading, Muted, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { CheckinResult, UndoCheckinResponse } from '@/lib/types';

type CheckinTicket = NonNullable<CheckinResult['ticket']>;

type Outcome =
  | { kind: 'valid'; ticket: CheckinTicket; undone: boolean }
  | { kind: 'already_used'; ticket: CheckinTicket | null }
  | { kind: 'cancelled' | 'refunded'; ticket: CheckinTicket | null }
  | { kind: 'invalid' }
  | { kind: 'campaign' }
  | { kind: 'error'; message: string };

// The same code is ignored for this long, so one ticket held in front of the camera
// is not sent twice.
const SAME_CODE_PAUSE_MS = 3000;

// A campaign QR is a link like https://.../events/{id}?promo=CODE (SRS 4.14). Ticket codes
// are random 43-character strings, never links. The backend also never accepts a link.
function isCampaignLink(code: string): boolean {
  return /^https?:\/\//i.test(code) || /[?&]promo=/i.test(code);
}

// Check-in at the door (SRS 4.8, UC4): scan a ticket QR, the backend validates it and
// records the check-in once (POST /api/checkin). A mistaken check-in can be undone
// (POST /api/checkin/undo).
export default function ScanScreen() {
  const { t } = useTranslation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState('');

  // The camera reports the same code many times per second, faster than React state
  // updates, so the guard against double scans lives in refs.
  const busy = useRef(false);
  const lastCode = useRef('');
  const lastAt = useRef(0);

  // Only one camera may run at a time: stop it when this screen is not visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const show = useCallback(
    (result: Outcome) => {
      setOutcome(result);
      if (result.kind === 'valid') Vibration.vibrate(150);
      else Vibration.vibrate([0, 300, 150, 300]);
      AccessibilityInfo.announceForAccessibility(headline(result, t));
    },
    [t],
  );

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      const code = (data ?? '').trim();
      const now = Date.now();
      if (busy.current || !code) return;
      if (code === lastCode.current && now - lastAt.current < SAME_CODE_PAUSE_MS) return;
      busy.current = true;
      lastCode.current = code;
      lastAt.current = now;

      if (isCampaignLink(code)) {
        show({ kind: 'campaign' });
        return;
      }

      setChecking(true);
      try {
        const res = await api<CheckinResult>('/checkin', { method: 'POST', body: { event_id: id, qr_code: code } });
        if (res.result === 'valid' && res.ticket) show({ kind: 'valid', ticket: res.ticket, undone: false });
        else if (res.result === 'already_used') show({ kind: 'already_used', ticket: res.ticket });
        else if (res.ticket?.status === 'cancelled') show({ kind: 'cancelled', ticket: res.ticket });
        else if (res.ticket?.status === 'refunded') show({ kind: 'refunded', ticket: res.ticket });
        else show({ kind: 'invalid' });
      } catch (err) {
        show({ kind: 'error', message: errorText(err) });
      } finally {
        setChecking(false);
      }
    },
    [id, show],
  );

  function scanNext() {
    setOutcome(null);
    setUndoError('');
    lastAt.current = Date.now(); // the same ticket stays ignored for a moment
    busy.current = false;
  }

  async function undo() {
    if (outcome?.kind !== 'valid') return;
    setUndoBusy(true);
    setUndoError('');
    try {
      await api<UndoCheckinResponse>('/checkin/undo', {
        method: 'POST',
        body: { event_id: id, ticket_id: outcome.ticket.id },
      });
      setOutcome({ ...outcome, undone: true });
      lastCode.current = ''; // the same ticket may be scanned again right away
      AccessibilityInfo.announceForAccessibility(t('scanner.undone'));
    } catch (err) {
      setUndoError(errorText(err));
    } finally {
      setUndoBusy(false);
    }
  }

  // Manual search and the entrance counter (package 2-1) for when a QR code cannot be read.
  const header = (
    <Stack.Screen
      options={{
        title: title || t('tabs.scanner'),
        headerRight: () => (
          <Pressable
            onPress={() => router.push({ pathname: '/scanner/search', params: { id, title: title ?? '' } })}
            accessibilityRole="button"
            accessibilityLabel={t('staffSearch.title')}
            hitSlop={12}
            style={styles.headerButton}
          >
            <Ionicons name="search" size={20} color={colors.blue} />
            <Text style={styles.headerButtonText}>{t('staffSearch.open')}</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (!permission) return <Loading />;
  if (!permission.granted) {
    return (
      <Screen>
        {header}
        <Muted>{permission.canAskAgain ? t('scanner.cameraNeeded') : t('scanner.cameraDenied')}</Muted>
        {permission.canAskAgain ? (
          <Button title={t('scanner.allowCamera')} onPress={() => void requestPermission()} />
        ) : (
          <Button title={t('scanner.openSettings')} onPress={() => void Linking.openSettings()} />
        )}
      </Screen>
    );
  }

  const scanning = focused && !outcome && !checking;

  return (
    <View style={styles.fill}>
      {header}
      {focused ? (
        <CameraView
          style={styles.cover}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? (result) => void onScanned(result) : undefined}
        />
      ) : null}

      {!outcome ? (
        <View style={styles.hintBox} pointerEvents="none">
          <View style={styles.frame} />
          <View style={styles.hintPill}>
            {checking ? <ActivityIndicator color="#fff" /> : null}
            <Text style={styles.hintText}>{checking ? t('scanner.checking') : t('scanner.pointCamera')}</Text>
          </View>
        </View>
      ) : (
        <ResultPanel
          outcome={outcome}
          onNext={scanNext}
          onUndo={() => void undo()}
          undoBusy={undoBusy}
          undoError={undoError}
        />
      )}
    </View>
  );
}

function ResultPanel({
  outcome,
  onNext,
  onUndo,
  undoBusy,
  undoError,
}: {
  outcome: Outcome;
  onNext: () => void;
  onUndo: () => void;
  undoBusy: boolean;
  undoError: string;
}) {
  const { t } = useTranslation();
  const look = LOOKS[outcome.kind];
  const ticket = 'ticket' in outcome ? outcome.ticket : null;
  const undone = outcome.kind === 'valid' && outcome.undone;

  return (
    <View style={[styles.panel, { borderTopColor: look.color }]} accessibilityLiveRegion="assertive">
      <View style={styles.panelHead}>
        <Ionicons name={undone ? 'arrow-undo-circle' : look.icon} size={40} color={undone ? colors.muted : look.color} />
        <Text style={[styles.panelTitle, { color: undone ? colors.text : look.color }]}>
          {undone ? t('scanner.undone') : headline(outcome, t)}
        </Text>
      </View>

      {!undone ? <Text style={styles.panelText}>{detail(outcome, t)}</Text> : null}

      {ticket ? (
        <View style={styles.ticketBox}>
          <Row label={t('scanner.attendee')} value={ticket.attendee_name} />
          <Row label={t('scanner.ticketType')} value={ticket.ticket_type.name} />
        </View>
      ) : null}

      <ErrorText>{undoError}</ErrorText>
      <Button title={t('scanner.scanNext')} onPress={onNext} />
      {outcome.kind === 'valid' && !outcome.undone ? (
        <Button title={t('scanner.undo')} variant="secondary" onPress={onUndo} loading={undoBusy} />
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Color plus an icon plus text, so the result never depends on color alone (SRS 7).
const LOOKS: Record<Outcome['kind'], { color: string; icon: IconName }> = {
  valid: { color: colors.success, icon: 'checkmark-circle' },
  already_used: { color: colors.warning, icon: 'alert-circle' },
  cancelled: { color: colors.danger, icon: 'close-circle' },
  refunded: { color: colors.danger, icon: 'close-circle' },
  invalid: { color: colors.danger, icon: 'close-circle' },
  campaign: { color: colors.danger, icon: 'pricetag' },
  error: { color: colors.danger, icon: 'cloud-offline' },
};

type T = ReturnType<typeof useTranslation>['t'];

function headline(o: Outcome, t: T): string {
  switch (o.kind) {
    case 'valid':
      return t('scanner.valid');
    case 'already_used':
      return t('scanner.alreadyUsed');
    case 'cancelled':
      return t('scanner.cancelled');
    case 'refunded':
      return t('scanner.refunded');
    case 'campaign':
      return t('scanner.campaign');
    case 'error':
      return t('scanner.error');
    default:
      return t('scanner.invalid');
  }
}

function detail(o: Outcome, t: T): string {
  switch (o.kind) {
    case 'valid':
      return t('scanner.validHint');
    case 'already_used':
      return o.ticket?.checked_in_at
        ? t('scanner.alreadyUsedAt', { time: formatTime(o.ticket.checked_in_at) })
        : t('scanner.notValidEntry');
    case 'cancelled':
    case 'refunded':
      return t('scanner.notValidEntry');
    case 'campaign':
      return t('scanner.campaignHint');
    case 'error':
      return o.message;
    default:
      return t('scanner.invalidHint');
  }
}

const styles = StyleSheet.create({
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  headerButtonText: { color: colors.blue, fontSize: 16, fontWeight: '600' },
  fill: { flex: 1, backgroundColor: '#000' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hintBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: radius.md },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  hintText: { color: '#fff', fontSize: 15 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 8,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelTitle: { flex: 1, fontSize: 24, fontWeight: '800' },
  panelText: { fontSize: 16, color: colors.text },
  ticketBox: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
});
