// R2grid 플레이그라운드 — seed-ui Playground 구조 + 전체 기능 검색
//  story = { id, category, name, desc, keywords[], controls[], render(props, ctx), code(props), usage?{file, code}, wide? }
//  controls 타입: boolean | select | number | text
//  - 활성 스토리는 URL 해시(#/id)로 유지 → 새로고침해도 그대로
//  - 검색: 이름/설명/키워드(옵션·API·이벤트 이름)/카테고리, 공백으로 여러 단어 AND
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORIES, CATEGORIES } from './stories/index.js';
import { Code } from './highlight.jsx';
import './playground.css';

const defaultsOf = story => Object.fromEntries((story.controls || []).map(c => [c.key, c.default]));

function readHash() {
  const m = /^#\/([\w-]+)/.exec(window.location.hash);
  return m ? m[1] : null;
}

function readTheme() {
  try {
    return localStorage.getItem('r2pg-theme') || 'light';
  } catch {
    return 'light';
  }
}

// 검색: 단어별 점수 (이름 > 키워드 > 설명 > 카테고리)
function searchStories(q) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const out = [];
  for (const s of STORIES) {
    let score = 0;
    const hits = new Set();
    let ok = true;
    for (const w of words) {
      let ws = 0;
      if (s.name.toLowerCase().includes(w)) ws += 10;
      if (s.id.includes(w)) ws += 6;
      for (const k of s.keywords || []) {
        if (k.toLowerCase().includes(w)) {
          ws += k.toLowerCase() === w ? 8 : 4;
          hits.add(k);
        }
      }
      if ((s.desc || '').toLowerCase().includes(w)) ws += 2;
      if (s.category.toLowerCase().includes(w)) ws += 1;
      if (!ws) {
        ok = false;
        break;
      }
      score += ws;
    }
    if (ok) out.push({ story: s, score, hits: [...hits].slice(0, 6) });
  }
  return out.sort((a, b) => b.score - a.score);
}

function Mark({ text, q }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

function ControlRow({ control, value, onChange }) {
  const { key, type, options, desc, min, max, step } = control;
  let field;
  if (type === 'boolean') {
    field = (
      <label className="pg-switch">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        <span />
      </label>
    );
  } else if (type === 'select') {
    field = (
      <div className="pg-seg">
        {options.map(o => {
          const v = typeof o === 'object' ? o.value : o;
          const label = typeof o === 'object' ? o.label : String(o);
          return (
            <button key={String(v)} type="button" data-active={value === v} onClick={() => onChange(v)}>
              {label}
            </button>
          );
        })}
      </div>
    );
  } else if (type === 'number') {
    field = <input type="number" value={value ?? ''} min={min} max={max} step={step} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  } else {
    field = <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} />;
  }
  return (
    <div className="pg-row">
      <div className="pg-row-label" title={desc}>
        {key}
        {desc && <span className="pg-help" data-tip={desc}>?</span>}
      </div>
      <div className="pg-row-field">{field}</div>
    </div>
  );
}

