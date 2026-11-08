"""Optional PDF extraction for hosts with pypdf and no Poppler."""
import io
import sys
from pypdf import PdfReader

reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()))
for page in reader.pages:
    sys.stdout.buffer.write((page.extract_text() or '').encode('utf-8') + b'\n')
