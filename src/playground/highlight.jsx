// 아주 가벼운 JS/JSX 하이라이터 (외부 의존성 없음)
import React from 'react';

const RULES = [
  ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
  ['string', /`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/y],
  ['tag', /<\/?[A-Za-z][\w.]*|\/?>/y],
  ['keyword', /\b(?:import|from|export|default|const|let|var|function|return|if|else|new|true|false|null|undefined|await|async|this|typeof)\b/y],
  ['number', /\b\d[\d_]*(?:\.\d+)?\b/y],
  ['attr', /\b[A-Za-z_$][\w$]*(?==\{|="|=')/y],
  ['prop', /\b[A-Za-z_$][\w$]*(?=\s*:)/y],
  ['fn', /\b[A-Za-z_$][\w$]*(?=\s*\()/y],
  ['plain', /[\s\S]/y],
];

export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    for (const [type, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m) {
        const last = out[out.length - 1];
        if (type === 'plain' && last?.type === 'plain') last.text += m[0];
        else out.push({ type, text: m[0] });
        i += m[0].length;
        break;
      }
    }
  }
  return out;
}

export function Code({ code }) {
  return (
    <pre className="pg-code">
      <code>
        {tokenize(code).map((t, i) =>
          t.type === 'plain' ? t.text : (
            <span key={i} className={`tk-${t.type}`}>
              {t.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}
