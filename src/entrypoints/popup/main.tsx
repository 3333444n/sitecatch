import { render } from 'preact';
import '@/ui/theme.css';
import './popup.css';
import { App } from './App';

const root = document.getElementById('app');
if (root) render(<App />, root);
