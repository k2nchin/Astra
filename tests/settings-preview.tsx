// Visual fixture: no microphone, no credentials, no startup registration.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPanel } from '../src/components/SettingsPanel';
import { DEFAULT_SETTINGS } from '../src/types';
import '../src/index.css';
function Preview() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, handsFree: false, tts: false });
  return <main style={{ minHeight: '100vh', background: '#15171c' }}>
    <SettingsPanel settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} micMode="unknown" handsFree="off" style={{ top: 20, left: 20 }} onRetryHandsFree={() => {}} onTestVoice={() => {}} onResetPosition={() => {}} onClose={() => {}} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
