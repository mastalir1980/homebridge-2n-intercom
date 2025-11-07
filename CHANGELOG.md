# Changelog

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