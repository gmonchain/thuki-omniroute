import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnboardingView } from '../index';
import { invoke } from '../../../testUtils/mocks/tauri';

describe('OnboardingView (orchestrator)', () => {
  beforeEach(() => {
    invoke.mockClear();
    invoke.mockResolvedValue(undefined);
  });

  it('renders PermissionsStep when stage is permissions', async () => {
    render(<OnboardingView stage="permissions" onComplete={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText("Let's get Thuki set up")).toBeInTheDocument();
  });

  it('renders IntroStep when stage is intro', () => {
    render(<OnboardingView stage="intro" onComplete={vi.fn()} />);
    expect(screen.getByText('Before you dive in')).toBeInTheDocument();
  });

  it('renders ApiSetupStep when stage is api-setup', () => {
    render(<OnboardingView stage="api-setup" onComplete={vi.fn()} />);
    expect(screen.getByText('AI Connection Setup')).toBeInTheDocument();
    expect(screen.getByLabelText('API Endpoint')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
  });

  it('completes onboarding after saving API setup', async () => {
    const onComplete = vi.fn();

    render(<OnboardingView stage="api-setup" onComplete={onComplete} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('API Endpoint'), {
        target: { value: 'http://localhost:20128/v1' },
      });
      fireEvent.change(screen.getByLabelText('API Key'), {
        target: { value: 'sk-test-123' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(invoke).toHaveBeenCalledWith('set_api_endpoint', {
      endpoint: 'http://localhost:20128/v1',
    });
    expect(invoke).toHaveBeenCalledWith('set_api_key', {
      apiKey: 'sk-test-123',
    });
    expect(invoke).toHaveBeenCalledWith('finish_onboarding');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
