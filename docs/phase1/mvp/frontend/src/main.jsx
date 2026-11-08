import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import L from 'leaflet';
import './tailwind.css';
import 'leaflet/dist/leaflet.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
window.L = L;
import './original.css';

createRoot(document.getElementById('root')).render(<App />);
