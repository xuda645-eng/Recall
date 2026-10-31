import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecallStore } from '@/stores/recall-store';
import { commitMemory } from '@/services/memory-actions';
import { DEFAULT_FIXED_INTERVALS, normalizeMemoryReviewPlan } from '@/services/memory-review';
import { normalizeMemoryStudyPreferences } from '@/services/memory-study';
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
const controlStyle = { minHeight: 44, minWidth: 44 };

function validInteger(value: string, minimum: number, maximum: number): boolean {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(number) && number >= minimum && number <= maximum;
}

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
  const [studyInputs, setStudyInputs] = useState(() => {
    const preferences = normalizeMemoryStudyPreferences(settings.studyPreferences);
    return {
      newCardRatio: preferences.newCardRatio,
      batchSize: String(preferences.batchSize),
      sessionMinutes: String(preferences.sessionMinutes),
    };
  });
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
      && ((rating !== 'good' && rating !== 'easy') || interval >= UNIT_MS.day)
      && (index === 0 || interval > intervals[RATINGS[index - 1]]);
  });
  const retentionPercent = Number(retention);
  const retentionValid = retention.trim() !== '' && Number.isFinite(retentionPercent)
    && retentionPercent >= 70 && retentionPercent <= 99;
  const ratioValid = Number.isFinite(studyInputs.newCardRatio) && studyInputs.newCardRatio >= 0 && studyInputs.newCardRatio <= 1;
  const batchSizeValid = validInteger(studyInputs.batchSize, 1, 100);
  const sessionMinutesValid = validInteger(studyInputs.sessionMinutes, 5, 120);
  const newPercent = Math.round(studyInputs.newCardRatio * 100);
  const oldPercent = 100 - newPercent;
  const validationError = !retentionValid
    ? t('memory.reviewPlan.retentionError', { defaultValue: '目标保留率必须在 70% 到 99% 之间。' })
    : mode === 'fixed' && !intervalsValid
      ? t('memory.reviewPlan.intervalError', { defaultValue: '请输入整数间隔，范围为 1 分钟到 365 天，且四项必须依次严格递增；记住了和很熟悉不得少于完整 24 小时。' })
      : !ratioValid
        ? t('memory.reviewPlan.ratioError', { defaultValue: '新卡占比必须在 0% 到 100% 之间。' })
        : !batchSizeValid
          ? t('memory.reviewPlan.batchSizeError', { defaultValue: '每轮卡片数必须是 1 到 100 的整数。' })
          : !sessionMinutesValid
            ? t('memory.reviewPlan.sessionMinutesError', { defaultValue: '每次时长目标必须是 5 到 120 分钟的整数。' })
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
    const studyPreferences = normalizeMemoryStudyPreferences({
      newCardRatio: studyInputs.newCardRatio,
      batchSize: Number(studyInputs.batchSize),
      sessionMinutes: Number(studyInputs.sessionMinutes),
    });
    try {
      busyCallback.current?.(true);
      await commitMemory(current => ({
        ...current,
        settings: { ...current.settings, reviewPlan, desiredRetention, studyPreferences },
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

  function keepControlVisible(event: FocusEvent<HTMLFormElement>): void {
    const control = event.target as HTMLElement;
    if (!control.matches('input,select,textarea')) return;
    requestAnimationFrame(() => {
      const sheet = control.closest<HTMLElement>('.m-sheet');
      const actions = sheet?.querySelector<HTMLElement>('.m-review-plan .m-actions');
      if (!sheet || !actions || !control.isConnected) return;
      const overlap = control.getBoundingClientRect().bottom + 16 - actions.getBoundingClientRect().top;
      if (overlap > 0) sheet.scrollTop += overlap;
    });
  }

  return <form className="m-review-plan m-panel" noValidate onFocusCapture={keepControlVisible} onSubmit={event => void save(event)} aria-busy={saving}>
    <p>{t('memory.reviewPlan.description', { defaultValue: '选卡配比保存后立即调整本轮未练部分，保留当前卡和已完成记录。记忆排期只影响之后的评分，不会重排已有卡片的到期时间，也不会清空复习记录。' })}</p>
    <fieldset disabled={saving} className="grid gap-4" style={groupStyle}>
      <fieldset className="m-review-modes grid gap-2" style={groupStyle}>
        <legend>{t('memory.reviewPlan.modeLabel', { defaultValue: '调度方式' })}</legend>
        <label style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
          <input type="radio" name={`${id}-mode`} value="smart" checked={mode === 'smart'} style={radioStyle} disabled={saving}
            onChange={() => { setMode('smart'); setSaveError(''); }} />
          <span>{t('memory.reviewPlan.smart', { defaultValue: '智能计划（FSRS）' })}</span>
        </label>
        <small>{t('memory.reviewPlan.smartHint', { defaultValue: '根据真实复习进度与目标保留率计算间隔，可从数天到数月；记住了和很熟悉的下次复习至少间隔完整 24 小时，不是跨过午夜就算一天。' })}</small>
        <label style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
          <input type="radio" name={`${id}-mode`} value="fixed" checked={mode === 'fixed'} style={radioStyle} disabled={saving}
            onChange={() => { setMode('fixed'); setSaveError(''); }} />
          <span>{t('memory.reviewPlan.fixed', { defaultValue: '固定间隔' })}</span>
        </label>
        <small>{t('memory.reviewPlan.fixedHint', { defaultValue: '使用设定的间隔安排下次复习，同时保留真实的 FSRS 进度。' })}</small>
      </fieldset>
      {mode === 'fixed' && <fieldset className="m-interval-grid grid gap-3" style={groupStyle}>
        <legend>{t('memory.reviewPlan.intervals', { defaultValue: '评分后的复习间隔' })}</legend>
        {RATINGS.map(rating => {
          const ratingLabel = t(`memory.reviewPlan.ratings.${rating}`, { defaultValue: RATING_LABELS[rating] });
          return <div className="m-interval-input grid gap-2" key={rating}>
            <label htmlFor={`${id}-${rating}`}>{ratingLabel}</label>
            <div className="m-spread">
              <input id={`${id}-${rating}`} type="number" inputMode="numeric" step="1"
                min={Math.ceil(((rating === 'good' || rating === 'easy') ? UNIT_MS.day : UNIT_MS.minute) / UNIT_MS[inputs[rating].unit])}
                max={Math.floor(365 * UNIT_MS.day / UNIT_MS[inputs[rating].unit])}
                value={inputs[rating].value} disabled={saving} style={controlStyle}
                onChange={event => updateInput(rating, { value: event.target.value })}
                aria-invalid={!intervalsValid} aria-describedby={`${id}-bounds ${id}-validation`} />
              <select value={inputs[rating].unit} disabled={saving} style={controlStyle}
                aria-label={t('memory.reviewPlan.intervalUnit', { defaultValue: '{{rating}}的间隔单位', rating: ratingLabel })}
                onChange={event => updateInput(rating, { unit: event.target.value as IntervalUnit })}>
                {(Object.keys(UNIT_MS) as IntervalUnit[]).map(unit => <option value={unit} key={unit}>
                  {t(`memory.reviewPlan.units.${unit}`, { defaultValue: UNIT_LABELS[unit] })}
                </option>)}
              </select>
            </div>
          </div>;
        })}
        <small id={`${id}-bounds`}>{t('memory.reviewPlan.bounds', { defaultValue: '整数间隔，1 分钟到 365 天；忘记了 < 有点难 < 记住了 < 很熟悉。记住了和很熟悉均不得少于完整 24 小时。' })}</small>
        <button type="button" disabled={saving} style={controlStyle} onClick={() => { setInputs(intervalInputs(DEFAULT_FIXED_INTERVALS)); setSaveError(''); }}>
          {t('memory.reviewPlan.preset', { defaultValue: '恢复默认间隔' })}
        </button>
      </fieldset>}
      <label htmlFor={`${id}-retention`}>
        {t('memory.reviewPlan.retention', { defaultValue: '目标保留率（%）' })}
        <input id={`${id}-retention`} type="number" inputMode="decimal" min="70" max="99" step="any" value={retention} disabled={saving} style={controlStyle}
          aria-invalid={!retentionValid} aria-describedby={`${id}-retention-hint ${id}-validation`}
          onChange={event => { setRetention(event.target.value); setSaveError(''); }} />
      </label>
      <small id={`${id}-retention-hint`}>{t('memory.reviewPlan.retentionHint', { defaultValue: '范围 70% 到 99%。保留率越高，智能计划通常安排越频繁。' })}</small>
      <fieldset className="m-study-preferences grid gap-3" style={{ minWidth: 0 }}>
        <legend>{t('memory.reviewPlan.selection', { defaultValue: '本轮选卡' })}</legend>
        <label htmlFor={`${id}-new-ratio`}>{t('memory.reviewPlan.newCardRatio', { defaultValue: '新卡占比' })}</label>
        <input id={`${id}-new-ratio`} className="m-study-ratio" type="range" min="0" max="1" step="0.05"
          aria-label={t('memory.reviewPlan.newCardRatio', { defaultValue: '新卡占比' })}
          aria-valuetext={t('memory.reviewPlan.ratioValue', { defaultValue: '旧卡 {{oldPercent}}%，新卡 {{newPercent}}%', oldPercent, newPercent })}
          aria-describedby={`${id}-ratio-hint ${id}-validation`} aria-invalid={!ratioValid}
          value={studyInputs.newCardRatio} disabled={saving} style={{ ...controlStyle, width: '100%', padding: 0 }}
          onChange={event => { setStudyInputs(current => ({ ...current, newCardRatio: Number(event.target.value) })); setSaveError(''); }} />
        <div className="m-study-ratio-endpoints m-spread" aria-hidden="true">
          <small>{t('memory.reviewPlan.oldEndpoint', { defaultValue: '0% 新卡' })}</small>
          <small>{t('memory.reviewPlan.newEndpoint', { defaultValue: '100% 新卡' })}</small>
        </div>
        <output className="m-study-ratio-output" htmlFor={`${id}-new-ratio`} aria-live="polite" aria-atomic="true">
          {t('memory.reviewPlan.ratioValue', { defaultValue: '旧卡 {{oldPercent}}%，新卡 {{newPercent}}%', oldPercent, newPercent })}
        </output>
        <small id={`${id}-ratio-hint`}>{t('memory.reviewPlan.ratioHint', { defaultValue: '占比按卡片张数分配，不是用时比例。0% 是全旧卡目标，100% 是全新卡目标；旧卡只选当前范围内已到期的已学卡，不提前复习未到期卡。某类不足时由另一类补足，两类都不足时按实际可用卡数开始。' })}</small>
        {studyInputs.newCardRatio > 0.5 && <p className="m-study-warning" role="status">
          {t('memory.reviewPlan.ratioWarning', { defaultValue: '新卡占比较高，可能增加之后的复习负担；可以按自己的节奏调整，这不影响保存。' })}
        </p>}
        <label htmlFor={`${id}-batch-size`}>{t('memory.reviewPlan.batchSize', { defaultValue: '每轮卡片数' })}</label>
        <input id={`${id}-batch-size`} type="number" inputMode="numeric" min="1" max="100" step="1"
          value={studyInputs.batchSize} disabled={saving} style={controlStyle}
          aria-invalid={!batchSizeValid} aria-describedby={`${id}-batch-hint ${id}-validation`}
          onChange={event => { setStudyInputs(current => ({ ...current, batchSize: event.target.value })); setSaveError(''); }} />
        <small id={`${id}-batch-hint`}>{t('memory.reviewPlan.batchHint', { defaultValue: '每轮 1 到 100 张；这是卡片数量目标，不是每天必须完成的任务。' })}</small>
        <label htmlFor={`${id}-session-minutes`}>{t('memory.reviewPlan.sessionMinutes', { defaultValue: '每次时长目标（分钟）' })}</label>
        <input id={`${id}-session-minutes`} type="number" inputMode="numeric" min="5" max="120" step="1"
          value={studyInputs.sessionMinutes} disabled={saving} style={controlStyle}
          aria-invalid={!sessionMinutesValid} aria-describedby={`${id}-session-hint ${id}-validation`}
          onChange={event => { setStudyInputs(current => ({ ...current, sessionMinutes: event.target.value })); setSaveError(''); }} />
        <small id={`${id}-session-hint`}>{t('memory.reviewPlan.sessionHint', { defaultValue: '范围 5 到 120 分钟，只用于规划一次学习，不是严格截止时间，也不保证能在目标时间内完成；可随时暂停或继续，不要求每天打卡。' })}</small>
      </fieldset>
      <p id={`${id}-validation`} role={validationError ? 'alert' : undefined} className="m-error" hidden={!validationError}>{validationError}</p>
      {saveError && <p role="alert" className="m-error">{saveError}</p>}
      <div className="m-actions">
        <button type="button" disabled={saving} style={controlStyle} onClick={onClose}>{t('memory.reviewPlan.cancel', { defaultValue: '取消' })}</button>
        <button className="m-primary" type="submit" disabled={saving || Boolean(validationError)} style={controlStyle}>
          {saving ? t('memory.reviewPlan.saving', { defaultValue: '保存中...' }) : t('memory.reviewPlan.save', { defaultValue: '保存计划' })}
        </button>
      </div>
    </fieldset>
  </form>;
}
