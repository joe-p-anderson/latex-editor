import { mount } from 'svelte'
import App from './App.svelte'
// Bundled typefaces: Source Sans 3 for the chrome, and the four page faces.
import '@fontsource-variable/source-sans-3/wght.css'
import '@fontsource-variable/crimson-pro/wght.css'
import '@fontsource-variable/crimson-pro/wght-italic.css'
import '@fontsource-variable/eb-garamond/wght.css'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import '@fontsource/libre-caslon-text/400.css'
import '@fontsource/libre-caslon-text/400-italic.css'
import '@fontsource/libre-caslon-text/700.css'
import '@fontsource/old-standard-tt/400.css'
import '@fontsource/old-standard-tt/400-italic.css'
import '@fontsource/old-standard-tt/700.css'
import './app.css'
import './bench.css'

mount(App, { target: document.getElementById('app')! })
