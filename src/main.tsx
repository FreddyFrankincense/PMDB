import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeStandaloneDesktopRuntime } from './utils/standaloneDesktopRuntime';

initializeStandaloneDesktopRuntime();

createRoot(document.getElementById('root')!).render(<App />);

