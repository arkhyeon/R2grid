import React from 'react';
import ReactDOM from 'react-dom/client';
// CLM30 main.jsx 와 동일한 초기화 코드 (import 경로만 자체 그리드)
import {
  AllEnterpriseModule,
  LicenseManager,
  ModuleRegistry,
  provideGlobalGridOptions,
  themeQuartz,
} from './grid/index.js';
import App from './App.jsx';
import Playground from './playground/Playground.jsx';

LicenseManager.setLicenseKey('not-needed');
ModuleRegistry.registerModules([AllEnterpriseModule]);
const gridTheme = themeQuartz.withParams({ accentColor: '#4db8ff' }, 'dark');
provideGlobalGridOptions({ theme: gridTheme });

// 기본: 플레이그라운드 / ?demo: 기존 종합 데모 단독 화면
const legacy = new URLSearchParams(window.location.search).has('demo') || new URLSearchParams(window.location.search).has('rows') || new URLSearchParams(window.location.search).has('tab');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{legacy ? <App /> : <Playground />}</React.StrictMode>,
);
