import { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { CTAButton } from '../PermissionsStep';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function ApiSetupStep({ onComplete, onBack }: Props) {
  const [endpoint, setEndpoint] = useState('https://openrouter.ai/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('API Key là bắt buộc');
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
      setError('Lưu cấu hình thất bại. Vui lòng thử lại.');
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
        background:
          'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(255,141,92,0.14) 0%, rgba(28,24,20,0.97) 60%), rgba(28,24,20,0.97)',
        border: '1px solid rgba(255, 141, 92, 0.2)',
        borderRadius: 24,
        padding: '32px 26px 26px',
        boxShadow: '0 0 40px rgba(255,100,40,0.07)',
        position: 'relative',
        overflow: 'hidden',
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
          Thiết lập kết nối AI
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.4)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          Nhập thông tin để kết nối với nhà cung cấp AI
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
            Đường dẫn đến API của nhà cung cấp AI (ví dụ: OpenRouter, OpenAI,
            v.v.)
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
            placeholder="Nhập API Key của bạn"
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
            Khóa bảo mật để xác thực với nhà cung cấp AI
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CTAButton onClick={handleSave} disabled={loading} loading={loading}>
          {loading ? 'Đang lưu...' : 'Tiếp tục'}
        </CTAButton>

        <CTAButton onClick={onBack} disabled={loading} secondary>
          Quay lại
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
        Bạn có thể thay đổi cài đặt này sau trong ứng dụng bằng lệnh /endpoint
        và /api-key
      </p>
    </motion.div>
  );
}
