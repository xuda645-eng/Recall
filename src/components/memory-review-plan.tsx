import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecallStore } from '@/stores/recall-store';
import { commitMemory } from '@/services/memory-actions';
import { DEFAULT_FIXED_INTERVALS, normalizeMemoryReviewPlan } from '@/services/memory-review';
import type { MemoryReviewPlan, ReviewRating } from '@/types';

interface MemoryReviewPlanEditorProps {
  onClose: () => void;
  onBusy?: (busy: boolean) => void;
}

type IntervalUnit = 'minute' | 'hour' | 'day';
interface IntervalInput { value: string; unit: IntervalUnit }
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
const UNIT_MS: Record<IntervalUnit, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };
const RATING_LABELS: Record<ReviewRating, string> = {
  again: '忘记了', hard: '有点难', good: '记住了', easy: '很熟悉',
};
const UNIT_LABELS: Record<IntervalUnit, string> = { minute: '分钟', hour: '小时', day: '天' };
const groupStyle = { border: 0, padding: 0, margin: 0, minWidth: 0 };
const radioStyle = { minHeight: 20, height: 20, width: 20, padding: 0, accentColor: 'var(--stone)' };

function intervalInputs(intervals: Record<ReviewRating, number>): Record<ReviewRating, IntervalInput> {
  return Object.fromEntries(RATINGS.map(rating => {
    const interval = intervals[rating];
    const unit: IntervalUnit = interval % UNIT_MS.day === 0 ? 'day'
      : interval % UNIT_MS.hour === 0 ? 'hour' : 'minute';
    return [rating, { value: String(interval / UNIT_MS[unit]), unit }];
  })) as Record<ReviewRating, IntervalInput>;
}

