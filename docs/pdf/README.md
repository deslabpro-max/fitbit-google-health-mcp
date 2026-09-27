# Сборка PDF-инструкции

```bash
pip install reportlab
python3 docs/pdf/make_guide.py "docs/Инструкция-Fitbit-Claude-ChatGPT.pdf"
```

Шрифты (OFL): IBM Plex Sans / Mono и Unbounded, статические начертания
получены из вариативных файлов google/fonts.

Иллюстрации: положите `cover.png` (вертикальная) и `hero.png` (горизонтальная)
рядом со скриптом — обложка и баннер на стр. 2 подхватят их сами; без файлов
собирается векторная версия.
