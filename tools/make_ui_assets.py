"""Generate the original UI artwork of Pedaliera Studio (no third-party graphics).

Usage: python tools/make_ui_assets.py frontend/public/assets/ui
"""
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

FONT = "font-family=\"'Arial Black','Segoe UI',Arial,sans-serif\" font-weight=\"900\""

# module key: (label, active color)
MODULES = {
    'nr': ('NR', '#F4F4F5'),
    'fx1': ('FX1', '#3B82F6'),
    'drv': ('DRV', '#EF4444'),
    'amp': ('AMP', '#F97316'),
    'ir': ('IR', '#FACC15'),
    'eq': ('EQ', '#84CC16'),
    'fx2': ('FX2', '#22D3EE'),
    'dly': ('DLY', '#38BDF8'),
    'rvb': ('RVB', '#A855F7'),
}

# Line glyphs drawn in a 31 x 22 box placed at (8, 9) of the 47 x 66 tile
GLYPHS = {
    'nr': '<path d="M1 11c2.5-9 4.5 9 7 0s4.5 9 7 0" /><path d="M17 11h13" /><path d="M15.5 3v16" stroke-dasharray="2 2.5" />',
    'fx1': '<circle cx="15.5" cy="11" r="8.5" /><path d="M15.5 11l4.5-5" /><path d="M5 20.5h21" />',
    'drv': '<path d="M1 11h4l2-8h5l2 16h5l2-16h5l2 8h3" />',
    'amp': '<rect x="2" y="2" width="27" height="18" rx="2.5" /><path d="M2 8h27" /><path d="M6 13h19M6 16.5h19" /><circle cx="7" cy="5" r=".9" /><circle cx="12" cy="5" r=".9" /><circle cx="17" cy="5" r=".9" />',
    'ir': '<rect x="4" y="1.5" width="23" height="19" rx="2.5" /><circle cx="15.5" cy="11" r="6.5" /><circle cx="15.5" cy="11" r="2" />',
    'eq': '<path d="M7 2v18M15.5 2v18M24 2v18" /><path d="M4.5 13h5M13 6h5M21.5 10h5" />',
    'fx2': '<path d="M1 11l4.5-8 5 16 5-16 5 16 5-16 4.5 8" />',
    'dly': '<circle cx="5" cy="11" r="3.5" /><circle cx="14" cy="11" r="2.6" opacity=".7" /><circle cx="21.5" cy="11" r="1.8" opacity=".45" /><circle cx="27.5" cy="11" r="1.1" opacity=".25" />',
    'rvb': '<circle cx="15.5" cy="11" r="2" /><path d="M10.5 6a7 7 0 0 0 0 10M20.5 6a7 7 0 0 1 0 10" /><path d="M6.5 2.5a12 12 0 0 0 0 17M24.5 2.5a12 12 0 0 1 0 17" />',
}


def tile(key, on):
    label, color = MODULES[key]
    line = color if on else '#5F5F63'
    body = '#1B1B1E' if on else '#202023'
    text = '#FFFFFF' if on else '#5F5F63'
    switch = color if on else '#3A3A3E'
    glow = f'<rect x="2.5" y="2.5" width="42" height="61" rx="6" fill="{color}" opacity=".08" />' if on else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="47" height="66" viewBox="0 0 47 66">
  <rect x="1.5" y="1.5" width="44" height="63" rx="7" fill="{body}" stroke="{line}" stroke-width="2.5" />
  {glow}
  <g transform="translate(8 9)" fill="none" stroke="{line}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{GLYPHS[key]}</g>
  <path d="M7 37h33" stroke="{line}" stroke-width="1.2" opacity=".5" />
  <text x="23.5" y="51" text-anchor="middle" font-size="11" {FONT} fill="{text}"{" textLength=\"30\" lengthAdjust=\"spacingAndGlyphs\"" if len(label) > 2 else ""}>{label}</text>
  <circle cx="23.5" cy="58.5" r="2.4" fill="{switch}" />
