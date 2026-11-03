import {createRoot} from 'react-dom/client';
import {lazy, Suspense} from 'react';
import App from './app/App';
import './ui/styles.css';
import './ui/theme-cozy.css';
import './ui/layout-viewport.css';
import './ui/layout-battle.css';
import {initRUM} from './observability/rum';
void initRUM();
const WarehouseWalkPreview = import.meta.env.DEV ? lazy(() => import('./modules/chapter5/WarehouseWalkPreview')) : null;
createRoot(document.getElementById('root')!).render(WarehouseWalkPreview && new URLSearchParams(window.location.search).has('warehouseWalk')
  ? <Suspense fallback={<p>正在打开仓库预览…</p>}><WarehouseWalkPreview/></Suspense>
  : <App/>);
