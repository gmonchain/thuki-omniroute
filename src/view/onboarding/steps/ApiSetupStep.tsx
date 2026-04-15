import { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { CTAButton } from '../PermissionsStep';

interface Props {
  onBack: () => void;
}

export function ApiSetupStep({ onBack }: Props) {
  const [endpoint, setEndpoint] = useState('https://openrouter.ai/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('API Key is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await invoke('set_api_endpoint', { endpoint: endpoint.trim() });
      await invoke('set_api_key', { apiKey: apiKey.trim() });

      // Complete the onboarding process after API setup
      await invoke('finish_onboarding');

      // Don't call onComplete since finish_onboarding will handle the transition
      setLoading(false);
    } catch (err) {
      setError('Failed to save configuration. Please try again.');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{
        width: 420,
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 24,
        padding: '32px 26px 26px',
        boxShadow: 'var(--shadow-chat)',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#f0f0f2',
            letterSpacing: '-0.4px',
            lineHeight: 1.2,
            margin: '0 0 8px',
          }}
        >
          AI Connection Setup
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.4)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          Enter information to connect to the AI provider
        </p>
      </div>

      {/* Form */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <label
            htmlFor="endpoint"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: '#f0f0f2',
              marginBottom: 6,
            }}
          >
            API Endpoint
          </label>
          <input
            id="endpoint"
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#f0f0f2',
              fontSize: 13,
            }}
          />
          <p
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.3)',
              lineHeight: 1.4,
              margin: '6px 0 0 0',
            }}
          >
            Path to the AI provider's API (e.g., OpenRouter, OpenAI, etc.)
          </p>
        </div>

        <div>
          <label
            htmlFor="api-key"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: '#f0f0f2',
              marginBottom: 6,
            }}
          >
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API Key"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#f0f0f2',
              fontSize: 13,
            }}
          />
          <p
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.3)',
              lineHeight: 1.4,
              margin: '6px 0 0 0',
            }}
          >
            Security key to authenticate with the AI provider
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '10px 12px',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            color: '#fecaca',
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <CTAButton
          onClick={onBack}
          disabled={loading}
          secondary
          style={{ flex: 1 }}
        >
          Go Back
        </CTAButton>
        <CTAButton
          onClick={handleSave}
          disabled={loading}
          loading={loading}
          primary
          style={{ flex: 1 }}
        >
          {loading ? 'Saving...' : 'Continue'}
        </CTAButton>
      </div>

      {/* Note */}
      <p
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          lineHeight: 1.4,
          margin: '16px 0 0 0',
        }}
      >
        You can change these settings later in the app using the /endpoint and
        /api-key commands
      </p>
    </motion.div>
  );
}
