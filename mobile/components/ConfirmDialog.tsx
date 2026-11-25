import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';

// Confirmation for destructive actions (cancel, refund, delete). With `withReason` it also
// asks for the reason the backend requires and the attendee sees in the email.
// A custom modal instead of Alert.alert, which has no buttons on the web build.
export function ConfirmDialog(props: {
  visible: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  withReason?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.visible) {
      setReason('');
      setError('');
      setBusy(false);
    }
  }, [props.visible]);

  async function confirm() {
    if (props.withReason && !reason.trim()) {
      setError(t('reason.required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await props.onConfirm(reason.trim());
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {props.title}
          </Text>
          {props.text ? <Text style={styles.text}>{props.text}</Text> : null}
          {props.withReason ? (
            <Field label={t('reason.label')} hint={t('reason.hint')} value={reason} onChangeText={setReason} multiline />
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button title={props.confirmLabel ?? t('reason.confirm')} variant="danger" onPress={() => void confirm()} loading={busy} />
          <Button title={t('common.cancel')} variant="secondary" onPress={props.onCancel} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  text: { fontSize: 15, color: colors.text, lineHeight: 21 },
});
