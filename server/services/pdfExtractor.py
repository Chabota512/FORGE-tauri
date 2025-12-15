#!/usr/bin/env python3
import sys
import json
from pathlib import Path

def extract_pdf(file_path):
    try:
        from pypdf import PdfReader
        with open(file_path, 'rb') as f:
            reader = PdfReader(f)
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text.strip() if text.strip() else "[PDF extracted but empty]"
    except Exception as e:
        raise Exception(f"PDF error: {str(e)}")

def extract_txt(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read().strip()
            return content if content else "[Empty file]"
    except Exception as e:
        raise Exception(f"Text error: {str(e)}")

def extract_md(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read().strip()
            return content if content else "[Empty markdown]"
    except Exception as e:
        raise Exception(f"Markdown error: {str(e)}")

def process_file(file_path, file_name):
    ext = Path(file_path).suffix.lower()
    extractors = {'.pdf': extract_pdf, '.txt': extract_txt, '.md': extract_md}
    
    if ext not in extractors:
        raise Exception(f"Unsupported: {ext}")
    
    return extractors[ext](file_path)

try:
    data = json.loads(sys.stdin.read())
    files = data.get('files', [])
    
    for i, file_info in enumerate(files):
        try:
            text = process_file(file_info['path'], file_info['name'])
            update = {
                'type': 'progress',
                'fileName': file_info['name'],
                'status': 'success',
                'current': i + 1,
                'total': len(files),
                'text': text
            }
            print(json.dumps(update))
            sys.stdout.flush()
        except Exception as e:
            update = {
                'type': 'progress',
                'fileName': file_info['name'],
                'status': 'error',
                'error': str(e),
                'current': i + 1,
                'total': len(files)
            }
            print(json.dumps(update))
            sys.stdout.flush()
    
    print(json.dumps({'type': 'complete'}))
    sys.stdout.flush()
except Exception as e:
    print(json.dumps({'type': 'error', 'error': str(e)}))
    sys.exit(1)
