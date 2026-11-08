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
            mark = (150 <= x < 196 and 156 <= y < 356
                    or 150 <= x < 366 and 156 <= y < 198
                    or 196 <= x < 320 and 250 <= y < 292
                    or (x - 341) ** 2 + (y - 336) ** 2 <= 400)
            pixels.extend((145, 239, 195) if mark else (17, 41, 35))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
    (PUBLIC / f'icon-{size}.png').write_bytes(png)
