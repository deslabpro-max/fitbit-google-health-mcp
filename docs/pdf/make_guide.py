#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Красивая PDF-инструкция «Fitbit → Claude и ChatGPT» (стиль лендинга).
Рисуется на canvas постранично: макеты экранов вместо скриншотов."""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics import renderPDF

HERE = os.path.dirname(os.path.abspath(__file__))
FD = os.path.join(HERE, "fonts")
for name, file in [("Un", "Unbounded-Bold.ttf"), ("UnM", "Unbounded-Medium.ttf"),
                   ("Px", "Plex-Regular.ttf"), ("PxM", "Plex-Medium.ttf"),
                   ("PxS", "Plex-SemiBold.ttf"), ("PxB", "Plex-Bold.ttf"),
                   ("Mo", "IBMPlexMono-Regular.ttf"), ("MoM", "IBMPlexMono-Medium.ttf")]:
    pdfmetrics.registerFont(TTFont(name, os.path.join(FD, file)))
pdfmetrics.registerFontFamily("Px", normal="Px", bold="PxB", italic="Px", boldItalic="PxB")

W, H = A4
M = 42                      # поля
CW = W - 2 * M              # ширина контента
REPO = "https://github.com/deslabpro-max/fitbit-google-health-mcp"

C = lambda h: colors.HexColor(h)
DARK, DARK2, ACC, ACC_D, MINT = C("#0B211C"), C("#12302A"), C("#0E7C6B"), C("#0A5A4E"), C("#5FD4B0")
PAPER, INK, MUT, LINE, SOFT = C("#F4F1EA"), C("#182420"), C("#55625C"), C("#E3DFD3"), C("#F8F6F0")
SAGE, SAGE_T = C("#8FB5A6"), C("#BFD6CC")
WARN_BG, WARN = C("#FFF4DE"), C("#C98A14")
WHITE = colors.white
UI_BLUE = C("#1A73E8")      # «гугловая» кнопка в макетах
CF_ORANGE = C("#F38020")    # «Cloudflare» в макетах


def st(**kw):
    base = dict(fontName="Px", fontSize=10, leading=14.2, textColor=INK)
    base.update(kw)
    return ParagraphStyle("s", **base)

S_BODY = st()
S_BODY_S = st(fontSize=9, leading=12.6, textColor=MUT)
S_STEP = st(fontSize=10, leading=14.2)


def para(c, text, x, ytop, w, style=S_BODY):
    p = Paragraph(text, style)
    _, h = p.wrap(w, 2000)
    p.drawOn(c, x, ytop - h)
    return h


def rrect(c, x, y, w, h, r, fill=None, stroke=None, lw=0.8):
    c.saveState()
    if fill is not None: c.setFillColor(fill)
    if stroke is not None: c.setStrokeColor(stroke); c.setLineWidth(lw)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)
    c.restoreState()


def text(c, s, x, y, font="Px", size=10, color=INK, anchor="l"):
    c.saveState(); c.setFont(font, size); c.setFillColor(color)
    {"l": c.drawString, "r": c.drawRightString, "c": c.drawCentredString}[anchor](x, y, s)
    c.restoreState()


def check_icon(c, x, y, s=7, color=ACC, lw=1.6):
    c.saveState(); c.setStrokeColor(color); c.setLineWidth(lw); c.setLineCap(1); c.setLineJoin(1)
    p = c.beginPath(); p.moveTo(x, y + s * 0.5); p.lineTo(x + s * 0.38, y + s * 0.12); p.lineTo(x + s, y + s * 0.9)
    c.drawPath(p, stroke=1, fill=0); c.restoreState()


def arrow(c, x1, y, x2, color=C("#9AA69F"), lw=1.4):
    c.saveState(); c.setStrokeColor(color); c.setLineWidth(lw); c.setLineCap(1)
    c.line(x1, y, x2, y); c.line(x2 - 5, y + 4, x2, y); c.line(x2 - 5, y - 4, x2, y); c.restoreState()


def marker(c, x, y, n, r=8.5, fill=ACC):
    """Нумерованная метка на макете экрана — «куда нажимать»."""
    c.saveState(); c.setFillColor(fill); c.setStrokeColor(WHITE); c.setLineWidth(1.6)
    c.circle(x, y, r, stroke=1, fill=1); c.restoreState()
    text(c, str(n), x, y - 3.4, "PxB", 9.5, WHITE, "c")


def chip(c, x, y, s, font="PxM", size=8.2, fg=SAGE, border=C("#35544A"), fill=None, pad=8, h=17):
    w = pdfmetrics.stringWidth(s, font, size) + 2 * pad
    rrect(c, x, y, w, h, h / 2, fill=fill, stroke=border)
    text(c, s, x + pad, y + h / 2 - size * 0.34, font, size, fg)
    return w


def qr(c, url, x, y, size):
    w = QrCodeWidget(url); b = w.getBounds()
    d = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
    d.add(w); renderPDF.draw(d, c, x, y)


# ---------- макет окна (вместо скриншота) ----------

def window(c, x, ytop, w, h, url, title=None, dark_bar=False):
    """Окно браузера: полоса с точками и адресом. Возвращает y верха контента."""
    rrect(c, x + 2, ytop - h - 3, w, h, 9, fill=C("#E6E2D8"))
    rrect(c, x, ytop - h, w, h, 9, fill=WHITE, stroke=LINE)
    bar = 22
    c.saveState(); p = c.beginPath()
    p.roundRect(x, ytop - bar, w, bar, 9); c.clipPath(p, stroke=0)
    c.setFillColor(C("#F1EEE6")); c.rect(x, ytop - bar, w, bar, stroke=0, fill=1); c.restoreState()
    c.saveState(); c.setStrokeColor(LINE); c.setLineWidth(0.8); c.line(x, ytop - bar, x + w, ytop - bar); c.restoreState()
    for i, col in enumerate(["#E26D5C", "#E8B04B", "#6BBF6A"]):
        c.saveState(); c.setFillColor(C(col)); c.circle(x + 11 + i * 9, ytop - bar / 2, 2.6, stroke=0, fill=1); c.restoreState()
    rrect(c, x + 44, ytop - bar + 5, w - 56, bar - 10, 5, fill=WHITE)
    text(c, url, x + 51, ytop - bar / 2 - 2.6, "Mo", 7, MUT)
    y = ytop - bar - 12
    if title:
        text(c, title, x + 14, y - 8, "PxS", 11, INK)
        y -= 22
    return y


def field(c, x, ytop, w, label, value, hl=False, mono=False, dropdown=False):
    text(c, label, x, ytop - 8, "PxM", 7.6, MUT)
    bh = 20
    by = ytop - 12 - bh
    rrect(c, x, by, w, bh, 4, fill=C("#EAF6F1") if hl else WHITE, stroke=ACC if hl else C("#C9CFCB"), lw=1.3 if hl else 0.8)
    text(c, value, x + 7, by + bh / 2 - 3, "Mo" if mono else "Px", 7.6 if mono else 8.4, INK)
    if dropdown:
        c.saveState(); c.setFillColor(MUT); p = c.beginPath()
        p.moveTo(x + w - 14, by + 12); p.lineTo(x + w - 8, by + 12); p.lineTo(x + w - 11, by + 8); p.close()
        c.drawPath(p, stroke=0, fill=1); c.restoreState()
    return by


def button(c, x, y, s, fill=ACC, fg=WHITE, h=21, size=8.6, stroke=None):
    w = pdfmetrics.stringWidth(s, "PxS", size) + 22
    rrect(c, x, y, w, h, 5, fill=fill, stroke=stroke)
    text(c, s, x + 11, y + h / 2 - size * 0.35, "PxS", size, fg)
    return w


# ---------- общие элементы страниц ----------

def header_light(c, page_no, label):
    c.setFillColor(PAPER); c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(DARK); c.rect(0, H - 26, W, 26, stroke=0, fill=1)
    logo(c, M, H - 17.5, 9, light=True)
    text(c, label, W - M, H - 17, "PxM", 7.8, SAGE, "r")
    text(c, f"{page_no}", W - M, 22, "PxM", 8, MUT, "r")
    text(c, "github.com/deslabpro-max/fitbit-google-health-mcp  ·  MIT  ·  не медицинское изделие",
         M, 22, "Px", 7.4, MUT)


def logo(c, x, y, size=11, light=True):
    col = MINT
    c.saveState(); c.setStrokeColor(col); c.setLineWidth(1.4); c.setLineCap(1); c.setLineJoin(1)
    s = size / 11.0
    pts = [(0, 5), (4, 5), (6, 0), (10, 11), (13, 3), (14.5, 5), (19, 5)]
    p = c.beginPath(); p.moveTo(x + pts[0][0] * s, y + pts[0][1] * s - 2)
    for a, b in pts[1:]: p.lineTo(x + a * s, y + b * s - 2)
    c.drawPath(p, stroke=1, fill=0); c.restoreState()
    text(c, "Fitbit → ИИ", x + 24 * s, y, "Un", size, C("#F2EFE6") if light else INK)


def step_header(c, ytop, n, title, minutes):
    rrect(c, M, ytop - 34, 34, 34, 9, fill=ACC)
    text(c, str(n), M + 17, ytop - 23.5, "Un", 16, WHITE, "c")
    text(c, "ШАГ " + str(n), M + 46, ytop - 11, "PxB", 7.8, ACC)
    text(c, title, M + 46, ytop - 29, "Un", 16.5, INK)
    w = pdfmetrics.stringWidth(minutes, "PxS", 8.2) + 18
    rrect(c, W - M - w, ytop - 26, w, 18, 9, fill=WHITE, stroke=LINE)
    text(c, minutes, W - M - w + 9, ytop - 20.3, "PxS", 8.2, ACC_D)
    return ytop - 50


def numbered(c, x, ytop, w, items, gap=7):
    """Список шагов с круглыми номерами. items: html-строки. Возвращает низ."""
    y = ytop
    for i, s in enumerate(items, 1):
        c.saveState(); c.setFillColor(C("#DDEEE7")); c.circle(x + 8, y - 7, 8, stroke=0, fill=1); c.restoreState()
        text(c, str(i), x + 8, y - 10.2, "PxB", 8.6, ACC_D, "c")
        h = para(c, s, x + 24, y, w - 24, S_STEP)
        y -= max(h, 16) + gap
    return y


def callout(c, x, ytop, w, title, body, warn=False):
    bg, fg = (WARN_BG, WARN) if warn else (C("#EAF3EE"), ACC_D)
    tw = w - 44
    p = Paragraph(body, st(fontSize=9.2, leading=13, textColor=C("#3E3A2E") if warn else C("#0A3A31")))
    _, bh = p.wrap(tw, 1000)
    h = bh + 34
    rrect(c, x, ytop - h, w, h, 10, fill=bg)
    # иконка
    cx, cy = x + 20, ytop - 20
    c.saveState(); c.setStrokeColor(fg); c.setLineWidth(1.5); c.setLineJoin(1); c.setLineCap(1)
    if warn:
        p2 = c.beginPath(); p2.moveTo(cx, cy + 7); p2.lineTo(cx + 7.5, cy - 6); p2.lineTo(cx - 7.5, cy - 6); p2.close()
        c.drawPath(p2, stroke=1, fill=0); c.line(cx, cy + 2, cx, cy - 2); c.circle(cx, cy - 4, 0.4, stroke=1, fill=1)
    else:
        c.roundRect(cx - 6, cy - 7, 12, 9, 2, stroke=1, fill=0)
        p2 = c.beginPath(); p2.moveTo(cx - 3.5, cy + 2); p2.lineTo(cx - 3.5, cy + 4.5)
        p2.arcTo(cx - 3.5, cy + 1, cx + 3.5, cy + 8, 180, -180); p2.lineTo(cx + 3.5, cy + 2)
        c.drawPath(p2, stroke=1, fill=0)
    c.restoreState()
    text(c, title, x + 36, ytop - 18, "PxB", 9.6, fg)
    p.drawOn(c, x + 36, ytop - 24 - bh)
    return ytop - h


# ======================= СТРАНИЦЫ =======================

COVER_IMG = next((os.path.join(HERE, f) for f in ("cover.png", "cover.jpg", "cover.webp")
                  if os.path.exists(os.path.join(HERE, f))), None)
HERO_IMG = next((os.path.join(HERE, f) for f in ("hero.png", "hero.jpg", "hero.webp")
                 if os.path.exists(os.path.join(HERE, f))), None)


def draw_image_cover(c, path, x, y, w, h):
    """Картинка «cover»: заполняет рамку, лишнее обрезается по центру."""
    from reportlab.lib.utils import ImageReader
    img = ImageReader(path); iw, ih = img.getSize()
    k = max(w / iw, h / ih); dw, dh = iw * k, ih * k
    c.saveState(); p = c.beginPath(); p.rect(x, y, w, h); c.clipPath(p, stroke=0)
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); c.restoreState()


def fade(c, x, y, w, h, color, top_alpha, bottom_alpha, steps=40):
    for i in range(steps):
        a = top_alpha + (bottom_alpha - top_alpha) * i / (steps - 1)
        c.saveState(); c.setFillColor(color); c.setFillAlpha(a)
        c.rect(x, y + h - (i + 1) * h / steps, w, h / steps + 0.5, stroke=0, fill=1); c.restoreState()


def page_cover_image(c):
    c.setFillColor(DARK); c.rect(0, 0, W, H, stroke=0, fill=1)
    draw_image_cover(c, COVER_IMG, 0, 0, W, H)
    fade(c, 0, H - 380, W, 380, DARK, 0.92, 0.0)
    fade(c, 0, 0, W, 250, DARK, 0.0, 0.95)
    logo(c, M, H - 52, 12)
    x = M
    for s in ["Бесплатно", "Открытый код · MIT", "Без посредников"]:
        x += chip(c, x, H - 104, s, fill=DARK) + 6
    t = Paragraph("Спросите свой браслет. Словами.",
                  st(fontName="Un", fontSize=34, leading=40, textColor=C("#F2EFE6")))
    _, th = t.wrap(CW - 40, 400); t.drawOn(c, M, H - 124 - th)
    y = H - 124 - th - 16
    para(c, "Пошаговая инструкция: подключаем браслет Fitbit (или Pixel Watch) к <b>Claude</b> и <b>ChatGPT</b>. "
            "Сон, пульс, шаги, SpO2 — прямо в чате, плюс дневник еды, воды и веса голосом.",
         M, y, 360, st(fontSize=11, leading=16, textColor=SAGE_T))
    cover_footer(c)


def cover_footer(c):
    rrect(c, M, 60, CW, 104, 14, fill=DARK2)
    cols = [("4 шага", "без программирования"), ("40 мин", "от нуля до работы"),
            ("0 ₽", "бесплатные тарифы"), ("15", "инструментов в чате")]
    cw = (CW - 118) / 4
    for i, (a, b) in enumerate(cols):
        xx = M + 20 + i * cw
        text(c, a, xx, 118, "Un", 15, C("#F2EFE6"))
        text(c, b, xx, 100, "Px", 8.4, SAGE)
    rrect(c, W - M - 94, 72, 80, 80, 8, fill=WHITE)
    qr(c, REPO, W - M - 90, 76, 72)
    text(c, "код и инструкция на GitHub", W - M - 54, 64, "Px", 7, SAGE, "c")
    text(c, "Проект открытый (MIT), не аффилирован с Google и Fitbit, не является медицинским изделием.",
         M, 34, "Px", 7.4, C("#6F8C80"))


def page_cover(c):
    if COVER_IMG:
        return page_cover_image(c)
    c.setFillColor(DARK); c.rect(0, 0, W, H, stroke=0, fill=1)
    # мягкий световой круг
    for r, a in [(260, 0.05), (190, 0.05), (120, 0.06)]:
        c.saveState(); c.setFillColor(ACC); c.setFillAlpha(a); c.circle(W - 150, H - 400, r, stroke=0, fill=1); c.restoreState()
    logo(c, M, H - 52, 12)
    x = M
    for s in ["Бесплатно", "Открытый код · MIT", "Без посредников"]:
        x += chip(c, x, H - 104, s) + 6
    t = Paragraph("Спросите свой<br/>браслет.<br/>Словами.",
                  st(fontName="Un", fontSize=34, leading=40, textColor=C("#F2EFE6")))
    _, th = t.wrap(300, 400); t.drawOn(c, M, H - 124 - th)
    y = H - 124 - th - 18
    y -= para(c, "Пошаговая инструкция: подключаем браслет Fitbit (или Pixel Watch) к <b>Claude</b> и <b>ChatGPT</b>. "
              "Сон, пульс, шаги, SpO2 — прямо в чате, плюс дневник еды, воды и веса голосом.",
              M, y, 236, st(fontSize=11, leading=16, textColor=SAGE_T))

    draw_bracelet(c, W - 160, H - 322)
    draw_chat(c, M, 412, 296)

    # нижняя плашка — сводка
    rrect(c, M, 60, CW, 104, 14, fill=DARK2)
    cols = [("4 шага", "без программирования"), ("40 мин", "от нуля до работы"),
            ("0 ₽", "бесплатные тарифы"), ("15", "инструментов в чате")]
    cw = (CW - 118) / 4
    for i, (a, b) in enumerate(cols):
        xx = M + 20 + i * cw
        text(c, a, xx, 118, "Un", 15, C("#F2EFE6"))
        text(c, b, xx, 100, "Px", 8.4, SAGE)
    rrect(c, W - M - 94, 72, 80, 80, 8, fill=WHITE)
    qr(c, REPO, W - M - 90, 76, 72)
    text(c, "код и инструкция на GitHub", W - M - 54, 64, "Px", 7, SAGE, "c")
    text(c, "Проект открытый (MIT), не аффилирован с Google и Fitbit, не является медицинским изделием.",
         M, 34, "Px", 7.4, C("#6F8C80"))


def draw_bracelet(c, cx, cy):
    """Векторная иллюстрация: Fitbit Air — капсула на тканевом ремешке."""
    c.saveState()
    c.translate(cx, cy); c.rotate(-14)
    # ремешок
    c.setFillColor(C("#1D4A40")); c.roundRect(-36, -170, 72, 340, 30, stroke=0, fill=1)
    c.setFillColor(C("#235549")); c.roundRect(-30, -170, 60, 340, 26, stroke=0, fill=1)
    c.setStrokeColor(C("#2F6A5C")); c.setLineWidth(0.8); c.setDash(3, 3)
    c.line(-24, -160, -24, 160); c.line(24, -160, 24, 160); c.setDash()
    # фактура ткани
    c.setStrokeColor(C("#2A5E52")); c.setLineWidth(0.5)
    for yy in range(-160, 165, 7): c.line(-20, yy, 20, yy + 3)
    # капсула
    c.setFillColor(C("#0A1814")); c.roundRect(-30, -62, 60, 124, 28, stroke=0, fill=1)
    c.setFillColor(C("#1B2F2A")); c.roundRect(-27, -59, 54, 118, 26, stroke=0, fill=1)
    c.setFillColor(C("#27433C")); c.roundRect(-22, -12, 30, 64, 14, stroke=0, fill=1)
    c.setFillColor(WHITE); c.setFillAlpha(0.12); c.roundRect(-18, 10, 8, 38, 4, stroke=0, fill=1); c.setFillAlpha(1)
    c.setFillColor(MINT); c.circle(0, -40, 2.6, stroke=0, fill=1)
    c.setFillColor(MINT); c.setFillAlpha(0.25); c.circle(0, -40, 6, stroke=0, fill=1); c.setFillAlpha(1)
    c.restoreState()
    # парящие карточки метрик
    cards = [(cx - 150, cy + 105, "Сон", "7 ч 48 мин"), (cx + 20, cy + 60, "Пульс покоя", "58 уд/мин"),
             (cx - 118, cy - 64, "SpO2", "96 %"), (cx + 30, cy - 130, "Шаги", "13 825")]
    for x, y, a, b in cards:
        rrect(c, x + 2, y - 3, 108, 42, 10, fill=C("#06140F"))
        rrect(c, x, y, 108, 42, 10, fill=C("#F2EFE6"))
        text(c, a, x + 12, y + 26, "PxM", 7.6, MUT)
        text(c, b, x + 12, y + 10, "Un", 11.5, ACC_D)


def draw_chat(c, x, ytop, w):
    h = 176
    rrect(c, x + 3, ytop - h - 4, w, h, 14, fill=C("#06140F"))
    rrect(c, x, ytop - h, w, h, 14, fill=WHITE)
    c.saveState(); c.setFillColor(C("#37B58C")); c.circle(x + 16, ytop - 15, 3.2, stroke=0, fill=1); c.restoreState()
    text(c, "Claude · коннектор fitbit подключён", x + 25, ytop - 18, "PxS", 8, MUT)
    c.saveState(); c.setStrokeColor(C("#ECE8DE")); c.line(x, ytop - 28, x + w, ytop - 28); c.restoreState()

    def bubble(s, yt, right, bw):
        p = Paragraph(s, st(fontSize=9, leading=12.6, textColor=WHITE if right else INK))
        _, bh = p.wrap(bw - 20, 300)
        bx = x + w - bw - 12 if right else x + 12
        rrect(c, bx, yt - bh - 14, bw, bh + 14, 10, fill=ACC if right else C("#F1F3EF"))
        p.drawOn(c, bx + 10, yt - bh - 7)
        return yt - bh - 14 - 8

    y = bubble("Как я спал на этой неделе?", ytop - 38, True, 150)
    y = bubble("В среднем <b>7 ч 48 мин</b>, лучше всего — в четверг. Глубокий сон 50–70 мин за ночь, REM около 2 часов.",
               y, False, 250)
    y = bubble("Запиши обед 700 ккал и стакан воды", y, True, 190)
    rrect(c, x + 12, y - 24, 180, 24, 10, fill=C("#F1F3EF"))
    check_icon(c, x + 21, y - 16, 8)
    text(c, "Записал: обед 700 ккал и 250 мл воды", x + 35, y - 15, "Px", 8.4, INK)


def page_overview(c):
    header_light(c, 2, "Как это работает")
    y = H - 64
    if HERO_IMG:
        bh = 104
        c.saveState(); p = c.beginPath(); p.roundRect(M, y - bh + 14, CW, bh, 14); c.clipPath(p, stroke=0)
        draw_image_cover(c, HERO_IMG, M, y - bh + 14, CW, bh); c.restoreState()
        y -= bh + 8
    text(c, "ЧТО ПОЛУЧИТСЯ", M, y, "PxB", 8, ACC); y -= 26
    text(c, "Ваш ИИ-ассистент видит данные браслета", M, y, "Un", 17, INK); y -= 18
    y -= para(c, "Личный сервер-коннектор связывает облако Google Health, куда синхронизируется браслет, "
              "с Claude и ChatGPT. Дальше просто пишете в любом чате — на телефоне, в браузере, на компьютере:",
              M, y, CW, st(fontSize=10.2, leading=15, textColor=MUT)) + 12

    phrases = ["Как я спал на этой неделе? Сравни с прошлой", "Сколько шагов и калорий сегодня?",
               "Какой пульс покоя за месяц, есть ли тренд?", "Запиши обед: борщ и котлета, 700 ккал",
               "Запиши стакан воды и вес 82,5", "Были ли уведомления об аритмии?"]
    colw = (CW - 12) / 2
    for i, s in enumerate(phrases):
        xx = M + (i % 2) * (colw + 12); yy = y - (i // 2) * 34
        rrect(c, xx, yy - 26, colw, 26, 13, fill=WHITE, stroke=LINE)
        text(c, "«" + s + "»", xx + 14, yy - 16.5, "Px", 8.9, INK)
    y -= 3 * 34 + (22 if HERO_IMG else 34)

    text(c, "КАК ЭТО РАБОТАЕТ", M, y, "PxB", 8, ACC); y -= 14
    nodes = [("Браслет Fitbit", "пульс, сон, шаги, SpO2"), ("Облако Google Health", "куда синхронизирует приложение Fitbit"),
             ("Ваш сервер", "Cloudflare, бесплатно; ключи только у вас"), ("Claude · ChatGPT", "любой чат, любое устройство")]
    nw = (CW - 3 * 22) / 4; nh = 70
    for i, (a, b) in enumerate(nodes):
        xx = M + i * (nw + 22)
        dark = i == 2
        rrect(c, xx, y - nh, nw, nh, 10, fill=DARK if dark else WHITE, stroke=None if dark else LINE)
        draw_node_icon(c, i, xx + 12, y - 24, MINT if dark else ACC)
        text(c, a, xx + 12, y - 42, "PxB", 9.2, C("#F2EFE6") if dark else INK)
        para(c, b, xx + 12, y - 47, nw - 20, st(fontSize=7.6, leading=10, textColor=SAGE if dark else MUT))
        if i < 3: arrow(c, xx + nw + 4, y - nh / 2, xx + nw + 18)
    y -= nh + 22
    y = callout(c, M, y, CW, "Почему это безопасно",
                "Сервер — ваш личный, сервисов-посредников нет. Доступ к данным даётся через обычное окно входа "
                "Google: чтение плюс запись ваших ручных логов (еда, вода, вес). Изменить или удалить данные "
                "браслета коннектор не может — это запрещено на уровне API Google. Код открыт (MIT).") - 34

    text(c, "ЧТО ПОНАДОБИТСЯ", M, y, "PxB", 8, ACC); y -= 12
    needs = [("Браслет или часы", "Fitbit (Air, Charge, Inspire, Sense, Versa…) или Pixel Watch, привязанные к Google-аккаунту"),
             ("GitHub и Cloudflare", "бесплатные аккаунты, банковская карта не нужна"),
             ("Google-аккаунт", "тот же, что в приложении Fitbit на телефоне"),
             ("ИИ-ассистент", "Claude (платный план) или ChatGPT Plus / Pro")]
    for i, (a, b) in enumerate(needs):
        xx = M + (i % 2) * (colw + 12); yy = y - (i // 2) * 58
        rrect(c, xx, yy - 50, colw, 50, 10, fill=WHITE, stroke=LINE)
        c.saveState(); c.setFillColor(C("#DDEEE7")); c.circle(xx + 18, yy - 18, 9, stroke=0, fill=1); c.restoreState()
        check_icon(c, xx + 13.5, yy - 22, 9)
        text(c, a, xx + 34, yy - 21, "PxB", 9.4, INK)
        para(c, b, xx + 34, yy - 25, colw - 44, st(fontSize=8, leading=10.6, textColor=MUT))
    y -= 2 * 58 + (16 if HERO_IMG else 26)

    text(c, "ПЛАН НА 40 МИНУТ", M, y, "PxB", 8, ACC); y -= 14
    plan = [("1", "Сервер", "5 мин"), ("2", "Google Cloud", "15 мин"), ("3", "Ключи", "3 мин"), ("4", "Подключение", "5 мин")]
    pw = (CW - 3 * 10) / 4
    for i, (n, a, b) in enumerate(plan):
        xx = M + i * (pw + 10)
        rrect(c, xx, y - 40, pw, 40, 10, fill=SOFT, stroke=LINE)
        rrect(c, xx + 10, y - 30, 20, 20, 6, fill=ACC)
        text(c, n, xx + 20, y - 24, "Un", 10, WHITE, "c")
        text(c, a, xx + 38, y - 18, "PxB", 9.2, INK)
        text(c, b, xx + 38, y - 30, "Px", 8, MUT)


def draw_node_icon(c, i, x, y, col):
    c.saveState(); c.setStrokeColor(col); c.setLineWidth(1.4); c.setLineCap(1); c.setLineJoin(1)
    if i == 0:
        c.roundRect(x + 3, y - 7, 8, 16, 4, stroke=1, fill=0)
    elif i == 1:
        p = c.beginPath(); p.moveTo(x, y - 5); p.lineTo(x + 14, y - 5)
        p.curveTo(x + 19, y - 5, x + 19, y + 4, x + 13, y + 4); p.curveTo(x + 12, y + 10, x + 3, y + 10, x + 3, y + 3)
        p.curveTo(x - 2, y + 3, x - 3, y - 5, x, y - 5); c.drawPath(p, stroke=1, fill=0)
    elif i == 2:
        c.roundRect(x, y, 16, 7, 2, stroke=1, fill=0); c.roundRect(x, y - 9, 16, 7, 2, stroke=1, fill=0)
    else:
        c.roundRect(x, y - 6, 16, 13, 4, stroke=1, fill=0)
        p = c.beginPath(); p.moveTo(x + 3, y - 6); p.lineTo(x + 1, y - 10); p.lineTo(x + 7, y - 6); c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def page_step1(c):
    header_light(c, 3, "Шаг 1 · Cloudflare")
    y = step_header(c, H - 52, 1, "Сервер на Cloudflare", "≈ 5 минут")
    y -= para(c, "Одна кнопка делает всё сама: копирует код в ваш GitHub, создаёт хранилище токенов "
              "и запускает сервер. Проверено: 17 секунд от клика до рабочего адреса.",
              M, y, CW, st(fontSize=10.2, leading=15, textColor=MUT)) + 14

    lw = 214
    yl = numbered(c, M, y, lw, [
        "Откройте репозиторий проекта — QR-код на обложке или <font name='Mo' size='8.4'>github.com/deslabpro-max/"
        "fitbit-google-health-mcp</font>",
        "Нажмите в описании кнопку <b>Deploy to Cloudflare</b> <font color='#0E7C6B'>(1)</font>",
        "Войдите в Cloudflare или зарегистрируйтесь, разрешите доступ к GitHub",
        "Ничего не меняйте и нажмите <b>Create and deploy</b> <font color='#0E7C6B'>(2)</font>",
        "Дождитесь зелёной сборки и скопируйте адрес сервера <font color='#0E7C6B'>(3)</font>",
    ])

    # макет: README с кнопкой
    wx, ww = M + lw + 20, CW - lw - 20
    yy = window(c, wx, y, ww, 112, "github.com/deslabpro-max/fitbit-google-health-mcp")
    text(c, "Fitbit / Google Health → Claude, ChatGPT", wx + 14, yy - 8, "PxB", 10, INK)
    for i, wdt in enumerate([ww - 60, ww - 90]):
        rrect(c, wx + 14, yy - 22 - i * 9, wdt, 4, 2, fill=C("#E7E4DC"))
    bx = wx + 14; by = yy - 62
    rrect(c, bx, by, 138, 22, 4, fill=CF_ORANGE)
    c.saveState(); c.setFillColor(WHITE); p = c.beginPath()
    p.moveTo(bx + 9, by + 7); p.curveTo(bx + 9, by + 14, bx + 17, by + 17, bx + 20, by + 12)
    p.curveTo(bx + 26, by + 14, bx + 27, by + 7, bx + 23, by + 7); p.close(); c.drawPath(p, stroke=0, fill=1); c.restoreState()
    text(c, "Deploy to Cloudflare", bx + 33, by + 7.6, "PxB", 8.6, WHITE)
    marker(c, bx + 146, by + 11, 1)

    # макет: настройка проекта
    y2 = y - 128
    yy = window(c, wx, y2, ww, 178, "dash.cloudflare.com/…/workers/deploy", "Create a new project")
    fw = ww - 28
    b1 = field(c, wx + 14, yy, fw, "Git account", "deslabpro-max", dropdown=True)
    b2 = field(c, wx + 14, b1 - 6, fw, "Repository name", "fitbit-google-health-mcp", mono=True)
    b3 = field(c, wx + 14, b2 - 6, fw, "Worker name — можно оставить как есть", "fitbit-health-connector", mono=True, hl=True)
    bw = button(c, wx + 14, b3 - 30, "Create and deploy", fill=UI_BLUE)
    marker(c, wx + 14 + bw + 12, b3 - 19.5, 2)

    # макет: успешная сборка
    y3 = min(yl, y2 - 196) - 6
    yy = window(c, M, y3, CW, 112, "dash.cloudflare.com/…/workers/fitbit-health-connector/deployments")
    c.saveState(); c.setFillColor(C("#1E8E3E")); c.circle(M + 22, yy - 6, 7, stroke=0, fill=1); c.restoreState()
    check_icon(c, M + 18.5, yy - 9.5, 7, WHITE, 1.5)
    text(c, "Build  #ed7644d3", M + 36, yy - 10, "PxB", 11, INK)
    text(c, "17 s", W - M - 14, yy - 10, "Mo", 8.4, MUT, "r")
    stages = ["Инициализация", "Клонирование", "Установка", "Развёртывание"]
    sw = (CW - 28 - 3 * 8) / 4
    for i, s in enumerate(stages):
        xx = M + 14 + i * (sw + 8)
        rrect(c, xx, yy - 40, sw, 18, 4, fill=WHITE, stroke=C("#C9CFCB"))
        text(c, s, xx + 7, yy - 34, "Px", 7.8, INK)
        c.saveState(); c.setFillColor(C("#1E8E3E")); c.circle(xx + sw - 10, yy - 31, 4.6, stroke=0, fill=1); c.restoreState()
        check_icon(c, xx + sw - 12.6, yy - 33.6, 5, WHITE, 1.2)
    rrect(c, M + 14, yy - 72, CW - 28, 22, 5, fill=DARK)
    text(c, "https://fitbit-health-connector.ВАШ-ПОДДОМЕН.workers.dev", M + 24, yy - 64.5, "Mo", 8.6, C("#8FE0C2"))
    marker(c, W - M - 26, yy - 61, 3)

    y4 = y3 - 128
    callout(c, M, y4, CW, "Проверьте, что сервер жив",
            "Откройте этот адрес в браузере — должна появиться страница «Коннектор Fitbit Air → Claude». "
            "Сохраните адрес: он понадобится в шагах 2 и 4. Если на экране настройки задали своё имя воркера — "
            "в адресе и в примерах дальше будет оно.")


def page_step2(c):
    header_light(c, 4, "Шаг 2 · Google Cloud")
    y = step_header(c, H - 52, 2, "Доступ к данным браслета", "≈ 15 минут")
    y -= para(c, "Создаём ваше <b>личное</b> приложение в Google Cloud — только оно и только с вашего согласия "
              "сможет читать данные здоровья. Всё делается на <font name='Mo' size='8.6'>console.cloud.google.com</font> "
              "под аккаунтом, к которому привязан браслет.",
              M, y, CW, st(fontSize=10.2, leading=15, textColor=MUT)) + 12

    colw = (CW - 16) / 2
    # 2.1
    text(c, "2.1  Проект и Google Health API", M, y - 8, "PxB", 10.5, INK)
    numbered(c, M, y - 20, colw, [
        "Выбор проекта (слева сверху) → <b>New project</b> → любое имя → Create",
        "В поиске наберите <b>Google Health API</b> → <b>Enable</b>",
    ], gap=5)
    # 2.2
    xr = M + colw + 16
    text(c, "2.2  Экран согласия и Test users", xr, y - 8, "PxB", 10.5, INK)
    numbered(c, xr, y - 20, colw, [
        "<b>OAuth consent screen</b>: имя приложения, ваш e-mail, <b>External</b>, режим <b>Testing</b>",
        "<b>Audience → Test users → Add users</b> → добавьте свой адрес Google",
    ], gap=5)
    y -= 104

    # мини-макеты 2.1 и 2.2
    yy = window(c, M, y, colw, 104, "console.cloud.google.com/apis/library")
    rrect(c, M + 12, yy - 20, colw - 24, 20, 10, fill=C("#F1F3F4"))
    text(c, "Google Health API", M + 24, yy - 13, "Px", 8.4, INK)
    text(c, "Google Health API", M + 12, yy - 38, "PxB", 9.4, INK)
    bw = button(c, M + 12, yy - 64, "Enable", fill=UI_BLUE)
    marker(c, M + 12 + bw + 12, yy - 53.5, 1)

    yy = window(c, xr, y, colw, 104, "console.cloud.google.com/auth/audience")
    text(c, "Test users", xr + 12, yy - 8, "PxB", 9.4, INK)
    button(c, xr + colw - 88, yy - 14, "+ Add users", fill=WHITE, fg=UI_BLUE, stroke=C("#C9CFCB"), h=18, size=7.8)
    rrect(c, xr + 12, yy - 42, colw - 24, 22, 4, fill=C("#EAF6F1"), stroke=ACC, lw=1.2)
    text(c, "ваш.адрес@gmail.com", xr + 22, yy - 34, "Mo", 8, INK)
    marker(c, xr + colw - 24, yy - 31, 2)
    para(c, "Без этого при подключении будет ошибка <b>access_denied</b>", xr + 12, yy - 50, colw - 24,
         st(fontSize=7.8, leading=10, textColor=MUT))
    y -= 116

    # 2.3
    text(c, "2.3  OAuth-клиент для вашего сервера", M, y - 8, "PxB", 10.5, INK)
    yl = numbered(c, M, y - 20, 200, [
        "Раздел <b>Clients</b> → <b>Create client</b>",
        "Тип: <b>Web application</b> — не Desktop!",
        "Имя — любое",
        "<b>Authorized redirect URIs</b> → Add URI → адрес сервера из шага 1 + <font name='Mo' size='8.4'>/callback</font>",
        "<b>Create</b> — появятся Client ID и секрет",
    ], gap=5)
    wx, ww = M + 216, CW - 216
    yy = window(c, wx, y - 14, ww, 226, "console.cloud.google.com/auth/clients/create", "Create OAuth client ID")
    fw = ww - 28
    b1 = field(c, wx + 14, yy, fw, "Application type *", "Web application", dropdown=True, hl=True)
    marker(c, wx + ww - 22, b1 + 10, 2)
    b2 = field(c, wx + 14, b1 - 6, fw, "Name *", "health-connector")
    text(c, "Authorized redirect URIs", wx + 14, b2 - 14, "PxS", 8.4, INK)
    button(c, wx + 14, b2 - 38, "+ Add URI", fill=WHITE, fg=UI_BLUE, stroke=C("#C9CFCB"), h=18, size=7.8)
    b3 = field(c, wx + 14, b2 - 42, fw, "URIs 1 *", "https://fitbit-health-connector.…workers.dev/callback", mono=True, hl=True)
    marker(c, wx + ww - 22, b3 + 10, 4)
    bw = button(c, wx + 14, b3 - 30, "Create", fill=UI_BLUE)
    marker(c, wx + 14 + bw + 12, b3 - 19.5, 5)
    y = min(yl, y - 14 - 226) - 14

    # результат
    yy = window(c, M, y, CW, 88, "console.cloud.google.com/auth/clients", "OAuth client created")
    text(c, "Client ID", M + 14, yy - 8, "PxM", 8, MUT)
    text(c, "1234567890-abc…xyz.apps.googleusercontent.com", M + 110, yy - 8, "Mo", 8.4, INK)
    text(c, "Client secret", M + 14, yy - 26, "PxM", 8, MUT)
    text(c, "GOCSPX-••••••••••••••••", M + 110, yy - 26, "Mo", 8.4, INK)
    button(c, W - M - 118, yy - 22, "Download JSON", fill=WHITE, fg=UI_BLUE, stroke=C("#C9CFCB"), h=20, size=8)
    y -= 100
    callout(c, M, y, CW, "Секрет показывают только один раз",
            "Сразу скопируйте Client ID и Client secret в заметки или нажмите Download JSON. "
            "Потерялся — в клиенте можно добавить новый секрет.", warn=True)


def page_step34(c):
    header_light(c, 5, "Шаги 3–4 · ключи и подключение")
    y = step_header(c, H - 52, 3, "Два ключа — серверу", "≈ 3 минуты")
    lw = 214
    yl = numbered(c, M, y, lw, [
        "Cloudflare → <b>Workers &amp; Pages</b> → ваш воркер → <b>Settings</b> → <b>Variables and Secrets</b> → <b>Add</b>",
        "Type <b>Secret</b>, имя <font name='Mo' size='8.4'>GOOGLE_CLIENT_ID</font>, значение — Client ID → Save",
        "Ещё раз: <font name='Mo' size='8.4'>GOOGLE_CLIENT_SECRET</font> и секрет GOCSPX-… → Save",
    ])
    wx, ww = M + lw + 20, CW - lw - 20
    yy = window(c, wx, y + 4, ww, 118, "dash.cloudflare.com/…/settings", "Variables and Secrets")
    cols = [("Type", 14), ("Name", 70), ("Value", ww - 92)]
    for n, cx in cols: text(c, n, wx + cx, yy - 6, "PxM", 7.6, MUT)
    c.saveState(); c.setStrokeColor(LINE); c.line(wx + 10, yy - 12, wx + ww - 10, yy - 12); c.restoreState()
    for i, (nm, val) in enumerate([("GOOGLE_CLIENT_ID", "1234…"), ("GOOGLE_CLIENT_SECRET", "••••••")]):
        ry = yy - 30 - i * 26
        chip(c, wx + 12, ry - 4, "Secret", "PxM", 7, ACC_D, None, C("#DDEEE7"), 6, 14)
        text(c, nm, wx + 70, ry, "MoM", 7.6, INK)
        text(c, val, wx + ww - 92, ry, "Mo", 7.4, MUT)
        marker(c, wx + ww - 16, ry + 3, i + 2, r=7.5)
    y = min(yl, y + 4 - 118) - 22
    c.saveState(); c.setStrokeColor(LINE); c.setLineWidth(0.8); c.line(M, y + 8, W - M, y + 8); c.restoreState()

    y = step_header(c, y - 6, 4, "Подключаем к ИИ", "≈ 5 минут")
    colw = (CW - 16) / 2
    # Claude
    rrect(c, M, y - 22, colw, 22, 6, fill=C("#F5E6DC"))
    text(c, "Claude — браузер, телефон, десктоп", M + 10, y - 14.5, "PxB", 9.2, C("#8A4B2A"))
    yc = numbered(c, M, y - 32, colw, [
        "claude.ai → <b>Settings</b> → <b>Connectors</b>",
        "<b>Add custom connector</b> → URL сервера + <font name='Mo' size='8.4'>/mcp</font> → Add",
        "<b>Connect</b> → окно Google → аккаунт с браслетом → разрешить",
    ], gap=5)
    xr = M + colw + 16
    rrect(c, xr, y - 22, colw, 22, 6, fill=C("#E2ECE8"))
    text(c, "ChatGPT — планы Plus / Pro", xr + 10, y - 14.5, "PxB", 9.2, ACC_D)
    yg = numbered(c, xr, y - 32, colw, [
        "Settings → <b>Apps &amp; Connectors</b> → Advanced → включить <b>Developer mode</b>",
        "<b>Create</b> → имя Fitbit, URL сервера + <font name='Mo' size='8.4'>/mcp</font>, авторизация <b>OAuth</b>",
        "Окно Google → разрешить. В чате — меню «+»",
    ], gap=5)
    y = min(yc, yg) - 8

    # макет: добавление коннектора
    yy = window(c, M, y, colw, 150, "claude.ai/settings/connectors", "Add custom connector")
    fw = colw - 28
    b1 = field(c, M + 14, yy, fw, "Name", "Fitbit")
    b2 = field(c, M + 14, b1 - 6, fw, "Remote MCP server URL", "https://fitbit-health-connector.…/mcp", mono=True, hl=True)
    bw = button(c, M + 14, b2 - 30, "Add", fill=INK)
    marker(c, M + 14 + bw + 12, b2 - 19.5, 2)

    # макет: окно Google
    yy = window(c, xr, y, colw, 150, "accounts.google.com/signin/oauth")
    text(c, "Google hasn’t verified this app", xr + 14, yy - 8, "PxB", 9.6, INK)
    para(c, "Это <b>ваше</b> личное приложение в режиме тестирования — так и должно быть.",
         xr + 14, yy - 16, colw - 28, st(fontSize=8, leading=11, textColor=MUT))
    text(c, "Advanced", xr + 14, yy - 52, "PxS", 8.2, UI_BLUE)
    bw = button(c, xr + 14, yy - 84, "Continue", fill=UI_BLUE)
    marker(c, xr + 14 + bw + 12, yy - 73.5, 3)
    y -= 166

    callout(c, M, y, CW, "Готово! Проверьте в любом чате",
            "«Покажи статус браслета» — модель, заряд, время синхронизации. «Сводка за сегодня» — шаги, сон "
            "с фазами, пульс, SpO2. «Запиши стакан воды» — проверка записи. Если данных за сегодня нет, "
            "откройте приложение Fitbit на телефоне: данные уходят в облако при синхронизации.")


def page_faq(c):
    header_light(c, 6, "Возможности и частые вопросы")
    y = H - 64
    text(c, "ВОЗМОЖНОСТИ", M, y, "PxB", 8, ACC); y -= 24
    text(c, "15 инструментов в одном коннекторе", M, y, "Un", 16, INK); y -= 16
    feats = [("Сон с фазами", "Глубокий, REM, лёгкий; засыпание, пробуждения, тренды по неделям"),
             ("Пульс, HRV, SpO2", "Пульс покоя и по часам, вариабельность, кислород, дыхание и температура кожи во сне"),
             ("Активность", "Шаги, дистанция, калории, этажи, зонные минуты, тренировки"),
             ("Дневник еды и воды", "Калории и БЖУ голосом — в Fitbit рядом с расходом энергии"),
             ("Аритмия", "Уведомления о возможной фибрилляции предсердий (AFib)"),
             ("Статус браслета", "Заряд и время последней синхронизации — встроенная диагностика")]
    fw = (CW - 2 * 10) / 3
    for i, (a, b) in enumerate(feats):
        xx = M + (i % 3) * (fw + 10); yy = y - (i // 3) * 74
        rrect(c, xx, yy - 66, fw, 66, 10, fill=WHITE, stroke=LINE)
        rrect(c, xx + 12, yy - 20, 4, 10, 2, fill=ACC)
        text(c, a, xx + 22, yy - 18.5, "PxB", 9.6, INK)
        para(c, b, xx + 12, yy - 26, fw - 22, st(fontSize=8, leading=10.8, textColor=MUT))
    y -= 2 * 74 + 10
    para(c, "Данные браслета коннектор только читает. Записывать и удалять можно лишь собственные записи: "
            "вес, еду, воду, тренировки, настроение, симптомы.", M, y, CW, S_BODY_S)
    y -= 50

    text(c, "ЧАСТЫЕ ВОПРОСЫ", M, y, "PxB", 8, ACC); y -= 12
    faq = [("access_denied в окне Google", "Аккаунт не добавлен в Test users (шаг 2.2). Добавьте и подключитесь заново."),
           ("redirect_uri_mismatch", "Адрес в клиенте Google не совпадает с адресом сервера + /callback. Сверьте до буквы, без слэша на конце."),
           ("«Google hasn’t verified this app»", "Норма: приложение ваше личное. Нажимайте Continue."),
           ("Ошибка 403 SERVICE_DISABLED", "Не включён Google Health API (шаг 2.1)."),
           ("Просит переподключиться раз в неделю", "В режиме Testing Google ограничивает токен ~7 днями. Лечится: OAuth consent screen → Publish app."),
           ("Пульс есть, а шаги пустые", "Сводки нового устройства Google считает с задержкой до нескольких часов — коннектор покажет диагностику."),
           ("Нет данных вообще", "Браслет не синхронизирован: откройте приложение Fitbit. «Статус браслета» покажет время синхронизации."),
           ("В ChatGPT нет кнопки Create", "Не включён Developer mode или план Free.")]
    qw = (CW - 12) / 2
    rows = [faq[i:i + 2] for i in range(0, len(faq), 2)]
    for row in rows:
        hs = []
        for q, a in row:
            p = Paragraph(a, st(fontSize=8.2, leading=11.2, textColor=MUT)); _, h = p.wrap(qw - 24, 300); hs.append(h)
        rh = max(hs) + 34
        for j, (q, a) in enumerate(row):
            xx = M + j * (qw + 12)
            rrect(c, xx, y - rh, qw, rh, 10, fill=SOFT, stroke=LINE)
            text(c, q, xx + 12, y - 17, "PxB", 9, INK)
            para(c, a, xx + 12, y - 23, qw - 24, st(fontSize=8.2, leading=11.2, textColor=MUT))
        y -= rh + 8

    # финальный блок
    y -= 8
    bh = 96
    rrect(c, M, y - bh, CW, bh, 14, fill=DARK)
    rrect(c, W - M - 86, y - bh + 12, 72, 72, 7, fill=WHITE)
    qr(c, REPO, W - M - 82, y - bh + 16, 64)
    text(c, "Код, обновления и помощь", M + 20, y - 30, "Un", 13, C("#F2EFE6"))
    para(c, "Всё открыто на GitHub: код, подробная инструкция, раздел Issues для вопросов. "
            "Новые версии подтягиваются кнопкой Sync fork в вашей копии — Cloudflare пересоберёт сам.",
         M + 20, y - 40, CW - 140, st(fontSize=8.8, leading=12.4, textColor=SAGE_T))


def build(out):
    c = rl_canvas.Canvas(out, pagesize=A4)
    c.setTitle("Fitbit → Claude и ChatGPT: инструкция по подключению")
    c.setAuthor("deslabpro-max")
    c.setSubject("Личный MCP-коннектор Google Health для Claude и ChatGPT")
    for fn in (page_cover, page_overview, page_step1, page_step2, page_step34, page_faq):
        fn(c); c.showPage()
    c.save()


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "guide.pdf")
    print("OK")
