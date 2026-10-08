// R2grid 플레이그라운드 — seed-ui 플레이그라운드와 같은 구성(사이드바 · 문서 페이지 · 오른쪽 목차)
//  story = { id, category(대), group(중), name(소·메뉴용), title(상세 제목), desc, keywords[], controls[], render(props, ctx), code(props), usage?{file, code}, wide? }
//  control = { key, type: boolean|select|number|text, default, label?, desc, on?, off?, options?: [값 | { value, label?, desc }] }
//  문서(언제 쓰나요 · 주의 · NEW/UPDATE 스티커)는 storyDocs.js
//  - 활성 스토리는 URL 해시(#/id)로 유지 → 새로고침해도 그대로
//  - 검색: 이름/설명/키워드(옵션·API·이벤트 이름)/분류, 공백으로 여러 단어 AND
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORIES, CATEGORIES } from './stories/index.js';
import STORY_DOCS from './storyDocs.js';
import { Code } from './highlight.jsx';
import './playground.css';

const defaultsOf = story => Object.fromEntries((story.controls || []).map(c => [c.key, c.default]));
const optValue = o => (o && typeof o === 'object' ? o.value : o);
const optLabel = o => (o && typeof o === 'object' ? (o.label ?? String(o.value)) : String(o));
const docsOf = s => STORY_DOCS[s.id] || {};
const badgeOf = s => docsOf(s).badge;

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

// 검색: 단어별 점수 (이름 > 키워드 > 설명 > 분류)
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
      if (s.name.toLowerCase().includes(w) || s.title.toLowerCase().includes(w)) ws += 10;
      if (s.id.includes(w)) ws += 6;
      for (const k of s.keywords || []) {
        if (k.toLowerCase().includes(w)) {
          ws += k.toLowerCase() === w ? 8 : 4;
          hits.add(k);
        }
      }
      for (const c of s.controls || []) {
        if ((c.label || c.key).toLowerCase().includes(w)) {
          ws += 3;
          hits.add(c.label || c.key);
        }
      }
      if ((s.desc || '').toLowerCase().includes(w)) ws += 2;
      if (`${s.category} ${s.group}`.toLowerCase().includes(w)) ws += 1;
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

function Badge({ kind }) {
  return kind ? (
    <span className="pg-badge" data-kind={kind}>
      {kind}
    </span>
  ) : null;
}

// 컨트롤 설명 텍스트 (툴팁 — 좁은 화면)
function controlTip(c) {
  const lines = [c.desc].filter(Boolean);
  if (c.type === 'boolean') {
    if (c.on) lines.push(`켜기: ${c.on}`);
    if (c.off) lines.push(`끄기: ${c.off}`);
  }
  if (c.type === 'select') {
    for (const o of c.options || []) if (o && typeof o === 'object' && o.desc) lines.push(`${optLabel(o)}: ${o.desc}`);
  }
  return lines.join('\n');
}

function HelpIcon({ tip }) {
  return (
    <span className="pg-help" data-tip={tip} aria-label={tip}>
      !
    </span>
  );
}

