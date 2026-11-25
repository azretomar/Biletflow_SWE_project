import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/components/Chips';
import { Button, ErrorText, Field } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { fromDateInput, toDateInput } from '@/lib/format';
import type { Event } from '@/lib/types';

const CATEGORIES = ['music', 'education', 'sports', 'other'] as const;
const VISIBILITY = ['public', 'unlisted', 'private'] as const;

export type EventBody = {
  title: string;
  description: string;
  category: string;
  date: string;
  ends_at: string;
  venue: string;
  venue_address: string;
  capacity: number;
  registration_opens_at: string;
  registration_closes_at: string;
  visibility: string;
  image_url: string;
  status?: 'draft' | 'published';
};

export function eventToBody(ev: Event): EventBody {
  return {
    title: ev.title,
    description: ev.description,
    category: ev.category,
    date: ev.date,
    ends_at: ev.ends_at ?? '',
    venue: ev.venue,
    venue_address: ev.venue_address,
    capacity: ev.capacity,
    registration_opens_at: ev.registration_opens_at ?? '',
    registration_closes_at: ev.registration_closes_at ?? '',
    visibility: ev.visibility,
    image_url: ev.image_url,
  };
}

export function EventForm({
  initial,
  submitLabel,
  showPublish,
  onSubmit,
}: {
  initial?: Event;
  submitLabel: string;
  showPublish: boolean;
  onSubmit: (body: EventBody) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? 'other');
  const [date, setDate] = useState(toDateInput(initial?.date));
  const [endsAt, setEndsAt] = useState(toDateInput(initial?.ends_at));
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [venueAddress, setVenueAddress] = useState(initial?.venue_address ?? '');
  const [capacity, setCapacity] = useState(initial ? String(initial.capacity) : '');
  const [regOpens, setRegOpens] = useState(toDateInput(initial?.registration_opens_at));
  const [regCloses, setRegCloses] = useState(toDateInput(initial?.registration_closes_at));
  const [visibility, setVisibility] = useState<string>(initial?.visibility ?? 'public');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !venue.trim() || !date.trim() || !capacity.trim()) {
      setError(t('errors.required'));
      return;
    }
    const dates = [date, endsAt, regOpens, regCloses].map(fromDateInput);
    if (dates.some((d) => d === null) || !dates[0]) {
      setError(t('eventForm.badDate'));
      return;
    }
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) {
      setError(t('eventForm.badCapacity'));
      return;
    }
    const [start, end, opens, closes] = dates as string[];
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        category,
        date: start,
        ends_at: end,
        venue: venue.trim(),
        venue_address: venueAddress.trim(),
        capacity: cap,
        registration_opens_at: opens,
        registration_closes_at: closes,
        visibility,
        image_url: imageUrl.trim(),
        ...(showPublish ? { status: publish ? 'published' : 'draft' } : {}),
      });
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  const dateHint = t('eventForm.dateHint');
  return (
    <View style={styles.form}>
      <Field label={t('eventForm.title')} value={title} onChangeText={setTitle} maxLength={200} />
      <Field label={t('eventForm.description')} value={description} onChangeText={setDescription} multiline />
      <Text style={styles.label}>{t('eventForm.category')}</Text>
      <Chips
        label={t('eventForm.category')}
        value={category}
        onChange={setCategory}
        options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
      />
      <Field label={t('eventForm.date')} hint={dateHint} value={date} onChangeText={setDate} placeholder="2026-12-20 19:00" />
      <Field label={t('eventForm.endsAt')} hint={dateHint} value={endsAt} onChangeText={setEndsAt} placeholder="2026-12-20 22:00" />
      <Field label={t('eventForm.venue')} value={venue} onChangeText={setVenue} maxLength={200} />
      <Field label={t('eventForm.venueAddress')} value={venueAddress} onChangeText={setVenueAddress} />
      <Field label={t('eventForm.capacity')} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
      <Field label={t('eventForm.regOpens')} hint={dateHint} value={regOpens} onChangeText={setRegOpens} />
      <Field label={t('eventForm.regCloses')} hint={dateHint} value={regCloses} onChangeText={setRegCloses} />
      <Text style={styles.label}>{t('eventForm.visibility')}</Text>
      <Chips
        label={t('eventForm.visibility')}
        value={visibility}
        onChange={setVisibility}
        options={VISIBILITY.map((v) => ({ value: v, label: t(`eventForm.visibilityOptions.${v}`) }))}
      />
      <Field label={t('eventForm.imageUrl')} value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" keyboardType="url" />
      {showPublish ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('eventForm.publishNow')}</Text>
          <Switch value={publish} onValueChange={setPublish} accessibilityLabel={t('eventForm.publishNow')} />
        </View>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button title={submitLabel} onPress={() => void submit()} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchLabel: { flex: 1, fontSize: 15, color: colors.text },
});