</svg>
'''


ICONS = {
    # Effects tab / clone module: three blocks in a chain
    'effects.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="32" height="22" viewBox="0 0 32 22" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round">
  <rect x="1" y="1" width="8" height="8" rx="2" /><rect x="12" y="1" width="8" height="8" rx="2" /><rect x="23" y="1" width="8" height="8" rx="2" />
  <rect x="6" y="13" width="8" height="8" rx="2" /><rect x="18" y="13" width="8" height="8" rx="2" />
  <path d="M9 5h3M20 5h3M14 17h4" />
</svg>
''',
    # Selected-module pointer under a tile
    'effects_pointer.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="42" height="34" viewBox="0 0 42 34">
  <path d="M21 6L34 26H8z" fill="#FFFFFF" stroke="#141414" stroke-width="3" stroke-linejoin="round" />
</svg>
''',
    'dropdown.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
''',
    'btn_dropdown.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><path d="M12 15l6 7 6-7z" fill="#FFFFFF" /></svg>
''',
    'btn_menu.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#E07020" stroke-width="2.6" stroke-linecap="round"><path d="M9 11h18M9 18h18M9 25h18" /></svg>
''',
    'btn_more_option.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="#E07020"><circle cx="10" cy="18" r="2.6" /><circle cx="18" cy="18" r="2.6" /><circle cx="26" cy="18" r="2.6" /></svg>
''',
    'btn_next.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11l7 7-7 7" /></svg>
''',
    'btn_previous.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11l-7 7 7 7" /></svg>
''',
    # Drum tab: snare with sticks
    'drum.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B6B70" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="12" cy="11" rx="8" ry="3" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /><path d="M8 13.8v5.5M12 14v6M16 13.8v5.5" />
  <path d="M5 2l6 7M19 2l-6 7" />
</svg>
''',
    # Save preset: floppy disk
    'home_btn_save.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.9" stroke-linejoin="round">
  <path d="M4 4h12.5L20 7.5V20H4z" /><path d="M8 4v5h7V4" /><rect x="7.5" y="13" width="9" height="7" />
</svg>
''',
    'settings.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B6B70" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3" />
  <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  <circle cx="12" cy="12" r="7" />
</svg>
''',
    # App icon (favicon / PWA): orange stompbox on dark
    'icon.svg': '''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#141518" />
  <rect x="136" y="76" width="240" height="360" rx="40" fill="#1E1F24" stroke="#F97316" stroke-width="22" />
  <circle cx="200" cy="168" r="34" fill="none" stroke="#F97316" stroke-width="18" />
  <circle cx="312" cy="168" r="34" fill="none" stroke="#F97316" stroke-width="18" />
  <path d="M200 168l18-22M312 168l-18-22" stroke="#F97316" stroke-width="16" stroke-linecap="round" />
  <circle cx="256" cy="262" r="12" fill="#10B981" />
  <circle cx="256" cy="352" r="44" fill="#F97316" />
</svg>
''',
}

# Wordmark for the header
LOGO = f'''<svg xmlns="http://www.w3.org/2000/svg" width="196" height="28" viewBox="0 0 196 28">
  <rect x="1" y="2" width="16" height="24" rx="3.5" fill="none" stroke="#F97316" stroke-width="2.4" />
  <circle cx="9" cy="9.5" r="2.6" fill="none" stroke="#F97316" stroke-width="2" />
  <circle cx="9" cy="19.5" r="3.2" fill="#F97316" />
  <text x="25" y="20.5" font-size="17" {FONT} fill="#FFFFFF" textLength="104" lengthAdjust="spacingAndGlyphs">PEDALIERA</text>
  <text x="135" y="20.5" font-size="17" {FONT} fill="#F97316" textLength="60" lengthAdjust="spacingAndGlyphs">STUDIO</text>
</svg>
'''

for key in MODULES:
    for on in (True, False):
        with open(os.path.join(OUT, f"{key}_{'on' if on else 'off'}.svg"), 'w', encoding='utf-8', newline='\n') as f:
            f.write(tile(key, on))
for name, svg in ICONS.items():
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg)
with open(os.path.join(OUT, 'logo.svg'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(LOGO)
print(len(os.listdir(OUT)), 'file in', OUT)
