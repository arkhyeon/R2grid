// CLM30 을 수정 없이 clm-datagrid 로 띄우는 vite 설정.
// CLM30 원본 vite.config.mjs 를 그대로 불러와 ag-grid 패키지 import 만 src/grid 로 돌린다.
//   실행: npm run clm30   (CLM30 node_modules 의 vite 로 CLM30 루트를 서빙, 포트 5200)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import clmConfig from '../../02 CLM30/vite.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLM_ROOT = path.resolve(here, '../../02 CLM30');
const GRID = path.resolve(here, '../src/grid/index.js');

export default mergeConfig(clmConfig, {
  root: CLM_ROOT,
  // 원본 dev 서버 prebundle 캐시와 섞이지 않게 분리
  cacheDir: path.join(CLM_ROOT, 'node_modules/.vite-clm-datagrid'),
  resolve: {
    alias: [
      { find: /^ag-grid-(react|community|enterprise)$/, replacement: GRID },
      { find: /^@ag-grid-community\/locale$/, replacement: GRID },
    ],
    // src/grid 의 react import 가 clm-datagrid/node_modules 로 가면 React 2벌 → CLM30 것으로 고정
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['ag-grid-react', 'ag-grid-community', 'ag-grid-enterprise', '@ag-grid-community/locale'],
  },
  server: {
    port: 5200,
    strictPort: true,
    fs: { allow: [CLM_ROOT, path.resolve(here, '..')] },
  },
});
