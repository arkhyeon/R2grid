// 고급 필터 입력줄 + 빌더 팝업
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADVANCED_OPS } from '../core/advancedFilter.js';
import { localeText } from '../core/locale.js';
import { cx } from '../core/utils.js';
import { Icon } from './common.jsx';
import { PopupLayer, useClickOutside, usePopupPosition } from './popup.jsx';

export function AdvancedFilterBar({ core }) {
  const [text, setText] = useState(core.advancedFilterText || '');
  const [error, setError] = useState(null);
  const applied = core.advancedFilterText || '';
  // 바깥(api/빌더)에서 바뀐 모델 반영
  useEffect(() => {
    setText(applied);
    setError(null);
  }, [applied]);
  if (!core.isAdvancedFilterEnabled()) return null;
  const t = (k, d) => localeText(core, k, d);
  const apply = () => {
    const r = core.applyAdvancedFilterText(text);
    setError(r.error || null);
  };
  const dirty = text !== applied;
  // advancedFilterParams: { buttons: ['apply'|'clear'|'reset'|'cancel'] (기본 ['apply']), suppressBuilderButton }
  const ap = core.gos.advancedFilterParams || {};
  const buttons = Array.isArray(ap.buttons) ? ap.buttons : ['apply'];
  const BTN = {
    apply: [t('advancedFilterApply', '적용'), apply, !dirty],
    clear: [
      t('advancedFilterClear', '지우기'),
      () => {
        setText('');
        setError(null);
      },
      !text,
    ],
    reset: [
      t('advancedFilterReset', '초기화'),
      () => {
        setText('');
        setError(null);
        core.setAdvancedFilterModel(null);
      },
      !text && !applied,
    ],
    cancel: [
      t('advancedFilterCancel', '취소'),
      () => {
        setText(applied);
        setError(null);
      },
      !dirty,
    ],
  };
  // advancedFilterParent: 그리드 밖 요소 안에 입력줄을 둠 (테마 변수가 따라가도록 테마 클래스를 같이 붙임)
  const parent = core.gos.advancedFilterParent;
  const outside = typeof HTMLElement !== 'undefined' && parent instanceof HTMLElement;
  const bar = (
    <div
      className={cx('r2-advanced-filter-header', outside && 'r2-advanced-filter-header-outside r2-theme-vars r2-theme-moon', outside && core.theme?.className)}
      role="row"
    >
      <div className="r2-advanced-filter" role="presentation">
        <Icon name="filter" />
        <input
          className="r2-input-field-input r2-text-field-input r2-advanced-filter-input"
          placeholder={t('advancedFilterPlaceholder', '예) [소유자] contains "USER" AND [행 수] > 100')}
          value={text}
          spellCheck={false}
          onChange={e => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') apply();
          }}
          aria-invalid={!!error}
        />
        {buttons
          .filter(b => BTN[b])
          .map(b => (
            <button key={b} type="button" className={`r2-button r2-advanced-filter-${b}-button`} disabled={BTN[b][2]} onClick={BTN[b][1]}>
              {BTN[b][0]}
            </button>
          ))}
        {!ap.suppressBuilderButton && (
          <button type="button" className="r2-button r2-advanced-filter-builder-button" onClick={() => core.openPopup({ type: 'advancedFilterBuilder' })}>
            {t('advancedFilterBuilder', '빌더')}
          </button>
        )}
      </div>
      {error && <div className="r2-advanced-filter-error">{error}</div>}
    </div>
  );
  return outside ? createPortal(bar, parent) : bar;
}

// 빌더: 조건 목록 + 결합(AND/OR) + 중첩 그룹 편집
const blankCond = core => {
  const col = core.advancedFilterColumns()[0];
  const ft = col ? core.advancedFilterTypeOf(col) : 'text';
  return { filterType: ft, colId: col?.colId, type: ADVANCED_OPS[ft][0][1], filter: '' };
};

// 같은 단계 안에서 위/아래로 옮기기 (advancedFilterBuilderParams.showMoveButtons)
function MoveButtons({ core, i, count, move }) {
  if (!core.gos.advancedFilterBuilderParams?.showMoveButtons) return null;
  return (
    <>
      <button
        type="button"
        className="r2-advanced-filter-builder-move"
        disabled={i === 0}
        onClick={() => move(i, -1)}
        aria-label={localeText(core, 'advancedFilterBuilderMoveUpButtonTooltip', '위로')}
      >
        <Icon name="small-up" />
      </button>
      <button
        type="button"
        className="r2-advanced-filter-builder-move"
        disabled={i === count - 1}
        onClick={() => move(i, 1)}
        aria-label={localeText(core, 'advancedFilterBuilderMoveDownButtonTooltip', '아래로')}
      >
        <Icon name="small-down" />
      </button>
    </>
  );
}

