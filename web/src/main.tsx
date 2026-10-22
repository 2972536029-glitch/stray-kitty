import {createRoot} from 'react-dom/client';
import App from './app/App';
import './ui/styles.css';
import './ui/theme-cozy.css';
import './ui/layout-viewport.css';
createRoot(document.getElementById('root')!).render(<App/>);
