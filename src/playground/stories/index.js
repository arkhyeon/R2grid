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

export const STORIES = [...start, ...data, ...columns, ...rows, ...cells, ...filters, ...grouping, ...server, ...ui, ...exporting, ...clm];
export const CATEGORIES = [...new Set(STORIES.map(s => s.category))];