function JoinEditor({ core, node, onChange, onRemove, depth, moveSelf }) {
  const cols = core.advancedFilterColumns();
  const t = (k, d) => localeText(core, k, d);
  const setCond = (i, c) => onChange({ ...node, conditions: node.conditions.map((x, k) => (k === i ? c : x)) });
  const remove = i => onChange({ ...node, conditions: node.conditions.filter((_, k) => k !== i) });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= node.conditions.length) return;
    const next = node.conditions.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...node, conditions: next });
  };
  return (
    <div className="r2-advanced-filter-builder-join" style={{ marginInlineStart: depth ? 16 : 0 }}>
      <div className="r2-advanced-filter-builder-join-head">
        <select value={node.type} onChange={e => onChange({ ...node, type: e.target.value })}>
          <option value="AND">{t('advancedFilterBuilderAnd', 'AND (모두)')}</option>
          <option value="OR">{t('advancedFilterBuilderOr', 'OR (하나라도)')}</option>
        </select>
        <button type="button" onClick={() => onChange({ ...node, conditions: [...node.conditions, blankCond(core)] })}>
          {t('advancedFilterBuilderAddCondition', '+ 조건')}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...node, conditions: [...node.conditions, { filterType: 'join', type: 'OR', conditions: [blankCond(core)] }] })}
        >
          {t('advancedFilterBuilderAddGroup', '+ 그룹')}
        </button>
        {moveSelf}
        {onRemove && (
          <button
            type="button"
            className="r2-advanced-filter-builder-remove"
            onClick={onRemove}
            aria-label={t('advancedFilterBuilderRemoveGroup', '그룹 삭제')}
          >
            <Icon name="cross" />
          </button>
        )}
      </div>
      {node.conditions.map((c, i) =>
        c.filterType === 'join' ? (
          <JoinEditor
            key={i}
            core={core}
            node={c}
            depth={depth + 1}
            onChange={x => setCond(i, x)}
            onRemove={() => remove(i)}
            moveSelf={<MoveButtons core={core} i={i} count={node.conditions.length} move={move} />}
          />
        ) : (
          <div key={i} className="r2-advanced-filter-builder-cond" style={{ marginInlineStart: 16 }}>
            <select
              value={c.colId}
              onChange={e => {
                const col = core.getColumn(e.target.value);
                const ft = core.advancedFilterTypeOf(col);
                setCond(i, { filterType: ft, colId: col.colId, type: ADVANCED_OPS[ft][0][1], filter: '' });
              }}
            >
              {cols.map(col => (
                <option key={col.colId} value={col.colId}>
                  {core.getDisplayName(col)}
                </option>
              ))}
            </select>
            <select value={c.type} onChange={e => setCond(i, { ...c, type: e.target.value })}>
              {(ADVANCED_OPS[c.filterType] || ADVANCED_OPS.text)
                .filter((o, k, arr) => arr.findIndex(x => x[1] === o[1]) === k)
                .map(([label, t]) => (
                  <option key={t} value={t}>
                    {label}
                  </option>
                ))}
            </select>
            {!['blank', 'notBlank', 'true', 'false'].includes(c.type) && (
              <input
                type={c.filterType === 'number' ? 'number' : c.filterType === 'date' || c.filterType === 'dateString' ? 'date' : 'text'}
                value={c.filter ?? ''}
                onChange={e => setCond(i, { ...c, filter: c.filterType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })}
                onKeyDown={e => e.stopPropagation()}
              />
            )}
            <MoveButtons core={core} i={i} count={node.conditions.length} move={move} />
            <button
              type="button"
              className="r2-advanced-filter-builder-remove"
              onClick={() => remove(i)}
              aria-label={t('advancedFilterBuilderRemoveCondition', '조건 삭제')}
            >
              <Icon name="cross" />
            </button>
          </div>
        ),
      )}
    </div>
  );
}

export function AdvancedFilterBuilderPopup({ core }) {
  const ref = useRef(null);
  const [model, setModel] = useState(() => {
    const m = core.getAdvancedFilterModel();
    return m ? JSON.parse(JSON.stringify(m)) : { filterType: 'join', type: 'AND', conditions: [blankCond(core)] };
  });
  const close = () => core.closePopup();
  useClickOutside(ref, close);
  const pos = usePopupPosition(
    ref,
    () => {
      const r = core.eRoot?.getBoundingClientRect();
      return r ? { x: r.left + 8, y: r.top + 40 } : { x: 80, y: 80 };
    },
    [],
    core,
  );
  const preview = core.advancedModelToText(model);
  const t = (k, d) => localeText(core, k, d);
  // advancedFilterBuilderParams: { minWidth, showMoveButtons, buttons: ['apply'|'clear'|'reset'|'cancel'] }
  const bp = core.gos.advancedFilterBuilderParams || {};
  const avail = (core.getPopupParent()?.clientWidth || 600) - 16;
  const width = Math.max(Math.min(bp.minWidth ?? 280, avail), Math.min(560, avail));
  const buttons = Array.isArray(bp.buttons) ? bp.buttons : ['reset', 'cancel', 'apply'];
  const BTN = {
    apply: [
      t('advancedFilterBuilderApply', '적용'),
      () => {
        core.setAdvancedFilterModel(model.conditions.length ? model : null);
        close();
      },
    ],
    clear: [t('advancedFilterBuilderClear', '지우기'), () => setModel({ filterType: 'join', type: 'AND', conditions: [blankCond(core)] })],
    reset: [t('advancedFilterBuilderReset', '초기화'), () => core.setAdvancedFilterModel(null) || close()],
    cancel: [t('advancedFilterBuilderCancel', '취소'), close],
  };
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-dialog r2-popup-child r2-advanced-filter-builder"
        style={{ ...pos.style, width }}
        onKeyDown={e => e.key === 'Escape' && close()}
      >
        <div className="r2-panel-title-bar">
          <span className="r2-panel-title-bar-title">{t('advancedFilterBuilderTitle', '고급 필터 빌더')}</span>
          <span className="r2-panel-title-bar-button" onClick={close} role="button">
            <Icon name="cross" />
          </span>
        </div>
        <div className="r2-advanced-filter-builder-body">
          <JoinEditor core={core} node={model} depth={0} onChange={setModel} />
          <code className="r2-advanced-filter-builder-preview">{preview || t('advancedFilterBuilderEmpty', '(조건 없음)')}</code>
        </div>
        <div className="r2-advanced-filter-builder-buttons">
          {buttons
            .filter(b => BTN[b])
            .map(b => (
              <button key={b} type="button" className={`r2-advanced-filter-builder-${b}`} onClick={BTN[b][1]}>
                {BTN[b][0]}
              </button>
            ))}
        </div>
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}