export default function Playground() {
  const [activeId, setActiveId] = useState(() => readHash() || STORIES[0].id);
  const active = STORIES.find(s => s.id === activeId) || STORIES[0];
  const [props, setProps] = useState(() => defaultsOf(active));
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState(readTheme);
  const [copied, setCopied] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const searchRef = useRef(null);
  const mainRef = useRef(null);

  // 다크 모드: 플레이그라운드 + 그리드(data-r2-theme-mode)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') root.setAttribute('data-r2-theme-mode', 'dark');
    else root.removeAttribute('data-r2-theme-mode');
    try {
      localStorage.setItem('r2pg-theme', theme);
    } catch {
      /* 무시 */
    }
  }, [theme]);

  useEffect(() => {
    const onHash = () => {
      const id = readHash();
      if (id && id !== activeId) select(id, false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  // 검색 단축키: / 또는 Ctrl+K
  useEffect(() => {
    const onKey = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const select = useCallback((id, push = true) => {
    const s = STORIES.find(x => x.id === id);
    if (!s) return;
    setActiveId(id);
    setProps(defaultsOf(s));
    setLogs([]);
    setMountKey(k => k + 1);
    if (push) window.location.hash = `#/${id}`;
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const log = useCallback(msg => {
    const t = new Date().toTimeString().slice(0, 8);
    setLogs(prev => [`${t}  ${msg}`, ...prev].slice(0, 80));
  }, []);
  const ctx = useMemo(() => ({ log, dark: theme === 'dark' }), [log, theme]);

  const results = useMemo(() => searchStories(query), [query]);
  const code = active.code(props);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const searchKeyDown = e => {
    if (e.key === 'Enter' && results?.length) {
      select(results[0].story.id);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setQuery('');
      e.currentTarget.blur();
    }
  };

  return (
    <div className="pg-layout" data-theme={theme}>
      <aside className="pg-sidebar">
        <div className="pg-brand-row">
          <div className="pg-brand">
            R2grid <span>Playground</span>
          </div>
          <button type="button" className="pg-theme-toggle" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} title="다크 모드">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
        <div className="pg-search">
          <input
            ref={searchRef}
            placeholder="기능·옵션·API 검색  ( / )"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={searchKeyDown}
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="검색 지우기">
              ×
            </button>
          )}
        </div>
        <div className="pg-count">
          {results ? `${results.length}개 결과` : `기능 ${STORIES.length}개 · 카테고리 ${CATEGORIES.length}개`}
        </div>
        <nav className="pg-nav">
          {results ? (
            results.length ? (
              results.map(({ story, hits }) => (
                <button key={story.id} type="button" className="pg-nav-item pg-result" data-active={story.id === active.id} onClick={() => select(story.id)}>
                  <span className="pg-result-name">
                    <Mark text={story.name} q={query} />
                  </span>
                  <span className="pg-result-cat">{story.category}</span>
                  {hits.length > 0 && (
                    <span className="pg-result-hits">
                      {hits.map(h => (
                        <code key={h}>
                          <Mark text={h} q={query} />
                        </code>
                      ))}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="pg-empty">일치하는 기능이 없습니다</div>
            )
          ) : (
            CATEGORIES.map(cat => (
              <div key={cat} className="pg-group">
                <div className="pg-group-title">{cat}</div>
                {STORIES.filter(s => s.category === cat).map(s => (
                  <button key={s.id} type="button" className="pg-nav-item" data-active={s.id === active.id} onClick={() => select(s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>
      </aside>

      <main className="pg-main" ref={mainRef}>
        <div className="pg-head">
          <h1>{active.name}</h1>
          <span className="pg-chip">{active.category}</span>
          <code className="pg-url">#/{active.id}</code>
        </div>
        {active.desc && <p className="pg-desc">{active.desc}</p>}
        {active.keywords?.length > 0 && (
          <div className="pg-keywords">
            {active.keywords.map(k => (
              <code key={k} onClick={() => setQuery(k)} title="이 키워드로 검색">
                {k}
              </code>
            ))}
          </div>
        )}

        <div className={`pg-stage ${active.wide ? 'pg-stage-wide' : ''}`}>
          <StageBoundary key={`${active.id}:${mountKey}`}>{active.render(props, ctx)}</StageBoundary>
        </div>

        <div className="pg-grid">
          <section className="pg-panel">
            <div className="pg-panel-head">
              <span>Controls</span>
              <button type="button" className="pg-small-btn" onClick={() => setProps(defaultsOf(active))}>
                reset
              </button>
            </div>
            {active.controls?.length ? (
              active.controls.map(c => <ControlRow key={c.key} control={c} value={props[c.key]} onChange={v => setProps(p => ({ ...p, [c.key]: v }))} />)
            ) : (
              <div className="pg-empty-small">조절 가능한 옵션 없음 (그리드를 직접 조작해 보세요)</div>
            )}
            <div className="pg-log">
              <div className="pg-log-head">
                <span>이벤트 로그</span>
                {logs.length > 0 && (
                  <button type="button" className="pg-small-btn" onClick={() => setLogs([])}>
                    clear
                  </button>
                )}
              </div>
              <pre>{logs.length ? logs.join('\n') : '(그리드를 조작하면 이벤트가 표시됩니다)'}</pre>
            </div>
          </section>

          <section className="pg-panel">
            <div className="pg-panel-head">
              <span>Code</span>
              <button type="button" className="pg-small-btn" data-copied={copied} onClick={copy}>
                {copied ? '✓ 복사됨' : '복사'}
              </button>
            </div>
            <Code code={code} />
          </section>
        </div>

        {active.usage && (
          <section className="pg-panel pg-usage">
            <div className="pg-panel-head">
              <span>본 프로젝트(CLM30) 사용 예</span>
              <code className="pg-url">{active.usage.file}</code>
            </div>
            <Code code={active.usage.code} />
          </section>
        )}
      </main>
    </div>
  );
}

// 스토리 렌더 오류가 플레이그라운드 전체를 깨뜨리지 않게
class StageBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return <div className="pg-error">렌더 오류: {String(this.state.error.message || this.state.error)}</div>;
    return this.props.children;
  }
}
