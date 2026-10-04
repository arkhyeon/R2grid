import start from './start.jsx';
import data from './data.jsx';
import columns from './columns.jsx';
import rows from './rows.jsx';
import cells from './cells.jsx';
import filters from './filters.jsx';
import grouping from './grouping.jsx';
import server from './server.jsx';
import ui from './ui.jsx';
import exporting from './export.jsx';
import clm from './clm.jsx';
import advanced from './advanced.jsx';

// 카테고리 순서는 첫 등장 순 — advanced 스토리는 각 카테고리 끝에 붙도록 카테고리별로 정렬
const BASE = [...start, ...data, ...columns, ...rows, ...cells, ...filters, ...grouping, ...server, ...ui, ...exporting, ...clm];
const ORDER = [...new Set(BASE.map(s => s.category))];
export const STORIES = ORDER.flatMap(cat => [...BASE, ...advanced].filter(s => s.category === cat));
export const CATEGORIES = [...new Set(STORIES.map(s => s.category))];
