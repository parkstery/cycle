import json
from pathlib import Path

b = Path('temp-my-routes-export/000006.log').read_bytes()
key = 'favorite_routes'.encode('utf-16le')
i = b.find(key)
if i == -1:
    raise SystemExit('favorite_routes key not found')

seg = b[i:i+2500000].decode('utf-16le', 'ignore')
start = seg.find('[')
if start == -1:
    raise SystemExit('json array start not found')

depth = 0
end = -1
for idx, ch in enumerate(seg[start:], start):
    if ch == '[':
        depth += 1
    elif ch == ']':
        depth -= 1
        if depth == 0:
            end = idx + 1
            break
if end == -1:
    raise SystemExit('json array end not found')

arr_txt = seg[start:end].replace('\x00', '')
arr_txt = ''.join(c for c in arr_txt if c in '\n\r\t' or ord(c) >= 32)

print('preview:', repr(arr_txt[:120]))
print('tail:', repr(arr_txt[-120:]))

data = json.loads(arr_txt)
out = Path('my-routes-export-from-phone.json')
out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'exported {len(data)} routes to {out}')
