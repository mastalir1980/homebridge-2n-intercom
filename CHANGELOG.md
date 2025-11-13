# Changelog

## [2.2.0] - 2025-11-13

### ✨ New Features

- **Per-User Doorbell Filtering**: Add `doorbellUser` configuration to trigger ring notifications only for a selected SIP user/account. The plugin fetches available phone accounts from the intercom at startup and logs them to help configuration.

### 🐞 Fixes & Improvements

- **Minor release**: Documentation and packaging updates, version bump to 2.2.0.

## [2.1.0] - 2025-11-09

### � Major Features

#### 🔒 Complete SSL/HTTPS Support
- **HTTPS by Default**: Secure HTTPS is now the default protocol for all communications
- **Protocol Selection**: Choose between HTTP and HTTPS in web configuration interface
- **SSL Certificate Handling**: Configurable SSL certificate verification (disabled by default for self-signed certs)
- **Smart URL Generation**: Automatic protocol detection with explicit configuration options

#### 📷 Enhanced Camera Experience
- **Fixed Black Screen Issue**: Completely resolved 10-second black screens in camera preview
- **Intelligent Snapshot Caching**: 5-second cache prevents interruptions and provides seamless experience
- **Graceful Error Recovery**: Uses cached snapshots when camera requests fail
- **Optimized Performance**: Better refresh intervals and faster response times

### 🔧 Technical Improvements
- **Protocol Configuration**: New `protocol` parameter with HTTPS default
- **SSL Verification**: Configurable `verifySSL` parameter for certificate handling
- **Enhanced Snapshot System**: Intelligent caching with fallback mechanisms
- **Improved Timeouts**: Optimized request timeouts for better reliability
- **Better Error Handling**: Graceful degradation with cached content
- **Enhanced Logging**: Detailed protocol and SSL status information

### 🛡️ Security & Privacy
- **Secure Defaults**: HTTPS enabled by default for all new installations
- **Certificate Flexibility**: Works with self-signed certificates (common in 2N intercoms)
- **Clean Sample Config**: Removed personal information from configuration examples

### 📋 Configuration Updates
- **Default Protocol**: `https` (was auto-detected)
- **Default Snapshot Refresh**: 30 seconds (was 10 seconds)
- **Minimum Refresh Interval**: 10 seconds (was 5 seconds)
- **New SSL Options**: `protocol` and `verifySSL` parameters

### 🔄 Migration Notes
- Existing configurations automatically upgrade to HTTPS
- All HTTP requests now support SSL with configurable verification
- No breaking changes - backward compatibility maintained

### 🔒 SSL Support
- **HTTPS by Default**: HTTPS is now the default protocol for secure communication
- **Protocol Selection**: Explicit choice between HTTP and HTTPS in web configuration
- **SSL Certificate Handling**: Configurable SSL certificate verification (disabled by default for self-signed certificates)
- **Web Configuration**: Added protocol selector and verifySSL option in Device Settings section

### 🔧 Technical Enhancements
- Added `protocol` configuration parameter (default: 'https')
- Added `verifySSL` configuration parameter (default: false)
- Updated all HTTP requests to support SSL with configurable certificate verification
- Enhanced URL generation with explicit protocol selection
- SSL configuration passed to camera streaming and doorbell monitoring
- Improved logging with protocol and SSL verification status

## [1.3.0] - 2025-11-07

### 🚀 Performance Improvements
- **Optimalizace video streamingu**: Výrazné zrychlení navazování video streamu
- **Nativní VGA@15fps**: Použití původního rozlišení 2N interkomu pro eliminaci transcodingu
- **Rychlejší timeouty**: Zkrácení čekacích časů pro rychlejší odezvu
- **Čistší logy**: Redukce verbose výpisů, zachování pouze důležitých informací

### 🔧 Technical Details
- RTSP connection test: 8s → 3s (62% rychlejší)
- FFmpeg startup timeout: 15s → 8s (47% rychlejší)
- Optimalizované retry mechanismy
- VGA@15fps end-to-end streaming bez zbytečného škálování
- Vylepšená detekce úspěšného spuštění streamu

### 📊 Expected Results
- Video stream se spustí za 5-10 sekund místo původních 15-30 sekund
- Nižší zatížení CPU díky eliminaci transcodingu
- Menší datové toky díky nativnímu VGA rozlišení
- Stabilnější performance na Raspberry Pi

## [1.2.1] - Previous Release
- Základní funkcionalita video streamingu
- Door unlock ovládání
- Doorbell notifications