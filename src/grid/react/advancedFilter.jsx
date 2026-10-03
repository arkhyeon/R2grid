// 고급 필터 입력줄 + 빌더 팝업
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADVANCED_OPS } from '../core/advancedFilter.js';
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
  const apply = () => {
    const r = core.applyAdvancedFilterText(text);
    setError(r.error || null);
  };
  const dirty = text !== applied;
  return (
    <div className="r2-advanced-filter-header" role="row">
      <div className="r2-advanced-filter" role="presentation">
        <Icon name="filter" />
        <input
          className="r2-input-field-input r2-text-field-input r2-advanced-filter-input"
          placeholder='예) [소유자] contains "USER" AND [행 수] > 100'
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
        <button type="button" className="r2-button r2-advanced-filter-apply-button" disabled={!dirty} onClick={apply}>
          적용
        </button>
        <button type="button" className="r2-button r2-advanced-filter-builder-button" onClick={() => core.openPopup({ type: 'advancedFilterBuilder' })}>
          빌더
        </button>
      </div>
      {error && <div className="r2-advanced-filter-error">{error}</div>}
    </div>
  );
}

// 빌더: 조건 목록 + 결합(AND/OR) + 중첩 그룹 편집
const blankCond = core => {
  const col = core.advancedFilterColumns()[0];
  const ft = col ? core.advancedFilterTypeOf(col) : 'text';
  return { filterType: ft, colId: col?.colId, type: ADVANCED_OPS[ft][0][1], filter: '' };
};

function JoinEditor({ core, node, onChange, onRemove, depth }) {
  const cols = core.advancedFilterColumns();
  const setCond = (i, c) => onChange({ ...node, conditions: node.conditions.map((x, k) => (k === i ? c : x)) });
  const remove = i => onChange({ ...node, conditions: node.conditions.filter((_, k) => k !== i) });
  return (
    <div className="r2-advanced-filter-builder-join" style={{ marginInlineStart: depth ? 16 : 0 }}>
      <div className="r2-advanced-filter-builder-join-head">
        <select value={node.type} onChange={e => onChange({ ...node, type: e.target.value })}>
          <option value="AND">AND (모두)</option>
          <option value="OR">OR (하나라도)</option>
        </select>
        <button type="button" onClick={() => onChange({ ...node, conditions: [...node.conditions, blankCond(core)] })}>
          + 조건
        </button>
        <button type="button" onClick={() => onChange({ ...node, conditions: [...node.conditions, { filterType: 'join', type: 'OR', conditions: [blankCond(core)] }] })}>
          + 그룹
        </button>
        {onRemove && (
          <button type="button" className="r2-advanced-filter-builder-remove" onClick={onRemove} aria-label="그룹 삭제">
            <Icon name="cross" />
          </button>
        )}
      </div>
      {node.conditions.map((c, i) =>
        c.filterType === 'join' ? (
          <JoinEditor key={i} core={core} node={c} depth={depth + 1} onChange={x => setCond(i, x)} onRemove={() => remove(i)} />
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
            <button type="button" className="r2-advanced-filter-builder-remove" onClick={() => remove(i)} aria-label="조건 삭제">
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
  return createPortal(
    <PopupLayer core={core}>
      <div ref={ref} className="r2-dialog r2-popup-child r2-advanced-filter-builder" style={{ ...pos.style, width: Math.max(280, Math.min(560, (core.getPopupParent()?.clientWidth || 600) - 16)) }} onKeyDown={e => e.key === 'Escape' && close()}>
        <div className="r2-panel-title-bar">
          <span className="r2-panel-title-bar-title">고급 필터 빌더</span>
          <span className="r2-panel-title-bar-button" onClick={close} role="button">
            <Icon name="cross" />
          </span>
        </div>
        <div className="r2-advanced-filter-builder-body">
          <JoinEditor core={core} node={model} depth={0} onChange={setModel} />
          <code className="r2-advanced-filter-builder-preview">{preview || '(조건 없음)'}</code>
        </div>
        <div className="r2-advanced-filter-builder-buttons">
          <button type="button" onClick={() => core.setAdvancedFilterModel(null) || close()}>
            초기화
          </button>
          <button type="button" onClick={close}>
            취소
          </button>
          <button
            type="button"
            className="r2-advanced-filter-builder-apply"
            onClick={() => {
              core.setAdvancedFilterModel(model.conditions.length ? model : null);
              close();
            }}
          >
            적용
          </button>
        </div>
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}