function ControlRow({ control, value, onChange }) {
  const { key, type, options, min, max, step } = control;
  const label = control.label || key;
  let field;
  if (type === 'boolean') {
    field = <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />;
  } else if (type === 'select') {
    field = (
      <div className="pg-seg">
        {options.map(o => {
          const v = optValue(o);
          return (
            <button key={String(v)} type="button" data-active={value === v} onClick={() => onChange(v)}>
              {optLabel(o)}
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
  const tip = controlTip(control);
  const optDocs = type === 'select' ? (options || []).filter(o => o && typeof o === 'object' && o.desc) : [];
  return (
    <div className="pg-row">
      <div className="pg-row-main">
        <div className="pg-row-label">
          <span>{label}</span>
          {tip && <HelpIcon tip={tip} />}
        </div>
        <div className="pg-row-field">{field}</div>
      </div>
      {/* Controls 판이 넓으면 설명을 바로 글로 (좁으면 숨기고 ! 툴팁) */}
      {(control.desc || control.on || optDocs.length > 0) && (
        <div className="pg-row-doc">
          {control.desc && <p>{control.desc}</p>}
          <OptionList control={control} value={value} />
        </div>
      )}
    </div>
  );
}

// 켜기/끄기 · 선택지별 의미 (현재 값 강조)
function OptionList({ control, value }) {
  const { type, options } = control;
  if (type === 'boolean' && (control.on || control.off)) {
    return (
      <ul className="pg-opts">
        {control.on && (
          <li data-active={value === undefined ? undefined : !!value}>
            <b>켜기</b> {control.on}
          </li>
        )}
        {control.off && (
          <li data-active={value === undefined ? undefined : !value}>
            <b>끄기</b> {control.off}
          </li>
        )}
      </ul>
    );
  }
  const optDocs = type === 'select' ? (options || []).filter(o => o && typeof o === 'object' && o.desc) : [];
  if (!optDocs.length) return null;
  return (
    <ul className="pg-opts">
      {optDocs.map(o => (
        <li key={String(o.value)} data-active={value === undefined ? undefined : value === o.value}>
          <b>{optLabel(o)}</b> {o.desc}
        </li>
      ))}
    </ul>
  );
}

const controlType = c => {
  if (c.type === 'select') return (c.options || []).map(o => optLabel(o)).join(' | ');
  if (c.type === 'text') return 'string';
  return c.type; // boolean · number
};

const defText = c => {
  const v = c.default;
  if (c.type === 'select') {
    const o = (c.options || []).find(x => optValue(x) === v);
    if (o !== undefined) return optLabel(o);
  }
  if (v === '' || v === undefined) return '—';
  return typeof v === 'string' ? `'${v}'` : String(v);
};

// 긴 타입(유니온)은 ' | ' 앞에서만 줄바꿈
function TypeText({ type }) {
  const parts = String(type).split(' | ');
  return (
    <code className="pg-type">
      {parts.map((part, i) => (
        <React.Fragment key={`${part}${i}`}>
          {i > 0 && ' | '}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </code>
  );
}

// 옵션 표: 이름 | 타입 | 기본값 | 설명 (Controls 와 같은 내용을 한눈에)
function OptionTable({ controls }) {
  return (
    <div className="pg-table-wrap">
      <table className="pg-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>타입</th>
            <th>기본값</th>
            <th>설명</th>
          </tr>
        </thead>
        <tbody>
          {controls.map(c => (
            <tr key={c.key}>
              <td>
                <code>{c.label || c.key}</code>
              </td>
              <td>
                <TypeText type={controlType(c)} />
              </td>
              <td>
                <code>{defText(c)}</code>
              </td>
              <td>
                {c.desc}
                <OptionList control={c} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 본문 + 오른쪽 목차 (현재 보고 있는 섹션 강조, 클릭하면 이동)
function DocsPage({ story, toc, children }) {
  const pageRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const clickedRef = useRef(null); // 목차로 이동한 항목 — 사용자가 직접 스크롤하기 전까지 유지

  useEffect(() => {
    const scroller = pageRef.current?.closest('main');
    if (!scroller) return undefined;
    const onScroll = () => {
      if (clickedRef.current) return;
      const top = scroller.getBoundingClientRect().top + 80;
      let current = toc[0]?.id;
      toc.forEach(t => {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top <= top) current = t.id;
      });
      // 맨 아래까지 내리면 마지막 항목 (짧은 끝 섹션은 위까지 못 올라오므로)
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = toc[toc.length - 1]?.id;
      setActiveId(current);
    };
    const release = () => {
      clickedRef.current = null;
    };
    const userEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    userEvents.forEach(ev => scroller.addEventListener(ev, release, { passive: true }));
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      userEvents.forEach(ev => scroller.removeEventListener(ev, release));
    };
  }, [toc]);

  const jump = id => {
    clickedRef.current = id;
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="pg-doc-layout" ref={pageRef}>
      <div className="pg-doc-page">{children}</div>
      <nav className="pg-toc" aria-label={`${story.title} 목차`}>
        <strong>{story.name}</strong>
        {toc.map(t => (
          <button key={t.id} type="button" data-active={t.id === activeId} onMouseDown={e => e.stopPropagation()} onClick={() => jump(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
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
  // 사이드바 아코디언: 대메뉴는 한 번에 하나만 펼침 (기본: 현재 기능의 대메뉴)
  const [openCat, setOpenCat] = useState(() => active.category);
  useEffect(() => {
    setOpenCat(active.category);
  }, [active.category]);
  const searchRef = useRef(null);
  const mainRef = useRef(null);

  // 다크 모드: 소비 앱과 같게 <html data-theme> + 그리드(data-r2-theme-mode)
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

  const select = useCallback((id, push = true) => {
    const s = STORIES.find(x => x.id === id);
    if (!s) return;
    setActiveId(id);
    setProps(defaultsOf(s));
    setLogs([]);
    setCopied(false);
    setMountKey(k => k + 1);
    if (push) window.location.hash = `#/${id}`;
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

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
      setTimeout(() => setCopied(false), 1500);
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

  const docs = docsOf(active);
  const controls = active.controls || [];
  // 현재 값 (선택지에 표시 이름이 있으면 그 이름 — 예: 'both' → true)
  const readout = `{\n${controls
    .map(c => {
      const v = props[c.key];
      const o = c.type === 'select' ? (c.options || []).find(x => optValue(x) === v) : undefined;
      return `  ${c.label || c.key}: ${o && typeof o === 'object' && o.label ? o.label : JSON.stringify(v)}`;
    })
    .join(',\n')}\n}`;

  const toc = useMemo(() => {
    const list = [];
    if (docs.whenToUse?.length) list.push({ id: 'doc-when', label: '언제 쓰나요' });
    list.push({ id: 'doc-demo', label: '직접 해보기' });
    if (controls.length) list.push({ id: 'doc-props', label: '옵션' });
    if (active.keywords?.length) list.push({ id: 'doc-api', label: '관련 API' });
    if (active.usage) list.push({ id: 'doc-usage', label: 'CLM30 사용 예' });
    if (docs.notes?.length) list.push({ id: 'doc-notes', label: '주의' });
    return list;
  }, [active, docs, controls.length]);

  return (
    <div className="pg-layout" data-theme={theme}>
      <aside className="pg-sidebar">
        <div className="pg-brand-row">
          <div className="pg-brand">R2grid Playground</div>
          <button type="button" className="pg-theme-toggle" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} title="다크모드 전환">
            {theme === 'dark' ? '☀' : '◐'}
          </button>
        </div>
        <div className="pg-search">
          <input ref={searchRef} type="search" placeholder="기능·옵션·API 검색 ( / )" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={searchKeyDown} spellCheck={false} />
        </div>
        <div className="pg-count">{results ? `${results.length}개 결과` : `기능 ${STORIES.length}개 · 분류 ${CATEGORIES.length}개`}</div>
        <nav className="pg-nav">
          {results ? (
            results.length ? (
              results.map(({ story, hits }) => (
                <button key={story.id} type="button" className="pg-nav-item pg-result" data-active={story.id === active.id} onClick={() => select(story.id)}>
                  <span className="pg-result-name">
                    <Mark text={story.name} q={query} />
                    <Badge kind={badgeOf(story)} />
                  </span>
                  <span className="pg-result-cat">
                    {story.category} › {story.group}
                  </span>
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
              <div className="pg-empty">검색 결과가 없습니다.</div>
            )
          ) : (
            CATEGORIES.map(cat => {
              const items = STORIES.filter(s => s.category === cat);
              const groups = [...new Set(items.map(s => s.group))];
              const isOpen = openCat === cat;
              const hasBadge = items.some(badgeOf);
              return (
                <div key={cat} className="pg-group" data-open={isOpen}>
                  <button type="button" className="pg-group-title" aria-expanded={isOpen} onClick={() => setOpenCat(isOpen ? null : cat)}>
                    <span className="pg-group-caret">▸</span>
                    <span className="pg-group-name">{cat}</span>
                    {!isOpen && hasBadge && <span className="pg-group-dot" title="새 기능·기능 추가 있음" />}
                    <span className="pg-group-count">{items.length}</span>
                  </button>
                  {isOpen &&
                    groups.map(g => (
                      <div key={g} className="pg-sub">
                        <div className="pg-sub-title">{g}</div>
                        {items
                          .filter(s => s.group === g)
                          .map(s => (
                            <button key={s.id} type="button" className="pg-nav-item" data-active={s.id === active.id} onClick={() => select(s.id)} title={s.title}>
                              {s.name}
                              <Badge kind={badgeOf(s)} />
                            </button>
                          ))}
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </nav>
      </aside>

      <main className="pg-main" ref={mainRef}>
        <div className="pg-head">
          <h1>{active.title}</h1>
          <Badge kind={badgeOf(active)} />
          <span className="pg-chip">
            {active.category} › {active.group}
          </span>
          <code className="pg-url">#/{active.id}</code>
        </div>

        <DocsPage story={active} toc={toc}>
          {active.desc && <p className="pg-lead">{active.desc}</p>}

          {docs.whenToUse?.length > 0 && (
            <section className="pg-section" id="doc-when">
              <h2>언제 쓰나요</h2>
              <ul className="pg-list">
                {docs.whenToUse.map(t => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="pg-section" id="doc-demo">
            <h2>직접 해보기</h2>
            <div className="pg-demo">
              <div className={`pg-stage ${active.wide ? 'pg-stage-wide' : ''}`}>
                <StageBoundary key={`${active.id}:${mountKey}`}>{active.render(props, ctx)}</StageBoundary>
              </div>
              <div className="pg-grid">
                <div className="pg-panel pg-controls">
                  <div className="pg-panel-head">
                    <span>Controls</span>
                    {controls.length > 0 && (
                      <button type="button" className="pg-small-btn" onClick={() => setProps(defaultsOf(active))}>
                        reset
                      </button>
                    )}
                  </div>
                  {controls.length === 0 ? (
                    <div className="pg-empty-small">조절 가능한 옵션 없음 — 그리드를 직접 조작해 보세요</div>
                  ) : (
                    controls.map(c => <ControlRow key={c.key} control={c} value={props[c.key]} onChange={v => setProps(p => ({ ...p, [c.key]: v }))} />)
                  )}
                  {controls.length > 0 && (
                    <div className="pg-readout">
                      <span>current props</span>
                      <pre>{readout}</pre>
                    </div>
                  )}
                </div>
                <div className="pg-panel">
                  <div className="pg-panel-head">
                    <span>Code</span>
                    <button type="button" className="pg-small-btn" data-copied={copied} onClick={copy}>
                      {copied ? '✓ 복사됨' : '복사'}
                    </button>
                  </div>
                  <Code code={code} />
                </div>
              </div>
              <div className="pg-panel pg-log-panel">
                <div className="pg-panel-head">
                  <span>이벤트 로그</span>
                  {logs.length > 0 && (
                    <button type="button" className="pg-small-btn" onClick={() => setLogs([])}>
                      clear
                    </button>
                  )}
                </div>
                <pre className="pg-log">{logs.length ? logs.join('\n') : '(그리드를 조작하면 이벤트가 표시됩니다)'}</pre>
              </div>
            </div>
          </section>

          {controls.length > 0 && (
            <section className="pg-section" id="doc-props">
              <h2>옵션</h2>
              <OptionTable controls={controls} />
            </section>
          )}

          {active.keywords?.length > 0 && (
            <section className="pg-section" id="doc-api">
              <h2>관련 API</h2>
              <p className="pg-desc">누르면 그 이름으로 다른 기능을 검색합니다.</p>
              <div className="pg-keywords">
                {active.keywords.map(k => (
                  <code key={k} onClick={() => setQuery(k)} title="이 이름으로 검색">
                    {k}
                  </code>
                ))}
              </div>
            </section>
          )}

          {active.usage && (
            <section className="pg-section" id="doc-usage">
              <h2>CLM30 사용 예</h2>
              <p className="pg-desc">
                <code>{active.usage.file}</code>
              </p>
              <Code code={active.usage.code} />
            </section>
          )}

          {docs.notes?.length > 0 && (
            <section className="pg-section" id="doc-notes">
              <h2>주의</h2>
              <ul className="pg-list">
                {docs.notes.map(n => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </DocsPage>
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
