# Thuki OmniRoute - Project Documentation

## Overview

Thuki OmniRoute is an advanced AI assistant application for macOS that serves as a floating secretary powered by local and cloud-based AI models. The application seamlessly integrates with your workflow, providing contextual assistance through a floating overlay interface.

### Key Features
- **Floating AI Assistant**: Always accessible overlay that floats above all other applications
- **OmniRoute Technology**: Connects to multiple AI providers simultaneously, supporting both local and cloud-based models
- **Contextual Understanding**: Integrates with your screen, clipboard, and selected text to provide contextual responses
- **Customizable AI Models**: Support for multiple AI providers and models with easy switching
- **Visual Processing**: Support for image analysis and screen capture for visual context
- **Privacy-First**: Local processing capabilities with optional cloud integration

## Architecture

### Frontend Stack
- **React 19**: Modern React application with hooks and functional components
- **TypeScript**: Type-safe JavaScript with strict typing
- **Framer Motion**: Smooth animations and transitions
- **Tauri**: Cross-platform framework for desktop applications
- **StreamDown**: Streaming library for handling data flows

### Backend Stack
- **Rust**: High-performance backend with memory safety
- **Tauri**: Bridge between frontend and native OS features
- **SQLite**: Embedded database for conversation history
- **Tokio**: Async runtime for concurrent operations
- **Reqwest**: HTTP client for API requests

## Core Components

### UI Components
- **App.tsx**: Main application component managing overlay state and interactions
- **OnboardingFlow**: Multi-step setup process guiding users through initial configuration
- **AskBarView**: Input interface for user queries and commands
- **ConversationView**: Display of chat history and AI responses
- **ThinkingBlock**: Visual indicator for AI processing state

### Backend Services
- **Commands.rs**: Tauri commands for interfacing between frontend and backend
- **History Management**: Database integration for conversation persistence
- **API Router**: Handles routing to different AI providers
- **Permission Handler**: Manages system permissions (accessibility, screen recording)

## Onboarding Flow

The application implements a comprehensive onboarding process to guide new users:

1. **Permissions Setup**
   - Accessibility permissions for hotkey activation
   - Screen recording permissions for visual context
   - Restart requirement after granting permissions

2. **API Configuration**
   - Endpoint setup for AI providers
   - API key configuration for authentication
   - Support for multiple providers (OpenRouter, OpenAI, etc.)

3. **Introduction**
   - Quick tutorial on application features
   - Usage tips and shortcuts

## Command System

The application includes a rich command system accessible via slash commands:

### Available Commands
- `/model [model-name]`: Switch between different AI models
- `/add-model [model-name]`: Add a new model to available models
- `/del-model [model-name]`: Remove a model from available models
- `/endpoint [url]`: Set custom API endpoint
- `/api-key [key]`: Set custom API key
- `/think`: Activate deep thinking mode
- `/screen`: Capture and analyze current screen
- `/history`: Toggle conversation history

### Usage Examples
```
/model gpt-4
/endpoint http://localhost:20128/v1
/api-key sk-1234567890
/think Analyze this complex problem
```

## AI Provider Integration

### OmniRoute Architecture
The OmniRoute feature enables seamless switching between multiple AI providers:

- **Local Models**: Integration with local Ollama instances
- **Cloud Providers**: Support for OpenRouter, OpenAI, and compatible APIs
- **Model Agnostic**: Works with any OpenAI-compatible API endpoint
- **Smart Routing**: Intelligent distribution of requests based on capabilities

### Configuration
AI providers can be configured through:
1. Onboarding interface
2. Runtime slash commands
3. Environment variables

## Technical Features

### Floating Overlay
- Double-tap Control hotkey to activate
- Context-aware positioning
- Non-intrusive interface that stays above other windows
- Collapsible and expandable states

### Visual Processing
- Screenshot capture capability
- Image analysis and understanding
- OCR integration for text extraction
- Visual context awareness

### Privacy & Security
- Local processing capabilities
- Optional cloud connectivity
- Encrypted conversation storage
- No persistent data collection by default

## Development Setup

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- Bun package manager
- macOS (primary target platform)

### Installation
```bash
cd thuki
bun install
cd src-tauri
cargo build
```

### Running Development Server
```bash
bun run tauri dev
```

### Building Production Version
```bash
bun run build:all
```

## Customization

### Model Configuration
Users can customize their AI experience through various models:
- Code-focused models (e.g., CodeLlama, StarCoder)
- General-purpose models (e.g., GPT-4, Claude)
- Specialized models for specific tasks

### UI Themes
The interface adapts to system dark/light mode preferences with carefully crafted color schemes optimized for focus and readability.

## Troubleshooting

### Common Issues
1. **Overlay not appearing**: Check accessibility permissions in System Preferences
2. **API connection failures**: Verify endpoint and API key configurations
3. **Performance issues**: Ensure sufficient system resources for AI processing

### Support Commands
- Check system status: Run permission checks and configuration validation
- Reset configuration: Clear stored settings and restart onboarding

## Future Roadmap

### Planned Features
- Enhanced multimodal capabilities
- Team collaboration features
- Advanced customization options
- Expanded model marketplace

### Performance Improvements
- More efficient context handling
- Optimized image processing
- Better memory management for long conversations

## Contributing

Contributions are welcome! Please review the contributing guidelines in the repository for details on:
- Code style and architecture decisions
- Testing requirements
- Pull request procedures

## License

This project is licensed under the Apache 2.0 License - see the LICENSE file for details.