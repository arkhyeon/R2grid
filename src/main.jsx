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

LicenseManager.setLicenseKey('not-needed');
ModuleRegistry.registerModules([AllEnterpriseModule]);
const gridTheme = themeQuartz.withParams({ accentColor: '#4db8ff' }, 'dark');
provideGlobalGridOptions({ theme: gridTheme });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
