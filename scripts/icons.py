"""Generate the two FINN PWA icons from the same simple mark as icon.svg."""
from pathlib import Path
import struct
import zlib

PUBLIC = Path(__file__).resolve().parents[1] / 'public'

def chunk(kind, value):
    return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', zlib.crc32(kind + value))

for size in (192, 512):
    pixels = bytearray()
    for row in range(size):
        pixels.append(0)
        for col in range(size):
            x, y = col * 512 / size, row * 512 / size
            mark = (140 <= x < 186 and 152 <= y < 360
                    or 186 <= x < 380 - (y - 152) * 42 / 44 and 152 <= y < 196
                    or 186 <= x < 308 - (y - 251) * 42 / 44 and 251 <= y < 295)
            accent = 285 <= y <= 355 and 653 - y <= x <= 368
            pixels.extend((246, 247, 251) if mark else (167, 181, 255) if accent else (20, 23, 34))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
    (PUBLIC / f'icon-{size}.png').write_bytes(png)
