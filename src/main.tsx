import { render } from 'preact';
import './styles.css';
import { App } from './ui/app';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('./sw.js');
}
// Ask the browser not to clear this site's storage when space runs low.
void navigator.storage?.persist?.();