export function MemoryReviewPlanEditor({ onClose, onBusy }: MemoryReviewPlanEditorProps) {
  const settings = useRecallStore(state => state.settings);
  const { t } = useTranslation();
  const id = useId();
  const pending = useRef(false);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusy);
  const [mode, setMode] = useState<MemoryReviewPlan['mode']>(() => normalizeMemoryReviewPlan(settings.reviewPlan).mode);
  const [inputs, setInputs] = useState(() => intervalInputs(normalizeMemoryReviewPlan(settings.reviewPlan).intervals));
  const [retention, setRetention] = useState(() => String(Number((settings.desiredRetention * 100).toFixed(10))));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { busyCallback.current = onBusy; }, [onBusy]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      busyCallback.current?.(false);
    };
  }, []);

  const intervals = Object.fromEntries(RATINGS.map(rating => {
    const input = inputs[rating];
    return [rating, /^\d+$/.test(input.value) ? Number(input.value) * UNIT_MS[input.unit] : NaN];
  })) as Record<ReviewRating, number>;
  const intervalsValid = RATINGS.every((rating, index) => {
    const interval = intervals[rating];
    return Number.isInteger(interval) && interval >= UNIT_MS.minute && interval <= 365 * UNIT_MS.day
      && (index === 0 || interval > intervals[RATINGS[index - 1]]);
  });
  const retentionPercent = Number(retention);
  const retentionValid = retention.trim() !== '' && Number.isFinite(retentionPercent)
    && retentionPercent >= 70 && retentionPercent <= 99;
  const validationError = !retentionValid
    ? t('memory.reviewPlan.retentionError', { defaultValue: '目标保留率必须在 70% 到 99% 之间。' })
    : mode === 'fixed' && !intervalsValid
      ? t('memory.reviewPlan.intervalError', { defaultValue: '请输入整数间隔，范围为 1 分钟到 365 天，且四项必须依次严格递增。' })
      : '';

  function updateInput(rating: ReviewRating, change: Partial<IntervalInput>): void {
    setInputs(current => ({ ...current, [rating]: { ...current[rating], ...change } }));
    setSaveError('');
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending.current || validationError) return;
    pending.current = true;
    setSaving(true);
    setSaveError('');
    const reviewPlan = normalizeMemoryReviewPlan({ mode, intervals });
    const desiredRetention = retentionPercent / 100;
    try {
      busyCallback.current?.(true);
      await commitMemory(current => ({
        ...current,
        settings: { ...current.settings, reviewPlan, desiredRetention },
      }));
      if (mounted.current) onClose();
    } catch (error) {
      if (mounted.current) setSaveError(t('memory.reviewPlan.saveError', {
        defaultValue: '保存失败，请重试。{{message}}',
        message: error instanceof Error ? error.message : '',
      }));
    } finally {
      pending.current = false;
      if (mounted.current) {
        setSaving(false);
        busyCallback.current?.(false);
      }
    }
  }

  return <form className="m-review-plan m-panel" noValidate onSubmit={event => void save(event)} aria-busy={saving}>
    <h2>{t('memory.reviewPlan.title', { defaultValue: '复习计划' })}</h2>
    <p>{t('memory.reviewPlan.description', { defaultValue: '计划只影响之后的评分，不会重排已有卡片的到期时间，也不会清空复习记录。' })}</p>
    <fieldset disabled={saving} className="grid gap-4" style={groupStyle}>
      <fieldset className="m-review-modes grid gap-2" style={groupStyle}>
        <legend>{t('memory.reviewPlan.modeLabel', { defaultValue: '调度方式' })}</legend>
        <label style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
          <input type="radio" name={`${id}-mode`} value="smart" checked={mode === 'smart'} style={radioStyle} disabled={saving}
            onChange={() => { setMode('smart'); setSaveError(''); }} />
          <span>{t('memory.reviewPlan.smart', { defaultValue: '智能计划（FSRS）' })}</span>
        </label>
        <small>{t('memory.reviewPlan.smartHint', { defaultValue: '根据真实复习进度与目标保留率，计算每次评分后的间隔。' })}</small>
        <label style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
          <input type="radio" name={`${id}-mode`} value="fixed" checked={mode === 'fixed'} style={radioStyle} disabled={saving}
            onChange={() => { setMode('fixed'); setSaveError(''); }} />
          <span>{t('memory.reviewPlan.fixed', { defaultValue: '固定间隔' })}</span>
        </label>
        <small>{t('memory.reviewPlan.fixedHint', { defaultValue: '使用设定的间隔安排下次复习，同时保留真实的 FSRS 进度。' })}</small>
      </fieldset>
      <fieldset className="m-interval-grid grid gap-3" style={groupStyle} disabled={mode !== 'fixed'}>
        <legend>{t('memory.reviewPlan.intervals', { defaultValue: '评分后的复习间隔' })}</legend>
        {RATINGS.map(rating => {
          const ratingLabel = t(`memory.reviewPlan.ratings.${rating}`, { defaultValue: RATING_LABELS[rating] });
          return <div className="m-interval-input grid gap-2" key={rating}>
            <label htmlFor={`${id}-${rating}`}>{ratingLabel}</label>
            <div className="m-spread">
              <input id={`${id}-${rating}`} type="number" inputMode="numeric" step="1"
                min={Math.ceil(UNIT_MS.minute / UNIT_MS[inputs[rating].unit])}
                max={Math.floor(365 * UNIT_MS.day / UNIT_MS[inputs[rating].unit])}
                value={inputs[rating].value} disabled={saving || mode !== 'fixed'}
                onChange={event => updateInput(rating, { value: event.target.value })}
                aria-invalid={mode === 'fixed' && !intervalsValid} aria-describedby={`${id}-bounds`} />
              <select value={inputs[rating].unit} disabled={saving || mode !== 'fixed'}
                aria-label={t('memory.reviewPlan.intervalUnit', { defaultValue: '{{rating}}的间隔单位', rating: ratingLabel })}
                onChange={event => updateInput(rating, { unit: event.target.value as IntervalUnit })}>
                {(Object.keys(UNIT_MS) as IntervalUnit[]).map(unit => <option value={unit} key={unit}>
                  {t(`memory.reviewPlan.units.${unit}`, { defaultValue: UNIT_LABELS[unit] })}
                </option>)}
              </select>
            </div>
          </div>;
        })}
        <small id={`${id}-bounds`}>{t('memory.reviewPlan.bounds', { defaultValue: '整数间隔，1 分钟到 365 天；忘记了 < 有点难 < 记住了 < 很熟悉。' })}</small>
        <button type="button" disabled={saving || mode !== 'fixed'} onClick={() => { setInputs(intervalInputs(DEFAULT_FIXED_INTERVALS)); setSaveError(''); }}>
          {t('memory.reviewPlan.preset', { defaultValue: '恢复默认间隔' })}
        </button>
      </fieldset>
      <label htmlFor={`${id}-retention`}>
        {t('memory.reviewPlan.retention', { defaultValue: '目标保留率（%）' })}
        <input id={`${id}-retention`} type="number" inputMode="decimal" min="70" max="99" step="any" value={retention} disabled={saving}
          aria-invalid={!retentionValid} aria-describedby={`${id}-retention-hint`}
          onChange={event => { setRetention(event.target.value); setSaveError(''); }} />
      </label>
      <small id={`${id}-retention-hint`}>{t('memory.reviewPlan.retentionHint', { defaultValue: '范围 70% 到 99%。保留率越高，智能计划通常安排越频繁。' })}</small>
      {validationError && <p role="alert" className="m-error">{validationError}</p>}
      {saveError && <p role="alert" className="m-error">{saveError}</p>}
      <div className="m-actions">
        <button type="button" disabled={saving} onClick={onClose}>{t('memory.reviewPlan.cancel', { defaultValue: '取消' })}</button>
        <button className="m-primary" type="submit" disabled={saving || Boolean(validationError)}>
          {saving ? t('memory.reviewPlan.saving', { defaultValue: '保存中...' }) : t('memory.reviewPlan.save', { defaultValue: '保存计划' })}
        </button>
      </div>
    </fieldset>
  </form>;
}
